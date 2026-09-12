import { aesEcbEncryptRaw, aesGcmEncrypt, hmacSha256, xorBuffers } from "./crypto";
import { TuyaCommand } from "./commands";

const NONCE_BYTES = 16;
const HANDSHAKE_RESPONSE_BYTES = 48; // 16-byte device nonce + 32-byte HMAC

export class TuyaLocalKeyError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "TuyaLocalKeyError";
    }
}

export interface NegotiateSessionKeyParams {
    version: "3.4" | "3.5";
    /** The static local key, in its raw 16 bytes. */
    localKey: Buffer;
    /** Sends a payload and resolves with the decrypted payload of the awaited response. */
    request: (command: number, payload: Buffer, expect: number[]) => Promise<Buffer>;
    /** Sends a payload without awaiting a response. */
    send: (command: number, payload: Buffer) => Promise<void>;
}

/**
 * Runs the three-way handshake that protocols 3.4 and 3.5 use in place of the static local
 * key, and returns the negotiated session key.
 */
export async function negotiateSessionKey({
    version,
    localKey,
    request,
    send,
}: NegotiateSessionKeyParams): Promise<Buffer> {
    const localNonce = Buffer.from(crypto.getRandomValues(new Uint8Array(NONCE_BYTES)));

    const response = await request(TuyaCommand.SESS_KEY_NEG_START, localNonce, [
        TuyaCommand.SESS_KEY_NEG_RESP,
    ]);

    if (response.length < HANDSHAKE_RESPONSE_BYTES) {
        throw new TuyaLocalKeyError(
            `Handshake response too short (${response.length} bytes); the localKey is likely wrong`,
        );
    }

    const remoteNonce = response.subarray(0, NONCE_BYTES);
    const expectedHmac = hmacSha256(localKey, localNonce);

    if (!expectedHmac.equals(response.subarray(NONCE_BYTES, HANDSHAKE_RESPONSE_BYTES))) {
        throw new TuyaLocalKeyError(
            "Handshake HMAC mismatch: the localKey is invalid or out of date (it changes when the device is re-paired)",
        );
    }

    await send(TuyaCommand.SESS_KEY_NEG_FINISH, hmacSha256(localKey, remoteNonce));

    const mixed = xorBuffers(localNonce, remoteNonce);

    if (version === "3.4") return aesEcbEncryptRaw(localKey, mixed);

    return aesGcmEncrypt(localKey, localNonce.subarray(0, 12), mixed).cipherText;
}
