/* eslint-disable @typescript-eslint/no-require-imports -- Standalone browser smoke check. */
const { chromium } = require('@playwright/test');

(async () => {
  const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || (process.platform === 'win32' ? 'msedge' : undefined), headless: true });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  const redact = value => String(value).replace(/AIza[\w-]+/g, '[REDACTED]').replace(/([?&]key=)[^&\s]+/g, '$1[REDACTED]');
  page.on('console', message => { if (message.type() === 'error') errors.push(redact(message.text()).slice(0, 600)); });
  page.on('requestfailed', request => { if (request.url().includes('googleapis.com')) errors.push({ host: new URL(request.url()).host, reason: request.failure()?.errorText }); });
  try {
    await page.goto((process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3010') + '/evac?mode=api');
    await page.waitForTimeout(15000);
    const loaded = await page.evaluate(() => Boolean(window.google?.maps?.Map));
    console.log(JSON.stringify({ loaded, errors }, null, 2));
    await page.screenshot({ path: 'artifacts/maps-api-preview.png' });
  } finally { await browser.close(); }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
