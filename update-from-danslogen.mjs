// Hämtar dansdata från danslogen.se och uppdaterar data.js + JUNE_DATA i index.html
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

// Läs platsfält från höger — danslogen har varierande tomma celler mitt i raden
function mapTds(tds) {
  if (tds.length < 8) return null;
  const ovrigt = tds[tds.length - 1] || '';
  const lan = tds[tds.length - 2] || '';
  const kommun = tds[tds.length - 3] || '';
  const ort = tds[tds.length - 4] || '';
  const stalle = tds[tds.length - 5] || '';
  const left = tds.slice(0, tds.length - 5);

  let i = 0;
  let dayAbbr = left[i++];
  let dayNum = left[i++];
  if (!dayMap[dayAbbr] && dayMap[dayNum]) {
    dayAbbr = dayNum;
    dayNum = left[i++];
  }
  if (!dayMap[dayAbbr]) return null;

  while (i < left.length && left[i] === '') i++;
  let tid = '';
  if (i < left.length && looksLikeTime(left[i])) {
    tid = left[i++];
    while (i < left.length && left[i] === '') i++;
  }
  let band = '';
  if (i < left.length) {
    band = left[i++];
    while (i < left.length && left[i] === '') i++;
    if (i < left.length && !band) band = left[i++];
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
          if (num === '01' && currentMonth >= '06') {
            currentYear = String(parseInt(currentYear) + 1);
          }
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
    if (!band) continue;
    if (isPreviewRow(ovrigt)) continue;
    const dayNum = String(dayNumRaw).padStart(2, '0');
    const fullDay = dayMap[dayAbbr] || dayAbbr;
    let datum = currentYear + '-' + activeMonth + '-' + dayNum;

    const dagNames = ['Söndag','Måndag','Tisdag','Onsdag','Torsdag','Fredag','Lördag'];
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
  return dedupeRows(rows);
}

function rowKey(r) {
  return [r[0], r[2], r[3], r[4], r[5]].join('|').toLowerCase();
}

function dedupeRows(rows) {
  const seen = new Map();
  for (const r of rows) {
    const k = rowKey(r);
    if (!seen.has(k)) seen.set(k, r);
  }
  return [...seen.values()].sort((a, b) => {
    const d = a[0].localeCompare(b[0]);
    return d !== 0 ? d : a[2].localeCompare(b[2]);
  });
}

function formatMonthData(varName, rows) {
  const json = JSON.stringify(rows, null, 0)
    .replace(/\],\[/g, '],\n[')
    .replace('[[', '[\n[')
    .replace(']]', ']\n]');
  return `const ${varName} = ${json};\n`;
}

const months = {
  JUNE: 'juni',
  JULY: 'juli',
  AUG: 'augusti',
  SEP: 'september',
  OCT: 'oktober',
  NOV: 'november',
  DEC: 'december'
};

const dataVarNames = {
  JULY: 'JULY_DATA',
  AUG: 'AUG_DATA',
  SEP: 'SEP_DATA',
  OCT: 'OCT_DATA',
  NOV: 'NOV_DATA',
  DEC: 'DEC_DATA'
};

const allMonthData = {};
for (const [key, slug] of Object.entries(months)) {
  const url = `https://www.danslogen.se/dansprogram/${slug}`;
  console.log(`Hämtar ${slug}...`);
  const html = await (await fetch(url)).text();
  const rows = parseHTML(html, slug);
  allMonthData[key] = rows;
  console.log(`  ${rows.length} danser`);
}

// data.js (juli–december)
let dataJs = '';
for (const [key, varName] of Object.entries(dataVarNames)) {
  dataJs += formatMonthData(varName, allMonthData[key]);
}
fs.writeFileSync(path.join(__dirname, 'data.js'), dataJs, 'utf8');

// JUNE_DATA i index.html
const indexPath = path.join(__dirname, 'index.html');
let indexHtml = fs.readFileSync(indexPath, 'utf8');
const juneJson = JSON.stringify(allMonthData.JUNE);
const juneRe = /const JUNE_DATA = \[[\s\S]*?\];/;
if (!juneRe.test(indexHtml)) throw new Error('JUNE_DATA hittades inte i index.html');
indexHtml = indexHtml.replace(juneRe, `const JUNE_DATA = ${juneJson};`);
fs.writeFileSync(indexPath, indexHtml, 'utf8');

const total = Object.values(allMonthData).reduce((s, r) => s + r.length, 0);
console.log(`\nKlart! ${total} danser totalt (jun–dec).`);
