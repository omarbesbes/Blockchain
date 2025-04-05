// vite.config.js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // Alias the "wagmi/providers/public" import to the correct directory.
      // Note: We alias to the folder rather than a specific file.
      'wagmi/providers/public': resolve(__dirname, 'node_modules', 'wagmi', 'dist', 'providers', 'public'),
    },
  },
  optimizeDeps: {
    include: ['wagmi/providers/public'],
  },
});
