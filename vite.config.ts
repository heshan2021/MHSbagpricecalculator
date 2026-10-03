import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

/* Three separate documents, exactly like the legacy folder:
     index.html       -> the two-card chooser      (/  and  /home)
     calculator.html  -> the customer calculator   (/calculator)
     admin.html       -> the rate control panel    (/admin  and  /dashboard)
   A multi-page build keeps each page's own stylesheet isolated - the legacy pages style
   .card / .field / .btn / .tag differently, so sharing one bundle would shift the pixels. */
export default defineConfig({
  base: './',                       // relative URLs: dist/ also works when opened from the file system
  plugins: [react()],
  server: {
    port: 8081,                     // serve.js owns 8080; dev proxies the rate-card API to it
    strictPort: false,
    proxy: {
      '/api/rates': { target: 'http://localhost:8080', changeOrigin: false },
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        home: resolve(__dirname, 'index.html'),
        calculator: resolve(__dirname, 'calculator.html'),
        admin: resolve(__dirname, 'admin.html'),
      },
    },
  },
});
