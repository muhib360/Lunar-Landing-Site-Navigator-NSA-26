import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  // Relative base so the static build works from any subpath (e.g. GitHub Pages).
  base: './',
  // CesiumJS runtime files are copied to public/cesium by scripts/copy-cesium.mjs (predev/prebuild).
  plugins: [react()],
})
