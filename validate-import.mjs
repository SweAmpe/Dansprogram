// Jämför vårt data med danslogen (samma parser som import)
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const dayMap = {
  'Mån': 'Måndag', 'Tis': 'Tisdag', 'Ons': 'Onsdag',
  'Tor': 'Torsdag', 'Fre': 'Fredag', 'Lör': 'Lördag', 'Sön': 'Söndag'
};
const monthMap = {
  'Januari': '01', 'Februari': '02', 'Mars': '03', 'April': '04',
  'Maj': '05', 'Juni': '06', 'Juli': '07', 'Augusti': '08',
  'September': '09', 'Oktober': '10', 'November': '11', 'December': '12'
};
const slugToMonth = {
  juni: '06', juli: '07', augusti: '08', september: '09',
  oktober: '10', november: '11', december: '12'
};

function looksLikeTime(s) {
  return /^\d{1,2}[.:]\d{2}/.test(String(s || '').trim());
}

function mapTds(tds) {
  if (tds.length < 8) return null;
  let i = tds.length - 1;
  const ovrigt = tds[i] || '';
  i--;
  const loc = [];
  while (i >= 0 && loc.length < 4) {
    if (tds[i] !== '') loc.unshift(tds[i]);
    i--;
  }
  if (loc.length < 3) return null;
  const lan = loc.length >= 4 ? loc[3] : '';
  const kommun = loc.length >= 3 ? loc[2] : '';
  const ort = loc.length >= 2 ? loc[1] : '';
  const stalle = loc[0] || '';
  const left = tds.slice(0, i + 1);
  let j = 0;
  let dayAbbr = left[j++];
  let dayNum = left[j++];
  if (!dayMap[dayAbbr] && dayMap[dayNum]) {
    dayAbbr = dayNum;
    dayNum = left[j++];
  }
  if (!dayMap[dayAbbr]) return null;
  while (j < left.length && left[j] === '') j++;
  let tid = '';
  if (j < left.length && looksLikeTime(left[j])) {
    tid = left[j++];
    while (j < left.length && left[j] === '') j++;
  }
  let band = '';
  if (j < left.length) {
    band = left[j++];
    while (j < left.length && left[j] === '') j++;
    if (j < left.length && !band) band = left[j++];
  }
  return [dayAbbr, dayNum, tid, band, stalle, ort, kommun, lan, ovrigt];
}

function isPreviewRow(ovrigt) {
  return String(ovrigt || '').trim() === '>';
}

function parseHTML(html, slug) {
  const rows = [];
  const title = (html.match(/<title>([^<]*)</i) || [])[1] || slug;
  let currentYear = '2026';
  const yearMatch = title.match(/20\d{2}/);
  if (yearMatch) currentYear = yearMatch[0];
  let currentMonth = '';
  for (const [name, num] of Object.entries(monthMap)) {
    if ((title + slug).toLowerCase().includes(name.toLowerCase())) {
      currentMonth = num;
      break;
    }
  }
  let activeMonth = currentMonth;
  const trRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let m;
  while ((m = trRe.exec(html)) !== null) {
    const trInner = m[1];
    const trOpen = m[0].slice(0, m[0].indexOf('>') + 1);
    if (/colspan/i.test(trInner)) {
      const hText = trInner.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      for (const [name, num] of Object.entries(monthMap)) {
        if (hText.includes(name)) {
          activeMonth = num;
          if (num === '01' && currentMonth >= '06') currentYear = String(parseInt(currentYear) + 1);
        }
      }
      continue;
    }
    if (!/class="r\d+"/i.test(trOpen)) continue;
    const tds = [...trInner.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map(x =>
      x[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
    );
    const mapped = mapTds(tds);
    if (!mapped) continue;
    const [dayAbbr, dayNumRaw, tid, band, stalle, ort, kommun, lan, ovrigt] = mapped;
    if (!band || isPreviewRow(ovrigt)) continue;
    const dayNum = String(dayNumRaw).padStart(2, '0');
    const fullDay = dayMap[dayAbbr] || dayAbbr;
    let datum = currentYear + '-' + activeMonth + '-' + dayNum;
    const dagNames = ['Söndag', 'Måndag', 'Tisdag', 'Onsdag', 'Torsdag', 'Fredag', 'Lördag'];
    const dagIdx = Object.fromEntries(dagNames.map((n, i) => [n, i]));
    const d = new Date(datum + 'T12:00:00');
    const claimed = dagIdx[fullDay];
    if (!isNaN(d) && claimed !== undefined && d.getDay() !== claimed) {
      let diff = claimed - d.getDay();
      if (diff > 3) diff -= 7;
      if (diff < -3) diff += 7;
      const c = new Date(d.getTime() + diff * 86400000);
      datum = c.getFullYear() + '-' + String(c.getMonth() + 1).padStart(2, '0') + '-' + String(c.getDate()).padStart(2, '0');
    }
    const pageMonth = slugToMonth[slug];
    if (pageMonth && datum.slice(5, 7) !== pageMonth) continue;
    rows.push([datum, fullDay, tid, band, stalle, ort, kommun, lan, ovrigt]);
  }
  return rows;
}

function rowKey(r) {
  return [r[0], r[2], r[3], r[4], r[5]].join('|').toLowerCase();
}

const dataJs = fs.readFileSync(path.join(__dirname, 'data.js'), 'utf8');
const indexHtml = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const local = {};
for (const m of ['JULY', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']) {
  local[m] = JSON.parse(dataJs.match(new RegExp(`const ${m}_DATA = (\\[[\\s\\S]*?\\]);`))[1]);
}
local.JUNE = JSON.parse(indexHtml.match(/const JUNE_DATA = (\[[\s\S]*?\]);/)[1]);

const months = { JUNE: 'juni', JULY: 'juli', AUG: 'augusti', SEP: 'september', OCT: 'oktober', NOV: 'november', DEC: 'december' };
let mismatches = 0;

for (const [key, slug] of Object.entries(months)) {
  const html = await (await fetch(`https://www.danslogen.se/dansprogram/${slug}`)).text();
  const live = parseHTML(html, slug);
  const ours = local[key] || [];
  const liveSet = new Map(live.map(r => [rowKey(r), r]));
  const ourSet = new Map(ours.map(r => [rowKey(r), r]));
  const onlyLive = [...liveSet.keys()].filter(k => !ourSet.has(k));
  const onlyOurs = [...ourSet.keys()].filter(k => !liveSet.has(k));
  if (onlyLive.length || onlyOurs.length || live.length !== ours.length) {
    mismatches++;
    console.log(`${key}: live ${live.length} | vårt ${ours.length} | saknas ${onlyLive.length} | extra ${onlyOurs.length}`);
    onlyLive.slice(0, 2).forEach(k => console.log('  +', liveSet.get(k).slice(0, 6).join(' ')));
    onlyOurs.slice(0, 2).forEach(k => console.log('  -', ourSet.get(k).slice(0, 6).join(' ')));
  } else {
    console.log(`${key}: ✓ ${ours.length} danser`);
  }
}
console.log(mismatches ? `\n${mismatches} månader med skillnad` : '\nAlla månader matchar danslogen');
