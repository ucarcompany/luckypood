import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@abi': path.resolve(__dirname, '../shared/abi')
    }
  },
  server: { host: true, port: 5174 }
})
