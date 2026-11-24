import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Hash routing + relative assets so the bundle works on any static host.
  base: './',
});
