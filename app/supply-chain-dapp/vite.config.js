// vite.config.js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {

      'wagmi/providers/public': resolve(__dirname, 'node_modules', 'wagmi', 'dist', 'providers', 'public'),
    },
  },
  optimizeDeps: {
    include: ['wagmi/providers/public'],
  },
});
