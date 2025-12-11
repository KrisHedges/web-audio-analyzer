# Project Context: Web Audio Analyzer

## Overview
`web-audio-analyzer` is a TypeScript library for analyzing `AudioBuffer` objects in the browser. It is designed to extract impulse response characteristics to classify them (e.g., as "Plate Reverb", "Tape Delay") and provide quantitative analysis data.

## Tech Stack
-   **Language**: TypeScript
-   **Build Tool**: Vite (Library Mode)
-   **Testing**: Vitest + JSDOM
-   **Package Manager**: Yarn (Berry) with `node-modules` linker (due to JSDOM/Parse5 PnP issues).
-   **Linting**: ESLint (Flat Config) + Prettier.

## Key Components

### `src/analyzer.ts`
The core logic resides here.
-   **`analyzeAudioBuffer(buffer)`**: Main entry point.
-   **Peak Detection**: Uses a relative threshold (5% of max) and an absolute floor (0.0001) with a prominence check (1.55x rise) to robustly identify delay taps.
-   **Classification**: Determines `type` (Reverb vs Delay) based on peak count and density.

### `src/transformer.ts`
Helper to transform the raw analysis result into a specific JSON payload format used by the consuming application (Impulse Record Database).

### `src/types.ts`
Defines the `AnalysisResult`, `Classification`, and `FileMeta` interfaces.

## Development Workflows

-   **Testing**: Run `yarn test run`. Tests mock `AudioBuffer` data.
-   **Building**: `yarn build` produces ESM and UMD bundles in `dist/`.
-   **CI**: GitHub Actions enforces lint, format, typecheck, and tests on PRs.

## Recent Changes
-   **Peak Detection Refinement**: Lowered thresholds to detect sparse/quiet delay taps.
-   **CI fixes**: Switched to `node-modules` linker to fix `jsdom` issues.
-   **Dependencies**: Updated `jsdom` and `vitest` to latest versions.
