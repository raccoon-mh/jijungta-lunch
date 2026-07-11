# 홈서버 크롤러 배포 (raccoonlab)

프론트는 GitHub Pages, 이 디렉토리는 **데이터 수집 크롤러를 홈서버에서 스케줄 실행**하기 위한 빌드 인프라.
(홈랩 고유 경로·시크릿은 여기 없음 — 서버측 compose/`.auth`에서 주입.)

- 이미지: `docker build -f deploy/Dockerfile deploy/` (repo는 빌드 시 공개 clone).
- 실행: supercronic으로 **평일 09:00~11:00 KST/30분** 크롤 → OCR → `docs/data` 커밋 → git push.
- 런타임 마운트(서버측): 세션쿠키 → `/app/.instagram-cookies.json`, 인스타 계정(ro) → `.../.auth/instagram`,
  git push용 deploy key(ro) → `/root/.ssh/id_ed25519`. `init: true`(tini) 필요.
