import { defineConfig } from 'vitest/config';

// The components are custom elements: they need a DOM. A local config also lets the package be
// tested on its own (without it Vitest would walk up to the root configuration).
export default defineConfig({ test: { environment: 'happy-dom' } });
