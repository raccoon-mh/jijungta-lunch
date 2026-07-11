#!/usr/bin/env bash
set -u
cd /app
export GIT_SSH_COMMAND="ssh -i /root/.ssh/id_ed25519 -o StrictHostKeyChecking=accept-new -o UserKnownHostsFile=/dev/null"
echo "[$(date '+%F %T %Z')] === crawl 시작 ==="
git pull --ff-only 2>&1 | tail -1 || echo "pull 실패(계속)"
node src/crawl.mjs || echo "⚠️ 일부 크롤 실패(부분 저장)"
git add docs/data/
if git diff --staged --quiet; then
  echo "변경 없음, 커밋 스킵"
else
  git commit -m "data: $(date '+%Y-%m-%d') 점심 메뉴 업데이트" && git push && echo "푸시 완료"
fi
