#!/usr/bin/env bash
set -u
cd /app
export GIT_SSH_COMMAND="ssh -i /root/.ssh/id_ed25519 -o StrictHostKeyChecking=accept-new -o UserKnownHostsFile=/dev/null"
git config user.name "Minhyeok LEE"
git config user.email "wsx1341@gmail.com"
git config pull.ff only
git remote set-url origin git@github.com:raccoon-mh/jijungta-lunch.git

# 즉시 1회 (테스트/수동): RUN_ONCE=1
if [ "${RUN_ONCE:-0}" = "1" ]; then exec /app/crawl-once.sh; fi

# 평일(월~금) 09:00~11:00, 30분 간격 → 09:00 09:30 10:00 10:30 11:00
cat > /app/crontab <<CRON
0,30 9,10 * * 1-5 /app/crawl-once.sh
0 11 * * 1-5 /app/crawl-once.sh
CRON
echo "[entrypoint] supercronic 시작 — 평일 09:00~11:00/30분 (TZ=${TZ:-UTC})"
exec supercronic /app/crontab
