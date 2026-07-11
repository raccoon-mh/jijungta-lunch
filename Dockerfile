# 지정타 점심 — home server(lunch.raccoonhub.me) 배포용. GitHub Pages와 별개로 base=/ 재빌드.
FROM node:20-alpine AS build
WORKDIR /app
COPY web/package.json web/package-lock.json* ./
RUN npm ci --legacy-peer-deps || npm install --legacy-peer-deps
COPY web/ ./
RUN npx vite build --base=/ --outDir dist --emptyOutDir

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY docs/data /usr/share/nginx/html/data
