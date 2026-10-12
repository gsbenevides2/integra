/**
 * Downloads the small Portuguese Vosk model used by the "Hey Integra" wake
 * word and repackages it as the .tar.gz that vosk-browser expects. The model
 * (~32 MB, Apache 2.0) is not committed: run this once locally, and the
 * Docker build runs it too.
 *
 *   bun run assistant:model
 */
import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { inflateRawSync } from "node:zlib";

const MODEL_NAME = "vosk-model-small-pt-0.3";
const MODEL_URL = `https://alphacephei.com/vosk/models/${MODEL_NAME}.zip`;
const OUTPUT = "public/vosk/vosk-model-small-pt.tar.gz";

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;

/** Reads every file of a zip archive (stored or deflated entries only). */
function unzip(zip: Uint8Array): Record<string, Uint8Array> {
  const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  let eocd = zip.length - 22;
  while (eocd >= 0 && view.getUint32(eocd, true) !== EOCD_SIGNATURE) eocd--;
  if (eocd < 0) throw new Error("Not a zip file");

  const count = view.getUint16(eocd + 10, true);
  let offset = view.getUint32(eocd + 16, true);
  const files: Record<string, Uint8Array> = {};
  for (let i = 0; i < count; i++) {
    if (view.getUint32(offset, true) !== CENTRAL_SIGNATURE) {
      throw new Error("Corrupt zip central directory");
    }
    const method = view.getUint16(offset + 10, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const localOffset = view.getUint32(offset + 42, true);
    const name = new TextDecoder().decode(
      zip.subarray(offset + 46, offset + 46 + nameLength),
    );
    offset += 46 + nameLength + extraLength + commentLength;
    if (name.endsWith("/")) continue;

    const dataStart =
      localOffset +
      30 +
      view.getUint16(localOffset + 26, true) +
      view.getUint16(localOffset + 28, true);
    const data = zip.subarray(dataStart, dataStart + compressedSize);
    if (method === 0) files[name] = data;
    else if (method === 8) files[name] = inflateRawSync(data);
    else throw new Error(`Unsupported zip compression ${method} for ${name}`);
  }
  return files;
}

if (await Bun.file(OUTPUT).exists() && !process.argv.includes("--force")) {
  console.log(`${OUTPUT} already exists (use --force to download again)`);
} else {
  console.log(`Downloading ${MODEL_URL}...`);
  const response = await fetch(MODEL_URL);
  if (!response.ok) throw new Error(`Download failed: ${response.status}`);
  const files = unzip(new Uint8Array(await response.arrayBuffer()));
  // vosk-browser strips the archive's first path component, so every entry
  // must sit under the model's own top-level folder, as in the zip.
  await mkdir(dirname(OUTPUT), { recursive: true });
  await Bun.Archive.write(OUTPUT, files, { compress: "gzip" });
  console.log(`Wrote ${Object.keys(files).length} files to ${OUTPUT}`);
}
