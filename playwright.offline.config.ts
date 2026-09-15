import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir:'./tests',testMatch:process.env.OFFLINE_LIVE?'offline-live.spec.ts':'offline-evac.spec.ts',timeout:60000,workers:1,
  use:{baseURL:process.env.PLAYWRIGHT_BASE_URL??'http://127.0.0.1:3106',browserName:'chromium',channel:process.env.PLAYWRIGHT_CHANNEL,headless:true,viewport:{width:390,height:844},serviceWorkers:'allow'},
  webServer:process.env.PLAYWRIGHT_BASE_URL?undefined:{command:'npm run dev -- --port 3106',url:'http://127.0.0.1:3106',reuseExistingServer:true,timeout:120000},
});
