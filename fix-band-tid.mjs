// Rättar rader där tid hamnat i band-kolumnen
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function looksLikeTime(s) {
  return /^\d{1,2}[.:]\d{2}/.test(String(s || '').trim());
}

function fixRow(r) {
  if (r.length >= 9 && !r[2] && looksLikeTime(r[3])) {
    return [r[0], r[1], r[3], r[4], r[5], r[6], r[7], r[8], r[9] || ''];
  }
  return r;
}

let fixed = 0;

const dataPath = path.join(__dirname, 'data.js');
let dataJs = fs.readFileSync(dataPath, 'utf8');
for (const varName of ['JULY_DATA', 'AUG_DATA', 'SEP_DATA', 'OCT_DATA', 'NOV_DATA', 'DEC_DATA']) {
  const re = new RegExp(`const ${varName} = (\\[[\\s\\S]*?\\]);`);
  const m = dataJs.match(re);
  if (!m) continue;
  const rows = JSON.parse(m[1]).map(r => {
    const f = fixRow(r);
    if (f !== r) fixed++;
    return f;
  });
  dataJs = dataJs.replace(re, `const ${varName} = ${JSON.stringify(rows)};`);
}
fs.writeFileSync(dataPath, dataJs, 'utf8');

const indexPath = path.join(__dirname, 'index.html');
let indexHtml = fs.readFileSync(indexPath, 'utf8');
const juneRe = /const JUNE_DATA = (\[[\s\S]*?\]);/;
const june = JSON.parse(indexHtml.match(juneRe)[1]).map(r => {
  const f = fixRow(r);
  if (f !== r) fixed++;
  return f;
});
indexHtml = indexHtml.replace(juneRe, `const JUNE_DATA = ${JSON.stringify(june)};`);
fs.writeFileSync(indexPath, indexHtml, 'utf8');

console.log(`Rättade ${fixed} rader där tid hamnat i band-kolumnen.`);
