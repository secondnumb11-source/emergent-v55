#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const dotenv = require("dotenv");
const { Builder } = require("selenium-webdriver");
const chrome = require("selenium-webdriver/chrome");

dotenv.config({ path: path.join(__dirname, ".env") });
const API_BASE = (process.env.API_BASE || "").replace(/\/$/, "");
const SYNC_TOKEN = process.env.SYNC_TOKEN || "";
const FIXTURE_BASE = (process.env.FIXTURE_BASE || "").replace(/\/$/, "");
const HEADLESS = process.env.HEADLESS === "1";
const PLAYWRIGHT_CHROME = "/root/.cache/ms-playwright/chromium-1228/chrome-linux/chrome";

if (!API_BASE || !SYNC_TOKEN) {
  console.error("❌ يجب ضبط API_BASE و SYNC_TOKEN في ملف bot/.env");
  process.exit(1);
}

const CONTENT_JS = fs.readFileSync(path.join(__dirname, "..", "extension", "content.js"), "utf8");
const CHROME_STUB = `
  if (!window.chrome) window.chrome = {};
  if (!chrome.runtime) chrome.runtime = {};
  if (!chrome.runtime.getURL) chrome.runtime.getURL = () => "";
  if (!chrome.runtime.sendMessage) chrome.runtime.sendMessage = async () => ({ ok: false });
  if (!chrome.runtime.onMessage) chrome.runtime.onMessage = { addListener: () => {} };
  if (!chrome.storage) chrome.storage = { local: { get: async () => ({}), set: async () => {} } };
  window.__ADALA_BOT__ = true;
`;

async function injectScraper(driver) {
  await driver.executeScript(CHROME_STUB);
  await driver.executeScript(CONTENT_JS);
  const maxWait = Date.now() + 10000;
  while (Date.now() < maxWait) {
    const loaded = await driver.executeScript("return !!window.__ADALA_NAJIZ__");
    if (loaded) return true;
    await driver.sleep(200);
  }
  return false;
}

async function main() {
  const options = new chrome.Options();
  if (HEADLESS) options.addArguments("--headless=new", "--disable-gpu");
  options.setChromeBinaryPath(PLAYWRIGHT_CHROME);

  const driver = await new Builder().forBrowser("chrome").setChromeOptions(options).build();
  try {
    const url = FIXTURE_BASE || "https://najiz.sa/applications/landing";
    await driver.get(url);
    console.log("✅ Selenium opened", url);
    await driver.sleep(3000);

    const loaded = await injectScraper(driver);
    if (!loaded) {
      throw new Error("فشل تحميل سكريبت Najiz في Selenium");
    }
    console.log("✅ Selenium injected Najiz scraper");

    if (!FIXTURE_BASE) {
      console.log(
        "🔐 سجّل الدخول عبر النفاذ الوطني في نافذة Selenium ثم انتظر حتى يكتب البوت الحالة.",
      );
      await driver.sleep(10000);
    }

    const payload = await driver.executeScript('return window.__ADALA_NAJIZ__?.scrape("cases")');
    console.log("ℹ️ Selenium scraped cases payload length:", payload?.cases?.length ?? 0);
  } finally {
    await driver.quit();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
