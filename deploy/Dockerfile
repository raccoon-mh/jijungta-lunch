# 지정타 점심 크롤러 — 평일 오전 인스타 크롤 + OCR + git push. supercronic 스케줄.
FROM mcr.microsoft.com/playwright:v1.52.0-jammy
RUN apt-get update && apt-get install -y --no-install-recommends \
      tesseract-ocr tesseract-ocr-kor tesseract-ocr-eng git openssh-client curl ca-certificates \
    && rm -rf /var/lib/apt/lists/*
RUN curl -fsSLo /usr/local/bin/supercronic \
      https://github.com/aptible/supercronic/releases/download/v0.2.33/supercronic-linux-amd64 \
    && chmod +x /usr/local/bin/supercronic
WORKDIR /app
ARG REPO_REF=main
RUN echo "ref=${REPO_REF}" && git clone --depth 50 https://github.com/raccoon-mh/jijungta-lunch.git .
RUN npm install --no-audit --no-fund
RUN npx playwright install chromium
COPY entrypoint.sh /entrypoint.sh
COPY crawl-once.sh /app/crawl-once.sh
RUN chmod +x /entrypoint.sh /app/crawl-once.sh
ENTRYPOINT ["/entrypoint.sh"]
