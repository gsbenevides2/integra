import {
    aesDecrypt,
    aesEncrypt,
    md5Hex,
    randomKeyIvPart,
    rsaEncryptNoPadding,
} from "./protocolCrypto";

const COMMON_HEADERS = {
    Accept: "text/plain, */*; q=0.01",
    "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
    "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36",
    "X-Requested-With": "XMLHttpRequest",
};

export interface TpLinkClientOptions {
    host: string;
    username: string;
    password: string;
}

export class TpLinkClient {
    private host: string;
    private username: string;
    private password: string;

    private nn = "";
    private ee = "";
    private seq = 0;
    private hash = "";

    private aesKey = "";
    private aesIv = "";

    private token = "0";
    private sessionCookie = "";

    constructor(opts: TpLinkClientOptions) {
        this.host = opts.host;
        this.username = opts.username;
        this.password = opts.password;
    }

    private baseUrl(path: string): string {
        return `http://${this.host}${path}`;
    }

    private captureCookie(res: Response): void {
        const setCookie = res.headers.get("set-cookie");
        if (setCookie) {
            this.sessionCookie = setCookie.split(";")[0] ?? "";
        }
    }

    private commonHeaders(): Record<string, string> {
        const headers: Record<string, string> = { ...COMMON_HEADERS };
        if (this.sessionCookie) headers["Cookie"] = this.sessionCookie;
        return headers;
    }

    private async fetchGDPRParm(): Promise<void> {
        const res = await fetch(this.baseUrl("/cgi/getGDPRParm"), {
            method: "POST",
            headers: {
                ...this.commonHeaders(),
                "Content-Type": "text/plain",
                Origin: `http://${this.host}`,
                Referer: `http://${this.host}/`,
                TokenID: this.token,
            },
            body: "",
        });
        this.captureCookie(res);

        const text = await res.text();
        if (!res.ok) {
            throw new Error(`getGDPRParm failed: HTTP ${res.status}: ${text}`);
        }

        const nn = /var\s+nn\s*=\s*"([^"]*)"/.exec(text)?.[1];
        const ee = /var\s+ee\s*=\s*"([^"]*)"/.exec(text)?.[1];
        const seq = /var\s+seq\s*=\s*"([^"]*)"/.exec(text)?.[1];

        if (!nn || !ee || !seq) {
            throw new Error(`Could not parse getGDPRParm response: ${text}`);
        }

        this.nn = nn;
        this.ee = ee;
        this.seq = parseInt(seq, 10);
    }

    private buildSign(payloadForRsa: string): string {
        return rsaEncryptNoPadding(payloadForRsa, this.nn, this.ee);
    }

    /** Low level POST to /cgi_gdpr?9, returns decrypted response text. */
    private async postGdpr(
        jsonBody: string,
        isLogin: boolean,
        aesKey: string,
        aesIv: string,
    ): Promise<string> {
        const data = aesEncrypt(jsonBody, aesKey, aesIv);
        const dataLen = data.length;

        const signPlain = isLogin
            ? `key=${aesKey}&iv=${aesIv}&h=${this.hash}&s=${this.seq + dataLen}`
            : `h=${this.hash}&s=${this.seq + dataLen}`;

        const sign = this.buildSign(signPlain);

        const body = `sign=${sign}\r\ndata=${data}\r\n`;
        try {
            const res = await fetch(this.baseUrl("/cgi_gdpr?9"), {
                method: "POST",
                headers: {
                    ...this.commonHeaders(),
                    "Content-Type": "text/plain",
                    Origin: `http://${this.host}`,
                    Referer: `http://${this.host}/`,
                    TokenID: this.token,
                },
                body,
            });

            this.captureCookie(res);

            const text = await res.text();
            if (!res.ok) {
                throw new Error(`cgi_gdpr failed: HTTP ${res.status}: ${text}`);
            }

            return aesDecrypt(text.trim(), aesKey, aesIv);
        } catch (error: unknown) {
            console.error(
                "Error while make request to TP-Link router:",
                JSON.stringify({ jsonBody, error }),
            );
            throw new Error("Request Error");
        }
    }

    private extractToken(html: string): string | null {
        return /var\s+token\s*=\s*"([^"]*)"/.exec(html)?.[1] ?? null;
    }

    async login(): Promise<void> {
        await this.fetchGDPRParm();

        this.hash = md5Hex(this.username + this.password);

        const aesKey = randomKeyIvPart();
        const aesIv = randomKeyIvPart();

        const userNameB64 = Buffer.from(this.username, "utf8").toString("base64");
        const passwdB64 = Buffer.from(this.password, "utf8").toString("base64");

        const payload = {
            data: {
                UserName: userNameB64,
                Passwd: passwdB64,
                Action: "1",
                stack: "0,0,0,0,0,0",
                pstack: "0,0,0,0,0,0",
            },
            operation: "cgi",
            oid: "/cgi/login",
        };

        const jsonBody = JSON.stringify(payload) + "\r\n";

        const decrypted = await this.postGdpr(jsonBody, true, aesKey, aesIv);

        const retMatch = /\$\.ret\s*=\s*(-?\d+)/.exec(decrypted);
        if (retMatch) {
            const code = parseInt(retMatch[1] ?? "0", 10);
            if (code !== 0) {
                throw new Error(`Login failed, error code ${code}`);
            }
        } else {
            let parsed: unknown;
            try {
                parsed = JSON.parse(decrypted);
            } catch {
                throw new Error(`Unrecognized login response: ${decrypted}`);
            }
            if (!(parsed as { success?: boolean })?.success) {
                throw new Error(`Login failed: ${JSON.stringify(parsed)}`);
            }
        }

        this.aesKey = aesKey;
        this.aesIv = aesIv;

        const indexRes = await fetch(this.baseUrl("/"), {
            headers: this.commonHeaders(),
        });
        this.captureCookie(indexRes);
        const indexHtml = await indexRes.text();
        const token = this.extractToken(indexHtml);
        if (!token) {
            throw new Error("Logged in, but could not find session token on index page");
        }
        this.token = token;
    }

    async call(
        operation: string,
        oid: string,
        data: Record<string, unknown> = {},
    ): Promise<unknown> {
        if (!this.aesKey) {
            throw new Error("Not logged in yet - call login() first");
        }

        const payload = { data, operation, oid };

        const jsonBody = JSON.stringify(payload) + "\r\n";
        const decrypted = await this.postGdpr(jsonBody, false, this.aesKey, this.aesIv);

        try {
            return JSON.parse(decrypted);
        } catch {
            return decrypted;
        }
    }

    add<T>(oid: string, data: Record<string, unknown> = {}) {
        return this.call("ao", oid, data) as Promise<T>;
    }
    get<T>(oid: string, data: Record<string, unknown> = {}) {
        return this.call("go", oid, data) as Promise<T>;
    }
    getList<T>(oid: string, data: Record<string, unknown> = {}) {
        return this.call("gl", oid, data) as Promise<T>;
    }
    getSubList<T>(oid: string, data: Record<string, unknown> = {}) {
        return this.call("gs", oid, data) as Promise<T>;
    }
    set<T>(oid: string, data: Record<string, unknown> = {}) {
        return this.call("so", oid, data) as Promise<T>;
    }
    del<T>(oid: string, data: Record<string, unknown> = {}) {
        return this.call("do", oid, data) as Promise<T>;
    }
    op<T>(oid: string, data: Record<string, unknown> = {}) {
        return this.call("op", oid, data) as Promise<T>;
    }
}
