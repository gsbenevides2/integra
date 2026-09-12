import { createCipheriv, createDecipheriv, createHash, createHmac } from "node:crypto";
import { crc32 as zlibCrc32 } from "node:zlib";

export const GCM_IV_BYTES = 12;
export const GCM_TAG_BYTES = 16;

export function md5(data: Buffer | string): Buffer {
    return createHash("md5").update(data).digest();
}

export function sha256Hex(data: Buffer | string): string {
    return createHash("sha256").update(data).digest("hex");
}

export function hmacSha256(key: Buffer, data: Buffer): Buffer {
    return createHmac("sha256", key).update(data).digest();
}

export function crc32(data: Buffer): number {
    return zlibCrc32(data) >>> 0;
}

export function aesEcbEncrypt(key: Buffer, plainText: Buffer): Buffer {
    const cipher = createCipheriv("aes-128-ecb", key, null);
    cipher.setAutoPadding(true);
    return Buffer.concat([cipher.update(plainText), cipher.final()]);
}

export function aesEcbDecrypt(key: Buffer, cipherText: Buffer): Buffer {
    const decipher = createDecipheriv("aes-128-ecb", key, null);
    decipher.setAutoPadding(true);
    return Buffer.concat([decipher.update(cipherText), decipher.final()]);
}

/**
 * ECB without PKCS#7 padding. The v3.4/v3.5 session key derivation encrypts an exact
 * 16-byte block and expects the raw 16 bytes back, with no padding block appended.
 */
export function aesEcbEncryptRaw(key: Buffer, plainText: Buffer): Buffer {
    const cipher = createCipheriv("aes-128-ecb", key, null);
    cipher.setAutoPadding(false);
    return Buffer.concat([cipher.update(plainText), cipher.final()]);
}

export function aesEcbDecryptRaw(key: Buffer, cipherText: Buffer): Buffer {
    const decipher = createDecipheriv("aes-128-ecb", key, null);
    decipher.setAutoPadding(false);
    return Buffer.concat([decipher.update(cipherText), decipher.final()]);
}

export interface GcmEncryptResult {
    cipherText: Buffer;
    tag: Buffer;
}

export function aesGcmEncrypt(
    key: Buffer,
    iv: Buffer,
    plainText: Buffer,
    aad?: Buffer,
): GcmEncryptResult {
    const cipher = createCipheriv("aes-128-gcm", key, iv);
    if (aad) cipher.setAAD(aad);
    const cipherText = Buffer.concat([cipher.update(plainText), cipher.final()]);
    return { cipherText, tag: cipher.getAuthTag() };
}

export function aesGcmDecrypt(
    key: Buffer,
    iv: Buffer,
    cipherText: Buffer,
    tag: Buffer,
    aad?: Buffer,
): Buffer {
    const decipher = createDecipheriv("aes-128-gcm", key, iv);
    decipher.setAuthTag(tag);
    if (aad) decipher.setAAD(aad);
    return Buffer.concat([decipher.update(cipherText), decipher.final()]);
}

export function xorBuffers(a: Buffer, b: Buffer): Buffer {
    const length = Math.min(a.length, b.length);
    const out = Buffer.alloc(length);
    for (let i = 0; i < length; i++) out[i] = a[i]! ^ b[i]!;
    return out;
}
