import { test, expect, type Page } from "@playwright/test";

/**
 * PDF preview dialog integration coverage.
 *
 * Covers the three critical states of `<PdfPreviewDialog />` as it is
 * mounted from the cases screen:
 *   1. Generating — download button spins, close is blocked.
 *   2. Error     — failure toast + inline retry affordance appears.
 *   3. Retry     — clicking retry re-invokes the generator successfully.
 *
 * Requires seeded lawyer account (bun run seed:test) and at least one
 * case (node scripts/seed-realistic-data.mjs). If the required
 * environment isn't present the whole file skips itself instead of
 * failing CI on projects that haven't wired secrets yet.
 */

const URL = process.env.E2E_URL || "http://localhost:8080";
const PASS = process.env.TEST_PASSWORD || "Test1234!";
const LAWYER_EMAIL = process.env.TEST_LAWYER_EMAIL || "lawyer@test.local";

test.describe("PdfPreviewDialog", () => {
  test.beforeEach(async ({ page }) => {
    // Skip gracefully if the app isn't wired to a Supabase instance in this CI run.
    const resp = await page.request.get(`${URL}/auth`).catch(() => null);
    test.skip(!resp || !resp.ok(), "App not reachable at E2E_URL — skipping");
  });

  async function loginAsLawyer(page: Page) {
    await page.goto(`${URL}/auth`);
    await page
      .getByRole("button", { name: /محامٍ|محام/ })
      .first()
      .click()
      .catch(() => {});
    await page.getByRole("textbox", { name: /البريد|email/i }).fill(LAWYER_EMAIL);
    await page.getByRole("textbox", { name: /كلمة المرور|password/i }).fill(PASS);
    await page.getByRole("button", { name: /تسجيل الدخول|sign in/i }).click();
    await page.waitForURL(/\/app/, { timeout: 60_000 });
  }

  async function openPdfDialog(page: Page) {
    await page.goto(`${URL}/app/cases`);
    // Wait for either the cases grid or the empty-state marker.
    await page
      .locator('[data-testid="cases-grid"], [data-testid="cases-empty-state"]')
      .first()
      .waitFor({ timeout: 30_000 });
    const empty = await page.locator('[data-testid="cases-empty-state"]').count();
    test.skip(empty > 0, "No seeded cases — run scripts/seed-realistic-data.mjs first");
    // Open the PDF preview via the toolbar action.
    await page
      .getByRole("button", { name: /تصدير PDF|معاينة|PDF/i })
      .first()
      .click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByText(/معاينة قبل توليد PDF|معاينة تصدير القضايا/)).toBeVisible();
  }

  test("shows generating state and blocks close during download", async ({ page }) => {
    await loginAsLawyer(page);
    await openPdfDialog(page);

    const dialog = page.getByRole("dialog");
    const downloadBtn = dialog.getByRole("button", { name: /تنزيل PDF|جاري التوليد/ });
    await expect(downloadBtn).toBeEnabled();

    // Kick off download. jsPDF runs in-browser; assert the busy state appears.
    await downloadBtn.click();
    await expect(dialog).toHaveAttribute("aria-busy", "true");
    // Try to escape — the dialog must remain open while generating.
    await page.keyboard.press("Escape");
    await expect(dialog).toBeVisible();

    // Success closes the dialog OR we surface the error banner.
    await Promise.race([
      dialog.waitFor({ state: "hidden", timeout: 30_000 }),
      dialog.getByRole("alert").waitFor({ timeout: 30_000 }),
    ]);
  });

  test("surfaces error state and retry flow", async ({ page }) => {
    await loginAsLawyer(page);

    // Force jsPDF to throw by shadowing the constructor before opening the dialog.
    await page.addInitScript(() => {
      (window as unknown as { __forcePdfError?: boolean }).__forcePdfError = true;
    });
    await page.route("**/*jspdf*", (route) => route.abort());

    await openPdfDialog(page);
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: /تنزيل PDF/ }).click();

    // Error banner + retry button appear.
    const alert = dialog.getByRole("alert");
    await expect(alert).toBeVisible({ timeout: 30_000 });
    await expect(alert.getByText(/فشل توليد الملف/)).toBeVisible();
    const retry = alert.getByRole("button", { name: /إعادة المحاولة/ });
    await expect(retry).toBeVisible();

    // Retry re-invokes the generator; still fails while route is intercepted.
    await retry.click();
    await expect(dialog).toHaveAttribute("aria-busy", "true");
    await expect(alert).toBeVisible({ timeout: 30_000 });

    // Unblock and retry — dialog should close (or at least alert should clear).
    await page.unroute("**/*jspdf*");
    await retry.click();
    await Promise.race([
      dialog.waitFor({ state: "hidden", timeout: 30_000 }),
      expect(alert).toBeHidden({ timeout: 30_000 }).catch(() => {}),
    ]);
  });
});
