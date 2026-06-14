// Jämför lokalt dansprogram med danslogen.se (live)
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

function mapTds(tds) {
  if (tds.length < 8) return null;
  let i = 0;
  let dayAbbr = tds[i++];
  let dayNum = tds[i++];
  if (!dayMap[dayAbbr] && dayMap[dayNum]) {
    dayAbbr = dayNum;
    dayNum = tds[i++];
  }
  if (!dayMap[dayAbbr]) return null;
  const tid = tds[i++];
  const band = tds[i++];
  // Hoppa över tomma celler (danslogen har ibland extra tom td)
  while (i < tds.length && tds[i] === '') i++;
  const stalle = tds[i++] || '';
  while (i < tds.length && tds[i] === '') i++;
  const ort = tds[i++] || '';
  const kommun = tds[i++] || '';
  const lan = tds[i++] || '';
  const ovrigt = tds[i] || '';
  return [dayAbbr, dayNum, tid, band, stalle, ort, kommun, lan, ovrigt];
}

function parseHTML(html, filename) {
  const rows = [];
  const title = (html.match(/<title>([^<]*)</i) || [])[1] || filename;
  let currentYear = '2026';
  const yearMatch = title.match(/20\d{2}/);
  if (yearMatch) currentYear = yearMatch[0];

  let currentMonth = '';
  for (const [name, num] of Object.entries(monthMap)) {
    if ((title + filename).toLowerCase().includes(name.toLowerCase())) {
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
    if (tds.length < 8) continue;

    const mapped = mapTds(tds);
    if (!mapped) continue;
    const [dayAbbr, dayNumRaw, tid, band, stalle, ort, kommun, lan, ovrigt] = mapped;
    const dayNum = dayNumRaw.padStart(2, '0');
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
    rows.push([datum, fullDay, tid, band, stalle, ort, kommun, lan, ovrigt]);
  }
  return rows;
}

function rowKey(r) {
  return [r[0], r[2], r[3], r[4], r[5]].join('|').toLowerCase();
}

function loadLocalData() {
  const dataJs = fs.readFileSync(path.join(__dirname, 'data.js'), 'utf8');
  const indexHtml = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
  const local = {};
  for (const m of ['JULY', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']) {
    const re = new RegExp(`const ${m}_DATA = (\\[[\\s\\S]*?\\]);`);
    const match = dataJs.match(re);
    if (match) local[m] = JSON.parse(match[1]);
  }
  const juneMatch = indexHtml.match(/const JUNE_DATA = (\[[\s\S]*?\]);/);
  if (juneMatch) local.JUNE = JSON.parse(juneMatch[1]);
  return local;
}

const liveMonths = {
  JUNE: 'juni', JULY: 'juli', AUG: 'augusti', SEP: 'september',
  OCT: 'oktober', NOV: 'november', DEC: 'december'
};
const monthLabels = {
  JUNE: 'Juni', JULY: 'Juli', AUG: 'Augusti', SEP: 'September',
  OCT: 'Oktober', NOV: 'November', DEC: 'December'
};

const local = loadLocalData();
console.log('=== Jämförelse: vårt program vs danslogen.se (live idag) ===\n');

let totalNew = 0, totalRemoved = 0, liveTotal = 0;

for (const [key, slug] of Object.entries(liveMonths)) {
  const url = `https://www.danslogen.se/dansprogram/${slug}`;
  const res = await fetch(url);
  const html = await res.text();
  const danslogen = parseHTML(html, slug);
  const ours = local[key] || [];
  liveTotal += danslogen.length;

  const dlSet = new Map(danslogen.map(r => [rowKey(r), r]));
  const ourSet = new Map(ours.map(r => [rowKey(r), r]));
  const onlyDl = [...dlSet.keys()].filter(k => !ourSet.has(k));
  const onlyOurs = [...ourSet.keys()].filter(k => !dlSet.has(k));

  console.log(`${monthLabels[key]}: danslogen ${danslogen.length} | vårt ${ours.length}`);
  if (onlyDl.length === 0 && onlyOurs.length === 0) {
    console.log('  ✓ Identiskt\n');
    continue;
  }
  if (onlyDl.length) {
    console.log(`  + ${onlyDl.length} nya på danslogen:`);
    onlyDl.slice(0, 8).forEach(k => {
      const r = dlSet.get(k);
      console.log(`    ${r[0]} ${r[2]} ${r[3]} @ ${r[4]}, ${r[5]}`);
    });
    if (onlyDl.length > 8) console.log(`    ... och ${onlyDl.length - 8} fler`);
    totalNew += onlyDl.length;
  }
  if (onlyOurs.length) {
    console.log(`  - ${onlyOurs.length} borttagna/ändrade på danslogen:`);
    onlyOurs.slice(0, 8).forEach(k => {
      const r = ourSet.get(k);
      console.log(`    ${r[0]} ${r[2]} ${r[3]} @ ${r[4]}, ${r[5]}`);
    });
    if (onlyOurs.length > 8) console.log(`    ... och ${onlyOurs.length - 8} fler`);
    totalRemoved += onlyOurs.length;
  }
  console.log('');
}

const localTotal = Object.values(local).reduce((s, a) => s + a.length, 0);
console.log('---');
console.log(`Danslogen totalt (jun-dec): ${liveTotal}`);
console.log(`Vårt program totalt: ${localTotal}`);
console.log(`Netto: +${totalNew} nya, -${totalRemoved} borttagna/ändrade`);
