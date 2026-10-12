import * as ort from "onnxruntime-web";

import { computeFbank } from "./fbank";

// onnxruntime-web fetches its .wasm/.mjs runtime at load time; serve it from
// our own origin (see ortAssetRoutes) instead of the page root, where it 404s.
ort.env.wasm.wasmPaths = "/ort/";
import { downsample, WAV_SAMPLE_RATE } from "./wav";

/**
 * The client-side speaker-embedding model (WeSpeaker ResNet34, ONNX), used to
 * check that a spoken "Ei Integra" is the enrolled user's voice. The audio
 * never leaves the browser: this runs offline, like the wake word. The model
 * bytes are cached in IndexedDB after the first download, keyed by the model
 * id so a new model invalidates the cache.
 */

const DB_NAME = "integra-voice";
const STORE = "models";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function readCache(key: string): Promise<ArrayBuffer | null> {
  try {
    const db = await openDb();
    return await new Promise((resolve, reject) => {
      const request = db.transaction(STORE).objectStore(STORE).get(key);
      request.onsuccess = () => resolve((request.result as ArrayBuffer) ?? null);
      request.onerror = () => reject(request.error);
    });
  } catch {
    return null;
  }
}

async function writeCache(key: string, bytes: ArrayBuffer): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(bytes, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // A failed cache write is not fatal; the model just re-downloads next time.
  }
}

async function fetchModel(url: string, modelId: string): Promise<ArrayBuffer> {
  const cacheKey = `model:${modelId}`;
  const cached = await readCache(cacheKey);
  if (cached) return cached;
  const response = await fetch(url);
  if (!response.ok) throw new Error("Falha ao baixar o modelo de voz");
  const bytes = await response.arrayBuffer();
  await writeCache(cacheKey, bytes);
  return bytes;
}

export interface SpeakerModel {
  /** Extracts an L2-normalised speaker embedding from mono Float32 samples. */
  embed: (samples: Float32Array, sampleRate: number) => Promise<Float32Array>;
}

let loading: Promise<SpeakerModel> | null = null;

/** Loads the model once (cached in IndexedDB); safe to call repeatedly. */
export function loadSpeakerModel(url: string, modelId: string): Promise<SpeakerModel> {
  return (loading ??= (async () => {
    const bytes = await fetchModel(url, modelId);
    const session = await ort.InferenceSession.create(bytes, {
      executionProviders: ["wasm"],
    });
    const inputName = session.inputNames[0]!;
    const outputName = session.outputNames[0]!;

    const embed = async (
      samples: Float32Array,
      sampleRate: number,
    ): Promise<Float32Array> => {
      const mono = downsample(samples, sampleRate, WAV_SAMPLE_RATE);
      const { data, frames, bins } = computeFbank(mono, WAV_SAMPLE_RATE);
      if (frames === 0) throw new Error("Áudio curto demais para reconhecer a voz");
      const feats = new ort.Tensor("float32", data, [1, frames, bins]);
      const result = await session.run({ [inputName]: feats });
      const raw = result[outputName]!.data as Float32Array;
      return normalize(raw);
    };

    return { embed };
  })());
}

/** L2-normalises a vector, so cosine similarity is just a dot product. */
export function normalize(vector: Float32Array): Float32Array {
  let norm = 0;
  for (const value of vector) norm += value * value;
  norm = Math.sqrt(norm) || 1;
  const out = new Float32Array(vector.length);
  for (let i = 0; i < vector.length; i++) out[i] = vector[i]! / norm;
  return out;
}

/** Cosine similarity of two already-L2-normalised vectors (a dot product). */
export function cosine(a: ArrayLike<number>, b: ArrayLike<number>): number {
  const length = Math.min(a.length, b.length);
  let dot = 0;
  for (let i = 0; i < length; i++) dot += a[i]! * b[i]!;
  return dot;
}
