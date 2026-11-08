import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: './',
  // GitHub Pages serves main:/docs, so the build lands there (see README, "Deploying").
  build: { outDir: 'docs', emptyOutDir: true, sourcemap: true },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    globals: false
  }
});
