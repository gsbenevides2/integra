import { createCipheriv, createDecipheriv, createHash } from "node:crypto";

const RSA_BLOCK_BYTES = 64; // 512-bit RSA key, no padding
const RSA_HEX_LEN = 128; // RSA_BLOCK_BYTES * 2

export function md5Hex(text: string): string {
    return createHash("md5").update(text, "utf8").digest("hex");
}

export function aesEncrypt(plainText: string, key: string, iv: string): string {
    const cipher = createCipheriv("aes-128-cbc", Buffer.from(key, "utf8"), Buffer.from(iv, "utf8"));
    const encrypted = Buffer.concat([cipher.update(plainText, "utf8"), cipher.final()]);
    return encrypted.toString("base64");
}

export function aesDecrypt(base64CipherText: string, key: string, iv: string): string {
    const decipher = createDecipheriv(
        "aes-128-cbc",
        Buffer.from(key, "utf8"),
        Buffer.from(iv, "utf8"),
    );
    const decrypted = Buffer.concat([
        decipher.update(Buffer.from(base64CipherText, "base64")),
        decipher.final(),
    ]);
    return decrypted.toString("utf8");
}

function modPow(base: bigint, exp: bigint, mod: bigint): bigint {
    let result = BigInt(1);
    base %= mod;
    while (exp > BigInt(0)) {
        if (exp & BigInt(1)) result = (result * base) % mod;
        exp >>= BigInt(1);
        base = (base * base) % mod;
    }
    return result;
}

/**
 * Raw (unpadded) RSA "encryption" used by the router's JS (flag=0 path of $.rsa.encrypt).
 * Each block is right-padded with zero bytes to RSA_BLOCK_BYTES before modpow, and the
 * result is left-padded with zero hex digits to RSA_HEX_LEN. Matches the router's encrypt.js exactly.
 */
export function rsaEncryptNoPadding(text: string, nnHex: string, eeHex: string): string {
    const n = BigInt("0x" + nnHex);
    const e = BigInt("0x" + eeHex);
    const bytes = Buffer.from(text, "utf8");

    let out = "";
    for (let offset = 0; offset < bytes.length; offset += RSA_BLOCK_BYTES) {
        const chunk = Buffer.alloc(RSA_BLOCK_BYTES, 0);
        bytes.copy(chunk, 0, offset, Math.min(offset + RSA_BLOCK_BYTES, bytes.length));
        const m = BigInt("0x" + chunk.toString("hex"));
        const c = modPow(m, e, n);
        out += c.toString(16).padStart(RSA_HEX_LEN, "0");
    }
    return out;
}

export function randomKeyIvPart(): string {
    return (Date.now().toString() + Math.random() * 1000000000).substring(0, 16);
}
