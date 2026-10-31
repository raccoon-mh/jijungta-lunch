import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'
import fs from 'fs'

// GitHub Pages는 클라이언트 라우트(/liquid 등) 직접 진입 시 404를 낸다.
// 빌드 후 index.html을 404.html로 복사하면 SPA가 폴백으로 로드돼 라우팅이 동작한다.
function spaFallback() {
  return {
    name: 'spa-404-fallback',
    closeBundle() {
      const outDir = path.resolve(__dirname, '../docs')
      const index = path.join(outDir, 'index.html')
      if (fs.existsSync(index)) {
        fs.copyFileSync(index, path.join(outDir, '404.html'))
      }
    },
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss(), spaFallback()],
  base: '/jijungta-lunch/',
  build: {
    outDir: '../docs',
    emptyDir: false,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
