import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // בקשות ל-/api עוברות לשרת ה-Express
    proxy: { '/api': 'http://localhost:4000' },
  },
});
