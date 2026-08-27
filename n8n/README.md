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
- **gangnambab**(인스타 강남밥상): 릴스(영상)로만 올라오지만 **영상도 OCR도 브라우저도 필요 없다** —
  인스타가 붙이는 자동 alt 텍스트("…text that says '…'")에 메뉴판 문구가 통째로 들어있다.
  - **2026-08-27 소스 교체**: 미러(`imginn.com`) → **인스타 본체 직접**. 아래 "미러 붕괴" 절 참고.
  - 게시물 페이지 `https://www.instagram.com/p/<code>/`를 **크롤러 UA(Googlebot)**로 받으면 SSR 된
    JSON(`polaris_ordered_timeline_connection`)이 실려 오고, 거기 **그 계정 최근 게시물 12개의
    `code` + `accessibility_caption`(= 자동 alt)**가 함께 들어있다. 요청 1번이면 끝.
  - 진입점(시드)은 **직전에 채택한 메뉴 게시물의 shortcode** — 저장된 `docs/data/<date>.json`의
    `gangnambab.url`에서 뽑는다(그래서 `url`에 릴스 링크를 저장한다 = 자체 갱신 시드).
    시드가 지워졌으면 `IG_SEED` 상수로 폴백.
  - **메뉴판은 전날 저녁~아침에 올라오므로 게시일이 아니라 alt 안의 `N월 N일 … 메뉴`로 날짜를 판정**하고,
    오늘 날짜와 일치하는 첫 게시물만 채택. 없으면 스킵 → 다음 스케줄에서 재시도.
  - alt 꼬리의 가게 안내(`점심`/`뷔페`/`주소`/`PEN`/`오전`…)에서 잘라내고, 한글 없는 토큰·중복 꼬리
    (`토스트/` + `토스트/커피` + `커피`)를 정리. 프론트가 텍스트로 표시하므로 `image`는 빈 문자열.
  - ⚠️ **일반 UA·프로필 페이지로는 안 된다**: 일반 UA는 빈 JS 셸, 프로필/릴스 탭은 크롤러 UA로 받아도
    `accessibility_caption`이 0개다(실측). **게시물 페이지 + 크롤러 UA** 조합이어야 한다.

기존 파일 내용+sha 는 GitHub Contents API(공개 레포=무인증 GET)로 읽고, 변경된 파일만
HTTP PUT(Contents API, `docs/data/<date>.json` + `dates.json`)로 커밋 → GitHub Pages 갱신.
변경 없으면 커밋 안 함(빈 커밋 방지).

### 미러(imginn) 붕괴 → 인스타 직접으로 교체 (2026-08-27)

증상: **강남밥상만 조용히 빠진 채** 나머지 세 곳은 정상 수집. 커밋도 에러도 없었다
(크롤러가 "오늘 메뉴 아직 안 올라옴"과 구분하지 않고 그냥 스킵하기 때문).

원인: `imginn.com`이 **Cloudflare 챌린지("Just a moment…")로 전환** → 서버(데이터센터 IP)에서
`403`. 대체 미러를 훑었지만 **imgsed·picnob·pixwox·piokok는 전부 같은 CF 뒤(pixnoy)로 리다이렉트,
picuki·gramhir·sotwe는 404, rsshub.app도 CF** — 무로그인 미러 생태계가 사실상 죽었다.

대책: 미러를 버리고 **인스타 본체에서 직접** 같은 alt 텍스트를 얻는다. 일반 UA로는 빈 JS 셸이지만
**크롤러 UA(Googlebot)로 게시물 페이지를 받으면 SSR 된 JSON이 실려 오고**, 그 안에 최근 게시물의
`accessibility_caption`이 12개 들어있다 — 미러가 `og:description`으로 주던 것과 **같은 문자열**이라
파서(`parseIgMenuAlt`)는 손대지 않았다. 브라우저·로그인·OCR 여전히 없음.

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
