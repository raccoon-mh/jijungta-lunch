// 기존 *-latest.json → 날짜별 통합 구조로 마이그레이션
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '..', 'data');

const ids = ['goodfood_xi', 'gangnambab'];
const byDate = {};

for (const id of ids) {
  const path = join(DATA_DIR, `${id}-latest.json`);
  if (!existsSync(path)) continue;
  const d = JSON.parse(readFileSync(path, 'utf-8'));
  const date = d.date;
  if (!byDate[date]) {
    byDate[date] = { date, crawled_at: d.crawled_at, restaurants: {} };
  }
  byDate[date].restaurants[id] = {
    url: d.url,
    title: d.title,
    body: d.body,
    image: d.image,
  };
}

const dates = Object.keys(byDate).sort().reverse();
for (const date of dates) {
  writeFileSync(join(DATA_DIR, `${date}.json`), JSON.stringify(byDate[date], null, 2));
  console.log(`saved: data/${date}.json`);
}
writeFileSync(join(DATA_DIR, 'dates.json'), JSON.stringify(dates, null, 2));
console.log(`dates.json: ${dates}`);
