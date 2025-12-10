import { describe, it, expect } from 'vitest';
import { analyzeAudioBuffer } from '../analyzer';
import { FFT } from '../fft';

// Mock AudioBuffer
function createMockBuffer(data: Float32Array, sampleRate = 44100): AudioBuffer {
  return {
    length: data.length,
    duration: data.length / sampleRate,
    sampleRate: sampleRate,
    numberOfChannels: 1,
    getChannelData: () => data,
    copyFromChannel: () => {},
    copyToChannel: () => {},
  } as unknown as AudioBuffer;
}

describe('FFT', () => {
    it('should initialize tables correctly', () => {
        const fft = new FFT(16);
        expect(fft.size).toBe(16);
        expect(fft.sinTable.length).toBe(16);
    });
});

describe('Analyzer', () => {
  it('should analyze silence correctly', () => {
    const silence = new Float32Array(44100).fill(0);
    const buffer = createMockBuffer(silence);
    
    const result = analyzeAudioBuffer(buffer);
    
    expect(result.analysis_data.musical_features.rms_energy).toBe(0);
    expect(result.analysis_data.musical_features.peak_count).toBe(0);
    expect(result.classification.type).toBe('Reverb'); // Default if peaks <= 1
  });

  it('should detect simple sine wave properties', () => {
    // Generate 1 second of 440Hz sine wave at 0.5 amplitude
    const sr = 44100;
    const data = new Float32Array(sr);
    const freq = 440;
    for(let i=0; i<sr; i++) {
        data[i] = 0.5 * Math.sin(2 * Math.PI * freq * i / sr);
    }
    
    const buffer = createMockBuffer(data);
    const result = analyzeAudioBuffer(buffer);
    
    // RMS of sine wave with amp A is A / sqrt(2) = 0.5 * 0.707 = 0.3535
    // After normalization (max=0.5 -> becomes max=1.0), RMS should be ~0.707?
    // analyze function normalizes audio first.
    // Normalized sine: amp=1.0. RMS = 1/sqrt(2) = 0.707
    expect(result.analysis_data.musical_features.rms_energy).toBeCloseTo(0.707, 2);
    
    // Smooth (low turbulence)
    // Sine wave is constant amplitude (0 turbulence).
    expect(result.classification.texture_category).toBe('Smooth');
    expect(result.classification.brightness_category).toBe('Dark');
  });

  it('should detect delay/echo properties', () => {
    // Generate 2 seconds of synthetic delay: impulses at 0s, 0.5s, 1.0s
    const sr = 44100;
    const data = new Float32Array(sr * 2).fill(0);
    
    // Simple impulses (rect)
    // t=0
    for(let i=0; i<100; i++) data[i] = 1.0;
    // t=0.5s (22050)
    for(let i=22050; i<22050+100; i++) data[i] = 0.6;
    // t=1.0s (44100)
    for(let i=44100; i<44100+100; i++) data[i] = 0.3;
    
    const buffer = createMockBuffer(data);
    const result = analyzeAudioBuffer(buffer);
    
    // Should have multiple peaks
    expect(result.analysis_data.musical_features.peak_count).toBeGreaterThan(1);
    expect(result.classification.type).toBe('Echo/Delay');
    
    // Turbulence should be high (gaps of silence)
    // "Echoic" > 8.0? Or at least Grainy > 4.0?
    // With pure silence gaps, RMSE will be massive.
    expect(result.classification.texture_category).toBe('Echoic');
  });

  it('should throw on empty buffer', () => {
     const empty = createMockBuffer(new Float32Array(0));
     expect(() => analyzeAudioBuffer(empty)).toThrow("Audio buffer is empty");
  });
});
