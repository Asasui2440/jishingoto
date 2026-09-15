const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('@playwright/test');
const sharp = require('sharp');

const root = path.resolve(__dirname, '../..');
const file = path.join(__dirname, 'stakeholder-map-clean.svg');
let svg = fs.readFileSync(file, 'utf8');
// Main のロゴ素材をそのまま埋め込み、SVG 単体でも表示できるようにする。
svg = svg.replace(/(<image\b[^>]*data-brand-asset="([^"]+)"[^>]*\bhref=")[^"]*(")/g, (_, before, name, after) => {
  const data = fs.readFileSync(path.join(__dirname, 'brand', path.basename(name)));
  return `${before}data:image/png;base64,${data.toString('base64')}${after}`;
});
const labels = [...svg.matchAll(/<text\b[^>]*>([^<]*)<\/text>/g)].map(m => m[1]).join('');
const codepoints = [...new Set([...labels].map(c => c.codePointAt(0)))];
const chunkDir = path.join(root, '.next/dev/static/chunks');
const cssPath = fs.readdirSync(chunkDir).find(n => n.includes('noto_sans_jp') && n.endsWith('.single.css'));
if (!cssPath) throw new Error('プロダクトの Noto Sans JP フォントが見つかりません');
const css = fs.readFileSync(path.join(chunkDir, cssPath), 'utf8');
const blocks = [...css.matchAll(/@font-face\s*\{[^}]+\}/g)].map(m => m[0]);
const used = blocks.filter(block => {
  if (!/font-weight:\s*(500|700|900);/.test(block)) return false;
  const match = block.match(/unicode-range:\s*([^;]+);/);
  if (!match) return false;
  return match[1].split(',').some(range => {
    const [low, high] = range.trim().replace(/^U\+/i, '').split('-');
    const a = parseInt(low, 16);
    const b = parseInt(high || low, 16);
    return codepoints.some(cp => cp >= a && cp <= b);
  });
}).map(block => block.replace(/url\("\.\.\/media\/([^\"]+)"\)/g, (_, name) => {
  const fontPath = path.join(root, '.next/dev/static/media', name);
  return `url("data:font/woff2;base64,${fs.readFileSync(fontPath).toString('base64')}")`;
}));
if (!used.length) throw new Error('フォントの埋め込みに失敗しました');
svg = svg.replace(/<style id="embedded-font">[\s\S]*?<\/style>/, `<style id="embedded-font">\n${used.join('\n')}\n</style>`);
fs.writeFileSync(file, svg);

(async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 2 });
    await page.setContent(`<html lang="ja"><head><meta charset="utf-8"><style>html,body{margin:0;width:1920px;height:1080px;overflow:hidden}svg{display:block}</style></head><body>${svg}</body></html>`);
    await page.evaluate(() => document.fonts.ready);
    await page.evaluate(() => Promise.all([...document.querySelectorAll('svg image')].map(element => {
      const image = new Image();
      image.src = element.href.baseVal;
      return image.decode();
    })));
    const checks = await page.evaluate(() => {
      const text = [...document.querySelectorAll('svg text')].map(el => {
        const r = el.getBoundingClientRect();
        return { text: el.textContent, x: r.x, y: r.y, right: r.right, bottom: r.bottom };
      });
      const clipped = text.filter(r => r.x < 0 || r.y < 0 || r.right > 1920 || r.bottom > 1080);
      const overlaps = [];
      for (let i = 0; i < text.length; i++) for (let j = i + 1; j < text.length; j++) {
        const a = text[i], b = text[j];
        if (a.x < b.right && a.right > b.x && a.y < b.bottom && a.bottom > b.y) overlaps.push([a.text, b.text]);
      }
      const logoImages = [...document.querySelectorAll('image[data-brand-asset]')].map(image => image.getAttribute('data-brand-asset'));
      return { fontLoaded: document.fonts.check('700 34px "Noto Sans JP"', '被害者サンドイッチ世代子ども高齢者'), clipped, overlaps, labels: text.length, logoImages };
    });
    if (!checks.fontLoaded || checks.clipped.length || checks.overlaps.length) throw new Error(JSON.stringify(checks));
    const png4k = path.join(__dirname, 'stakeholder-map-clean-4k.png');
    await page.screenshot({ path: png4k });
    await sharp(png4k).resize(1920, 1080).png().toFile(path.join(__dirname, 'stakeholder-map-clean.png'));
    console.log(JSON.stringify({ ...checks, outputs: ['stakeholder-map-clean.svg', 'stakeholder-map-clean.png', 'stakeholder-map-clean-4k.png'], embeddedFontFaces: used.length }));
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
