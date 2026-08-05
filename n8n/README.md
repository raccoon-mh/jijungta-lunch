# n8n 크롤러 (Playwright 크롤러 대체)

이 폴더가 **현재 운영되는 점심 메뉴 크롤러**다. 기존 `deploy/`(Playwright + tesseract + supercronic 컨테이너)와
`src/crawl.mjs`(인스타 릴스 OCR 등)는 **폐기**됐다 — 브라우저·OCR 없이 n8n 워크플로우로 재구현.
식당 3곳 전부(굿푸드·런치타임·강남밥상) HTTP GET + 문자열 파싱만으로 수집한다.

## 동작

raccoonlab 홈서버의 n8n(`n8n.raccoonhub.me`) 워크플로우 **"지정타 점심 크롤러"**.
평일 09:00~11:00 KST 30분 간격(5회) 스케줄 → Code 노드 → HTTP PUT 노드.

- **goodfood_xi**(굿푸드 상상자이): 카카오채널 JSON API
  `GET https://pf.kakao.com/rocket-web/web/profiles/_ExjIAn/posts` → `contents[0].v` 메뉴 텍스트. OCR 불필요.
- **lunchtime**(런치타임 과천) / **cookingtree**(쿠킹트리 한식뷔페): 채널 프로필 이미지가 곧 메뉴판.
  글은 안 올리고 이미지만 갈아끼우는 채널이라 `posts` API는 비어 있다.
  채널 페이지 `og:image` → 이미지 URL(`_m`→`_xl`)만 저장. **OCR 안 함, 프론트가 이미지로 표시**.
  프로필 이미지가 직전과 동일하면(미갱신) 스킵(stale 가드). 공통 함수 `crawlKakaoImage(id, …)` +
  `KAKAO_IMAGE_RESTAURANTS` 목록에 id만 추가하면 같은 유형의 식당을 늘릴 수 있다.
  - ⚠️ **두 채널 모두 전날 밤에 다음날 메뉴판으로 갈아끼운다**(밤에 보면 내일 것이 걸려 있음).
    크롤이 평일 09:00~11:00에만 돌기 때문에 그 시각엔 당일 메뉴가 걸려 있어 `menuDate = today`가 맞다.
    **밤에 손으로 1회 실행하면 내일 메뉴가 오늘 날짜로 저장되니 하지 말 것.**
- **gangnambab**(인스타 강남밥상): **2026-08-03 부활**(한때 드롭됐었다). 여전히 릴스(영상)로만 올라오지만
  **영상도 OCR도 브라우저도 필요 없다** — 인스타가 붙이는 자동 alt 텍스트("…text that says '…'")에
  메뉴판 문구가 통째로 들어있고, 그 alt가 무로그인 미러 `imginn.com`의 `og:description`으로 노출된다.
  - 프로필 `imginn.com/gangnambab/` → 최근 게시물 shortcode(최대 6개) → 각 `imginn.com/p/<code>/`의 `og:description`.
  - **메뉴판은 전날 저녁~아침에 올라오므로 게시일이 아니라 alt 안의 `N월 N일 … 메뉴`로 날짜를 판정**하고,
    오늘 날짜와 일치하는 첫 게시물만 채택. 없으면 스킵 → 다음 스케줄에서 재시도.
  - alt 꼬리의 가게 안내(`점심`/`뷔페`/`주소`/`PEN`/`오전`…)에서 잘라내고, 한글 없는 토큰·중복 꼬리
    (`토스트/` + `토스트/커피` + `커피`)를 정리. 프론트가 텍스트로 표시하므로 `image`는 빈 문자열
    (미러 URL을 커밋에 남기지 않음).
  - ⚠️ **미러 의존이 유일한 약점**: `imginn.com`이 죽거나 막히면 이 식당만 조용히 스킵된다
    (다른 두 곳은 영향 없음). 인스타 본체는 무로그인으로 빈 JS 셸만 주고, 로그인 세션은
    브라우저·2FA가 필요해 재도입하지 않는다.

기존 파일 내용+sha 는 GitHub Contents API(공개 레포=무인증 GET)로 읽고, 변경된 파일만
HTTP PUT(Contents API, `docs/data/<date>.json` + `dates.json`)로 커밋 → GitHub Pages 갱신.
변경 없으면 커밋 안 함(빈 커밋 방지).

### 09:00 실행만 실패하던 sha 충돌 (2026-08-05 수정)

증상: **매일 첫 실행(09:00)만 `error`**, 09:30 이후는 정상. 데이터는 다음 실행이 덮어써서 손실은 없었다.
에러는 `dates.json` PUT 에서 `is at <커밋A> but expected <커밋B>`.

원인은 **파일 sha 가 낡아서가 아니다** — 보낸 blob sha 는 실제 직전 상태와 정확히 일치했다.
그날 첫 실행만 PUT 이 2개(`<date>.json` 신규 + `dates.json` 갱신)인데, 두 PUT 이 밀리초 간격으로
나가면서 **GitHub 이 브랜치 ref 를 fast-forward 하는 단계에서 경합**한 것. 첫 PUT 은 성공해 커밋이
남고 두 번째가 409 로 떨어진다(그래서 "커밋은 됐는데 실행은 error" 라는 모순처럼 보인다).
09:30 이후 실행은 대개 PUT 이 0~1개라 재현되지 않았다.

대책(HTTP Request 노드):
- `options.batching = { batch: { batchSize: 1, batchInterval: 2000 } }` — 아이템당 1건씩, 2초 간격.
- `retryOnFail: true, maxTries: 3, waitBetweenTries: 5000` — 그래도 밀리면 재시도.
  blob sha 자체는 유효하므로 ref 경합만 풀리면 재시도가 성공한다.

식당을 추가하면 PUT 이 더 늘어나 경합 확률도 올라가므로 **이 설정을 지우지 말 것**.

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
