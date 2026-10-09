import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // The linked shared package emits CommonJS and must be prebundled in development.
  optimizeDeps: { include: ['shared'] },
  server: { proxy: { '/api': 'http://127.0.0.1:3001' } },
})
