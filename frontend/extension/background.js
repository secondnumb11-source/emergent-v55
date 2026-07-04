// منصة العدالة — background service worker v4.8
// البوت التلقائي: يفتح ناجز، ينتظر تسجيل الدخول عبر نفاذ،
// ثم يتنقل بين الأقسام تلقائياً، يسحب البيانات، ويرسلها إلى /api/public/najiz-sync بصيغة API الصحيحة.

const NAJIZ_LOGIN_URL = "https://najiz.sa";

const DEFAULT_AUTOPILOT_STEPS = [
  {
    kind: "cases",
    label: "القضايا",
    url: "https://najiz.sa/applications/lawsuit",
    subTabs: [["القضايا"]],
  },
  {
    kind: "documents",
    label: "الأحكام داخل القضايا",
    url: "https://najiz.sa/applications/lawsuit",
    subTabs: [["الأحكام", "الاحكام"], ["القرارات"]],
  },
  {
    kind: "documents",
    label: "الطلبات على القضايا",
    url: "https://najiz.sa/applications/lawsuit/requests",
  },
  {
    kind: "documents",
    label: "الطلبات على القضايا (مسار بديل)",
    url: "https://najiz.sa/applications/lawsuit//requests",
  },
  {
    kind: "lawsuit_requests",
    label: "الطلبات على القضايا",
    url: "https://najiz.sa/applications/lawsuit/requests",
  },
  { kind: "executions", label: "طلبات التنفيذ", url: "https://najiz.sa/applications/iexecution" },
  {
    kind: "powers",
    label: "الوكالات القضائية",
    url: "https://najiz.sa/applications/wekalat/procurations-query",
  },
  { kind: "sessions", label: "التقويم العدلي", url: "https://najiz.sa/applications/dashboard" },
  {
    kind: "sessions",
    label: "مواعيد الجلسات",
    url: "https://najiz.sa/applications/appointment-requests",
  },
];

chrome.runtime.onInstalled.addListener(() => {
  console.log(
    "[منصة العدالة] الإضافة جاهزة — الإصدار 4.8.0 (تعمق دقيق في الطلبات + هوية الوكالات + تفاصيل التنفيذ)",
  );
});

// =====================================================
// مساعدات
// =====================================================
function normalizeBaseUrl(raw) {
  let u = String(raw || "")
    .trim()
    .replace(/\/$/, "");
  // تحويل رابط Lovable preview إلى الرابط الثابت
  const m = u.match(/^https?:\/\/id-preview--([a-z0-9-]+)\.lovable\.app$/i);
  if (m) u = `https://project--${m[1]}-dev.lovable.app`;
  return u;
}

function suggestBaseUrl(raw) {
  const original = String(raw || "")
    .trim()
    .replace(/\/$/, "");
  const corrected = normalizeBaseUrl(original);
  return {
    corrected,
    changed: corrected !== original,
    reason:
      corrected !== original
        ? "تم تحويل رابط المعاينة إلى الرابط الثابت الذي يدعم واجهة المزامنة."
        : "",
  };
}

async function verifyEndpoint(baseUrl, syncToken) {
  const base = normalizeBaseUrl(baseUrl);
  const url = `${base}/api/public/najiz-sync`;
  try {
    const headers = { Accept: "application/json" };
    if (syncToken) headers["X-Sync-Token"] = syncToken;
    const res = await fetch(url, { method: "GET", headers });
    const text = await res.text();
    if (
      /Only HTML requests are supported here/i.test(text) ||
      /No published build/i.test(text) ||
      /<!DOCTYPE html/i.test(text)
    ) {
      return { ok: false, url, reason: "الرابط لا يصل لواجهة المزامنة (يعيد صفحة HTML)" };
    }
    let data = null;
    try {
      data = JSON.parse(text);
    } catch {}
    if (data?.ok)
      return { ok: true, url, authenticated: !!data.authenticated, message: data.message };
    if (data?.error) return { ok: false, url, reason: data.error.message || "خطأ غير معروف" };
    return { ok: false, url, reason: `استجابة غير متوقعة (HTTP ${res.status})` };
  } catch (netErr) {
    return { ok: false, url, reason: `تعذّر الوصول إلى ${url} — ${netErr.message || netErr}` };
  }
}

const RETRY_DELAYS = [1500, 4000, 9000];

async function postSync({ baseUrl, syncToken, payload }) {
  if (!baseUrl || !syncToken) return { ok: false, error: "إعدادات ناقصة (الرابط أو الرمز)" };
  const url = `${normalizeBaseUrl(baseUrl)}/api/public/najiz-sync`;
  let res;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Sync-Token": syncToken,
        Accept: "application/json",
      },
      body: JSON.stringify(payload),
    });
  } catch (netErr) {
    return {
      ok: false,
      retriable: true,
      error: `تعذّر الاتصال بـ ${url} — ${netErr.message || netErr}`,
    };
  }
  const text = await res.text();
  let data = null;
  try {
    data = JSON.parse(text);
  } catch {}
  if (
    /Only HTML requests are supported here/i.test(text) ||
    /No published build/i.test(text) ||
    /<!DOCTYPE html/i.test(text)
  ) {
    return {
      ok: false,
      status: res.status,
      error: "الرابط لا يصل إلى واجهة المزامنة. استخدم الرابط الثابت من إعدادات النظام.",
    };
  }
  if (!res.ok) {
    const retriable = res.status >= 500 || res.status === 429;
    const details = data?.error?.details
      ? ` — ${JSON.stringify(data.error.details).slice(0, 200)}`
      : "";
    return {
      ok: false,
      status: res.status,
      retriable,
      error: (data?.error?.message || text.slice(0, 250) || `HTTP ${res.status}`) + details,
    };
  }
  return { ok: true, data };
}

async function postSyncWithRetry(args, onProgress) {
  let last = null;
  for (let attempt = 0; attempt <= RETRY_DELAYS.length; attempt++) {
    if (attempt > 0) {
      const delay = RETRY_DELAYS[attempt - 1];
      onProgress &&
        onProgress(
          `إعادة المحاولة ${attempt}/${RETRY_DELAYS.length} خلال ${Math.round(delay / 1000)}ث — ${last?.error || ""}`,
        );
      await sleep(delay);
    }
    last = await postSync(args);
    if (last.ok) {
      if (attempt > 0) onProgress && onProgress(`✓ نجح الإرسال بعد المحاولة ${attempt}`);
      return last;
    }
    if (!last.retriable) return last;
  }
  return {
    ...last,
    error: `فشل بعد ${RETRY_DELAYS.length} محاولات — ${last?.error || "خطأ غير معروف"}`,
  };
}

function setProgress(update) {
  chrome.storage.local.get("autopilotProgress", (s) => {
    const cur = s.autopilotProgress || {};
    chrome.storage.local.set({ autopilotProgress: { ...cur, ...update, updatedAt: Date.now() } });
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function waitTab(tabId, timeoutMs = 45000) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      reject(new Error("انتهت مهلة التحميل"));
    }, timeoutMs);
    function listener(updatedId, info) {
      if (updatedId === tabId && info.status === "complete") {
        clearTimeout(t);
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    }
    chrome.tabs.onUpdated.addListener(listener);
  });
}

// =====================================================
// كشف تسجيل الدخول
// =====================================================
async function isLoggedIn(tabId) {
  try {
    const [r] = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        const u = location.href.toLowerCase();
        if (u.includes("login") || u.includes("nafath") || u.includes("auth") || u.includes("sso"))
          return false;
        const body = document.body;
        if (!body) return false;
        const txt = body.innerText || "";
        if (txt.length < 100) return false;
        const hints = [
          "القضايا",
          "الجلسات",
          "التقويم",
          "الوكالات",
          "التنفيذ",
          "لوحة",
          "الرئيسية",
          "ناجز",
          "najiz",
          "التطبيق",
          "الخدمات",
          "مواعيد",
          "طلبات",
        ];
        return hints.some((h) => txt.includes(h)) || txt.length > 500;
      },
    });
    return !!r?.result;
  } catch {
    return false;
  }
}

async function waitForLogin(tabId, { timeoutMs = 300000, intervalMs = 3000, onProgress } = {}) {
  const start = Date.now();
  let lastUI = 0;
  while (Date.now() - start < timeoutMs) {
    const elapsed = Math.round((Date.now() - start) / 1000);
    if (Date.now() - lastUI > 5000) {
      onProgress && onProgress(`⏳ بانتظار تسجيل الدخول عبر نفاذ... (${elapsed}ث)`);
      lastUI = Date.now();
    }
    if (await isLoggedIn(tabId)) return true;
    await sleep(intervalMs);
  }
  return false;
}

// =====================================================
// أوامر تشغيل داخل التبويب
// =====================================================
async function ensureContentScript(tabId) {
  try {
    await chrome.scripting.executeScript({ target: { tabId }, files: ["content.js"] });
  } catch {}
}

async function scrollOnTab(tabId) {
  await ensureContentScript(tabId);
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      func: async () => {
        if (window.__ADALA_NAJIZ__?.autoScrollFull) await window.__ADALA_NAJIZ__.autoScrollFull();
      },
    });
  } catch {}
}

async function clickSubTabOnTab(tabId, labels) {
  await ensureContentScript(tabId);
  try {
    const [r] = await chrome.scripting.executeScript({
      target: { tabId },
      args: [labels],
      func: async (lbls) =>
        window.__ADALA_NAJIZ__?.clickSubTab
          ? await window.__ADALA_NAJIZ__.clickSubTab(lbls)
          : false,
    });
    return !!r?.result;
  } catch {
    return false;
  }
}

async function scrapeOnTab(tabId, kind) {
  await ensureContentScript(tabId);
  await sleep(800);
  try {
    const [r] = await chrome.scripting.executeScript({
      target: { tabId },
      args: [kind],
      func: async (kf) => (window.__ADALA_NAJIZ__ ? await window.__ADALA_NAJIZ__.scrape(kf) : null),
    });
    return r?.result || null;
  } catch (e) {
    console.warn("[adala] scrape failed", e);
    return null;
  }
}

// Deep-dive: find detail-page links on a list page
async function findDetailLinksOnTab(tabId, kind) {
  await ensureContentScript(tabId);
  try {
    const [r] = await chrome.scripting.executeScript({
      target: { tabId },
      args: [kind],
      func: (k) => window.__ADALA_NAJIZ__?.findDetailLinks?.(k) || [],
    });
    return r?.result || [];
  } catch (e) {
    console.warn("[adala] findDetailLinks failed", e);
    return [];
  }
}

// Deep-dive: scrape detail page, return raw + schema-mapped
async function scrapeDetailOnTab(tabId, kind) {
  await ensureContentScript(tabId);
  await sleep(600);
  try {
    const [r] = await chrome.scripting.executeScript({
      target: { tabId },
      args: [kind],
      func: (k) => {
        const raw = window.__ADALA_NAJIZ__?.scrapeDetailPage?.() || {};
        const mapped = window.__ADALA_NAJIZ__?.detailToSchema?.(k, raw) || {};
        return { raw, mapped, url: location.href };
      },
    });
    return r?.result || null;
  } catch (e) {
    console.warn("[adala] scrapeDetail failed", e);
    return null;
  }
}

// Deep-dive: click a sidebar tab by label and scrape its content
async function clickSidebarTabAndScrape(tabId, tabLabel) {
  await ensureContentScript(tabId);
  await sleep(500);
  try {
    const [r] = await chrome.scripting.executeScript({
      target: { tabId },
      args: [tabLabel],
      func: async (lbl) => {
        const ADALA = window.__ADALA_NAJIZ__;
        if (!ADALA) return null;
        if (ADALA.clickSidebarTab) await ADALA.clickSidebarTab(lbl);
        await new Promise((r) => setTimeout(r, 1200));
        if (ADALA.scrapeSidebarContent) return ADALA.scrapeSidebarContent(lbl);
        return null;
      },
    });
    return r?.result || null;
  } catch (e) {
    console.warn("[adala] sidebar scrape failed", e);
    return null;
  }
}

// Deep-dive: scrape lawsuit requests from the requests page
async function scrapeLawsuitRequestsOnTab(tabId) {
  await ensureContentScript(tabId);
  await sleep(600);
  try {
    const [r] = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        const ADALA = window.__ADALA_NAJIZ__;
        if (ADALA?.scrapeLawsuitRequests) return ADALA.scrapeLawsuitRequests();
        return null;
      },
    });
    return r?.result || null;
  } catch (e) {
    console.warn("[adala] lawsuit requests scrape failed", e);
    return null;
  }
}

function countPayload(p) {
  if (!p) return 0;
  return (
    (p.cases?.length || 0) +
    (p.powers?.length || 0) +
    (p.executions?.length || 0) +
    (p.sessions?.length || 0) +
    (p.documents?.length || 0) +
    (p.lawsuit_requests?.length || 0) +
    (p.case_details?.length || 0) +
    (p.case_parties?.length || 0) +
    (p.case_sessions_detail?.length || 0) +
    (p.case_judgments?.length || 0)
  );
}

// Helper date/amount parsers used in deep-dive (Najiz fields are Arabic strings)
function parseDeepDateISO(s) {
  if (!s) return undefined;
  const str = String(s).trim();
  let m = str.match(/(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  m = str.match(/(\d{1,2})[-\/](\d{1,2})[-\/](\d{4})/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  m = str.match(/(\d{1,2})[-\/](\d{1,2})[-\/](14\d{2})/);
  if (m) {
    // Hijri → Gregorian (approximation, accurate enough for legal records)
    const hy = parseInt(m[3]),
      hm = parseInt(m[2]),
      hd = parseInt(m[1]);
    const jd =
      Math.floor((11 * hy + 3) / 30) +
      354 * hy +
      30 * hm -
      Math.floor((hm - 1) / 2) +
      hd +
      1948440 -
      385;
    const l = jd + 68569;
    const n = Math.floor((4 * l) / 146097);
    const l2 = l - Math.floor((146097 * n + 3) / 4);
    const i = Math.floor((4000 * (l2 + 1)) / 1461001);
    const l3 = l2 - Math.floor((1461 * i) / 4) + 31;
    const j = Math.floor((80 * l3) / 2447);
    const d = l3 - Math.floor((2447 * j) / 80);
    const l4 = Math.floor(j / 11);
    const mo = j + 2 - 12 * l4;
    const y = 100 * (n - 49) + i + l4;
    return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  }
  return undefined;
}

function parseDeepAmount(s) {
  if (!s) return undefined;
  const n = Number(String(s).replace(/[^\d.]/g, ""));
  return Number.isFinite(n) ? n : undefined;
}

// =====================================================
// حالة البوت
// =====================================================
let autopilotRunning = false;
let autopilotCancelled = false;

function cancelBot() {
  autopilotCancelled = true;
}

// =====================================================
// فتح ناجز + انتظار تسجيل دخول + تشغيل البوت
// =====================================================
async function openNajizAndWaitForLogin({ baseUrl, syncToken, deepDive = false }) {
  if (autopilotRunning) return { ok: false, error: "البوت يعمل بالفعل" };
  autopilotCancelled = false;
  try {
    setProgress({
      running: true,
      phase: "launch",
      currentStep: 0,
      totalSteps: DEFAULT_AUTOPILOT_STEPS.length + 1,
      message: deepDive ? "فتح ناجز (وضع التعمق)..." : "فتح ناجز...",
      error: null,
      finished: false,
    });

    const tab = await chrome.tabs.create({ url: NAJIZ_LOGIN_URL, active: true });

    setProgress({ message: "جارٍ تحميل صفحة ناجز..." });
    try {
      await waitTab(tab.id, 30000);
    } catch {}
    await sleep(1000);

    if (await isLoggedIn(tab.id)) {
      setProgress({ message: "✓ تم اكتشاف تسجيل دخول سابق — بدء البوت فوراً" });
      await sleep(700);
      return await runAutopilot({
        tabId: tab.id,
        baseUrl,
        syncToken,
        skipLoginCheck: true,
        deepDive,
      });
    }

    setProgress({ message: "⏳ يرجى تسجيل دخولك عبر نفاذ في التبويب المفتوح..." });
    const loggedIn = await waitForLogin(tab.id, {
      timeoutMs: 300000,
      intervalMs: 3000,
      onProgress: (msg) => {
        if (autopilotCancelled) {
          setProgress({ running: false, error: "تم إلغاء البوت" });
          return;
        }
        setProgress({ message: msg });
      },
    });

    if (autopilotCancelled) {
      setProgress({ running: false, error: "تم الإلغاء" });
      return { ok: false, error: "تم الإلغاء" };
    }
    if (!loggedIn) {
      setProgress({
        running: false,
        error: "انتهت مهلة الانتظار (5 دقائق) — لم يتم اكتشاف تسجيل دخول",
      });
      return { ok: false, error: "انتهت مهلة انتظار تسجيل الدخول" };
    }

    setProgress({ message: "✓ تم تسجيل الدخول — جارٍ تحميل لوحة التحكم..." });
    await sleep(1500);
    return await runAutopilot({
      tabId: tab.id,
      baseUrl,
      syncToken,
      skipLoginCheck: true,
      deepDive,
    });
  } catch (err) {
    setProgress({ running: false, error: err?.message || String(err) });
    return { ok: false, error: err?.message || String(err) };
  }
}

// =====================================================
// البوت الرئيسي
// =====================================================
async function runAutopilot({
  tabId,
  baseUrl,
  syncToken,
  steps,
  skipLoginCheck = false,
  deepDive = false,
}) {
  if (autopilotRunning) return { ok: false, error: "البوت يعمل بالفعل" };
  autopilotRunning = true;
  autopilotCancelled = false;
  const useSteps = steps && steps.length ? steps : DEFAULT_AUTOPILOT_STEPS;
  const summary = { total: 0, inserted: 0, updated: 0, steps: [] };
  try {
    setProgress({
      running: true,
      phase: "scraping",
      currentStep: 0,
      totalSteps: useSteps.length,
      message: "بدء البوت...",
      error: null,
      finished: false,
    });

    if (!skipLoginCheck) {
      setProgress({ message: "التحقق من تسجيل الدخول..." });
      if (!(await isLoggedIn(tabId))) {
        setProgress({ running: false, error: "يرجى تسجيل الدخول أولاً" });
        return { ok: false, error: "غير مسجل دخول" };
      }
    }

    // ملاحظة: لا نُجري preflight GET — قد يفشل بسبب اختلافات في التحقق بين GET و POST.
    // POST نفسه هو مصدر التحقق — إن كان الرمز خاطئاً، أول POST سيُظهر الخطأ.
    const sugg = suggestBaseUrl(baseUrl);
    if (sugg.changed) setProgress({ message: `ملاحظة: ${sugg.reason}` });
    setProgress({ message: "✓ بدء البوت — الرمز سيُختبر مع أول طلب POST" });
    await sleep(200);

    for (let i = 0; i < useSteps.length; i++) {
      if (autopilotCancelled) {
        setProgress({ running: false, error: "تم إلغاء البوت", summary });
        return { ok: false, error: "تم الإلغاء", summary };
      }

      const step = useSteps[i];
      setProgress({
        currentStep: i + 1,
        currentKind: step.kind,
        message: `(${i + 1}/${useSteps.length}) الانتقال إلى ${step.label}...`,
      });

      try {
        await chrome.tabs.update(tabId, { url: step.url });
      } catch (e) {
        summary.steps.push({ kind: step.kind, label: step.label, ok: false, error: e.message });
        continue;
      }
      try {
        await waitTab(tabId, 45000);
      } catch (e) {
        summary.steps.push({ kind: step.kind, label: step.label, ok: false, error: e.message });
        continue;
      }
      await sleep(1200);

      if (!(await isLoggedIn(tabId))) {
        setProgress({ running: false, error: `انتهت الجلسة عند ${step.label}` });
        return { ok: false, error: "انتهت جلسة ناجز" };
      }

      const tabs = step.subTabs && step.subTabs.length ? step.subTabs : [null];
      for (const tab of tabs) {
        if (autopilotCancelled) break;
        if (tab) {
          setProgress({ message: `فتح تبويب ${tab[0]}...` });
          await clickSubTabOnTab(tabId, tab);
          await sleep(900);
        }

        setProgress({ message: `تمرير وسحب ${step.label}${tab ? " · " + tab[0] : ""}...` });
        await scrollOnTab(tabId);
        const payload = await scrapeOnTab(tabId, step.kind);
        const count = countPayload(payload);

        setProgress({ message: `🔎 ${count} عنصر في ${step.label}${tab ? " · " + tab[0] : ""}` });
        if (!count) {
          summary.steps.push({
            kind: step.kind,
            label: step.label,
            sub: tab?.[0],
            ok: true,
            count: 0,
            diagnostic: "لم يتم اكتشاف بيانات",
          });
          continue;
        }

        setProgress({ message: `📤 إرسال ${count} عنصر إلى النظام...` });
        const resp = await postSyncWithRetry({ baseUrl, syncToken, payload }, (m) =>
          setProgress({ message: m }),
        );
        if (!resp.ok) {
          summary.steps.push({
            kind: step.kind,
            label: step.label,
            sub: tab?.[0],
            ok: false,
            error: resp.error,
          });
          setProgress({ message: `❌ فشل ${step.label}: ${resp.error}` });
          continue;
        }
        const d = resp.data || {};
        summary.total += d.total ?? count;
        summary.inserted += d.inserted ?? 0;
        summary.updated += d.updated ?? 0;
        summary.steps.push({
          kind: step.kind,
          label: step.label,
          sub: tab?.[0],
          ok: true,
          count: d.total ?? count,
          inserted: d.inserted,
          updated: d.updated,
        });
        setProgress({
          message: `✓ ${step.label}${tab ? " · " + tab[0] : ""}: ${d.inserted ?? 0} جديد · ${d.updated ?? 0} محدّث`,
        });

        // ============================================================
        // Deep-dive: ALWAYS visit each case detail page for rich data
        // ============================================================
        if (["cases", "powers", "executions"].includes(step.kind)) {
          // First try URL-based links, then fall back to click-based
          let links = await findDetailLinksOnTab(tabId, step.kind);

          // If no URL links found, try to find clickable rows/cards
          if (links.length === 0) {
            setProgress({ message: `🔬 البحث عن عناصر قابلة للنقر في ${step.label}...` });
            const clickableLinks = await (async () => {
              await ensureContentScript(tabId);
              try {
                const [r] = await chrome.scripting.executeScript({
                  target: { tabId },
                  args: [step.kind],
                  func: (kind) => {
                    const clean = (v) => (v || "").toString().replace(/\s+/g, " ").trim();
                    const $all = (sel, root = document) => Array.from(root.querySelectorAll(sel));
                    const results = [];
                    const seen = new Set();

                    // Find all clickable elements that look like case/agency rows
                    const sel =
                      "tr, [role='row'], [class*='row'], [class*='item'], [class*='card'], [class*='list-item'], li, a, button";
                    $all(sel).forEach((el) => {
                      if (el.children.length > 30) return;
                      const t = clean(el.innerText || "");
                      if (!t || t.length < 10 || t.length > 800) return;

                      let idMatch;
                      if (kind === "cases") {
                        if (!/قضية|دعوى|محكمة|المدعي/.test(t)) return;
                        idMatch = t.match(/\d{4}\s*\/\s*\d{3,}|\d{10,}/);
                      } else if (kind === "powers") {
                        if (!/وكال|موكل|وكيل/.test(t)) return;
                        idMatch = t.match(/\d{5,}/);
                      } else if (kind === "executions") {
                        if (!/تنفيذ|منفذ|مدين/.test(t)) return;
                        idMatch = t.match(/\d{6,}/);
                      }
                      if (!idMatch) return;
                      const id = idMatch[0].replace(/\s/g, "");
                      if (seen.has(id)) return;
                      seen.add(id);
                      results.push({
                        url: "__CLICK__",
                        clickTarget: true,
                        identifier: id,
                        rowText: t.slice(0, 200),
                      });
                    });
                    return results;
                  },
                });
                return r?.result || [];
              } catch {
                return [];
              }
            })();
            links = clickableLinks;
          }

          if (links.length) {
            setProgress({
              message: `🔬 وضع التعمق: ${links.length} عنصر للزيارة في ${step.label}`,
            });
            const deepItems = [];
            const MAX_DETAILS = 100;
            const linksToVisit = links.slice(0, MAX_DETAILS);

            const caseParties = [];
            const caseSessions = [];
            const caseJudgments = [];
            const lawsuitRequests = [];
            const caseDetailsList = [];

            // إرسال تدريجي: كل دفعة تُرسل فوراً حتى لا تضيع البيانات عند أي انقطاع
            const flushDeepData = async () => {
              const dPayload = { kind: "mixed", sourceUrl: step.url };
              if (step.kind === "cases") {
                if (caseDetailsList.length) dPayload.case_details = caseDetailsList.splice(0);
                const caseRows = deepItems
                  .splice(0)
                  .filter((d) => d.case_number)
                  .map((d) => ({
                    najiz_id: `case_${String(d.case_number).replace(/\s/g, "")}`.slice(0, 120),
                    case_number: String(d.case_number).replace(/\s/g, "").slice(0, 200),
                    title: (d.subject_matter || `قضية ${d.case_number}`).slice(0, 500),
                    court: d.court_name?.slice(0, 200),
                    case_type: d.case_type_detail?.slice(0, 200),
                    status: undefined,
                    opened_at: parseDeepDateISO(d.case_date_iso || d.case_date),
                    client_name: undefined,
                  }));
                if (caseRows.length) dPayload.cases = caseRows;
                if (caseParties.length) dPayload.case_parties = caseParties.splice(0);
                if (caseSessions.length) dPayload.case_sessions_detail = caseSessions.splice(0);
                if (caseJudgments.length) dPayload.case_judgments = caseJudgments.splice(0);
                if (lawsuitRequests.length) dPayload.lawsuit_requests = lawsuitRequests.splice(0);
              } else if (step.kind === "powers") {
                const powerRows = deepItems
                  .splice(0)
                  .filter((d) => d.wakalah_number)
                  .map((d) => ({
                    najiz_id: `power_${String(d.wakalah_number).replace(/\s/g, "")}`.slice(0, 120),
                    wakalah_number: String(d.wakalah_number).replace(/\s/g, "").slice(0, 200),
                    issuer_name: d.issuer_name?.slice(0, 200),
                    agent_name: d.agent_name?.slice(0, 200),
                    status: d.status?.slice(0, 100),
                    issue_date: parseDeepDateISO(d.issue_date),
                    expiry_date: parseDeepDateISO(d.expiry_date),
                    issuer_id_number: d.issuer_id_number?.slice(0, 100),
                    agent_id_number: d.agent_id_number?.slice(0, 100),
                    issuer_entity: d.issuer_entity?.slice(0, 300),
                    usage_method: d.usage_method?.slice(0, 300),
                    issuer_capacity: d.issuer_capacity?.slice(0, 200),
                    issuer_nationality: d.issuer_nationality?.slice(0, 200),
                    issuer_identity_type: d.issuer_identity_type?.slice(0, 100),
                    issuer_status_in_agency: d.issuer_status_in_agency?.slice(0, 200),
                    agent_capacity: d.agent_capacity?.slice(0, 200),
                    agent_nationality: d.agent_nationality?.slice(0, 200),
                    agent_identity_type: d.agent_identity_type?.slice(0, 100),
                    agent_status_in_agency: d.agent_status_in_agency?.slice(0, 200),
                    agency_clauses: d.agency_clauses?.slice(0, 2000),
                    agency_text: d.agency_text?.slice(0, 5000),
                    agency_data: d.agency_data || null,
                  }));
                if (powerRows.length) dPayload.powers = powerRows;
              } else if (step.kind === "executions") {
                const execRows = deepItems
                  .splice(0)
                  .filter((d) => d.execution_number)
                  .map((d) => ({
                    najiz_id: `exec_${String(d.execution_number).replace(/\s/g, "")}`.slice(0, 120),
                    execution_number: String(d.execution_number).replace(/\s/g, "").slice(0, 200),
                    court: d.court?.slice(0, 200),
                    amount:
                      typeof d.amount === "number" && Number.isFinite(d.amount)
                        ? d.amount
                        : undefined,
                    debtor_name: d.debtor_name?.slice(0, 200),
                    creditor_name: d.creditor_name?.slice(0, 200),
                    creditor_id_number: d.creditor_id_number?.slice(0, 100),
                    debtor_id_number: d.debtor_id_number?.slice(0, 100),
                    request_type: d.request_type?.slice(0, 200),
                    execution_data: d.execution_data?.slice(0, 5000),
                    status: d.status?.slice(0, 200),
                    filed_date: parseDeepDateISO(d.filed_date),
                  }));
                if (execRows.length) dPayload.executions = execRows;
              }
              const dCount = countPayload(dPayload);
              if (!dCount) return;
              setProgress({ message: `📤 إرسال ${dCount} عنصر معمق إلى النظام...` });
              const dResp = await postSyncWithRetry(
                { baseUrl, syncToken, payload: dPayload },
                (m) => setProgress({ message: m }),
              );
              if (dResp.ok) {
                const dd = dResp.data || {};
                summary.total += dd.total ?? dCount;
                summary.inserted += dd.inserted ?? 0;
                summary.updated += dd.updated ?? 0;
                setProgress({
                  message: `✓ حُفظت الدفعة المعمقة (${dd.inserted ?? 0} جديد · ${dd.updated ?? 0} محدّث)`,
                });
              } else {
                setProgress({ message: `⚠️ فشل حفظ دفعة معمقة: ${dResp.error}` });
              }
            };

            for (let di = 0; di < linksToVisit.length; di++) {
              if (autopilotCancelled) break;
              const link = linksToVisit[di];
              setProgress({
                message: `🔍 (${di + 1}/${linksToVisit.length}) فتح تفاصيل: ${link.identifier || link.rowText?.slice(0, 30) || ""}`,
              });

              try {
                if (link.url && link.url !== "__CLICK__") {
                  // Navigate via URL
                  await chrome.tabs.update(tabId, { url: link.url });
                  await waitTab(tabId, 25000);
                  await sleep(1500);
                } else if (link.url === "__CLICK__" && link.clickTarget) {
                  // Click-based navigation: click the element, wait for page change
                  const clicked = await (async () => {
                    await ensureContentScript(tabId);
                    try {
                      const [r] = await chrome.scripting.executeScript({
                        target: { tabId },
                        args: [link.identifier],
                        func: async (identifier) => {
                          // v4.8: النقر الدقيق على خانة الرقم نفسها أولاً
                          const A = window.__ADALA_NAJIZ__;
                          if (A && A.clickNumberElement && A.clickNumberElement(identifier))
                            return true;
                          const clean = (v) => (v || "").toString().replace(/\s+/g, " ").trim();
                          const $all = (sel, root = document) =>
                            Array.from(root.querySelectorAll(sel));
                          const sel =
                            "tr, [role='row'], [class*='row'], [class*='item'], [class*='card'], [class*='list-item'], li, a, button";
                          for (const el of $all(sel)) {
                            const t = clean(el.innerText || "");
                            if (t.includes(identifier)) {
                              // Find the actual clickable element within the row
                              const clickTarget =
                                el.querySelector("a, button, [role='button']") || el;
                              clickTarget.click();
                              return true;
                            }
                          }
                          return false;
                        },
                      });
                      return !!r?.result;
                    } catch {
                      return false;
                    }
                  })();

                  if (!clicked) {
                    setProgress({ message: `⚠️ تعذر النقر على ${link.identifier}` });
                    continue;
                  }
                  await sleep(2000);
                  // Wait for potential page navigation or content change
                  try {
                    await waitTab(tabId, 15000);
                  } catch {}
                  await sleep(1500);
                }

                // CRITICAL: Scroll thoroughly after page load to ensure all content is rendered
                await scrollOnTab(tabId);
                await sleep(500);

                // Scrape case detail fields using the specialized scraper
                if (step.kind === "cases") {
                  const detailFields = await (async () => {
                    await ensureContentScript(tabId);
                    try {
                      const [r] = await chrome.scripting.executeScript({
                        target: { tabId },
                        func: () => {
                          const ADALA = window.__ADALA_NAJIZ__;
                          if (!ADALA) return null;
                          return ADALA.scrapeCaseDetailFields
                            ? ADALA.scrapeCaseDetailFields()
                            : null;
                        },
                      });
                      return r?.result || null;
                    } catch {
                      return null;
                    }
                  })();

                  const caseNum = String(detailFields?.case_number || link.identifier || "")
                    .replace(/\s/g, "")
                    .slice(0, 200);

                  if (detailFields) {
                    const obj = {
                      case_number: caseNum,
                      case_classification: detailFields.case_classification,
                      case_type_detail: detailFields.case_type_detail,
                      case_date: detailFields.case_date,
                      case_date_iso: detailFields.case_date_iso,
                      subject_matter: detailFields.subject_matter,
                      plaintiff_requests: detailFields.plaintiff_requests,
                      case_foundations: detailFields.case_foundations,
                      court_name: detailFields.court_name,
                      circuit_number: detailFields.circuit_number,
                      identifier: link.identifier,
                    };
                    deepItems.push(obj);
                    caseDetailsList.push({
                      case_number: caseNum,
                      case_classification: detailFields.case_classification?.slice(0, 200),
                      case_type_detail: detailFields.case_type_detail?.slice(0, 200),
                      case_date:
                        detailFields.case_date_iso || parseDeepDateISO(detailFields.case_date),
                      subject_matter: detailFields.subject_matter?.slice(0, 5000),
                      plaintiff_requests: detailFields.plaintiff_requests?.slice(0, 5000),
                      case_foundations: detailFields.case_foundations?.slice(0, 5000),
                      court_name: detailFields.court_name?.slice(0, 200),
                      circuit_number: detailFields.circuit_number?.slice(0, 100),
                    });
                  }

                  // Now navigate through sidebar tabs
                  // 1. أطراف الدعوى (Parties) — صيغ متعددة لأن ناجز يكتبها بالياء أو الألف المقصورة
                  setProgress({ message: `📋 سحب أطراف الدعوى للقضية ${caseNum}...` });
                  const partiesData = await clickSidebarTabAndScrape(tabId, [
                    "أطراف الدعوى",
                    "أطراف الدعوي",
                    "اطراف الدعوى",
                  ]);
                  if (partiesData) {
                    const plaintiffs = partiesData.plaintiffs || partiesData.plaintiff || [];
                    const defendants = partiesData.defendants || partiesData.defendant || [];
                    for (const p of plaintiffs) {
                      caseParties.push({
                        case_number: caseNum,
                        party_type: "plaintiff",
                        party_name: p.name?.slice(0, 200) || p.party_name?.slice(0, 200),
                        party_id_number:
                          p.id_number?.slice(0, 200) || p.party_id_number?.slice(0, 200),
                        party_nationality:
                          p.nationality?.slice(0, 200) || p.party_nationality?.slice(0, 200),
                        party_identity_type:
                          p.id_type?.slice(0, 100) || p.party_identity_type?.slice(0, 100),
                        party_capacity:
                          p.capacity?.slice(0, 200) || p.party_capacity?.slice(0, 200),
                        party_status_in_case:
                          p.poa_status?.slice(0, 200) || p.party_status_in_case?.slice(0, 200),
                      });
                    }
                    for (const d of defendants) {
                      caseParties.push({
                        case_number: caseNum,
                        party_type: "defendant",
                        party_name: d.name?.slice(0, 200) || d.party_name?.slice(0, 200),
                        party_id_number:
                          d.id_number?.slice(0, 200) || d.party_id_number?.slice(0, 200),
                        party_nationality:
                          d.nationality?.slice(0, 200) || d.party_nationality?.slice(0, 200),
                        party_identity_type:
                          d.id_type?.slice(0, 100) || d.party_identity_type?.slice(0, 100),
                        party_capacity:
                          d.capacity?.slice(0, 200) || d.party_capacity?.slice(0, 200),
                        party_status_in_case:
                          d.poa_status?.slice(0, 200) || d.party_status_in_case?.slice(0, 200),
                      });
                    }
                  }

                  // 2. الجلسات (Sessions)
                  setProgress({ message: `📅 سحب جلسات القضية ${caseNum}...` });
                  const sessionsData = await clickSidebarTabAndScrape(tabId, ["الجلسات"]);
                  if (sessionsData) {
                    const sessions = Array.isArray(sessionsData)
                      ? sessionsData
                      : sessionsData.sessions || [];
                    for (const s of sessions) {
                      caseSessions.push({
                        case_number: caseNum,
                        session_status: s.session_status?.slice(0, 200) || s.status?.slice(0, 200),
                        court_name: s.court_name?.slice(0, 200) || s.court?.slice(0, 200),
                        circuit_number: s.circuit_number?.slice(0, 100) || s.circuit?.slice(0, 100),
                        mechanism: s.mechanism?.slice(0, 200),
                        degree: s.degree?.slice(0, 100),
                        session_date: parseDeepDateISO(s.session_date || s.date),
                        session_time: s.session_time?.slice(0, 50) || s.time?.slice(0, 50),
                        session_details:
                          s.session_details?.slice(0, 1000) || s.details?.slice(0, 1000),
                      });
                    }
                  }

                  // 3. الأحكام (Judgments)
                  setProgress({ message: `⚖️ سحب أحكام القضية ${caseNum}...` });
                  const judgmentsData = await clickSidebarTabAndScrape(tabId, [
                    "الأحكام",
                    "الاحكام",
                  ]);
                  if (judgmentsData) {
                    const judgments = Array.isArray(judgmentsData)
                      ? judgmentsData
                      : judgmentsData.judgments || [];
                    for (const j of judgments) {
                      caseJudgments.push({
                        case_number: caseNum,
                        judgment_finality:
                          j.judgment_finality?.slice(0, 200) || j.finality?.slice(0, 200),
                        deed_number: j.deed_number?.slice(0, 200),
                        deed_date: parseDeepDateISO(j.deed_date),
                        court_name: j.court_name?.slice(0, 200) || j.court?.slice(0, 200),
                        circuit_number: j.circuit_number?.slice(0, 100) || j.circuit?.slice(0, 100),
                        degree: j.degree?.slice(0, 100),
                        appeal_deed_date: parseDeepDateISO(j.appeal_deed_date),
                        appeal_circuit_number:
                          j.appeal_circuit_number?.slice(0, 100) || j.appeal_circuit?.slice(0, 100),
                        judgment_details:
                          j.judgment_details?.slice(0, 2000) || j.details?.slice(0, 2000),
                      });
                    }
                  }

                  // 4. الطلبات (Requests on the case) — من اللوحة الجانبية داخل ملف القضية
                  setProgress({ message: `📄 سحب الطلبات على القضية ${caseNum}...` });
                  const requestsData = await clickSidebarTabAndScrape(tabId, ["الطلبات"]);
                  if (requestsData) {
                    const reqs = Array.isArray(requestsData)
                      ? requestsData
                      : requestsData.requests || [];
                    for (const r of reqs) {
                      lawsuitRequests.push({
                        case_number: caseNum,
                        case_date: parseDeepDateISO(r.case_date),
                        request_number: r.request_number?.slice(0, 200),
                        request_date: parseDeepDateISO(r.request_date),
                        request_status: r.request_status?.slice(0, 200),
                        court_name: r.court_name?.slice(0, 200),
                        circuit_number: r.circuit_number?.slice(0, 100),
                        case_status: r.case_status?.slice(0, 200) || r.status?.slice(0, 200),
                        case_classification: r.case_classification?.slice(0, 200),
                        case_type_detail: r.case_type_detail?.slice(0, 200),
                        applicant_type: r.applicant_type?.slice(0, 100),
                        applicant_name: r.applicant_name?.slice(0, 200),
                        request_type: r.request_type?.slice(0, 200),
                        judgment_number: r.judgment_number?.slice(0, 200),
                        submissions: r.submissions?.slice(0, 2000),
                        request_reasons: r.request_reasons?.slice(0, 2000),
                        reason_1: r.reason_1?.slice(0, 1000),
                        reason_2: r.reason_2?.slice(0, 1000),
                        reason_3: r.reason_3?.slice(0, 1000),
                        reason_4: r.reason_4?.slice(0, 1000),
                        reason_5: r.reason_5?.slice(0, 1000),
                        reason_6: r.reason_6?.slice(0, 1000),
                      });
                    }
                  }
                }

                // Powers deep-dive
                if (step.kind === "powers") {
                  const poaFields = await (async () => {
                    await ensureContentScript(tabId);
                    try {
                      const [r] = await chrome.scripting.executeScript({
                        target: { tabId },
                        func: () => {
                          const ADALA = window.__ADALA_NAJIZ__;
                          if (!ADALA) return null;
                          return ADALA.scrapePowerDetail ? ADALA.scrapePowerDetail() : null;
                        },
                      });
                      return r?.result || null;
                    } catch {
                      return null;
                    }
                  })();

                  if (poaFields) {
                    const obj = {
                      wakalah_number: poaFields.wakalah_number || link.identifier,
                      issuer_name: poaFields.issuer_name?.slice(0, 200),
                      agent_name: poaFields.agent_name?.slice(0, 200),
                      status: poaFields.status?.slice(0, 100),
                      issue_date:
                        poaFields.issue_date_iso || parseDeepDateISO(poaFields.issue_date),
                      expiry_date:
                        poaFields.expiry_date_iso || parseDeepDateISO(poaFields.expiry_date),
                      issuer_id_number: poaFields.issuer_id_number?.slice(0, 100),
                      agent_id_number: poaFields.agent_id_number?.slice(0, 100),
                      issuer_entity: poaFields.issuer_entity?.slice(0, 300),
                      usage_method: poaFields.usage_method?.slice(0, 300),
                      issuer_capacity: poaFields.issuer_capacity?.slice(0, 200),
                      issuer_nationality: poaFields.issuer_nationality?.slice(0, 200),
                      issuer_identity_type: poaFields.issuer_identity_type?.slice(0, 100),
                      issuer_status_in_agency: poaFields.issuer_status_in_agency?.slice(0, 200),
                      agent_capacity: poaFields.agent_capacity?.slice(0, 200),
                      agent_nationality: poaFields.agent_nationality?.slice(0, 200),
                      agent_identity_type: poaFields.agent_identity_type?.slice(0, 100),
                      agent_status_in_agency: poaFields.agent_status_in_agency?.slice(0, 200),
                      agency_clauses: poaFields.agency_clauses?.slice(0, 2000),
                      agency_text: poaFields.agency_text?.slice(0, 5000),
                      agency_data: poaFields.agency_data || null,
                    };
                    deepItems.push(obj);
                  }
                }

                // v4.8: Executions deep-dive — كانت الصفحات تُزار بدون سحب البيانات
                if (step.kind === "executions") {
                  const execFields = await (async () => {
                    await ensureContentScript(tabId);
                    try {
                      const [r] = await chrome.scripting.executeScript({
                        target: { tabId },
                        func: () => {
                          const ADALA = window.__ADALA_NAJIZ__;
                          if (!ADALA) return null;
                          return ADALA.scrapeExecutionDetail ? ADALA.scrapeExecutionDetail() : null;
                        },
                      });
                      return r?.result || null;
                    } catch {
                      return null;
                    }
                  })();

                  if (execFields) {
                    deepItems.push({
                      execution_number: execFields.execution_number || link.identifier,
                      court: execFields.court?.slice(0, 200),
                      amount:
                        typeof execFields.amount === "number" && Number.isFinite(execFields.amount)
                          ? execFields.amount
                          : undefined,
                      debtor_name: execFields.debtor_name?.slice(0, 200),
                      creditor_name: execFields.creditor_name?.slice(0, 200),
                      creditor_id_number: execFields.creditor_id_number?.slice(0, 100),
                      debtor_id_number: execFields.debtor_id_number?.slice(0, 100),
                      request_type: execFields.request_type?.slice(0, 200),
                      execution_data: execFields.execution_data?.slice(0, 5000),
                      status: execFields.status?.slice(0, 200),
                      filed_date: execFields.filed_date_iso || execFields.filed_date,
                    });
                  }
                }

                // إرسال تدريجي كل 5 قضايا — حتى لا تضيع البيانات عند أي انقطاع
                if ((di + 1) % 5 === 0) {
                  await flushDeepData();
                }

                // العودة المباشرة إلى قائمة القضايا (أكثر موثوقية من history.back بعد التنقل في التبويبات)
                if (di < linksToVisit.length - 1) {
                  try {
                    setProgress({ message: `⏮ العودة إلى قائمة ${step.label}...` });
                    await chrome.tabs.update(tabId, { url: step.url });
                    await waitTab(tabId, 25000);
                    await sleep(1200);
                    await scrollOnTab(tabId);
                  } catch {}
                }
              } catch (e) {
                console.warn("[deep] detail visit failed", e);
              }
            }

            // إرسال أي بيانات معمقة متبقية
            await flushDeepData();

            // Return to the list page
            if (i < useSteps.length - 1) {
              setProgress({ message: `⏮ العودة إلى ${step.label}...` });
              try {
                await chrome.tabs.update(tabId, { url: step.url });
                await waitTab(tabId, 25000);
                await sleep(800);
              } catch {}
            }
          }
        }

        // ============================================================
        // Lawsuit Requests deep-dive: visit each request detail page
        // ============================================================
        if (step.kind === "lawsuit_requests") {
          // v4.8: أولاً — بطاقات الطلبات الدقيقة (النقر على خانة "رقم الطلب" تحديداً)
          let links = await (async () => {
            await ensureContentScript(tabId);
            try {
              const [r] = await chrome.scripting.executeScript({
                target: { tabId },
                func: () => {
                  const A = window.__ADALA_NAJIZ__;
                  return A && A.findRequestCards ? A.findRequestCards() : [];
                },
              });
              return r?.result || [];
            } catch {
              return [];
            }
          })();
          if (links.length === 0) links = await findDetailLinksOnTab(tabId, "lawsuit_requests");

          // If no URL links found, try click-based navigation
          if (links.length === 0) {
            setProgress({ message: `🔬 البحث عن عناصر الطلبات القابلة للنقر...` });
            const clickableLinks = await (async () => {
              await ensureContentScript(tabId);
              try {
                const [r] = await chrome.scripting.executeScript({
                  target: { tabId },
                  args: ["lawsuit_requests"],
                  func: (kind) => {
                    const clean = (v) => (v || "").toString().replace(/\s+/g, " ").trim();
                    const $all = (sel, root = document) => Array.from(root.querySelectorAll(sel));
                    const results = [];
                    const seen = new Set();

                    const sel =
                      "tr, [role='row'], [class*='row'], [class*='item'], [class*='card'], [class*='list-item'], li, a, button";
                    $all(sel).forEach((el) => {
                      if (el.children.length > 30) return;
                      const t = clean(el.innerText || "");
                      if (!t || t.length < 10 || t.length > 800) return;

                      if (!/طلب|قضية|استئناف|نقض/.test(t)) return;
                      const idMatch = t.match(/\d{4}\s*\/\s*\d{3,}|\d{10,}/);
                      if (!idMatch) return;
                      const id = idMatch[0].replace(/\s/g, "");
                      if (seen.has(id)) return;
                      seen.add(id);
                      results.push({
                        url: "__CLICK__",
                        clickTarget: true,
                        identifier: id,
                        rowText: t.slice(0, 200),
                      });
                    });
                    return results;
                  },
                });
                return r?.result || [];
              } catch {
                return [];
              }
            })();
            links = clickableLinks;
          }

          if (links.length) {
            setProgress({ message: `🔬 وضع التعمق: ${links.length} طلب للزيارة` });
            const lawsuitRequests = [];
            const MAX_REQUESTS = 100;
            const linksToVisit = links.slice(0, MAX_REQUESTS);

            for (let di = 0; di < linksToVisit.length; di++) {
              if (autopilotCancelled) break;
              const link = linksToVisit[di];
              setProgress({
                message: `🔍 (${di + 1}/${linksToVisit.length}) فتح تفاصيل الطلب: ${link.identifier || link.rowText?.slice(0, 30) || ""}`,
              });

              try {
                if (link.url && link.url !== "__CLICK__") {
                  await chrome.tabs.update(tabId, { url: link.url });
                  await waitTab(tabId, 25000);
                  await sleep(1500);
                } else if (link.url === "__CLICK__" && link.clickTarget) {
                  const clicked = await (async () => {
                    await ensureContentScript(tabId);
                    try {
                      const [r] = await chrome.scripting.executeScript({
                        target: { tabId },
                        args: [link.identifier],
                        func: async (identifier) => {
                          // v4.8: النقر الدقيق على خانة رقم الطلب نفسها
                          const A = window.__ADALA_NAJIZ__;
                          if (A && A.clickNumberElement && A.clickNumberElement(identifier))
                            return true;
                          // احتياط: النقر على أي صف يحتوي الرقم
                          const clean = (v) => (v || "").toString().replace(/\s+/g, " ").trim();
                          const $all = (sel, root = document) =>
                            Array.from(root.querySelectorAll(sel));
                          const sel =
                            "tr, [role='row'], [class*='row'], [class*='item'], [class*='card'], [class*='list-item'], li, a, button";
                          for (const el of $all(sel)) {
                            const t = clean(el.innerText || "");
                            if (t.includes(identifier)) {
                              const clickTarget =
                                el.querySelector("a, button, [role='button']") || el;
                              clickTarget.click();
                              return true;
                            }
                          }
                          return false;
                        },
                      });
                      return !!r?.result;
                    } catch {
                      return false;
                    }
                  })();

                  if (!clicked) {
                    setProgress({ message: `⚠️ تعذر النقر على ${link.identifier}` });
                    continue;
                  }
                  await sleep(2000);
                  try {
                    await waitTab(tabId, 15000);
                  } catch {}
                  await sleep(1500);
                }

                // CRITICAL: Scroll thoroughly after page load
                await scrollOnTab(tabId);
                await sleep(500);

                // Scrape lawsuit request details
                const requestData = await (async () => {
                  await ensureContentScript(tabId);
                  try {
                    const [r] = await chrome.scripting.executeScript({
                      target: { tabId },
                      func: () => {
                        const ADALA = window.__ADALA_NAJIZ__;
                        if (!ADALA) return null;
                        // v4.8: ماسح صفحة التفاصيل المخصص (يقرأ الجداول والقوائم المنسدلة)
                        if (ADALA.scrapeRequestDetail) {
                          const d = ADALA.scrapeRequestDetail();
                          if (
                            d &&
                            (d.case_number ||
                              d.judgment_number ||
                              d.request_type ||
                              d.submissions ||
                              d.request_reasons)
                          )
                            return [d];
                        }
                        return ADALA.scrapeLawsuitRequests ? ADALA.scrapeLawsuitRequests() : null;
                      },
                    });
                    return r?.result || null;
                  } catch {
                    return null;
                  }
                })();

                if (requestData && Array.isArray(requestData) && requestData.length > 0) {
                  const lf = link.listFields || {};
                  for (const raw of requestData) {
                    // دمج حقول البطاقة (القائمة) مع حقول صفحة التفاصيل — التفاصيل لها الأولوية
                    const req = {
                      ...lf,
                      ...Object.fromEntries(
                        Object.entries(raw).filter(([, v]) => v != null && v !== ""),
                      ),
                    };
                    lawsuitRequests.push({
                      case_number: req.case_number?.replace(/\s/g, "").slice(0, 200) || undefined,
                      case_date: parseDeepDateISO(req.case_date),
                      request_number: req.request_number?.slice(0, 200) || link.identifier,
                      request_date: parseDeepDateISO(req.request_date),
                      request_status: req.request_status?.slice(0, 200),
                      court_name: req.court_name?.slice(0, 200),
                      circuit_number: req.circuit_number?.slice(0, 100),
                      case_status: req.case_status?.slice(0, 200),
                      case_classification: req.case_classification?.slice(0, 200),
                      case_type_detail: req.case_type_detail?.slice(0, 200),
                      applicant_type: req.applicant_type?.slice(0, 100),
                      applicant_name: req.applicant_name?.slice(0, 200),
                      request_type: req.request_type?.slice(0, 200),
                      judgment_number: req.judgment_number?.slice(0, 200),
                      submissions: req.submissions?.slice(0, 2000),
                      request_reasons: req.request_reasons?.slice(0, 2000),
                      reason_1: req.reason_1?.slice(0, 1000),
                      reason_2: req.reason_2?.slice(0, 1000),
                      reason_3: req.reason_3?.slice(0, 1000),
                      reason_4: req.reason_4?.slice(0, 1000),
                      reason_5: req.reason_5?.slice(0, 1000),
                      reason_6: req.reason_6?.slice(0, 1000),
                    });
                  }
                }

                // Go back to list page for next iteration — العودة المباشرة أكثر موثوقية
                if (link.url === "__CLICK__" && di < linksToVisit.length - 1) {
                  try {
                    setProgress({ message: `⏮ العودة إلى قائمة الطلبات...` });
                    await chrome.tabs.update(tabId, { url: step.url });
                    await waitTab(tabId, 25000);
                    await sleep(1200);
                    await scrollOnTab(tabId);
                  } catch {}
                }
              } catch (e) {
                console.warn("[deep] lawsuit request visit failed", e);
              }
            }

            // Send lawsuit requests payload
            if (lawsuitRequests.length) {
              const lrPayload = {
                kind: "lawsuit_requests",
                sourceUrl: location.href,
                lawsuit_requests: lawsuitRequests,
              };
              setProgress({ message: `📤 إرسال ${lawsuitRequests.length} طلب إلى النظام` });
              const lrResp = await postSyncWithRetry(
                { baseUrl, syncToken, payload: lrPayload },
                (m) => setProgress({ message: m }),
              );
              if (lrResp.ok) {
                const dd = lrResp.data || {};
                summary.inserted += dd.inserted ?? 0;
                summary.updated += dd.updated ?? 0;
                setProgress({
                  message: `✓ الطلبات على القضايا: ${dd.inserted ?? 0} جديد · ${dd.updated ?? 0} محدّث`,
                });
              }
            }

            // Return to the list page
            if (i < useSteps.length - 1) {
              setProgress({ message: `⏮ العودة إلى ${step.label}...` });
              try {
                await chrome.tabs.update(tabId, { url: step.url });
                await waitTab(tabId, 25000);
                await sleep(800);
              } catch {}
            }
          }
        }
      }
    }

    chrome.storage.local.set({ lastSync: new Date().toISOString() });
    setProgress({
      running: false,
      finished: true,
      message: `✅ اكتمل البوت — ${summary.total} عنصر (${summary.inserted} جديد · ${summary.updated} محدّث)`,
      summary,
    });

    // إشعار
    try {
      chrome.notifications.create({
        type: "basic",
        iconUrl: "icon.png",
        title: "✅ اكتملت المزامنة",
        message: `تم إرسال ${summary.total} عنصر إلى منصة العدالة`,
        priority: 2,
      });
    } catch {}

    return { ok: true, summary };
  } catch (err) {
    setProgress({ running: false, error: err?.message || String(err) });
    return { ok: false, error: err?.message || String(err) };
  } finally {
    autopilotRunning = false;
  }
}

// =====================================================
// موجّه الرسائل
// =====================================================
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === "ADALA_SYNC") {
    postSyncWithRetry(msg).then(sendResponse);
    return true;
  }
  if (msg?.type === "ADALA_VERIFY_ENDPOINT") {
    (async () => {
      const sugg = suggestBaseUrl(msg.baseUrl);
      const verify = await verifyEndpoint(msg.baseUrl, msg.syncToken);
      sendResponse({
        ok: verify.ok,
        corrected: sugg.corrected,
        changed: sugg.changed,
        reason: verify.ok ? sugg.reason : verify.reason,
        authenticated: verify.authenticated,
        url: verify.url,
      });
    })();
    return true;
  }
  if (msg?.type === "ADALA_OPEN_NAJIZ_AND_BOT") {
    openNajizAndWaitForLogin(msg).then(sendResponse);
    return true;
  }
  if (msg?.type === "ADALA_CANCEL_BOT") {
    cancelBot();
    sendResponse({ ok: true });
    return true;
  }
  if (msg?.type === "ADALA_AUTOPILOT_START") {
    runAutopilot(msg).then(sendResponse);
    return true;
  }
  if (msg?.type === "ADALA_AUTOPILOT_START_HERE") {
    const tabId = sender?.tab?.id;
    if (!tabId) {
      sendResponse({ ok: false, error: "تعذّر تحديد التبويب" });
      return true;
    }
    runAutopilot({ ...msg, tabId }).then(sendResponse);
    return true;
  }
  if (msg?.type === "ADALA_AUTOPILOT_STATUS") {
    chrome.storage.local.get("autopilotProgress", (s) =>
      sendResponse({ ok: true, progress: s.autopilotProgress || null, running: autopilotRunning }),
    );
    return true;
  }
});
