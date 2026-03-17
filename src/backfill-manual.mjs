import { writeFileSync, readFileSync, existsSync, readdirSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '..', 'docs', 'data');
mkdirSync(DATA_DIR, { recursive: true });

function saveDayData(date, restaurantId, data) {
  const filePath = join(DATA_DIR, `${date}.json`);
  let dayData = { date, restaurants: {} };
  if (existsSync(filePath)) {
    try { dayData = JSON.parse(readFileSync(filePath, 'utf-8')); } catch {}
  }
  dayData.restaurants[restaurantId] = data;
  writeFileSync(filePath, JSON.stringify(dayData, null, 2), 'utf-8');
  console.log(`saved: data/${date}.json [${restaurantId}]`);
}

// goodfood_xi - 3/16 월요일 (기존 latest.json에서)
const gfData = JSON.parse(readFileSync(join(DATA_DIR, 'latest.json'), 'utf-8'));
saveDayData('2026-03-16', 'goodfood_xi', {
  url: gfData.url,
  title: gfData.title,
  body: gfData.body,
  image: gfData.image,
});

// gangnambab - 3/13 금요일 (이전 OCR 결과)
saveDayData('2026-03-13', 'gangnambab', {
  url: 'https://www.instagram.com/gangnambab/reel/DVzOqank2PP/',
  title: '강남밥상 과천점',
  body: '3월 13일 금요일 메뉴\n허브소금불고기\n모듬감자튀김\n미트볼스파게티\n파스타면\n유부우동장국\n콘푸레이크 누룽지\n셀프계란후라이\n햄마늘쫑볶음\n상추겉절이\n콩나물\n오이고추\n과일\n야채샐러드\n배추김치\n토스트 / 커피',
  image: '',
});

// gangnambab - 3/12 목요일 (test-frame-3.png에서 읽은 OCR 결과)
saveDayData('2026-03-12', 'gangnambab', {
  url: 'https://www.instagram.com/gangnambab/reel/DVwp7_tk_s6/',
  title: '강남밥상 과천점',
  body: '3월 12일 목요일 메뉴\n오삼불고기\n해물까스&치킨너겟\n들기름막국수\n버섯햄조림\n콩나물국\n콘푸레이크 누룽지\n주먹밥\n셀프계란후라이\n상추쌈\n숙주나물\n멸치볶음\n깍두기\n야채샐러드\n배추김치\n토스트 / 커피',
  image: '',
});

// dates.json 인덱스 업데이트
const dates = readdirSync(DATA_DIR)
  .filter(f => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
  .map(f => f.replace('.json', ''))
  .sort()
  .reverse();
writeFileSync(join(DATA_DIR, 'dates.json'), JSON.stringify(dates, null, 2));
console.log(`\ndates.json: ${dates.join(', ')}`);
