// === 지정타 점심 크롤러 (n8n Code 노드) =========================================
// 브라우저 없음. 카카오채널 JSON API + og:image/og:description 만 사용.
//  - goodfood_xi : /posts 최신 글의 메뉴 텍스트
//  - lunchtime   : 채널 프로필 이미지(og:image) = 오늘 메뉴판 (OCR 없이 이미지 그대로)
//  - cookingtree : lunchtime 과 동일 패턴(글 없이 프로필 이미지만 갈아끼우는 채널)
//  - gangnambab  : 인스타 릴스. 인스타 자동 alt(accessibility_caption)에 메뉴판 문구가
//                  통째로 들어있어 영상/OCR 없이 파싱만 한다. 크롤러 UA(Googlebot)로
//                  게시물 페이지를 받으면 그 계정의 최근 게시물 alt 목록이 함께 온다.
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
// 인스타 게시물 페이지는 일반 UA 로는 빈 JS 셸이지만, 크롤러 UA 로 받으면 SSR 된 JSON 이 실려
// 온다(그 계정 최근 게시물의 shortcode + accessibility_caption). 프로필/릴스 탭에는 안 실린다.
const IG_UA = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';
// 최신 게시물 목록을 얻기 위한 진입점. 평소엔 저장된 직전 메뉴 게시물을 시드로 쓰고, 그게
// 지워졌을 때만 이 상수로 폴백한다(둘 다 죽으면 그날은 스킵 → 다음 스케줄에서 재시도).
const IG_SEED = 'Dalr5e0zzDc';

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
async function getText(url, ua = 'Mozilla/5.0') { try { return await req({ url, headers: { 'User-Agent': ua } }); } catch { return ''; } }
const kakaoPosts = (code) => `https://pf.kakao.com/rocket-web/web/profiles/${code}/posts?limit=5`;
// 인스타 게시물 페이지 HTML → [{ code, caption }] (그 계정 최근 게시물, 최신순)
function igPostsFromHtml(html) {
  const out = [];
  const seg = (html || '').split('"polaris_ordered_timeline_connection"')[1] || '';
  for (const chunk of seg.split('{"node":{').slice(1)) {
    const cap = chunk.match(/"accessibility_caption":"((?:[^"\\]|\\.)*)"/);
    const code = chunk.match(/"code":"([A-Za-z0-9_-]{5,})"/);
    if (!cap || !code) continue;
    let caption; try { caption = JSON.parse('"' + cap[1] + '"'); } catch { continue; }
    out.push({ code: code[1], caption });
  }
  return out;
}

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
// 강남밥상: 게시물 페이지 하나(시드)를 크롤러 UA 로 받으면 최근 게시물의 alt 가 함께 실려 온다.
// 그중 '오늘 메뉴판' 하나만 채택 — 메뉴판은 전날 저녁~아침에 올라오므로 게시일이 아니라
// alt 안의 날짜로 판정한다. 채택한 게시물 URL 을 그대로 저장해 다음 실행의 시드로 쓴다.
async function crawlGangnambab(today, seedCodes = []) {
  const r = RESTAURANTS.gangnambab;
  for (const seed of [...new Set([...seedCodes, IG_SEED])]) {
    const posts = igPostsFromHtml(await getText(`https://www.instagram.com/p/${seed}/`, IG_UA));
    if (!posts.length) continue; // 시드가 지워짐 → 다음 시드
    for (const post of posts) {
      const parsed = parseIgMenuAlt(post.caption);
      if (!parsed || parsed.menuDate !== today) continue;
      // 프론트가 body(텍스트)로 표시 → image 는 goodfood 와 동일하게 미사용
      return { id: 'gangnambab', menuDate: parsed.menuDate, entry: { url: `https://www.instagram.com/${r.user}/reel/${post.code}/`, title: r.title, body: parsed.body, image: '' } };
    }
    return null; // 시드는 살아있고 오늘 메뉴만 아직 없음 → 다음 스케줄에서 재시도
  }
  return null;
}

// ================================ main ================================
const today = DateTime.now().setZone('Asia/Seoul').toFormat('yyyy-LL-dd');

// dates 인덱스 (내용+sha)
const datesFile = await ghGet('docs/data/dates.json');
const idx = Array.isArray(datesFile.obj) ? datesFile.obj : [];

// 최근 저장분에서 두 가지를 함께 긁는다(하루치 파일에 둘 다 들어있다):
//  - 이미지형 식당 stale 가드용 직전 이미지 key
//  - 강남밥상 인스타 시드 shortcode (직전에 채택한 게시물 = 확실히 살아있는 진입점)
const lastKeys = {};
const igSeeds = [];
for (const d of idx.slice(0, 5)) {
  if (KAKAO_IMAGE_RESTAURANTS.every(id => lastKeys[id]) && igSeeds.length >= 2) break;
  const day = await ghGet(`docs/data/${d}.json`);
  for (const id of KAKAO_IMAGE_RESTAURANTS) {
    const img = day.obj?.restaurants?.[id]?.image;
    if (!lastKeys[id] && img) lastKeys[id] = imgKey(img);
  }
  const seed = (day.obj?.restaurants?.gangnambab?.url || '').match(/\/(?:p|reel)\/([A-Za-z0-9_-]+)/);
  if (seed && !igSeeds.includes(seed[1])) igSeeds.push(seed[1]);
}

const results = [];
for (const c of [
  crawlGoodfood(),
  ...KAKAO_IMAGE_RESTAURANTS.map(id => crawlKakaoImage(id, today, lastKeys[id])),
  crawlGangnambab(today, igSeeds),
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
