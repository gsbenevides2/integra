/**
 * Downloads the WeSpeaker speaker-embedding model used by the "Ei Integra"
 * wake-word speaker check (only your voice fires the wake word). It is the same
 * ONNX file for the web (onnxruntime-web) and Android (onnxruntime-android)
 * clients, so a voice enrolled on one device verifies on the other.
 *
 * The model (ResNet34 trained on VoxCeleb, ~26 MB, CC-BY-4.0) is not committed:
 * run this once locally, and the Docker build runs it too. Speaker identity is
 * language-independent, so a VoxCeleb (English) model works for pt-BR speakers.
 *
 *   bun run assistant:speaker-model
 *
 * If the model file changes, bump VOICE_MODEL_ID in
 * server/modules/assistant/index.ts so enrolled profiles are re-collected.
 */
import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";

const MODEL_URL =
  "https://github.com/k2-fsa/sherpa-onnx/releases/download/speaker-recongition-models/wespeaker_en_voxceleb_resnet34_LM.onnx";
const OUTPUT = "public/voice/speaker-ecapa.onnx";

if ((await Bun.file(OUTPUT).exists()) && !process.argv.includes("--force")) {
  console.log(`${OUTPUT} already exists (use --force to download again)`);
} else {
  console.log(`Downloading ${MODEL_URL}...`);
  const response = await fetch(MODEL_URL);
  if (!response.ok) throw new Error(`Download failed: ${response.status}`);
  await mkdir(dirname(OUTPUT), { recursive: true });
  await Bun.write(OUTPUT, response);
  console.log(`Wrote ${OUTPUT}`);
}
