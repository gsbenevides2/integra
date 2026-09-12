import safeEnvGet from "utils/safeEnvGet";

const ALGORITHM = "AES-CBC";
const IV_LENGTH = 16;
const HASH_ALGORITHM = "SHA-256";

async function getSecret(): Promise<CryptoKey> {
    const secret = safeEnvGet("TUYA_LOCAL_KEY_SECRET");

    const secretBuffer = new TextEncoder().encode(secret);
    const hashBuffer = await crypto.subtle.digest(HASH_ALGORITHM, secretBuffer);

    return crypto.subtle.importKey("raw", hashBuffer, ALGORITHM, false, ["encrypt", "decrypt"]);
}

function uint8ArrayToHex(array: Uint8Array): string {
    return Array.from(array)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
}

function hexToUint8Array(hex: string): Uint8Array<ArrayBuffer> {
    const bytes = new Uint8Array(new ArrayBuffer(hex.length / 2));
    for (let i = 0; i < hex.length; i += 2) {
        bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
    }
    return bytes;
}

export async function encryptLocalKey(localKey: string): Promise<string> {
    const key = await getSecret();
    const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));

    const encryptedBuffer = await crypto.subtle.encrypt(
        { name: ALGORITHM, iv },
        key,
        new TextEncoder().encode(localKey),
    );

    return `${uint8ArrayToHex(iv)}:${uint8ArrayToHex(new Uint8Array(encryptedBuffer))}`;
}

export async function decryptLocalKey(encryptedLocalKey: string): Promise<string> {
    const key = await getSecret();

    const [ivHex, encryptedHex] = encryptedLocalKey.split(":") as [string, string];
    const iv = hexToUint8Array(ivHex);
    const encrypted = hexToUint8Array(encryptedHex);

    const decryptedBuffer = await crypto.subtle.decrypt({ name: ALGORITHM, iv }, key, encrypted);

    return new TextDecoder().decode(decryptedBuffer);
}
