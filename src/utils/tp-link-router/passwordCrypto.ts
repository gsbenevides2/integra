import safeEnvGet from "utils/safeEnvGet";

const ALGORITHM = "AES-CBC";
const IV_LENGTH = 16;
const HASH_ALGORITHM = "SHA-256";

async function getSecret(): Promise<CryptoKey> {
    const secret = safeEnvGet("ROUTER_PASSWORD_SECRET");

    const secretBuffer = new TextEncoder().encode(secret);
    const hashBuffer = await crypto.subtle.digest(HASH_ALGORITHM, secretBuffer);

    return crypto.subtle.importKey("raw", hashBuffer, ALGORITHM, false, ["encrypt", "decrypt"]);
}

function unit8ArrayToHex(array: Uint8Array): string {
    return Array.from(array)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
}

function arrayBufferToHex(buffer: ArrayBuffer): string {
    return unit8ArrayToHex(new Uint8Array(buffer));
}

function hexToArrayBuffer(hex: string): ArrayBuffer {
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < hex.length; i += 2) {
        bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
    }
    return bytes.buffer;
}

export async function encryptRouterPassword(password: string): Promise<string> {
    const key = await getSecret();

    const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));

    const passwordBuffer = new TextEncoder().encode(password);
    const encryptedBuffer = await crypto.subtle.encrypt(
        { name: ALGORITHM, iv },
        key,
        passwordBuffer,
    );

    const ivHex = unit8ArrayToHex(iv);
    const encryptedHex = arrayBufferToHex(encryptedBuffer);

    return `${ivHex}:${encryptedHex}`;
}

export async function decryptRouterPassword(encryptedPassword: string): Promise<string> {
    const key = await getSecret();

    const [ivHex, encryptedHex] = encryptedPassword.split(":") as [string, string];
    const iv = new Uint8Array(hexToArrayBuffer(ivHex));
    const encryptedBuffer = hexToArrayBuffer(encryptedHex);

    const decryptedBuffer = await crypto.subtle.decrypt(
        { name: ALGORITHM, iv },
        key,
        encryptedBuffer,
    );

    return new TextDecoder().decode(decryptedBuffer);
}
