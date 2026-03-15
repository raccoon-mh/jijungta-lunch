import { chromium } from 'playwright';
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import sharp from 'sharp';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '..', 'data');
const SCREENSHOTS_DIR = join(__dirname, '..', 'screenshots');

// 식당 설정
const restaurants = [
  {
    id: 'goodfood_xi',
    url: 'https://www.instagram.com/goodfood_xi/',
    type: 'text', // 게시글 텍스트에서 메뉴 추출
    postSelector: 'a[href*="/p/"]',
  },
  {
    id: 'gangnambab',
    url: 'https://www.instagram.com/gangnambab/',
    type: 'video-ocr', // 영상 프레임 캡처 → OCR
    postSelector: 'a[href*="/reel/"], a[href*="/p/"]',
    menuPostIndex: 1, // 홀수 인덱스가 메뉴판 (0=음식사진, 1=메뉴판)
  },
];

function saveScreenshot(page, name) {
  mkdirSync(SCREENSHOTS_DIR, { recursive: true });
  return page.screenshot({ path: join(SCREENSHOTS_DIR, `${name}.png`), fullPage: true });
}

async function dismissPopup(page) {
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
      break;
    } catch {}
  }
}

async function getPostLinks(page, selector) {
  let hrefs = await page.locator(selector).evaluateAll(els =>
    [...new Set(els.map(el => el.getAttribute('href')))].filter(Boolean)
  );
  if (hrefs.length === 0) {
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(3000);
    hrefs = await page.locator(selector).evaluateAll(els =>
      [...new Set(els.map(el => el.getAttribute('href')))].filter(Boolean)
    );
  }
  return hrefs;
}

// 텍스트 기반 크롤링 (goodfood_xi)
async function crawlText(context, restaurant) {
  const page = await context.newPage();
  await page.goto(restaurant.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(5000);
  await dismissPopup(page);
  await page.waitForTimeout(2000);

  const hrefs = await getPostLinks(page, restaurant.postSelector);
  if (hrefs.length === 0) throw new Error(`${restaurant.id}: 게시글을 찾을 수 없습니다.`);

  const latestPostUrl = `https://www.instagram.com${hrefs[0]}`;
  console.log(`  최신 게시글: ${latestPostUrl}`);

  const postPage = await context.newPage();
  await postPage.goto(latestPostUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await postPage.waitForTimeout(5000);
  await dismissPopup(postPage);

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

  await postPage.close();
  await page.close();

  return {
    url: latestPostUrl,
    title: result.title || '',
    body: result.body || result.meta || '',
    image: result.image || '',
  };
}

// 영상 OCR 기반 크롤링 (gangnambab)
async function crawlVideoOcr(context, restaurant) {
  const page = await context.newPage();
  await page.goto(restaurant.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(5000);
  await dismissPopup(page);
  await page.waitForTimeout(2000);

  const hrefs = await getPostLinks(page, restaurant.postSelector);
  if (hrefs.length === 0) throw new Error(`${restaurant.id}: 게시글을 찾을 수 없습니다.`);

  // 메뉴판 게시글 찾기 (여러 후보 시도)
  const menuIndex = restaurant.menuPostIndex || 0;
  let menuBody = '';
  let postUrl = '';
  let ogImage = '';

  for (let i = menuIndex; i < Math.min(menuIndex + 4, hrefs.length); i += 2) {
    const url = `https://www.instagram.com${hrefs[i]}`;
    console.log(`  메뉴판 후보 [${i}]: ${url}`);

    const postPage = await context.newPage();
    await postPage.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await postPage.waitForTimeout(5000);
    await dismissPopup(postPage);

    // og:image 가져오기
    ogImage = await postPage.evaluate(() => {
      const meta = document.querySelector('meta[property="og:image"]');
      return meta?.content || '';
    });

    // 영상 프레임 캡처
    const framePath = join(SCREENSHOTS_DIR, `${restaurant.id}-frame.png`);
    mkdirSync(SCREENSHOTS_DIR, { recursive: true });

    try {
      const videoEl = postPage.locator('video').first();
      await videoEl.waitFor({ timeout: 8000 });
      await videoEl.screenshot({ path: framePath });
      console.log(`  프레임 캡처 완료`);
    } catch {
      console.log(`  video 요소 없음, 스킵`);
      await postPage.close();
      continue;
    }

    await postPage.close();

    // 이미지 전처리
    const preprocessedPath = join(SCREENSHOTS_DIR, `${restaurant.id}-preprocessed.png`);
    const metadata = await sharp(framePath).metadata();

    const cropTop = Math.floor(metadata.height * 0.15);
    const cropBottom = Math.floor(metadata.height * 0.25);
    const cropRight = Math.floor(metadata.width * 0.25);

    await sharp(framePath)
      .extract({
        left: 0,
        top: cropTop,
        width: metadata.width - cropRight,
        height: metadata.height - cropTop - cropBottom,
      })
      .grayscale()
      .sharpen()
      .normalise()
      .toFile(preprocessedPath);

    // OCR
    try {
      const ocrResult = execSync(
        `tesseract "${preprocessedPath}" stdout -l kor+eng --psm 6 2>/dev/null`
      ).toString();

      // 메뉴 파싱
      const lines = ocrResult.split('\n').map(l => l.trim()).filter(Boolean);
      const menuItems = [];
      let dateInfo = '';

      for (const line of lines) {
        if (line.includes('월') && line.includes('일') && (line.includes('메뉴') || line.includes('요일'))) {
          dateInfo = line.replace(/@@/g, '').replace(/@/g, '').trim();
          continue;
        }
        if (line.includes('강남밥상') || line.includes('주소') || line.includes('인스타') ||
            line.includes('OPEN') || line.includes('검색') || line.includes('점심') ||
            line.includes('과천점') || line.includes('광장') || line.includes('뷔페')) continue;

        // 이모지 잔여물 제거 (OCR이 이모지를 영문/기호로 오인식)
        let cleaned = line
          .replace(/[^\w가-힣\s&/()]/g, '')  // 특수문자 제거
          .replace(/\b[a-zA-Z]{1,4}\b/g, '') // 짧은 영문 (이모지 오인식) 제거
          .replace(/\s{2,}/g, ' ')           // 다중 공백 정리
          .trim();
        if (cleaned.length >= 2 && /[가-힣]/.test(cleaned)) {
          menuItems.push(cleaned);
        }
      }

      if (menuItems.length >= 3) {
        menuBody = `${dateInfo}\n${menuItems.join('\n')}`;
        postUrl = url;
        console.log(`  OCR 성공: ${menuItems.length}개 메뉴 항목`);
        break;
      }
    } catch (err) {
      console.log(`  OCR 실패: ${err.message}`);
    }
  }

  await page.close();

  if (!menuBody) throw new Error(`${restaurant.id}: 메뉴를 추출할 수 없습니다.`);

  return {
    url: postUrl,
    title: `강남밥상 과천점`,
    body: menuBody,
    image: ogImage,
  };
}

// 메인
async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 900 },
    locale: 'ko-KR',
  });

  mkdirSync(DATA_DIR, { recursive: true });

  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const dateStr = kst.toISOString().split('T')[0];

  // 날짜별 통합 데이터
  const dayData = {
    date: dateStr,
    crawled_at: kst.toISOString(),
    restaurants: {},
  };

  let hasError = false;

  for (const restaurant of restaurants) {
    console.log(`\n[${restaurant.id}] 크롤링 시작...`);
    try {
      let result;
      if (restaurant.type === 'video-ocr') {
        result = await crawlVideoOcr(context, restaurant);
      } else {
        result = await crawlText(context, restaurant);
      }

      dayData.restaurants[restaurant.id] = {
        url: result.url,
        title: result.title,
        body: result.body,
        image: result.image,
      };

      console.log(`  완료: ${result.body.substring(0, 80)}...`);

    } catch (err) {
      console.error(`  [${restaurant.id}] 에러: ${err.message}`);
      hasError = true;
    }
  }

  await browser.close();

  // 날짜별 파일 저장
  writeFileSync(join(DATA_DIR, `${dateStr}.json`), JSON.stringify(dayData, null, 2), 'utf-8');
  console.log(`\n저장: data/${dateStr}.json`);

  // dates.json 인덱스 업데이트
  const datesPath = join(DATA_DIR, 'dates.json');
  let dates = [];
  if (existsSync(datesPath)) {
    try { dates = JSON.parse(readFileSync(datesPath, 'utf-8')); } catch {}
  }
  if (!dates.includes(dateStr)) {
    dates.push(dateStr);
    dates.sort().reverse(); // 최신순
  }
  writeFileSync(datesPath, JSON.stringify(dates, null, 2), 'utf-8');

  if (hasError) {
    console.error('\n일부 크롤링 실패 (부분 저장됨)');
    process.exit(1);
  }
  console.log('모든 크롤링 완료');
}

main();
