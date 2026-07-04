import { test, expect, type BrowserContext, type Page } from "@playwright/test";

/**
 * Visual regression baselines for the reformatted Najiz cards.
 *
 * Covers three viewports (see playwright.config.ts projects):
 *   • chromium         (desktop, 1280×800)
 *   • chromium-tablet  (834×1112)
 *   • chromium-mobile  (390×844)
 *
 * Snapshot filenames use Playwright's implicit -{project} suffix so the
 * three viewports don't collide.
 *
 * Baselines are stored next to this spec under __screenshots__/. Update with:
 *   bunx playwright test najiz-cards-visual --update-snapshots
 *
 * Requires the lawyer test account from `bun run seed:test` and at least one
 * synced execution / power row. Tests auto-skip when no card is present so CI
 * without seed data doesn't fail.
 */
const URL = process.env.E2E_URL || "http://localhost:8080";
const PASS = process.env.TEST_PASSWORD || "Test1234!";
const LAWYER = process.env.TEST_LAWYER_EMAIL || "lawyer@test.local";

// Fixed "now" used to freeze relative timestamps and expiry chips.
// 2026-04-15 12:00:00 Asia/Riyadh (UTC+3).
const FROZEN_NOW = new Date("2026-04-15T09:00:00.000Z").valueOf();

/**
 * Pin Date.now / new Date() to a fixed instant AND block remote font network
 * so every machine renders identical glyphs. Must run before any page load.
 */
async function stabiliseContext(context: BrowserContext) {
  // Block webfont requests — the browser then falls back to the system font
  // stack declared in the app, which is stable across machines.
  await context.route(/(fonts\.googleapis\.com|fonts\.gstatic\.com|\.woff2?$|\.ttf$)/i, (r) =>
    r.abort(),
  );
  await context.addInitScript((now: number) => {
    // Freeze Date so "منذ ..." / expiry chips are deterministic.
    const OriginalDate = Date;
    class FrozenDate extends OriginalDate {
      constructor(...args: unknown[]) {
        if (args.length === 0) super(now);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        else super(...(args as [any]));
      }
      static now() {
        return now;
      }
    }
    (globalThis as unknown as { Date: typeof Date }).Date = FrozenDate as unknown as typeof Date;
  }, FROZEN_NOW);
}

async function login(page: Page) {
  await page.goto(`${URL}/auth`);
  await page
    .getByRole("button", { name: /محامٍ|محام/ })
    .first()
    .click();
  await page.getByRole("textbox", { name: /البريد|email/i }).fill(LAWYER);
  await page.getByRole("textbox", { name: /كلمة المرور|password/i }).fill(PASS);
  await page.getByRole("button", { name: /تسجيل الدخول|sign in/i }).click();
  await page.waitForURL(/\/app/, { timeout: 60_000 });
}

/** Stabilise a card for pixel diffing: freeze animations & mask time-sensitive
 *  chips (relative dates, "منذ ..." labels) that would otherwise churn. */
async function freeze(page: Page) {
  await page.addStyleTag({
    content: `
      *, *::before, *::after {
        animation: none !important;
        transition: none !important;
        caret-color: transparent !important;
      }
      html { scroll-behavior: auto !important; }
    `,
  });
  // Wait for any pending layout to settle after we injected CSS.
  await page.evaluate(
    () => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))),
  );
}

test.describe("Najiz cards — visual regression", () => {
  test.beforeEach(async ({ context }) => {
    await stabiliseContext(context);
  });

  test("execution request card layout", async ({ page }) => {
    await login(page);
    await page.goto(`${URL}/app/execution`);
    await page.waitForLoadState("networkidle");
    await freeze(page);

    const card = page.getByTestId("execution-card").first();
    const count = await page.getByTestId("execution-card").count();
    test.skip(count === 0, "No execution rows seeded; skipping snapshot.");
    await expect(card).toBeVisible();
    await expect(card).toHaveScreenshot("execution-card.png");
  });

  test("power of attorney card layout", async ({ page }) => {
    await login(page);
    await page.goto(`${URL}/app/powers`);
    await page.waitForLoadState("networkidle");
    await freeze(page);

    const card = page.getByTestId("power-card").first();
    const count = await page.getByTestId("power-card").count();
    test.skip(count === 0, "No power rows seeded; skipping snapshot.");
    await expect(card).toBeVisible();
    await expect(card).toHaveScreenshot("power-card.png");
  });

  test("power of attorney detail modal layout", async ({ page }) => {
    await login(page);
    await page.goto(`${URL}/app/powers`);
    await page.waitForLoadState("networkidle");
    const cards = page.getByTestId("power-card");
    const count = await cards.count();
    test.skip(count === 0, "No power rows seeded; skipping snapshot.");

    // Open the details modal via the card's action.
    await cards
      .first()
      .getByRole("button", { name: /تفاصيل|عرض/ })
      .first()
      .click();
    const modal = page.getByRole("dialog");
    await expect(modal).toBeVisible();
    await freeze(page);
    await expect(modal).toHaveScreenshot("power-detail-modal.png");
  });
});
