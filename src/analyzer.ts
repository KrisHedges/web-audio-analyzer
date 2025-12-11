import { computeSpectrum } from './fft';
import { AnalysisResult, AnalysisData, Classification } from './types';

/**
 * Decodes an audio file into an AudioBuffer using the browser's AudioContext.
 */
export async function decodeAudio(
  file: File,
  context?: AudioContext,
): Promise<AudioBuffer> {
  const ctx = context || new AudioContext(); // Use provided or create temporary context
  const arrayBuffer = await file.arrayBuffer();

  // decodeAudioData requires a call within the context
  // Note: offline context or standard context both work.
  return await ctx.decodeAudioData(arrayBuffer);
}

/**
 * Main entry point for analyzing a File object.
 */
export async function analyzeFile(
  file: File,
  context?: AudioContext,
): Promise<AnalysisResult> {
  try {
    const audioBuffer = await decodeAudio(file, context);
    return analyzeAudioBuffer(audioBuffer);
  } catch (e) {
    throw new Error(
      `Analysis failed: ${e instanceof Error ? e.message : String(e)}`,
    );
  }
}

/**
 * Core analysis logic on an AudioBuffer.
 */
export function analyzeAudioBuffer(buffer: AudioBuffer): AnalysisResult {
  // 1. Get mono data (mixdown or first channel)
  const channelData = getMonoData(buffer);
  const sr = buffer.sampleRate;

  if (channelData.length === 0) {
    throw new Error('Audio buffer is empty');
  }

  // 2. Normalize
  const normalized = normalize(channelData);

  // 3. Extract Features
  const rmsEnergy = computeRMS(normalized);
  const { centroid, flatness, bands } = computeSpectralFeatures(normalized, sr);

  // 4. Envelope & Peaks
  const { envelopeVector, peakCount, decayTime, turbulence } =
    computeEnvelopeFeatures(normalized, sr);

  // 5. Classification
  const classification = classify(
    peakCount,
    decayTime,
    centroid,
    turbulence,
    bands,
  );

  // 6. Assemble Result
  const analysisData: AnalysisData = {
    file_meta: {
      output_wav_path: '', // Not applicable in browser flow, or could be blob URL
      duration_seconds: buffer.duration,
    },
    musical_features: {
      rms_energy: rmsEnergy,
      brightness_spectral_centroid: centroid,
      texture_spectral_flatness: flatness,
      peak_count: peakCount,
      estimated_decay_time: `${decayTime.toFixed(2)}s`,
    },
    vectors: {
      amplitude_envelope: envelopeVector,
      frequency_bands_db: bands,
    },
  };

  return {
    classification,
    analysis_data: analysisData,
  };
}

// --- Helpers ---

function getMonoData(buffer: AudioBuffer): Float32Array {
  if (buffer.numberOfChannels === 1) {
    return buffer.getChannelData(0);
  }
  // Simple average mixdown for stereo+
  const ch0 = buffer.getChannelData(0);
  const ch1 = buffer.getChannelData(1);
  const len = ch0.length;
  const mono = new Float32Array(len);
  for (let i = 0; i < len; i++) {
    mono[i] = (ch0[i] + ch1[i]) / 2;
  }
  return mono;
}

function normalize(data: Float32Array): Float32Array {
  let max = 0;
  for (let i = 0; i < data.length; i++) {
    const abs = Math.abs(data[i]);
    if (abs > max) max = abs;
  }

  if (max === 0) return data; // Silence

  const normalized = new Float32Array(data.length);
  for (let i = 0; i < data.length; i++) {
    normalized[i] = data[i] / max;
  }
  return normalized;
}

function computeRMS(data: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < data.length; i++) {
    sum += data[i] * data[i];
  }
  return Math.sqrt(sum / data.length);
}

function computeSpectralFeatures(data: Float32Array, sr: number) {
  // librosa uses STFT and averages.
  // For efficiency in JS, we'll take a large FFT window at the center or average of a few chunks.
  // To closely match librosa.feature.spectral_centroid(y=y), it does STFT.

  // Implementation:
  // 1. Calculate STFT (magnitude spectrogram)
  // 2. Compute centroid per frame -> mean
  // 3. Compute flatness per frame -> mean
  // 4. Compute bands from average spectrum

  const nFft = 2048;
  const hopLength = 512; // default librosa

  // We will accumulate sums to calculate means
  let centroidSum = 0;
  let flatnessSum = 0;
  let frameCount = 0;

  // For bands, we want the global average spectrum
  const avgSpectrum = new Float32Array(nFft / 2 + 1).fill(0);

  // Precompute window (Hanning)
  const window = new Float32Array(nFft);
  for (let i = 0; i < nFft; i++) {
    window[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (nFft - 1)));
  }

  for (let i = 0; i + nFft < data.length; i += hopLength) {
    const chunk = new Float32Array(nFft);
    for (let j = 0; j < nFft; j++) {
      chunk[j] = data[i + j] * window[j];
    }

    const magSpec = computeSpectrum(chunk);

    // Accumulate for average spectrum
    for (let k = 0; k < magSpec.length; k++) {
      avgSpectrum[k] += magSpec[k];
    }

    // Centroid for this frame
    // centroid = sum(S(f) * f) / sum(S(f))
    let num = 0;
    let den = 0;
    for (let k = 0; k < magSpec.length; k++) {
      const freq = (k * sr) / nFft;
      num += magSpec[k] * freq;
      den += magSpec[k];
    }
    const frameCentroid = den === 0 ? 0 : num / den;
    centroidSum += frameCentroid;

    // Flatness for this frame
    // flatness = geom_mean(S) / arith_mean(S)
    let sumLog = 0;
    let sumMag = 0;
    // avoid log(0) with epsilon
    const eps = 1e-10;

    for (let k = 0; k < magSpec.length; k++) {
      const val = magSpec[k] * magSpec[k] + eps; // Power spectrum (S^2) for standard flatness

      // Librosa spectral flatness input is Power Spectrum (S**2) usually?
      // actually librosa docs say S is magnitude or power.
      // analyze_ir.py uses: spectral_flatness(y=y) which uses magnitude S by default

      sumLog += Math.log(val);
      sumMag += val;
    }
    const geomMean = Math.exp(sumLog / magSpec.length);
    const arithMean = sumMag / magSpec.length;

    // Note: librosa.feature.spectral_flatness returns values relative to power (S**2) by default if S not provided?
    // Let's stick to magnitude for now, it yields similar relative results.
    const frameFlatness = arithMean === 0 ? 0 : geomMean / arithMean;
    flatnessSum += frameFlatness;

    frameCount++;
  }

  if (frameCount === 0) {
    // Audio shorter than one FFT frame
    return { centroid: 0, flatness: 0, bands: {} };
  }

  // Average Spectrum for bands
  for (let k = 0; k < avgSpectrum.length; k++) {
    avgSpectrum[k] /= frameCount;
  }

  // Bands calculation
  // "frequency_bands_db"
  const freqs = new Float32Array(avgSpectrum.length);
  for (let k = 0; k < freqs.length; k++) {
    freqs[k] = (k * sr) / nFft;
  }

  // band_limits = [0, 100, 500, 2000, 5000, 20000]
  const limits = [0, 100, 500, 2000, 5000, 20000];
  const bands: Record<string, number> = {};

  for (let i = 0; i < limits.length - 1; i++) {
    const minF = limits[i];
    const maxF = limits[i + 1];

    let bandPowerSum = 0;
    let count = 0;

    for (let k = 0; k < freqs.length; k++) {
      if (freqs[k] >= minF && freqs[k] < maxF) {
        // STFT is magnitude. Power approx S**2
        bandPowerSum += avgSpectrum[k] * avgSpectrum[k];
        count++;
      }
    }

    const avgBandPower = count === 0 ? 0 : bandPowerSum / count; // Mean power in band
    // power_to_db: 10 * log10(power)
    // Guard against log10(0)
    const db = 10 * Math.log10(Math.max(avgBandPower, 1e-10));
    bands[`${minF}-${maxF}hz`] = db;
  }

  return {
    centroid: centroidSum / frameCount,
    flatness: flatnessSum / frameCount,
    bands,
  };
}

function computeEnvelopeFeatures(data: Float32Array, sr: number) {
  // RMS Envelope: librosa uses hop_length=512, frame_length=2048 usually for feature.rms
  const hopLength = 512;
  const frameLength = 2048;

  const rmsEnvelope: number[] = [];

  // Calculate RMS frames
  // (pad mode 'reflect' not fully impl, doing 'valid' frames)
  for (let i = 0; i + frameLength <= data.length; i += hopLength) {
    let sum = 0;
    for (let j = 0; j < frameLength; j++) {
      sum += data[i + j] * data[i + j];
    }
    rmsEnvelope.push(Math.sqrt(sum / frameLength));
  }

  // Find Peaks
  // height=relative to max, distance=sr/1000 * 50 (50ms)
  const envSr = sr / hopLength;
  const distanceFrames = Math.ceil((50 / 1000) * envSr);

  const maxVal = Math.max(...rmsEnvelope);
  // Relative height threshold (e.g. 5% of max peak)
  const heightThreshold = maxVal * 0.05;
  // Absolute floor for peaks (avoid noise)
  const floorThreshold = 0.0001;
  const finalThreshold = Math.max(heightThreshold, floorThreshold);

  // Simple peak finding
  let peaks = 0;
  let lastPeakIdx = -distanceFrames;
  let minSinceLastPeak = maxVal; // Start high to prevent spurious first peaks if handled elsewhere

  // Check Index 0 (often direct sound)
  if (rmsEnvelope.length > 0) {
    // Peak at 0 if > threshold and > next (or next is end)
    const v0 = rmsEnvelope[0];
    const v1 = rmsEnvelope.length > 1 ? rmsEnvelope[1] : 0;

    if (v0 > finalThreshold && v0 >= v1) {
      peaks++;
      lastPeakIdx = 0;
      minSinceLastPeak = v0;
    } else {
      minSinceLastPeak = v0;
    }
  }

  // Check rest
  for (let i = 1; i < rmsEnvelope.length - 1; i++) {
    const v = rmsEnvelope[i];
    const prev = rmsEnvelope[i - 1];
    const next = rmsEnvelope[i + 1];

    // Update valley tracker
    if (v < minSinceLastPeak) {
      minSinceLastPeak = v;
    }

    // Use >= for prev to catch plateaus (finds the last point of a plateau)
    // Check if v is a peak (local max)
    const isLocalMax = v > finalThreshold && v >= prev && v > next;

    if (isLocalMax) {
      // Check spacing
      if (i - lastPeakIdx >= distanceFrames) {
        // Check Prominence: Must have risen significantly from the valley since the last peak.
        // 20% rise (1.55x) is robust for delays vs texture ripples.
        // Added 0.001 absolute buffer to handle near-silence ratios.
        if (v > minSinceLastPeak * 1.55 + 0.001) {
          peaks++;
          lastPeakIdx = i;
          minSinceLastPeak = v; // Reset valley for next peak
        }
      }
    }
  }

  // Decay Time (to -60dB or 0.1% of max energy)
  // Standard RT60 is -60dB.
  // maxVal is linear magnitude. -60dB is 0.001 * maxVal.
  const decayThreshold = maxVal * 0.001;

  // find last frame > threshold
  let lastHighFrame = 0;
  for (let i = 0; i < rmsEnvelope.length; i++) {
    if (rmsEnvelope[i] > decayThreshold) {
      lastHighFrame = i;
    }
  }

  const decayTime = (lastHighFrame * hopLength) / sr;

  // Vector (downsampled to 500 points)
  const envelopeVector = resampleArray(rmsEnvelope, 500);

  return {
    envelopeVector,
    peakCount: peaks,
    decayTime,
    turbulence: computeTurbulence(rmsEnvelope, lastHighFrame),
  };
}

function computeTurbulence(envelope: number[], endFrameIdx: number): number {
  // 1. Convert to dB
  // 2. Linear Regression on the decay part (Peak -> Last Audible)
  // 3. Calc RMSE

  // Convert to dB, handling value 0
  // Floor at -100dB
  const dbEnv = envelope.map((v) => 20 * Math.log10(Math.max(v, 1e-5)));

  // Find absolute peak index to start decay analysis
  let peakIdx = 0;
  let maxVal = -1000;
  for (let i = 0; i < dbEnv.length; i++) {
    if (dbEnv[i] > maxVal) {
      maxVal = dbEnv[i];
      peakIdx = i;
    }
  }

  // Analysis range: Peak -> EndFrame (last point > -60dB)
  // We do NOT break on silence gaps (that's the point of detecting echoes)
  const decaySlice = [];

  // If endFrameIdx is invalid or before peak
  const actualEnd = Math.max(endFrameIdx, peakIdx + 5);
  const limit = Math.min(actualEnd, dbEnv.length);

  for (let i = peakIdx; i < limit; i++) {
    // We clamp the silence floor for regression stability?
    // If we have distinct echoes: 0dB ... -100dB ... -10dB.
    // The -100dB points will create massive error against a line of e.g. -5dB.
    // This is Good. It detects turbulence.
    decaySlice.push(dbEnv[i]);
  }

  if (decaySlice.length < 5) return 0; // Too short

  // Linear Regression: y = mx + c
  // x is index 0..N
  const n = decaySlice.length;
  let sumX = 0,
    sumY = 0,
    sumXY = 0,
    sumX2 = 0;
  for (let i = 0; i < n; i++) {
    const x = i;
    const y = decaySlice[i];
    sumX += x;
    sumY += y;
    sumXY += x * y;
    sumX2 += x * x;
  }

  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  const intercept = (sumY - slope * sumX) / n;

  // Calculate RMSE of residuals
  let mse = 0;
  for (let i = 0; i < n; i++) {
    const x = i;
    const actual = decaySlice[i];
    const predicted = slope * x + intercept;
    // Simple error
    const error = actual - predicted;
    mse += error * error;
  }

  return Math.sqrt(mse / n);
}

function resampleArray(input: number[], targetLength: number): number[] {
  if (input.length === 0) return Array.from({ length: targetLength }, () => 0);
  if (input.length === targetLength) return input;

  const output = Array.from({ length: targetLength }, () => 0);
  const step = (input.length - 1) / (targetLength - 1);

  for (let i = 0; i < targetLength; i++) {
    const idx = i * step;
    const lower = Math.floor(idx);
    const upper = Math.ceil(idx);
    const weight = idx - lower;

    if (upper >= input.length) {
      output[i] = input[input.length - 1];
    } else {
      output[i] = input[lower] * (1 - weight) + input[upper] * weight;
    }
  }
  return output;
}

function classify(
  peakCount: number,
  decayTime: number,
  centroid: number,
  turbulence: number,
  bands: Record<string, number>,
): Classification {
  // Density Logic (Peaks per Second)
  const density = decayTime > 0 ? peakCount / decayTime : 0;
  const isHighDensity = density > 4;

  // Duration Logic
  let duration: Classification['duration_category'];
  if (decayTime < 1.5) duration = 'Short';
  else if (decayTime < 5.0) duration = 'Medium';
  else duration = 'Long';

  // Brightness Logic
  let brightness: Classification['brightness_category'];
  if (centroid < 100) brightness = 'Sub';
  else if (centroid < 400) brightness = 'Very Low';
  else if (centroid < 800) brightness = 'Low';
  else if (centroid < 1200) brightness = 'Low-Mid';
  else if (centroid < 2500) brightness = 'Mid';
  else if (centroid < 4000) brightness = 'High-Mid';
  else if (centroid < 6000) brightness = 'Bright';
  else brightness = 'Very Bright';

  const subDb = bands['0-100hz'] || -100;
  const midDb = bands['500-2000hz'] || -100;

  if (brightness === 'Low' && subDb > midDb + 12) {
    brightness = 'Very Low';
  }
  if (brightness === 'Very Low' && subDb > midDb + 24) {
    brightness = 'Sub';
  }

  // Texture Logic (Turbulence)
  let texture: Classification['texture_category'];
  if (turbulence < 3) texture = 'Smooth';
  else if (turbulence < 4) texture = 'Textured';
  else if (turbulence < 5) texture = 'Grainy';
  else if (turbulence < 6) texture = 'Coarse';
  else texture = isHighDensity ? 'Textured' : 'Energetic';

  console.dir({
    peakCount,
    decayTime,
    centroid,
    turbulence,
    density,
    isHighDensity,
    duration,
    brightness,
    texture,
  });

  // Type Logic
  // Reverb is default.
  // Delay/Echo requires:
  // 1. Multiple peaks (>1)
  // 2. Low Density (Sparse taps)
  // 3. EITHER 'Echoic' Texture (High turbulence) OR 'Very Low' Density (< 1.0 p/s)
  //    (Very sparse signals are Delays even if they are clean/grainy)

  // Density thresholds:
  // > 7.0 : High Density (Reverb/Noise)
  // < 1.0 : Very Low Density (Sparse Delay)

  const isDelay = peakCount > 1 && !isHighDensity;
  const type: Classification['type'] = isDelay ? 'Delay' : 'Reverb';

  return {
    type,
    duration_category: duration,
    brightness_category: brightness,
    texture_category: texture,
  };
}
