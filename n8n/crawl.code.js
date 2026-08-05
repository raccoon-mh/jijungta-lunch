// === 지정타 점심 크롤러 (n8n Code 노드) =========================================
// 브라우저 없음. 카카오채널 JSON API + og:image/og:description 만 사용.
//  - goodfood_xi : /posts 최신 글의 메뉴 텍스트
//  - lunchtime   : 채널 프로필 이미지(og:image) = 오늘 메뉴판 (OCR 없이 이미지 그대로)
//  - cookingtree : lunchtime 과 동일 패턴(글 없이 프로필 이미지만 갈아끼우는 채널)
//  - gangnambab  : 인스타 릴스. 미러(imginn)의 og:description = 인스타 자동 alt 텍스트에
//                  메뉴판 문구가 이미 들어있어 영상/OCR 없이 파싱만 한다.
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
  gangnambab:  { user: 'gangnambab', title: '강남밥상 과천점' },
  cookingtree: { code: '_eAqyxj', title: '쿠킹트리 한식뷔페' },
};
// 카카오채널 프로필 이미지가 곧 메뉴판인 식당들(글은 안 올리고 이미지만 갈아끼움)
const KAKAO_IMAGE_RESTAURANTS = ['lunchtime', 'cookingtree'];
const IG_MIRROR = 'https://imginn.com'; // 인스타 무로그인 미러(공개 프로필 읽기 전용)

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
const ogMeta = (html, prop) => {
  const m = (html || '').match(new RegExp(`<meta property="${prop}" content="([^"]*)"`));
  return m ? m[1].replace(/&#38;|&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'") : '';
};

// 인스타 alt 텍스트 → { menuDate, body }. 메뉴판 게시물이 아니면 null.
const IG_MONTHS = ['january','february','march','april','may','june','july','august','september','october','november','december'];
const IG_STOP = ['점심', '뷔페', '주소', '인스타그램', '검색', 'PEN', 'OPEN', '오전', '오후', '메시지', '수정됨'];
function parseIgMenuAlt(desc) {
  const t = (desc || '').replace(/\\\//g, '/');
  const m = t.match(/(\d{1,2})월\s*(\d{1,2})일[^@]{0,12}?메뉴/);
  if (!m) return null;

  // 연도는 게시일("on August 02, 2026")에서. 연말 게시 → 다음 해 메뉴 보정.
  const p = t.match(/on\s+([A-Za-z]+)\s+\d{1,2},\s*(\d{4})/);
  const postedMon = p ? IG_MONTHS.indexOf(p[1].toLowerCase()) + 1 : 0;
  const mon = +m[1], day = +m[2];
  let year = p ? +p[2] : new Date().getUTCFullYear();
  if (postedMon && mon < postedMon - 6) year += 1;
  const menuDate = validateDate(year, mon, day);
  if (!menuDate) return null;

  // 메뉴 문구는 "…메뉴@@" 뒤 ~ 가게 안내(STOP) 앞까지
  let rest = t.slice(m.index + m[0].length).replace(/^[@\s'"·:\-]+/, '');
  let cut = rest.length;
  for (const s of IG_STOP) { const i = rest.indexOf(s); if (i !== -1 && i < cut) cut = i; }
  rest = rest.slice(0, cut);

  const items = [];
  for (let tok of rest.split(/\s+/)) {
    tok = tok.replace(/^[^가-힣0-9]+|[^가-힣0-9)]+$/g, '').trim();
    if (tok.length < 2 || !/[가-힣]/.test(tok)) continue; // 한글 없는 토큰 = alt 노이즈
    const prev = items[items.length - 1];
    if (prev && tok.includes(prev)) { items[items.length - 1] = tok; continue; } // "토스트/" → "토스트/커피"
    if (prev && prev.includes(tok)) continue;                                    // 중복된 꼬리 토큰
    items.push(tok);
  }
  if (items.length < 3) return null;
  return { menuDate, body: `${mon}월 ${day}일 메뉴\n${items.join('\n')}` };
}

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
// 카카오채널 프로필 이미지 = 오늘 메뉴판 (lunchtime, cookingtree)
async function crawlKakaoImage(id, today, lastKey) {
  const r = RESTAURANTS[id];
  const html = await getText(`https://pf.kakao.com/${r.code}`);
  const m = html.match(/<meta property="og:image" content="([^"]+)"/);
  if (!m) return null;
  const image = xl(m[1]);
  if (lastKey && imgKey(image) === lastKey) return null; // 미갱신 → 스킵
  return { id, menuDate: today, entry: { url: `https://pf.kakao.com/${r.code}`, title: r.title, body: '', image } };
}
// 강남밥상: 미러 프로필의 최근 게시물을 훑어 '오늘 메뉴판' 하나만 채택.
// 메뉴판은 전날 저녁~아침에 올라오므로 게시일이 아니라 alt 안의 날짜로 판정한다.
async function crawlGangnambab(today, maxPosts = 6) {
  const r = RESTAURANTS.gangnambab;
  const prof = await getText(`${IG_MIRROR}/${r.user}/`);
  const codes = [...new Set([...prof.matchAll(/href="\/(?:p|reel)\/([^/"]+)\//g)].map(x => x[1]))].slice(0, maxPosts);
  for (const c of codes) {
    const html = await getText(`${IG_MIRROR}/p/${c}/`);
    const parsed = parseIgMenuAlt(ogMeta(html, 'og:description'));
    if (!parsed || parsed.menuDate !== today) continue;
    // 프론트가 body(텍스트)로 표시 → image는 goodfood와 동일하게 미사용(미러 URL 커밋 방지)
    return { id: 'gangnambab', menuDate: parsed.menuDate, entry: { url: `https://www.instagram.com/${r.user}/`, title: r.title, body: parsed.body, image: '' } };
  }
  return null; // 아직 안 올라옴 → 다음 스케줄에서 재시도
}

// ================================ main ================================
const today = DateTime.now().setZone('Asia/Seoul').toFormat('yyyy-LL-dd');

// dates 인덱스 (내용+sha)
const datesFile = await ghGet('docs/data/dates.json');
const idx = Array.isArray(datesFile.obj) ? datesFile.obj : [];

// 이미지형 식당 stale 가드: 최근 저장된 이미지 key (하루치를 읽어 두 식당을 함께 채운다)
const lastKeys = {};
for (const d of idx.slice(0, 5)) {
  if (KAKAO_IMAGE_RESTAURANTS.every(id => lastKeys[id])) break;
  const day = await ghGet(`docs/data/${d}.json`);
  for (const id of KAKAO_IMAGE_RESTAURANTS) {
    const img = day.obj?.restaurants?.[id]?.image;
    if (!lastKeys[id] && img) lastKeys[id] = imgKey(img);
  }
}

const results = [];
for (const c of [
  crawlGoodfood(),
  ...KAKAO_IMAGE_RESTAURANTS.map(id => crawlKakaoImage(id, today, lastKeys[id])),
  crawlGangnambab(today),
]) {
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
