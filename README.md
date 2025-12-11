# Web Audio Analyzer

A lightweight, dependency-free library for analyzing audio buffers in the browser. It extracts musical features (RMS energy, spectral brightness, texture) and robustly classifies audio as **Reverb** or **Delay** based on peak detection and density.

## Installation

This package is intended to be used as a library.

```bash
# Install via npm/yarn (once published)
yarn add web-audio-analyzer
```

## Usage

```typescript
import { analyzeAudioBuffer } from 'web-audio-analyzer';

// Assuming you have an AudioBuffer (e.g., from AudioContext.decodeAudioData)
const audioBuffer = ...;

const result = analyzeAudioBuffer(audioBuffer);

console.log(result.classification);
// Output:
// {
//   type: 'Delay',
//   duration_category: 'Short',
//   brightness_category: 'Low',
//   texture_category: 'Energetic'
// }

console.log(result.analysis_data.musical_features);
// Output:
// {
//   rms_energy: 0.002,
//   peak_count: 4,
//   estimated_decay_time: '1.5s',
//   ...
// }
```

## Features

-   **Robust Peak Detection**: Uses prominence checks and adaptive thresholds to distinguish distinct delay taps from reverb reflections, even in sparse signals.
-   **Classification**: Automatically categorizes audio into types (Reverb/Delay) and descriptors (Brightness, Texture, Duration).
-   **Spectral Analysis**: Provides frequency band energy distribution and spectral centroid data.
-   **Zero Dependencies**: Pure TypeScript implementation using standard Web Audio API structures.

## Development

### Setup

```bash
yarn install
```

### Commands

-   `yarn dev`: Start the development server (interactive demo).
-   `yarn build`: Build the library for production (outputs to `dist/`).
-   `yarn test run`: Run unit tests once.
-   `yarn lint`: Run ESLint.
-   `yarn format`: Format code with Prettier.
-   `yarn typecheck`: Run TypeScript type checking.

### CI/CD

This project uses [GitHub Actions](.github/workflows/ci.yml) to ensure code quality. On every push and pull request to `main`, it runs:
-   Linting & Formatting checks
-   Type checking
-   Unit tests (Vitest)

## License

[MIT](LICENSE)
