import { AnalysisResult } from './types';

/**
 * Shape of the Impulse Response record expected by the API/Database,
 * based on the provided user example.
 * Note: Arrays and Objects are stringified.
 */
export interface ImpulseResponsePayload {

    created_at?: string;
    name: string;
    type: string;
    duration_category: string;
    brightness_category: string;
    texture_category: string;
    
    source_type: string;
    source_location: string | null;
    source_architecture: string | null;
    source_manufacturer: string | null;
    source_model: string | null;
    
    space_type: string;
    space_duration_category: string;
    space_brightness_category: string;
    space_texture_category: string;
    space_size: string | null;
    
    duration_seconds: number;
    rms_energy: number;
    brightness_spectral_centroid: number;
    texture_spectral_flatness: number;
    peak_count: number;
    estimated_decay_time: string;
    
    amplitude_envelope: string; // JSON string "[]"
    frequency_bands_db: string; // JSON string "{}"
    
    wav_file_url: string;
    original_path: string;
}

/**
 * Transforms an AnalysisResult into the flat ImpulseResponsePayload format.
 * Applies heuristics to guess manufacturer/model from the filename.
 */
export function transformToImpulseResponse(
    result: AnalysisResult, 
    extra: { 
        wav_file_url: string; 
        created_at?: string;
    }
): ImpulseResponsePayload {
    const { file_meta, musical_features, vectors } = result.analysis_data;
    const { classification } = result;
    
    // 1. Name inference
    // Remove extension and underscores
    const originalName = file_meta.original_path.split('/').pop() || "";
    const name = originalName.replace(/\.[^/.]+$/, "").replace(/_/g, " ");
    
    // 2. Manufacturer/Model inference (Simple Heuristics)
    const { manufacturer, model, sourceType } = guessSourceInfo(name);

    return {
        created_at: extra.created_at,
        
        name: name,
        type: classification.type,
        duration_category: classification.duration_category,
        brightness_category: classification.brightness_category,
        texture_category: classification.texture_category,
        
        source_type: sourceType,
        source_location: null,
        source_architecture: null,
        source_manufacturer: manufacturer,
        source_model: model,
        
        // Map space_* to same as main categories for now, as in example
        space_type: classification.type,
        space_duration_category: classification.duration_category,
        space_brightness_category: classification.brightness_category,
        space_texture_category: classification.texture_category,
        space_size: null,
        
        duration_seconds: file_meta.duration_seconds,
        rms_energy: musical_features.rms_energy,
        brightness_spectral_centroid: musical_features.brightness_spectral_centroid,
        texture_spectral_flatness: musical_features.texture_spectral_flatness,
        peak_count: musical_features.peak_count,
        estimated_decay_time: musical_features.estimated_decay_time,
        
        // Stringify vectors
        amplitude_envelope: JSON.stringify(vectors.amplitude_envelope),
        frequency_bands_db: JSON.stringify(vectors.frequency_bands_db),
        
        wav_file_url: extra.wav_file_url,
        original_path: file_meta.original_path
    };
}

// --- Heuristics ---

const BRANDS = ["Roland", "Yamaha", "Korg", "Lexicon", "Bricasti", "Eventide", "TC Electronic", "Sony", "Fender", "Marshall"];

function guessSourceInfo(name: string): { manufacturer: string | null, model: string | null, sourceType: string } {
    let manufacturer: string | null = null;
    let model: string | null = null;
    let sourceType = "Device"; // Default
    
    // Check known brands
    for (const brand of BRANDS) {
        if (new RegExp(`\\b${brand}\\b`, 'i').test(name)) {
            manufacturer = brand;
            break;
        }
    }
    
    // If manufacturer found, try to guess model (word after manufacturer or just the rest?)
    // For "SE-50 Hall", if we knew SE-50 is a model...
    // Let's assume if the name starts with a brand, the next word is the model.
    if (manufacturer) {
        // Simple regex to find the word after the manufacturer
        const parts = name.split(/\s+/);
        const brandIdx = parts.findIndex(p => p.toLowerCase() === manufacturer!.toLowerCase());
        if (brandIdx !== -1 && brandIdx + 1 < parts.length) {
            // Take the next part as model, or maybe next two if short?
            // "Roland SE-50" -> Model SE-50
            model = parts[brandIdx + 1];
        }
    } else {
        // If no manufacturer found, maybe check specific known models?
        if (/SE-50/i.test(name)) { manufacturer = "Roland"; model = "SE-50"; }
        else if (/PCM/i.test(name)) { manufacturer = "Lexicon"; }
        else if (/SPX/i.test(name)) { manufacturer = "Yamaha"; }
    }

    return { manufacturer, model, sourceType };
}
