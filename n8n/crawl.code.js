// === 지정타 점심 크롤러 (n8n Code 노드) =========================================
// 브라우저 없음. 카카오채널 JSON API + 채널 og:image 만 사용.
//  - goodfood_xi : /posts 최신 글의 메뉴 텍스트
//  - lunchtime   : 채널 프로필 이미지(og:image) = 오늘 메뉴판 (OCR 없이 이미지 그대로)
// 기존 파일 내용+sha 는 GitHub Contents API(공개 레포=무인증 GET)로 획득.
// 출력: 변경된 파일마다 1 아이템 { path, body{message,content(base64),branch,sha?} }.
//       → 다음 HTTP Request(PUT, Header Auth 크레덴셜) 노드가 파일당 커밋.
// 변경 없으면 0 아이템 → 커밋 안 함(빈 커밋 방지).
// ==============================================================================
const OWNER = 'raccoon-mh', REPO = 'jijungta-lunch', BRANCH = 'main';
const GH = `https://api.github.com/repos/${OWNER}/${REPO}/contents`;
const req = this.helpers.httpRequest;

const RESTAURANTS = {
  goodfood_xi: { code: '_ExjIAn', title: '굿푸드(상상자이점)' },
  lunchtime:   { code: '_xbbMPn', title: '런치타임 (과천 어반허브)' },
};

// ---- utils ----
const pad = (n) => String(n).padStart(2, '0');
function validateDate(y, m, d) {
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCMonth() === m - 1 ? `${y}-${pad(m)}-${pad(d)}` : null;
}
function dateFromTitle(t) {
  const m = (t || '').match(/(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일/);
  return m ? validateDate(+m[1], +m[2], +m[3]) : null;
}
function kstDate(ms) {
  const d = new Date(ms + 9 * 3600 * 1000);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}
const xl = (u) => (u || '').replace(/^http:/, 'https:').replace(/img_[a-z]+\.jpg/i, 'img_xl.jpg');
const imgKey = (u) => { const m = (u || '').match(/dn\/([^/]+\/[^/]+\/[^/]+)\//); return m ? m[1] : (u || ''); };
function cleanTextBody(v) {
  if (!v) return '';
  let b = v.replace(/※※[\s\S]*?※※/g, '').replace(/ /g, ' ');
  const h = b.indexOf('#'); if (h !== -1) b = b.slice(0, h);
  return b.replace(/📍[\s\S]*$/m, '').trim();
}
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const b64 = (s) => Buffer.from(s, 'utf8').toString('base64');

async function getJson(url) { try { return await req({ url, headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' }, json: true }); } catch { return null; } }
async function getText(url) { try { return await req({ url, headers: { 'User-Agent': 'Mozilla/5.0' } }); } catch { return ''; } }
const kakaoPosts = (code) => `https://pf.kakao.com/rocket-web/web/profiles/${code}/posts?limit=5`;

// GitHub Contents API (무인증 GET) → { obj: 파싱된 JSON|null, sha: string|null }
async function ghGet(path) {
  try {
    const r = await req({ url: `${GH}/${path}?ref=${BRANCH}`, headers: { 'User-Agent': 'n8n-lunch', Accept: 'application/vnd.github+json' }, json: true });
    const content = Buffer.from(r.content || '', r.encoding || 'base64').toString('utf8');
    return { obj: content ? JSON.parse(content) : null, sha: r.sha || null };
  } catch { return { obj: null, sha: null }; } // 404=신규
}

// ---- crawlers ----
async function crawlGoodfood() {
  const r = RESTAURANTS.goodfood_xi;
  const data = await getJson(kakaoPosts(r.code));
  const post = (data?.items || []).find(p => (p.contents || []).some(c => c.t === 'text')) || data?.items?.[0];
  if (!post) return null;
  const body = cleanTextBody(((post.contents || []).find(c => c.t === 'text') || {}).v || '');
  const menuDate = dateFromTitle(post.title) || kstDate(post.published_at || post.created_at);
  // goodfood는 프론트에서 텍스트로 표시(image 미사용) → 원본과 동일하게 빈 문자열(불필요한 재커밋 방지)
  return { id: 'goodfood_xi', menuDate, entry: { url: `https://pf.kakao.com/${r.code}`, title: r.title, body, image: '' } };
}
async function crawlLunchtime(today, lastKey) {
  const r = RESTAURANTS.lunchtime;
  const html = await getText(`https://pf.kakao.com/${r.code}`);
  const m = html.match(/<meta property="og:image" content="([^"]+)"/);
  if (!m) return null;
  const image = xl(m[1]);
  if (lastKey && imgKey(image) === lastKey) return null; // 미갱신 → 스킵
  return { id: 'lunchtime', menuDate: today, entry: { url: `https://pf.kakao.com/${r.code}`, title: r.title, body: '', image } };
}

// ================================ main ================================
const today = DateTime.now().setZone('Asia/Seoul').toFormat('yyyy-LL-dd');

// dates 인덱스 (내용+sha)
const datesFile = await ghGet('docs/data/dates.json');
const idx = Array.isArray(datesFile.obj) ? datesFile.obj : [];

// lunchtime stale 가드: 최근 저장된 lunchtime 이미지 key
let lastKey = '';
for (const d of idx.slice(0, 5)) {
  const day = await ghGet(`docs/data/${d}.json`);
  const img = day.obj?.restaurants?.lunchtime?.image;
  if (img) { lastKey = imgKey(img); break; }
}

const results = [];
for (const c of [crawlGoodfood(), crawlLunchtime(today, lastKey)]) {
  try { const r = await c; if (r) results.push(r); } catch (e) { /* skip one restaurant */ }
}

// 날짜별 병합 + 변경분만 파일화
const byDate = {};
for (const r of results) { if (!r.menuDate) continue; (byDate[r.menuDate] ??= {})[r.id] = r.entry; }

const stamp = DateTime.now().toISO();
const items = [];
let dates = idx.slice();
const changed = [];
for (const [date, rests] of Object.entries(byDate)) {
  const existing = await ghGet(`docs/data/${date}.json`);
  const base = existing.obj || { date, restaurants: {} };
  const mergedRest = { ...base.restaurants, ...rests };
  if (eq(mergedRest, base.restaurants)) continue; // 동일 → 스킵
  const day = { date, restaurants: mergedRest, updatedAt: stamp };
  const body = { message: `data: ${date} 점심 메뉴 업데이트`, content: b64(JSON.stringify(day, null, 2)), branch: BRANCH };
  if (existing.sha) body.sha = existing.sha;
  items.push({ json: { path: `docs/data/${date}.json`, body } });
  changed.push(date);
  if (!dates.includes(date)) dates.push(date);
}
dates = [...new Set(dates)].sort().reverse();
if (!eq(dates, idx)) {
  const body = { message: `data: dates.json 갱신 (${changed.join(', ')})`, content: b64(JSON.stringify(dates, null, 2)), branch: BRANCH };
  if (datesFile.sha) body.sha = datesFile.sha;
  items.push({ json: { path: 'docs/data/dates.json', body } });
}

return items; // 0개면 커밋 안 함
