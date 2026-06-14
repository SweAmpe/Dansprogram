// Hämtar bandnamn + hemsida från danslogen.se
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const letters = ['09', 'a','b','c','d','e','f','g','h','i','j','k','l','m','n','o','p','q','r','s','t','u','v','w','x','y','z'];
const links = {};

for (const letter of letters) {
  const url = `https://www.danslogen.se/dansband/via/bokstav/${letter}`;
  const html = await (await fetch(url)).text();
  const trRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let m;
  while ((m = trRe.exec(html)) !== null) {
    const tr = m[1];
    const nameMatch = tr.match(/<td>\s*([^<]+?)\s*<\/td>/i);
    if (!nameMatch) continue;
    const name = nameMatch[1].trim();
    if (!name || name.length < 2) continue;
    const homeMatch = tr.match(/href="([^"]+)"[^>]*title="Hemsida"/i);
    if (homeMatch) {
      let url = homeMatch[1].trim();
      if (!url.startsWith('http')) url = 'https://' + url;
      links[name] = url;
    }
  }
  console.log(`${letter}: ${Object.keys(links).length} totalt`);
}

const out = '// Bandhemsidor från danslogen.se — uppdateras med scrape-band-links.mjs\nconst BAND_LINKS = ' +
  JSON.stringify(links, null, 2) + ';\n';
fs.writeFileSync(path.join(__dirname, 'band-lankar.js'), out, 'utf8');
console.log(`\n${Object.keys(links).length} band med hemsida sparade i band-lankar.js`);
