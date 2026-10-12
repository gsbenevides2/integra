/** Scribe needs no more than telephone-plus quality; it keeps uploads small. */
export const WAV_SAMPLE_RATE = 16000;

/** Averages blocks of samples down to `targetRate` (inputs are ≥ 16 kHz). */
export function downsample(
  samples: Float32Array,
  sampleRate: number,
  targetRate: number,
): Float32Array {
  if (sampleRate <= targetRate) return samples;
  const ratio = sampleRate / targetRate;
  const output = new Float32Array(Math.floor(samples.length / ratio));
  for (let i = 0; i < output.length; i++) {
    const start = Math.floor(i * ratio);
    const end = Math.min(samples.length, Math.floor((i + 1) * ratio));
    let sum = 0;
    for (let j = start; j < end; j++) sum += samples[j]!;
    output[i] = sum / (end - start);
  }
  return output;
}

/** Encodes mono Float32 chunks as a 16-bit PCM WAV file at WAV_SAMPLE_RATE. */
export function encodeWav(
  chunks: Float32Array[],
  sampleRate: number,
): Uint8Array<ArrayBuffer> {
  const joined = new Float32Array(chunks.reduce((n, c) => n + c.length, 0));
  let offset = 0;
  for (const chunk of chunks) {
    joined.set(chunk, offset);
    offset += chunk.length;
  }
  const samples = downsample(joined, sampleRate, WAV_SAMPLE_RATE);

  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const text = (at: number, value: string) =>
    [...value].forEach((char, i) => view.setUint8(at + i, char.charCodeAt(0)));
  text(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  text(8, "WAVE");
  text(12, "fmt ");
  view.setUint32(16, 16, true); // fmt chunk size
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, WAV_SAMPLE_RATE, true);
  view.setUint32(28, WAV_SAMPLE_RATE * 2, true); // byte rate
  view.setUint16(32, 2, true); // block align
  view.setUint16(34, 16, true); // bits per sample
  text(36, "data");
  view.setUint32(40, samples.length * 2, true);
  samples.forEach((sample, i) => {
    const clamped = Math.max(-1, Math.min(1, sample));
    view.setInt16(44 + i * 2, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
  });
  return new Uint8Array(buffer);
}
