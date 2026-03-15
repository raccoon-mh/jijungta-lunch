import { chromium } from 'playwright';
import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TARGET_URL = 'https://www.instagram.com/goodfood_xi/';

async function crawl() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 900 },
    locale: 'ko-KR',
  });
  const page = await context.newPage();

  try {
    console.log(`프로필 로드: ${TARGET_URL}`);
    await page.goto(TARGET_URL, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(3000);

    // 로그인 팝업 닫기
    try {
      await page.locator('svg[aria-label="닫기"], svg[aria-label="Close"]').first().click({ timeout: 3000 });
    } catch {}

    // 게시글 링크 수집
    const hrefs = await page.locator('a[href*="/p/"]').evaluateAll(els =>
      [...new Set(els.map(el => el.getAttribute('href')))].filter(Boolean)
    );

    if (hrefs.length === 0) {
      throw new Error('게시글을 찾을 수 없습니다.');
    }

    const latestPostUrl = `https://www.instagram.com${hrefs[0]}`;
    console.log(`최신 게시글: ${latestPostUrl}`);

    // 게시글 페이지 직접 방문
    const postPage = await context.newPage();
    await postPage.goto(latestPostUrl, { waitUntil: 'networkidle', timeout: 30000 });
    await postPage.waitForTimeout(2000);

    // 로그인 팝업 닫기
    try {
      await postPage.locator('svg[aria-label="닫기"], svg[aria-label="Close"]').first().click({ timeout: 3000 });
      await postPage.waitForTimeout(1000);
    } catch {}

    // 텍스트 추출
    const result = await postPage.evaluate(() => {
      const data = {};
      const metaDesc = document.querySelector('meta[property="og:description"]');
      if (metaDesc) data.meta = metaDesc.content;
      const metaTitle = document.querySelector('meta[property="og:title"]');
      if (metaTitle) data.title = metaTitle.content;
      const metaImage = document.querySelector('meta[property="og:image"]');
      if (metaImage) data.image = metaImage.content;

      const candidates = [];
      document.querySelectorAll('h1, span[dir="auto"]').forEach(el => {
        const t = el.innerText?.trim();
        if (t && t.length > 20 && !t.includes('로그인') && !t.includes('가입')) {
          candidates.push(t);
        }
      });
      if (candidates.length > 0) {
        data.body = candidates.sort((a, b) => b.length - a.length)[0];
      }
      return data;
    });

    // 결과 저장
    const now = new Date();
    const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
    const dateStr = kst.toISOString().split('T')[0]; // YYYY-MM-DD

    const output = {
      date: dateStr,
      url: latestPostUrl,
      crawled_at: kst.toISOString(),
      title: result.title || '',
      body: result.body || result.meta || '',
      image: result.image || '',
    };

    const dataDir = join(__dirname, '..', 'data');
    mkdirSync(dataDir, { recursive: true });

    const filePath = join(dataDir, `${dateStr}.json`);
    writeFileSync(filePath, JSON.stringify(output, null, 2), 'utf-8');
    console.log(`저장 완료: ${filePath}`);

    // latest.json도 저장
    writeFileSync(join(dataDir, 'latest.json'), JSON.stringify(output, null, 2), 'utf-8');
    console.log('latest.json 업데이트 완료');

    console.log('\n━━━ 메뉴 ━━━');
    console.log(output.body);
    console.log('━━━━━━━━━━━━');

  } catch (err) {
    console.error('에러:', err.message);
    process.exit(1);
  } finally {
    await browser.close();
  }
}

crawl();
