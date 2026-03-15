<div align="center">

# 🍽 지정타 점심

**과천 지식정보타운 점심 메뉴 대시보드**

매일 아침 자동으로 수집 · 한눈에 비교 · 오늘 뭐 먹지?

[![Live](https://img.shields.io/badge/Live-raccoon--mh.github.io-F59015?style=for-the-badge&logo=github-pages&logoColor=white)](https://raccoon-mh.github.io/jijungta-lunch/)
[![GitHub Pages](https://img.shields.io/github/deployments/raccoon-mh/jijungta-lunch/github-pages?style=for-the-badge&label=deploy&color=2C2520)](https://github.com/raccoon-mh/jijungta-lunch/deployments)

</div>

---

## How it works

```
┌─────────────┐     ┌──────────────┐     ┌──────────────┐     ┌────────────┐
│  n8n cron   │────▶│  Playwright   │────▶│  Tesseract   │────▶│  GitHub    │
│  평일 9·10시  │     │  + sharp     │     │  OCR (kor)   │     │  Pages     │
└─────────────┘     └──────────────┘     └──────────────┘     └────────────┘
                     Instagram · Kakao     이미지 → 텍스트       React SPA
```

## 식당

| | 식당 | 소스 | 크롤링 방식 |
|---|---|---|---|
| 🍚 | **굿푸드** 상상자이점 | Instagram | 게시글 텍스트 추출 |
| 🍛 | **강남밥상** 과천점 | Instagram | 릴스 영상 프레임 → OCR |
| 🍱 | **런치타임** 어반허브 | Kakao 채널 | 프로필 이미지 → OCR |

> 새 식당 추가: `src/crawl.mjs`에 크롤러 등록 + `web/src/lib/restaurants.js`에 카드 추가

## Stack

| Layer | Tech |
|---|---|
| Crawler | Node.js · Playwright · sharp · Tesseract OCR |
| Frontend | React · Tailwind CSS v4 · Vite |
| Automation | n8n · SSH · GitHub Pages |
| Fonts | Pretendard · Noto Serif KR |

## Project Structure

```
src/
  crawl.mjs          # 크롤러 (3개 식당, 3가지 방식)
  backfill.mjs       # 과거 데이터 백필
data/
  dates.json         # 날짜 인덱스
  2026-03-16.json    # 날짜별 메뉴 (모든 식당 통합)
web/
  src/
    App.jsx          # 메인 앱 (날짜 네비게이션)
    components/      # Header, DateNav, MenuCard
    lib/             # 식당 설정, 메뉴 파서
docs/                # GitHub Pages 빌드 출력
run.sh               # n8n이 실행하는 엔트리포인트
```

## License

MIT

</div>
