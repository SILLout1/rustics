import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

// Собирает весь лендинг в один HTML со встроенными ассетами.
// Нужен только чтобы отправить макет на согласование, в прод не идёт.
export default defineConfig({
  plugins: [react(), viteSingleFile()],
  build: {
    outDir: 'preview-dist',
    assetsInlineLimit: 100 * 1024 * 1024,
    cssCodeSplit: false,
  },
});
