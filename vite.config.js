import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'
import localAiInventory from './src/dev/localAiInventory.js'

export default defineConfig({
  // localAiInventory is dev-only (apply: 'serve') — see src/dev/localAiInventory.js.
  plugins: [vue(), localAiInventory()],
  root: '.',
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src/dashboard')
    }
  },
  server: {
    port: 5173,
    host: true,
    proxy: {
      '/api': {
        // Worker API. Override when 8787 is taken (WORKER_PORT=8788 npm run dev).
        target: `http://localhost:${process.env.WORKER_PORT || 8787}`,
        changeOrigin: true
      }
    }
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true
  }
})
