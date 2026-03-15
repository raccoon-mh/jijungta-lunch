#!/bin/bash
set -e

export PATH="$HOME/.nvm/versions/node/v25.6.1/bin:$PATH"

REPO_DIR="$HOME/workspace/jijungta-lunch"
cd "$REPO_DIR"

# 최신 코드 가져오기
git pull --ff-only

# 의존성 설치 (package-lock.json 변경 시에만)
npm ci --prefer-offline 2>/dev/null || npm install

# 크롤링 실행
node src/crawl.mjs

# data를 docs에도 복사 (GitHub Pages용)
mkdir -p "$REPO_DIR/docs/data"
cp "$REPO_DIR/data/"*-latest.json "$REPO_DIR/docs/data/" 2>/dev/null || true

# 결과 커밋 & 푸시
git add data/ docs/data/
if git diff --staged --quiet; then
  echo "변경사항 없음, 스킵"
else
  git commit -m "data: $(date '+%Y-%m-%d') 점심 메뉴 업데이트"
  git push
  echo "푸시 완료"
fi
