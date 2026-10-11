import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// tokens.css lives in ../design and is the single source of truth.
export default defineConfig({
  plugins: [react()],
  server: { fs: { allow: ['..'] }, port: 5173, strictPort: false },
})
