import { chromium } from 'playwright';
import { writeFileSync, readFileSync, existsSync, mkdirSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import sharp from 'sharp';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '..', 'data');
const SCREENSHOTS_DIR = join(__dirname, '..', 'screenshots');
const COOKIE_PATH = join(__dirname, '..', '.instagram-cookies.json');
const AUTH_PATH = '/home/raccoon/workspace/.auth/instagram';

// 본문에서 메뉴 날짜 추출 (YYYY-MM-DD)
function extractMenuDate(body) {
  if (!body) return null;
  const m1 = body.match(/(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일/);
  if (m1) return validateDate(parseInt(m1[1]), parseInt(m1[2]), parseInt(m1[3]));
  // OCR 노이즈 대응: 앞에 숫자가 붙을 수 있으므로 끝 1~2자리만 추출 (063→3, 012→12)
  const m2 = body.match(/(\d+)월\s*(\d{1,2})일/);
  if (m2) {
    const year = new Date().getFullYear();
    const rawMonth = m2[1];
    // 끝에서 최대 2자리만 취해서 1~12 범위 찾기
    let month = parseInt(rawMonth.slice(-2), 10);
    if (month > 12) month = parseInt(rawMonth.slice(-1), 10);
    return validateDate(year, month, parseInt(m2[2]));
  }
  return null;
}

function validateDate(year, month, day) {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const d = new Date(year, month - 1, day);
  if (d.getMonth() !== month - 1) return null; // 2월 30일 같은 케이스
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

// OCR 결과 후처리 (노이즈 제거, 메뉴 항목 추출)
function parseOcrMenu(ocrText, skipPatterns = []) {
  const lines = ocrText.split('\n').map(l => l.trim()).filter(Boolean);
  const menuItems = [];
  let dateInfo = '';

  for (const line of lines) {
    // 날짜 추출
    if (line.includes('월') && line.includes('일') && (line.includes('메뉴') || line.includes('요일'))) {
      dateInfo = line.replace(/@@/g, '').replace(/@/g, '').replace(/메뉴.*$/, '메뉴').trim();
      continue;
    }
    // 스킵 패턴
    if (skipPatterns.some(p => line.includes(p))) continue;
    // 안내문 스킵
    if (line.includes('상기 메뉴') || line.includes('변동될')) continue;

    let cleaned = line
      .replace(/[^\w가-힣\s&/*()\-:]/g, '')
      .replace(/\b[a-zA-Z]+\b/g, '')       // 영문 단어 제거 (이모지 잔상)
      .replace(/\s{2,}/g, ' ')
      .trim();
    // 끝에 붙은 1~2글자 노이즈 제거 (예: "직화제육볶음 태" → "직화제육볶음")
    cleaned = cleaned.replace(/\s+[가-힣a-zA-Z\d]{1,2}$/, '').trim();
    // 한글 2글자 이상 포함된 항목만
    const koreanChars = (cleaned.match(/[가-힣]/g) || []).length;
    if (cleaned.length >= 2 && koreanChars >= 2) {
      menuItems.push(cleaned);
    }
  }
  return { dateInfo, menuItems };
}

// 식당 설정
const restaurants = [
  {
    id: 'goodfood_xi',
    url: 'https://pf.kakao.com/_ExjIAn',
    type: 'kakao-text',
  },
  {
    id: 'gangnambab',
    url: 'https://www.instagram.com/gangnambab/',
    type: 'video-ocr',
    postSelector: 'a[href*="/reel/"], a[href*="/p/"]',
    menuPostIndex: 0,
  },
  {
    id: 'lunchtime',
    url: 'https://pf.kakao.com/_xbbMPn',
    type: 'kakao-ocr', // 카카오 채널 프로필 이미지 OCR
  },
];

// Instagram 쿠키 로드
function loadCookies() {
  try {
    if (existsSync(COOKIE_PATH)) {
      const cookies = JSON.parse(readFileSync(COOKIE_PATH, 'utf-8'));
      // 쿠키가 7일 이내면 재사용
      const stat = statSync(COOKIE_PATH);
      if (Date.now() - stat.mtimeMs < 7 * 24 * 60 * 60 * 1000) {
        return cookies;
      }
    }
  } catch {}
  return null;
}

// Instagram 쿠키 저장
function saveCookies(cookies) {
  writeFileSync(COOKIE_PATH, JSON.stringify(cookies, null, 2), 'utf-8');
}

// Instagram 로그인
async function loginInstagram(context) {
  // 저장된 쿠키 시도
  const cached = loadCookies();
  if (cached) {
    await context.addCookies(cached);
    // 쿠키 유효성 검증
    const testPage = await context.newPage();
    await testPage.goto('https://www.instagram.com/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await testPage.waitForTimeout(3000);
    const url = testPage.url();
    await testPage.close();
    if (!url.includes('/accounts/login')) {
      console.log('Instagram: 저장된 쿠키로 로그인 성공');
      return;
    }
    console.log('Instagram: 저장된 쿠키 만료, 재로그인...');
  }

  // 인증 정보 읽기
  const cred = readFileSync(AUTH_PATH, 'utf-8').trim();
  const [username, password] = cred.split(':');

  const page = await context.newPage();
  await page.goto('https://www.instagram.com/accounts/login/', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(3000);

  // 쿠키 동의 팝업 처리
  try {
    await page.locator('button:has-text("Allow all cookies"), button:has-text("모든 쿠키 허용")').first().click({ timeout: 3000 });
    await page.waitForTimeout(1000);
  } catch {}

  // 로그인 폼 입력 (Instagram 새 로그인 폼: input[name="email"] + div[role="button"])
  const usernameInput = page.locator('input[name="username"], input[name="email"]').first();
  const passwordInput = page.locator('input[name="password"], input[name="pass"]').first();
  await usernameInput.waitFor({ timeout: 10000 });
  await usernameInput.fill(username);
  await passwordInput.fill(password);
  await page.waitForTimeout(1000);
  await page.locator('div[role="button"]:has-text("로그인"), div[role="button"]:has-text("Log in"), button[type="submit"]').first().click();

  // 로그인 완료 대기
  await page.waitForURL(url => !url.toString().includes('/accounts/login'), { timeout: 30000 });
  await page.waitForTimeout(5000);

  // "나중에 하기" 팝업들 처리
  await dismissPopup(page);
  await page.waitForTimeout(2000);
  await dismissPopup(page);

  // 쿠키 저장
  const cookies = await context.cookies();
  saveCookies(cookies);
  console.log('Instagram: 로그인 성공, 쿠키 저장됨');

  await page.close();
}

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

  // 메뉴판 게시글 찾기 (전체 순회, 메뉴 검출된 것만 사용)
  const menuIndex = restaurant.menuPostIndex || 0;
  let menuBody = '';
  let postUrl = '';
  let ogImage = '';

  for (let i = menuIndex; i < Math.min(menuIndex + 2, hrefs.length); i += 1) {
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

    // 이미지 전처리: 노란 배경에서 검정 글씨만 추출
    const preprocessedPath = join(SCREENSHOTS_DIR, `${restaurant.id}-preprocessed.png`);
    const metadata = await sharp(framePath).metadata();

    const cropTop = Math.floor(metadata.height * 0.12);
    const cropBottom = Math.floor(metadata.height * 0.18);
    const cropRight = Math.floor(metadata.width * 0.15);
    const cropWidth = metadata.width - cropRight;

    await sharp(framePath)
      .extract({
        left: 0,
        top: cropTop,
        width: cropWidth,
        height: metadata.height - cropTop - cropBottom,
      })
      .resize({ width: cropWidth * 2 })
      .grayscale()
      .threshold(130)
      .toFile(preprocessedPath);

    // OCR
    try {
      const ocrResult = execSync(
        `tesseract "${preprocessedPath}" stdout -l kor+eng --psm 6 2>/dev/null`
      ).toString();

      // 메뉴 파싱
      const skipPatterns = ['강남밥상', '주소', '인스타', 'OPEN', '검색', '점심', '과천점', '광장', '뷔페'];
      const { dateInfo, menuItems } = parseOcrMenu(ocrResult, skipPatterns);

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

// 카카오 채널 소식 텍스트 추출 (goodfood_xi)
async function crawlKakaoText(context, restaurant) {
  const page = await context.newPage();
  await page.goto(restaurant.url, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(3000);

  // 첫 번째 소식 게시글에서 제목, 본문, 이미지 추출
  const postData = await page.evaluate(() => {
    const firstPost = document.querySelector('.box_list_board');
    if (!firstPost) return null;

    const title = firstPost.querySelector('.tit_info')?.textContent?.trim() || '';
    const desc = firstPost.querySelector('.desc_info')?.textContent?.trim() || '';
    const thumbEl = firstPost.querySelector('.wrap_fit_thumb');
    const bgImg = thumbEl?.style?.backgroundImage || '';
    const image = bgImg.replace(/^url\(["']?/, '').replace(/["']?\)$/, '');

    return { title, desc, image };
  });

  await page.close();

  if (!postData || !postData.desc) throw new Error(`${restaurant.id}: 소식 게시글을 찾을 수 없습니다.`);

  // 본문 정리
  let body = `${postData.title}\n${postData.desc}`;
  body = body
    .replace(/\s*#\S+/g, '')       // 해시태그 제거
    .replace(/※※.*?※※/gs, '')     // 안내문 제거
    .replace(/📍[\s\S]*$/gm, '')   // 위치 정보 이후 제거
    .replace(/\u00a0/g, ' ')       // &nbsp; → 공백
    .trim();

  console.log(`  소식 텍스트 추출 완료`);

  return {
    url: restaurant.url,
    title: '굿푸드(상상자이점)',
    body: body,
    image: postData.image,
  };
}

// 카카오 채널 프로필 이미지 OCR (lunchtime)
async function crawlKakaoOcr(context, restaurant) {
  const page = await context.newPage();
  await page.goto(restaurant.url, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(3000);

  // 프로필 이미지 URL 추출
  const imgUrl = await page.evaluate(() => {
    const head = document.querySelector('.item_profile_head');
    if (!head) return null;
    const img = head.querySelector('img');
    return img?.src || null;
  });
  await page.close();

  if (!imgUrl) throw new Error(`${restaurant.id}: 프로필 이미지를 찾을 수 없습니다.`);
  console.log(`  이미지: ${imgUrl.substring(0, 80)}...`);

  // 이미지 다운로드
  const imgPath = join(SCREENSHOTS_DIR, `${restaurant.id}-menu.jpg`);
  mkdirSync(SCREENSHOTS_DIR, { recursive: true });
  const imgPage = await context.newPage();
  const response = await imgPage.goto(imgUrl);
  const buffer = await response.body();
  writeFileSync(imgPath, buffer);
  await imgPage.close();

  // 이미지 전처리
  const preprocessedPath = join(SCREENSHOTS_DIR, `${restaurant.id}-preprocessed.png`);
  const metadata = await sharp(imgPath).metadata();
  const left = Math.floor(metadata.width * 0.08);
  const right = Math.floor(metadata.width * 0.08);
  const top = Math.floor(metadata.height * 0.12);
  const bottom = Math.floor(metadata.height * 0.12);

  await sharp(imgPath)
    .extract({ left, top, width: metadata.width - left - right, height: metadata.height - top - bottom })
    .resize({ width: 900 })
    .toColourspace('b-w')
    .toFile(preprocessedPath);

  // OCR
  const ocrResult = execSync(
    `tesseract "${preprocessedPath}" stdout -l kor+eng --psm 6 2>/dev/null`
  ).toString();

  const skipPatterns = ['런치타임'];
  const { dateInfo, menuItems } = parseOcrMenu(ocrResult, skipPatterns);

  if (menuItems.length < 3) {
    throw new Error(`${restaurant.id}: 메뉴 항목 부족 (${menuItems.length}개)`);
  }

  console.log(`  OCR 성공: ${menuItems.length}개 메뉴 항목`);

  return {
    url: restaurant.url,
    title: '런치타임 (과천 어반허브)',
    body: `${dateInfo}\n${menuItems.join('\n')}`,
    image: imgUrl,
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
  mkdirSync(SCREENSHOTS_DIR, { recursive: true });

  // Instagram 로그인 (video-ocr 타입에 필요)
  const needsInstagram = restaurants.some(r => r.type === 'video-ocr' || r.type === 'text');
  if (needsInstagram) {
    try {
      await loginInstagram(context);
    } catch (err) {
      console.error(`Instagram 로그인 실패: ${err.message}`);
    }
  }

  let successCount = 0;

  for (const restaurant of restaurants) {
    console.log(`\n[${restaurant.id}] 크롤링 시작...`);
    try {
      let result;
      if (restaurant.type === 'video-ocr') {
        result = await crawlVideoOcr(context, restaurant);
      } else if (restaurant.type === 'kakao-ocr') {
        result = await crawlKakaoOcr(context, restaurant);
      } else if (restaurant.type === 'kakao-text') {
        result = await crawlKakaoText(context, restaurant);
      } else {
        result = await crawlText(context, restaurant);
      }

      // 본문에서 메뉴 날짜 추출
      const menuDate = extractMenuDate(result.body);
      if (!menuDate) {
        console.error(`  [${restaurant.id}] 메뉴 날짜를 추출할 수 없습니다.`);
        continue;
      }

      // 해당 날짜 파일에 식당 데이터 저장
      const filePath = join(DATA_DIR, `${menuDate}.json`);
      let dayData = { date: menuDate, restaurants: {} };
      if (existsSync(filePath)) {
        try { dayData = JSON.parse(readFileSync(filePath, 'utf-8')); } catch {}
      }
      dayData.restaurants[restaurant.id] = {
        url: result.url,
        title: result.title,
        body: result.body,
        image: result.image,
      };
      writeFileSync(filePath, JSON.stringify(dayData, null, 2), 'utf-8');
      console.log(`  메뉴 날짜: ${menuDate}`);
      console.log(`  완료: ${result.body.substring(0, 80)}...`);
      successCount++;

    } catch (err) {
      console.error(`  [${restaurant.id}] 에러: ${err.message}`);
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
  writeFileSync(join(DATA_DIR, 'dates.json'), JSON.stringify(dates, null, 2), 'utf-8');

  console.log(`\n크롤링 완료: ${successCount}/${restaurants.length} 성공`);
  if (successCount === 0) {
    console.error('모든 크롤링 실패');
    process.exit(1);
  }
}

main();
