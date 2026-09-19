import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Куда dev-сервер отправляет запросы к /api.
//
// По умолчанию — бекенд на Render: тогда сайт открывается без запуска функций
// на своей машине. Сам код сайта об этом не знает и ходит по относительному
// /api, поэтому в проде, где фронт и бек лежат на одном домене, всё работает
// без правок.
//
// Нужен локальный бекенд — запусти его и укажи адрес:
//   VITE_API_PROXY=http://127.0.0.1:7071 npm run dev
const API = process.env.VITE_API_PROXY || 'https://rustics-api.onrender.com'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: API,
        changeOrigin: true,
        // Бесплатный тариф Render засыпает после 15 минут без запросов, и
        // первый запрос ждёт, пока поднимется контейнер. С прежними 10
        // секундами он обрывался, и сайт показывал «недоступно».
        timeout: 90000,
        proxyTimeout: 90000,
      },
    },
  },
})
