/**
 * Kaldi-compatible 80-bin log-mel filterbank ("fbank80"), the input the
 * WeSpeaker speaker-embedding model expects. The exact same parameters are
 * reimplemented natively in the Android app (`voice/Fbank.kt`), so a voice
 * enrolled on one device verifies on the other. Keep the two in lockstep.
 *
 * Pipeline per WeSpeaker preprocessing: scale samples to int16 range, frame at
 * 25 ms / 10 ms (snip-edges), remove DC, pre-emphasis 0.97, Povey window,
 * power spectrum over a padded FFT, triangular mel bank (20 Hz..Nyquist), log,
 * then cepstral mean normalisation (subtract each dim's mean over time).
 */

export const FBANK = {
  sampleRate: 16000,
  numBins: 80,
  frameLengthMs: 25,
  frameShiftMs: 10,
  preemph: 0.97,
  lowFreq: 20,
  /** 0 means Nyquist (sampleRate / 2). */
  highFreq: 0,
  /** Floor fed to log, matching Kaldi's mel energy floor. */
  epsilon: Math.exp(-50),
};

function melScale(freqHz: number): number {
  return 1127 * Math.log(1 + freqHz / 700);
}

/** Next power of two ≥ n (Kaldi rounds the window up for the FFT). */
function roundUpToPowerOfTwo(n: number): number {
  let p = 1;
  while (p < n) p *= 2;
  return p;
}

/** Povey window: a Hann window raised to the 0.85 power. */
function poveyWindow(length: number): Float32Array {
  const w = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    const hann = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (length - 1));
    w[i] = Math.pow(hann, 0.85);
  }
  return w;
}

/**
 * Triangular mel filterbank weights, one entry per bin as a {offset, weights}
 * span over the real FFT bins, matching Kaldi's MelBanks.
 */
function melBanks(fftSize: number): { offset: number; weights: Float32Array }[] {
  const numFftBins = fftSize / 2;
  const nyquist = FBANK.sampleRate / 2;
  const highFreq = FBANK.highFreq <= 0 ? nyquist : FBANK.highFreq;
  const melLow = melScale(FBANK.lowFreq);
  const melHigh = melScale(highFreq);
  const melDelta = (melHigh - melLow) / (FBANK.numBins + 1);
  const fftBinWidth = FBANK.sampleRate / fftSize;

  const banks: { offset: number; weights: Float32Array }[] = [];
  for (let bin = 0; bin < FBANK.numBins; bin++) {
    const leftMel = melLow + bin * melDelta;
    const centerMel = melLow + (bin + 1) * melDelta;
    const rightMel = melLow + (bin + 2) * melDelta;
    let offset = -1;
    const weights: number[] = [];
    for (let i = 0; i < numFftBins; i++) {
      const mel = melScale(fftBinWidth * i);
      if (mel <= leftMel || mel >= rightMel) continue;
      const weight =
        mel <= centerMel
          ? (mel - leftMel) / (centerMel - leftMel)
          : (rightMel - mel) / (rightMel - centerMel);
      if (offset < 0) offset = i;
      weights.push(weight);
    }
    banks.push({
      offset: offset < 0 ? 0 : offset,
      weights: new Float32Array(weights),
    });
  }
  return banks;
}

/** In-place iterative radix-2 FFT of interleaved [re, im] pairs. */
function fft(re: Float32Array, im: Float32Array): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j]!, re[i]!];
      [im[i], im[j]] = [im[j]!, im[i]!];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wRe = Math.cos(ang);
    const wIm = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let curRe = 1;
      let curIm = 0;
      for (let k = 0; k < len / 2; k++) {
        const aRe = re[i + k]!;
        const aIm = im[i + k]!;
        const bRe = re[i + k + len / 2]! * curRe - im[i + k + len / 2]! * curIm;
        const bIm = re[i + k + len / 2]! * curIm + im[i + k + len / 2]! * curRe;
        re[i + k] = aRe + bRe;
        im[i + k] = aIm + bIm;
        re[i + k + len / 2] = aRe - bRe;
        im[i + k + len / 2] = aIm - bIm;
        const nextRe = curRe * wRe - curIm * wIm;
        curIm = curRe * wIm + curIm * wRe;
        curRe = nextRe;
      }
    }
  }
}

/**
 * Computes fbank80 features for one utterance. `samples` are mono Float32 in
 * [-1, 1] at `sampleRate` (already resampled to 16 kHz). Returns a flat
 * Float32Array of `frames * 80`, row-major, ready for the ONNX `feats` input.
 */
export function computeFbank(
  samples: Float32Array,
  sampleRate: number,
): { data: Float32Array; frames: number; bins: number } {
  const frameLength = Math.round((FBANK.frameLengthMs / 1000) * sampleRate);
  const frameShift = Math.round((FBANK.frameShiftMs / 1000) * sampleRate);
  const fftSize = roundUpToPowerOfTwo(frameLength);
  const window = poveyWindow(frameLength);
  const banks = melBanks(fftSize);
  const bins = FBANK.numBins;

  const frames =
    samples.length < frameLength
      ? 0
      : 1 + Math.floor((samples.length - frameLength) / frameShift);
  const out = new Float32Array(frames * bins);

  const re = new Float32Array(fftSize);
  const im = new Float32Array(fftSize);
  const frame = new Float32Array(frameLength);

  for (let f = 0; f < frames; f++) {
    const start = f * frameShift;
    // Scale to int16 range (WeSpeaker multiplies by 1<<15 before fbank).
    for (let i = 0; i < frameLength; i++) frame[i] = samples[start + i]! * 32768;
    // Remove DC offset.
    let mean = 0;
    for (let i = 0; i < frameLength; i++) mean += frame[i]!;
    mean /= frameLength;
    for (let i = 0; i < frameLength; i++) frame[i] -= mean;
    // Pre-emphasis (Kaldi uses the first sample for index 0).
    for (let i = frameLength - 1; i > 0; i--) {
      frame[i] -= FBANK.preemph * frame[i - 1]!;
    }
    frame[0]! -= FBANK.preemph * frame[0]!;
    // Window + zero pad.
    re.fill(0);
    im.fill(0);
    for (let i = 0; i < frameLength; i++) re[i] = frame[i]! * window[i]!;

    fft(re, im);

    const base = f * bins;
    for (let b = 0; b < bins; b++) {
      const { offset, weights } = banks[b]!;
      let energy = 0;
      for (let k = 0; k < weights.length; k++) {
        const idx = offset + k;
        const power = re[idx]! * re[idx]! + im[idx]! * im[idx]!;
        energy += weights[k]! * power;
      }
      out[base + b] = Math.log(Math.max(energy, FBANK.epsilon));
    }
  }

  // Cepstral mean normalisation: subtract each dim's mean over all frames.
  if (frames > 0) {
    for (let b = 0; b < bins; b++) {
      let mean = 0;
      for (let f = 0; f < frames; f++) mean += out[f * bins + b]!;
      mean /= frames;
      for (let f = 0; f < frames; f++) out[f * bins + b]! -= mean;
    }
  }

  return { data: out, frames, bins };
}
