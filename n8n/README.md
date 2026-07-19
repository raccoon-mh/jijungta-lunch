# n8n 크롤러 (Playwright 크롤러 대체)

이 폴더가 **현재 운영되는 점심 메뉴 크롤러**다. 기존 `deploy/`(Playwright + tesseract + supercronic 컨테이너)와
`src/crawl.mjs`(인스타 릴스 OCR 등)는 **폐기**됐다 — 브라우저·OCR·인스타 없이 n8n 워크플로우로 재구현.

## 동작

raccoonlab 홈서버의 n8n(`n8n.raccoonhub.me`) 워크플로우 **"지정타 점심 크롤러"**.
평일 09:00~11:00 KST 30분 간격(5회) 스케줄 → Code 노드 → HTTP PUT 노드.

- **goodfood_xi**(굿푸드 상상자이): 카카오채널 JSON API
  `GET https://pf.kakao.com/rocket-web/web/profiles/_ExjIAn/posts` → `contents[0].v` 메뉴 텍스트. OCR 불필요.
- **lunchtime**(런치타임 과천): 채널 프로필 이미지가 곧 메뉴판.
  채널 페이지 `og:image` → 이미지 URL(`_m`→`_xl`)만 저장. **OCR 안 함, 프론트가 이미지로 표시**.
  프로필 이미지가 직전과 동일하면(미갱신) 스킵(stale 가드).
- **gangnambab**(인스타 강남밥상): **드롭**. 릴스 영상 프레임 OCR = 브라우저 필수라 제외.

기존 파일 내용+sha 는 GitHub Contents API(공개 레포=무인증 GET)로 읽고, 변경된 파일만
HTTP PUT(Contents API, `docs/data/<date>.json` + `dates.json`)로 커밋 → GitHub Pages 갱신.
변경 없으면 커밋 안 함(빈 커밋 방지).

## 파일

- `crawl.code.js` — Code 노드 소스(정본). n8n Code 노드에 붙여넣는 내용.
- `workflow.json` — 워크플로우 export. `credentials.httpHeaderAuth` 는 **id 참조만**(토큰 없음).

## 인증

GitHub 커밋은 n8n **Header Auth 크레덴셜**(`Authorization: Bearer <PAT>`)로.
- PAT: fine-grained, `raccoon-mh/jijungta-lunch` 레포 only, **Contents: Read and write**.
- 서버에는 `~/workspace/.auth/jijungta-lunch-n8n`(형식 `PAT=github_pat_...`).
- n8n Code 노드는 task runner가 env/credential 접근을 막으므로 토큰을 **HTTP 노드의 크레덴셜**로 처리(Code 노드는 커밋 안 함).

## 재배포 (워크플로우 갱신)

n8n Public API 로 import/update (호스트 loopback은 IP정책상 403 → docker 네트워크로):

```bash
NKEY=$(grep -E '^N8N_API_KEY=' ~/workspace/.auth/n8n | cut -d= -f2-)
docker run -i --rm --network nginxui_default curlimages/curl -s \
  -X PUT -H "X-N8N-API-KEY: $NKEY" -H "Content-Type: application/json" \
  --data-binary @- "http://n8n:5678/api/v1/workflows/9A9K1up6Qn8tMSDX" < n8n/workflow.json
```

헤드리스 테스트(수동 트리거 사본 필요): `docs/../.claude` 메모리 `n8n-code-node-env-block` 참고.
