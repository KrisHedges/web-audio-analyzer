export interface Classification {
  type: 'Reverb' | 'Echo/Delay';
  duration_category: 'Short' | 'Medium' | 'Long';
  brightness_category: 'Subsonic' | 'Very Dark' | 'Dark' | 'Low-Mid' | 'Mid' | 'High-Mid' | 'Bright' | 'Very Bright';
  texture_category: 'Smooth' | 'Textured' | 'Grainy' | 'Echoic';
}

export interface FileMeta {
  original_path: string;
  output_wav_path: string;
  duration_seconds: number;
}

export interface MusicalFeatures {
  rms_energy: number;
  brightness_spectral_centroid: number;
  texture_spectral_flatness: number;
  peak_count: number;
  estimated_decay_time: string; // formatted as "0.00s"
}

export interface Vectors {
  amplitude_envelope: number[];
  frequency_bands_db: Record<string, number>;
}

export interface AnalysisData {
  file_meta: FileMeta;
  musical_features: MusicalFeatures;
  vectors: Vectors;
}

export interface AnalysisResult {
  classification: Classification;
  analysis_data: AnalysisData;
}
