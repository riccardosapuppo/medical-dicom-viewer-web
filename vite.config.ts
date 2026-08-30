import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  worker: {
    format: 'es',
  },
  server: {
    port: 3000,
    proxy: {
      '/dicom-web': {
        target: 'http://localhost:8042',
        changeOrigin: true,
      },
    },
  },
});
