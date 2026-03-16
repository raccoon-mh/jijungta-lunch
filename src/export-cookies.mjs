#!/usr/bin/env node
/**
 * Instagram 쿠키 갱신 스크립트 (headless, 2FA 지원)
 *
 * 사용법:
 *   node src/export-cookies.mjs           → 2FA 코드를 프롬프트로 입력
 *   node src/export-cookies.mjs 123456    → 2FA 코드를 인자로 전달
 */
import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createInterface } from 'readline';

const __dirname = dirname(fileURLToPath(import.meta.url));
const COOKIE_PATH = join(__dirname, '..', '.instagram-cookies.json');
const AUTH_PATH = '/home/raccoon/workspace/.auth/instagram';

function prompt(question) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => rl.question(question, ans => { rl.close(); resolve(ans.trim()); }));
}

async function main() {
  const cred = readFileSync(AUTH_PATH, 'utf-8').trim();
  const [username, password] = cred.split(':');

  console.log(`Instagram 로그인: ${username}`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 900 },
    locale: 'ko-KR',
  });

  const page = await context.newPage();
  await page.goto('https://www.instagram.com/accounts/login/', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(3000);

  // 로그인
  await page.locator('input[name="email"], input[name="username"]').first().fill(username);
  await page.locator('input[name="pass"], input[name="password"]').first().fill(password);
  await page.waitForTimeout(1000);
  await page.locator('div[role="button"]:has-text("로그인"), div[role="button"]:has-text("Log in"), button[type="submit"]').first().click();
  await page.waitForTimeout(8000);

  // 2FA 처리
  if (page.url().includes('two_factor')) {
    const code = process.argv[2] || await prompt('2FA 보안 코드 입력: ');
    if (!code) {
      console.error('2FA 코드가 필요합니다.');
      await browser.close();
      process.exit(1);
    }

    await page.locator('input[name="verificationCode"]').fill(code);
    const checkbox = page.locator('input[name="checkbox"]');
    if (await checkbox.count() > 0 && !(await checkbox.isChecked())) {
      await checkbox.check();
    }
    await page.waitForTimeout(500);
    await page.locator('button:has-text("확인"), button:has-text("Confirm")').first().click();
    await page.waitForTimeout(10000);
  }

  // 로그인 결과 확인
  if (page.url().includes('login')) {
    console.error('로그인 실패:', page.url());
    await browser.close();
    process.exit(1);
  }

  // 팝업 닫기
  for (const sel of ['button:has-text("나중에 하기")', 'button:has-text("Not Now")', 'svg[aria-label="닫기"]']) {
    try { await page.locator(sel).first().click({ timeout: 3000 }); await page.waitForTimeout(1000); } catch {}
  }

  // 쿠키 저장
  const cookies = await context.cookies();
  writeFileSync(COOKIE_PATH, JSON.stringify(cookies, null, 2), 'utf-8');
  console.log(`쿠키 저장 완료: ${cookies.length}개 → ${COOKIE_PATH}`);

  await browser.close();
}

main().catch(err => {
  console.error('에러:', err.message);
  process.exit(1);
});
