import { chromium } from 'playwright';
import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TARGET_URL = 'https://www.instagram.com/goodfood_xi/';
const SCREENSHOTS_DIR = join(__dirname, '..', 'screenshots');

function saveScreenshot(page, name) {
  mkdirSync(SCREENSHOTS_DIR, { recursive: true });
  return page.screenshot({ path: join(SCREENSHOTS_DIR, `${name}.png`), fullPage: true });
}

async function crawl() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 900 },
    locale: 'ko-KR',
  });
  const page = await context.newPage();

  try {
    // 1. 프로필 페이지 로드
    console.log(`프로필 로드: ${TARGET_URL}`);
    await page.goto(TARGET_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    // networkidle 대신 충분히 대기
    await page.waitForTimeout(5000);

    await saveScreenshot(page, '01-profile');

    // 로그인 팝업/배너 닫기 (여러 패턴 시도)
    for (const selector of [
      'svg[aria-label="닫기"]',
      'svg[aria-label="Close"]',
      'button:has-text("Not Now")',
      'button:has-text("나중에 하기")',
      'div[role="dialog"] button:first-child',
    ]) {
      try {
        await page.locator(selector).first().click({ timeout: 2000 });
        await page.waitForTimeout(1000);
        console.log(`팝업 닫기 성공: ${selector}`);
        break;
      } catch {}
    }

    await page.waitForTimeout(2000);
    await saveScreenshot(page, '02-after-popup');

    // 2. 게시글 링크 수집
    const hrefs = await page.locator('a[href*="/p/"]').evaluateAll(els =>
      [...new Set(els.map(el => el.getAttribute('href')))].filter(Boolean)
    );
    console.log(`게시글 수: ${hrefs.length}`);

    // 게시글 못 찾으면 스크롤 후 재시도
    if (hrefs.length === 0) {
      console.log('게시글 미발견, 스크롤 후 재시도...');
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(3000);
      await saveScreenshot(page, '03-scrolled');

      const hrefs2 = await page.locator('a[href*="/p/"]').evaluateAll(els =>
        [...new Set(els.map(el => el.getAttribute('href')))].filter(Boolean)
      );
      if (hrefs2.length === 0) {
        // 페이지 HTML 일부 덤프
        const html = await page.content();
        console.log('페이지 HTML (처음 2000자):', html.substring(0, 2000));
        throw new Error('게시글을 찾을 수 없습니다. 스크린샷을 확인하세요.');
      }
      hrefs.push(...hrefs2);
    }

    const latestPostUrl = `https://www.instagram.com${hrefs[0]}`;
    console.log(`최신 게시글: ${latestPostUrl}`);

    // 3. 게시글 페이지 직접 방문
    const postPage = await context.newPage();
    await postPage.goto(latestPostUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await postPage.waitForTimeout(5000);

    // 로그인 팝업 닫기
    for (const selector of [
      'svg[aria-label="닫기"]',
      'svg[aria-label="Close"]',
      'div[role="dialog"] button:first-child',
    ]) {
      try {
        await postPage.locator(selector).first().click({ timeout: 2000 });
        await postPage.waitForTimeout(1000);
        break;
      } catch {}
    }

    await saveScreenshot(postPage, '04-post');

    // 4. 텍스트 추출
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

    // 5. 결과 저장
    const now = new Date();
    const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
    const dateStr = kst.toISOString().split('T')[0];

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

    writeFileSync(join(dataDir, `${dateStr}.json`), JSON.stringify(output, null, 2), 'utf-8');
    writeFileSync(join(dataDir, 'latest.json'), JSON.stringify(output, null, 2), 'utf-8');
    console.log(`저장 완료: data/${dateStr}.json`);

    console.log('\n━━━ 메뉴 ━━━');
    console.log(output.body);
    console.log('━━━━━━━━━━━━');

  } catch (err) {
    console.error('에러:', err.message);
    await saveScreenshot(page, '99-error');
    process.exit(1);
  } finally {
    await browser.close();
  }
}

crawl();
