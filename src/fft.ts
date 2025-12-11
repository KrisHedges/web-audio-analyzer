/**
 * Simple Radix-2 Cooley-Tukey FFT implementation.
 * Allows computing the spectrum without heavy external dependencies.
 */

export class FFT {
  size: number;
  reverseTable: Uint32Array;
  sinTable: Float32Array;
  cosTable: Float32Array;

  constructor(size: number) {
    if ((size & (size - 1)) !== 0) {
      throw new Error('FFT size must be a power of 2');
    }
    this.size = size;
    this.reverseTable = new Uint32Array(size);
    this.sinTable = new Float32Array(size);
    this.cosTable = new Float32Array(size);
    this._initTables();
  }

  private _initTables() {
    let limit = 1;
    let bit = this.size >> 1;

    while (limit < this.size) {
      for (let i = 0; i < limit; i++) {
        this.reverseTable[i + limit] = this.reverseTable[i] + bit;
      }
      limit <<= 1;
      bit >>= 1;
    }

    for (let i = 0; i < this.size; i++) {
      this.sinTable[i] = Math.sin(-Math.PI / i);
      this.cosTable[i] = Math.cos(-Math.PI / i);
    }
  }
}

/**
 * Computes the magnitude spectrum of a real-valued signal.
 * Returns an array of size (fftSize / 2) + 1 representing frequencies from 0 to Nyquist.
 *
 * NOTE: This is a simplified "Real-valued" wrapper around a standard complex FFT structure
 * or a direct estimation for feature extraction.
 *
 * For 'analyze_ir', we need STFT magnitudes.
 * To keep this file simple and lightweight, we'll implement a basic standard FFT function
 * that takes Real and Imaginary arrays.
 */
export function fft(real: Float32Array, imag: Float32Array): void {
  const n = real.length;
  if (n !== imag.length)
    throw new Error('Real and Imag arrays must be same length');
  if ((n & (n - 1)) !== 0) throw new Error('Size must be power of 2');

  // Bit-reverse copy
  // (Optimization: can be precomputed if reusing same size extensively,
  // but for this utility, computing on fly or simple swap is usually fine)
  let j = 0;
  for (let i = 0; i < n - 1; i++) {
    if (i < j) {
      const tr = real[j];
      const ti = imag[j];
      real[j] = real[i];
      imag[j] = imag[i];
      real[i] = tr;
      imag[i] = ti;
    }
    let k = n >> 1;
    while (k <= j) {
      j -= k;
      k >>= 1;
    }
    j += k;
  }

  // Butterfly updates
  // Using standard Cooley-Tukey
  let step = 1;
  while (step < n) {
    const jump = step << 1;
    const deltaAngle = -Math.PI / step;

    // Trig Tables could be optimized, but Math.sin/cos is fast enough for JS engines now
    // for moderate sizes (2048/4096)

    let wReal = 1.0;
    let wImag = 0.0;

    const sine = Math.sin(deltaAngle / 2);
    const wRealStep = -2.0 * sine * sine;
    const wImagStep = Math.sin(deltaAngle);

    for (let i = 0; i < step; i++) {
      for (let k = i; k < n; k += jump) {
        const index = k + step;
        const tempReal = wReal * real[index] - wImag * imag[index];
        const tempImag = wReal * imag[index] + wImag * real[index];

        real[index] = real[k] - tempReal;
        imag[index] = imag[k] - tempImag;
        real[k] += tempReal;
        imag[k] += tempImag;
      }

      const temp = wReal;
      wReal = temp * wRealStep - wImag * wImagStep + wReal;
      wImag = wImag * wRealStep + temp * wImagStep + wImag;
    }

    step = jump;
  }
}

/**
 * Helper to compute Magnitude Spectrum from audio samples.
 */
export function computeSpectrum(input: Float32Array): Float32Array {
  const n = input.length;
  const real = new Float32Array(input);
  const imag = new Float32Array(n).fill(0);

  fft(real, imag);

  // Calculate magnitude: sqrt(re^2 + im^2)
  // We only need first n/2 + 1 bins
  const outputSize = n / 2 + 1;
  const spectrum = new Float32Array(outputSize);

  for (let i = 0; i < outputSize; i++) {
    spectrum[i] = Math.sqrt(real[i] * real[i] + imag[i] * imag[i]);
  }

  return spectrum;
}
