import { chromium } from 'playwright';
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import sharp from 'sharp';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '..', 'data');
const SCREENSHOTS_DIR = join(__dirname, '..', 'screenshots');
mkdirSync(DATA_DIR, { recursive: true });
mkdirSync(SCREENSHOTS_DIR, { recursive: true });

// 본문에서 메뉴 날짜 추출 (YYYY-MM-DD)
function extractMenuDate(body) {
  if (!body) return null;
  // "2026년 03월 16일" 형식
  const m1 = body.match(/(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일/);
  if (m1) return `${m1[1]}-${m1[2].padStart(2, '0')}-${m1[3].padStart(2, '0')}`;
  // "3월 13일" 형식 (연도 없음 → 올해)
  const m2 = body.match(/(\d{1,2})월\s*(\d{1,2})일/);
  if (m2) return `2026-${m2[1].padStart(2, '0')}-${m2[2].padStart(2, '0')}`;
  return null;
}

// 날짜별 데이터 저장
function saveDayData(date, restaurantId, data) {
  const filePath = join(DATA_DIR, `${date}.json`);
  let dayData = { date, restaurants: {} };
  if (existsSync(filePath)) {
    try { dayData = JSON.parse(readFileSync(filePath, 'utf-8')); } catch {}
  }
  dayData.restaurants[restaurantId] = data;
  writeFileSync(filePath, JSON.stringify(dayData, null, 2), 'utf-8');
}

// dates.json은 마지막에 한번에 업데이트

async function dismissPopup(page) {
  for (const sel of ['svg[aria-label="닫기"]', 'svg[aria-label="Close"]', 'div[role="dialog"] button:first-child']) {
    try { await page.locator(sel).first().click({ timeout: 2000 }); await page.waitForTimeout(1000); break; } catch {}
  }
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 900 },
    locale: 'ko-KR',
  });

  // === goodfood_xi: 텍스트 기반 (여러 게시글 순회) ===
  console.log('\n=== goodfood_xi 백필 ===');
  {
    const page = await context.newPage();
    await page.goto('https://www.instagram.com/goodfood_xi/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(5000);
    await dismissPopup(page);
    await page.waitForTimeout(2000);

    await page.screenshot({ path: join(SCREENSHOTS_DIR, 'backfill-goodfood-profile.png') });
    let hrefs = await page.locator('a[href*="/p/"]').evaluateAll(els =>
      [...new Set(els.map(el => el.getAttribute('href')))].filter(Boolean)
    );
    if (hrefs.length === 0) {
      // 스크롤 후 재시도
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(3000);
      hrefs = await page.locator('a[href*="/p/"]').evaluateAll(els =>
        [...new Set(els.map(el => el.getAttribute('href')))].filter(Boolean)
      );
    }
    console.log(`게시글 ${hrefs.length}개 발견`);
    await page.close();

    for (let i = 0; i < hrefs.length; i++) {
      const url = `https://www.instagram.com${hrefs[i]}`;
      console.log(`\n[${i}] ${url}`);

      const p = await context.newPage();
      await p.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await p.waitForTimeout(4000);
      await dismissPopup(p);

      const result = await p.evaluate(() => {
        const data = {};
        const metaTitle = document.querySelector('meta[property="og:title"]');
        if (metaTitle) data.title = metaTitle.content;
        const metaImage = document.querySelector('meta[property="og:image"]');
        if (metaImage) data.image = metaImage.content;
        const candidates = [];
        document.querySelectorAll('h1, span[dir="auto"]').forEach(el => {
          const t = el.innerText?.trim();
          if (t && t.length > 20 && !t.includes('로그인') && !t.includes('가입')) candidates.push(t);
        });
        if (candidates.length > 0) data.body = candidates.sort((a, b) => b.length - a.length)[0];
        return data;
      });
      await p.close();

      const menuDate = extractMenuDate(result.body);
      if (!menuDate) {
        console.log('  날짜 추출 실패, 스킵');
        continue;
      }

      console.log(`  메뉴 날짜: ${menuDate}`);
      saveDayData(menuDate, 'goodfood_xi', {
        url,
        title: result.title || '',
        body: result.body || '',
        image: result.image || '',
      });
      console.log(`  저장 완료: data/${menuDate}.json`);
    }
  }

  // === gangnambab: 영상 OCR (메뉴판 게시글만) ===
  console.log('\n=== gangnambab 백필 ===');
  {
    const page = await context.newPage();
    await page.goto('https://www.instagram.com/gangnambab/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(5000);
    await dismissPopup(page);
    await page.waitForTimeout(2000);

    let hrefs = await page.locator('a[href*="/reel/"], a[href*="/p/"]').evaluateAll(els =>
      [...new Set(els.map(el => el.getAttribute('href')))].filter(Boolean)
    );
    if (hrefs.length === 0) {
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(3000);
      hrefs = await page.locator('a[href*="/reel/"], a[href*="/p/"]').evaluateAll(els =>
        [...new Set(els.map(el => el.getAttribute('href')))].filter(Boolean)
      );
    }
    console.log(`게시글 ${hrefs.length}개 발견`);
    await page.close();

    // 홀수 인덱스가 메뉴판
    for (let i = 1; i < hrefs.length; i += 2) {
      const url = `https://www.instagram.com${hrefs[i]}`;
      console.log(`\n[${i}] ${url}`);

      const p = await context.newPage();
      await p.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await p.waitForTimeout(5000);
      await dismissPopup(p);

      const ogImage = await p.evaluate(() => {
        const meta = document.querySelector('meta[property="og:image"]');
        return meta?.content || '';
      });

      // 프레임 캡처
      const framePath = join(SCREENSHOTS_DIR, `gangnambab-frame-${i}.png`);
      try {
        const videoEl = p.locator('video').first();
        await videoEl.waitFor({ timeout: 8000 });
        await videoEl.screenshot({ path: framePath });
      } catch {
        console.log('  video 없음, 스킵');
        await p.close();
        continue;
      }
      await p.close();

      // 전처리 + OCR
      const preprocessedPath = join(SCREENSHOTS_DIR, `gangnambab-pre-${i}.png`);
      const metadata = await sharp(framePath).metadata();
      await sharp(framePath)
        .extract({
          left: 0,
          top: Math.floor(metadata.height * 0.15),
          width: metadata.width - Math.floor(metadata.width * 0.25),
          height: metadata.height - Math.floor(metadata.height * 0.15) - Math.floor(metadata.height * 0.25),
        })
        .grayscale().sharpen().normalise()
        .toFile(preprocessedPath);

      let ocrResult;
      try {
        ocrResult = execSync(`tesseract "${preprocessedPath}" stdout -l kor+eng --psm 6 2>/dev/null`).toString();
      } catch {
        console.log('  OCR 실패, 스킵');
        continue;
      }

      // 날짜 추출
      const menuDate = extractMenuDate(ocrResult);
      if (!menuDate) {
        console.log('  날짜 추출 실패, 스킵');
        continue;
      }

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
        let cleaned = line.replace(/[^\w가-힣\s&/()]/g, '').replace(/\b[a-zA-Z]{1,4}\b/g, '').replace(/\s{2,}/g, ' ').trim();
        if (cleaned.length >= 2 && /[가-힣]/.test(cleaned)) menuItems.push(cleaned);
      }

      if (menuItems.length < 3) {
        console.log(`  메뉴 항목 부족 (${menuItems.length}개), 스킵`);
        continue;
      }

      console.log(`  메뉴 날짜: ${menuDate}, ${menuItems.length}개 항목`);
      saveDayData(menuDate, 'gangnambab', {
        url,
        title: '강남밥상 과천점',
        body: `${dateInfo}\n${menuItems.join('\n')}`,
        image: ogImage,
      });
      console.log(`  저장 완료: data/${menuDate}.json`);
    }
  }

  await browser.close();

  // dates.json 인덱스 업데이트
  const { readdirSync } = await import('node:fs');
  const dates = readdirSync(DATA_DIR)
    .filter(f => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
    .map(f => f.replace('.json', ''))
    .sort()
    .reverse();
  writeFileSync(join(DATA_DIR, 'dates.json'), JSON.stringify(dates, null, 2));
  console.log(`\ndates.json 업데이트: ${dates.join(', ')}`);
  console.log('백필 완료!');
}

main();
