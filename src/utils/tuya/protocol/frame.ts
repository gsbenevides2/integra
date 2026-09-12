import {
    GCM_IV_BYTES,
    GCM_TAG_BYTES,
    aesGcmDecrypt,
    aesGcmEncrypt,
    crc32,
    hmacSha256,
} from "./crypto";

const PREFIX_55AA = Buffer.from([0x00, 0x00, 0x55, 0xaa]);
const SUFFIX_55AA = Buffer.from([0x00, 0x00, 0xaa, 0x55]);
const PREFIX_6699 = Buffer.from([0x00, 0x00, 0x66, 0x99]);
const SUFFIX_6699 = Buffer.from([0x00, 0x00, 0x99, 0x66]);

const HEADER_LEN_55AA = 16; // prefix, seq, cmd, length
const HEADER_LEN_6699 = 18; // prefix, reserved, seq, cmd, length
const RETCODE_LEN = 4;
const END_LEN_CRC = 8; // crc32 + suffix
const END_LEN_HMAC = 36; // hmac-sha256 + suffix
const END_LEN_6699 = 20; // gcm tag + suffix

/** Guards against a desynced stream declaring an absurd frame size. */
const MAX_PAYLOAD_LENGTH = 100 * 1024;

export interface TuyaFrame {
    seq: number;
    command: number;
    retcode: number;
    /**
     * For 55AA frames this is the raw payload, still encrypted when the protocol version
     * encrypts it. For 6699 frames the GCM layer is inseparable from the framing, so this
     * is already decrypted.
     */
    payload: Buffer;
    checksumValid: boolean;
}

export interface EncodeOptions {
    seq: number;
    command: number;
    payload: Buffer;
    /**
     * When set, 55AA frames are signed with HMAC-SHA256 instead of CRC32 (protocol 3.4),
     * and 6699 frames use it as the AES-GCM key (protocol 3.5).
     */
    key?: Buffer;
    /** Selects the 6699 frame layout used by protocol 3.5. */
    use6699?: boolean;
}

export function encodeFrame(options: EncodeOptions): Buffer {
    return options.use6699 ? encode6699(options) : encode55AA(options);
}

function encode55AA({ seq, command, payload, key }: EncodeOptions): Buffer {
    const endLen = key ? END_LEN_HMAC : END_LEN_CRC;

    const header = Buffer.alloc(HEADER_LEN_55AA);
    PREFIX_55AA.copy(header, 0);
    header.writeUInt32BE(seq, 4);
    header.writeUInt32BE(command, 8);
    header.writeUInt32BE(payload.length + endLen, 12);

    const signed = Buffer.concat([header, payload]);

    if (key) return Buffer.concat([signed, hmacSha256(key, signed), SUFFIX_55AA]);

    const checksum = Buffer.alloc(4);
    checksum.writeUInt32BE(crc32(signed), 0);
    return Buffer.concat([signed, checksum, SUFFIX_55AA]);
}

function encode6699({ seq, command, payload, key }: EncodeOptions): Buffer {
    if (!key) throw new Error("A key is required to encode a 6699 frame");

    // The length field spans the IV through the tag, and excludes the 4-byte suffix.
    const length = GCM_IV_BYTES + payload.length + GCM_TAG_BYTES;

    const header = Buffer.alloc(HEADER_LEN_6699);
    PREFIX_6699.copy(header, 0);
    header.writeUInt16BE(0, 4); // reserved
    header.writeUInt32BE(seq, 6);
    header.writeUInt32BE(command, 10);
    header.writeUInt32BE(length, 14);

    const iv = crypto.getRandomValues(new Uint8Array(GCM_IV_BYTES));
    const ivBuffer = Buffer.from(iv);
    const aad = header.subarray(4); // reserved + seq + cmd + length
    const { cipherText, tag } = aesGcmEncrypt(key, ivBuffer, payload, aad);

    return Buffer.concat([header, ivBuffer, cipherText, tag, SUFFIX_6699]);
}

export interface DecodeResult {
    frames: TuyaFrame[];
    /** Bytes left over: either an incomplete frame or nothing. */
    rest: Buffer;
}

export interface DecodeOptions {
    /** HMAC key for 3.4 frames, or AES-GCM key for 3.5 frames. */
    key?: Buffer;
}

/**
 * Pulls every complete frame out of a TCP stream buffer. Devices freely split and coalesce
 * frames across socket `data` events, so the caller keeps `rest` and prepends it next time.
 */
export function decodeFrames(buffer: Buffer, options: DecodeOptions = {}): DecodeResult {
    const frames: TuyaFrame[] = [];
    let rest = buffer;

    for (;;) {
        const start = findPrefix(rest);
        if (start < 0) return { frames, rest: keepTail(rest) };
        if (start > 0) rest = rest.subarray(start);

        const is6699 = rest.subarray(0, 4).equals(PREFIX_6699);
        const headerLen = is6699 ? HEADER_LEN_6699 : HEADER_LEN_55AA;
        if (rest.length < headerLen) return { frames, rest };

        const length = rest.readUInt32BE(is6699 ? 14 : 12);
        if (length > MAX_PAYLOAD_LENGTH) {
            // Corrupt or desynced: skip this prefix and resynchronise on the next one.
            rest = rest.subarray(4);
            continue;
        }

        const total = is6699 ? headerLen + length + 4 : headerLen + length;
        if (rest.length < total) return { frames, rest };

        const raw = rest.subarray(0, total);
        rest = rest.subarray(total);

        const frame = is6699 ? decode6699(raw, options.key) : decode55AA(raw, options.key);
        if (frame) frames.push(frame);
    }
}

function findPrefix(buffer: Buffer): number {
    const a = buffer.indexOf(PREFIX_55AA);
    const b = buffer.indexOf(PREFIX_6699);
    if (a < 0) return b;
    if (b < 0) return a;
    return Math.min(a, b);
}

/** Drop everything that can no longer start a prefix, keeping a 3-byte straddle window. */
function keepTail(buffer: Buffer): Buffer {
    return buffer.length <= 3 ? buffer : buffer.subarray(buffer.length - 3);
}

function decode55AA(raw: Buffer, key?: Buffer): TuyaFrame | null {
    const endLen = key ? END_LEN_HMAC : END_LEN_CRC;
    if (raw.length < HEADER_LEN_55AA + RETCODE_LEN + endLen) return null;

    const seq = raw.readUInt32BE(4);
    const command = raw.readUInt32BE(8);
    const retcode = raw.readUInt32BE(HEADER_LEN_55AA);
    const payload = raw.subarray(HEADER_LEN_55AA + RETCODE_LEN, raw.length - endLen);

    const signed = raw.subarray(0, raw.length - endLen);
    const found = raw.subarray(raw.length - endLen, raw.length - 4);

    let checksumValid: boolean;
    if (key) {
        checksumValid = hmacSha256(key, signed).equals(found);
    } else {
        checksumValid = found.readUInt32BE(0) === crc32(signed);
    }

    return { seq, command, retcode, payload, checksumValid };
}

function decode6699(raw: Buffer, key?: Buffer): TuyaFrame | null {
    if (!key) throw new Error("A key is required to decode a 6699 frame");
    if (raw.length < HEADER_LEN_6699 + GCM_IV_BYTES + END_LEN_6699) return null;

    const seq = raw.readUInt32BE(6);
    const command = raw.readUInt32BE(10);

    const aad = raw.subarray(4, HEADER_LEN_6699);
    const iv = raw.subarray(HEADER_LEN_6699, HEADER_LEN_6699 + GCM_IV_BYTES);
    const cipherText = raw.subarray(HEADER_LEN_6699 + GCM_IV_BYTES, raw.length - END_LEN_6699);
    const tag = raw.subarray(raw.length - END_LEN_6699, raw.length - 4);

    let plain: Buffer;
    try {
        plain = aesGcmDecrypt(key, iv, cipherText, tag, aad);
    } catch {
        return { seq, command, retcode: 0, payload: Buffer.alloc(0), checksumValid: false };
    }

    // Every device-to-client 6699 frame carries its return code inside the ciphertext, ahead
    // of the payload proper. That includes the binary handshake frames, whose nonce would
    // otherwise be read four bytes out of alignment.
    const hasRetcode = plain.length >= RETCODE_LEN;
    const retcode = hasRetcode ? plain.readUInt32BE(0) : 0;
    const payload = hasRetcode ? plain.subarray(RETCODE_LEN) : plain;

    return { seq, command, retcode, payload, checksumValid: true };
}
