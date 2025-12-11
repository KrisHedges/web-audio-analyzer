import { describe, it, expect } from 'vitest';
import { transformToImpulseResponse } from '../transformer';
import { AnalysisResult } from '../types';

describe('Transformer', () => {
    // Mock result
    const mockResult: AnalysisResult = {
        classification: {
            type: 'Reverb',
            duration_category: 'Short',
            brightness_category: 'Bright',
            texture_category: 'Smooth'
        },
        analysis_data: {
            file_meta: {
                output_wav_path: '',
                duration_seconds: 10
            },
            musical_features: {
                rms_energy: 0.5,
                brightness_spectral_centroid: 2000,
                texture_spectral_flatness: 0.1,
                peak_count: 0,
                estimated_decay_time: '0.73s'
            },
            vectors: {
                amplitude_envelope: [0.1, 0.2, 0.3],
                frequency_bands_db: { "0-100hz": -30 }
            }
        }
    };

    it('should transform analysis result to impulse response payload', () => {
        const payload = transformToImpulseResponse(mockResult, {
            wav_file_url: 'impulse-responses/123.wav',
            created_at: '2025-01-01',
            original_filename: '/path/to/Roland SE-50 Hall.wav'
        });


        expect(payload.wav_file_url).toBe('impulse-responses/123.wav');
        expect(payload.name).toBe('Roland SE-50 Hall'); // Extracted from file
        
        // Assert JSON stringification
        expect(payload.amplitude_envelope).toBe('[0.1,0.2,0.3]');
        expect(payload.frequency_bands_db).toBe('{"0-100hz":-30}');
        
        // Assert heuristic
        expect(payload.source_manufacturer).toBe('Roland');
        expect(payload.source_model).toBe('SE-50');
    });

    it('should handle file names without brands gracefully', () => {
         // Create fresh copy of mockResult
         const result = JSON.parse(JSON.stringify(mockResult));
         
         const payload = transformToImpulseResponse(result, { 
             wav_file_url: 'foo',
             original_filename: 'MyCoolSpace.wav' 
         });
         
         expect(payload.name).toBe('MyCoolSpace');
         expect(payload.source_manufacturer).toBeNull();
    });
});
