#!/usr/bin/env node
/**
 * بوت أتمتة ناجز (RPA) — منصة العدالة
 * يفتح متصفح كروم، ينتظر تسجيل الدخول اليدوي عبر النفاذ الوطني،
 * ثم يتنقل آلياً بين صفحات ناجز (القضايا، الجلسات، الطلبات، التنفيذ، الوكالات)
 * مع التعمق في التفاصيل والتمرير الكامل، ويرسل البيانات إلى النظام
 * عبر /api/public/najiz-sync ويصدّر نسخة Excel.
 *
 * التشغيل:  node najiz-bot.js            (يقرأ .env)
 * المتغيرات: API_BASE, SYNC_TOKEN, MAX_DETAILS, HEADLESS, FIXTURE_BASE (للاختبار)
 */
const { chromium } = require("playwright");
const XLSX = require("xlsx");
const fs = require("fs");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });

const API_BASE = (process.env.API_BASE || "").replace(/\/$/, "");
const SYNC_TOKEN = process.env.SYNC_TOKEN || "";
const FIXTURE_BASE = (process.env.FIXTURE_BASE || "").replace(/\/$/, "");
const HEADLESS = process.env.HEADLESS === "1";
const MAX_DETAILS = parseInt(process.env.MAX_DETAILS || "100", 10);
const ONLY_STEPS = (process.env.ONLY_STEPS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

if (!API_BASE || !SYNC_TOKEN) {
  console.error("❌ يجب ضبط API_BASE و SYNC_TOKEN في ملف bot/.env");
  process.exit(1);
}

const CONTENT_JS = fs.readFileSync(path.join(__dirname, "..", "extension", "content.js"), "utf8");
// Stub لواجهات chrome حتى يعمل content.js خارج الإضافة
const CHROME_STUB = `
  if (!window.chrome) window.chrome = {};
  if (!chrome.runtime) chrome.runtime = {};
  if (!chrome.runtime.getURL) chrome.runtime.getURL = () => "";
  if (!chrome.runtime.sendMessage) chrome.runtime.sendMessage = async () => ({ ok: false });
  if (!chrome.runtime.onMessage) chrome.runtime.onMessage = { addListener: () => {} };
  if (!chrome.storage) chrome.storage = { local: { get: async () => ({}), set: async () => {} } };
  window.__ADALA_BOT__ = true;
`;

const NAJIZ_LOGIN = "https://najiz.sa/applications/landing";
let STEPS = [
  { kind: "cases", label: "القضايا", url: "https://najiz.sa/applications/lawsuit", deep: true },
  { kind: "sessions", label: "التقويم العدلي", url: "https://najiz.sa/applications/dashboard" },
  {
    kind: "sessions",
    label: "مواعيد الجلسات",
    url: "https://najiz.sa/applications/appointment-requests",
  },
  {
    kind: "lawsuit_requests",
    label: "الطلبات على القضايا",
    url: "https://najiz.sa/applications/lawsuit/requests",
    deep: true,
  },
  {
    kind: "executions",
    label: "طلبات التنفيذ",
    url: "https://najiz.sa/applications/iexecution",
    deep: true,
  },
  {
    kind: "powers",
    label: "الوكالات القضائية",
    url: "https://najiz.sa/applications/wekalat/procurations-query",
    deep: true,
  },
];

if (FIXTURE_BASE) {
  const fixtureUrls = {
    cases: `${FIXTURE_BASE}/lawsuit/index.html`,
    executions: `${FIXTURE_BASE}/iexecution/index.html`,
    lawsuit_requests: `${FIXTURE_BASE}/requests/index.html`,
    powers: `${FIXTURE_BASE}/wekalat/index.html`,
    sessions: `${FIXTURE_BASE}/dashboard/index.html`,
  };
  STEPS = STEPS.filter((s) => fixtureUrls[s.kind]).map((s) => ({ ...s, url: fixtureUrls[s.kind] }));
  const seen = new Set();
  STEPS = STEPS.filter((s) => (seen.has(s.kind) ? false : (seen.add(s.kind), true)));
}
if (ONLY_STEPS.length) STEPS = STEPS.filter((s) => ONLY_STEPS.includes(s.kind));

// ============ إرسال إلى النظام ============
async function postSync(payload) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(`${API_BASE}/api/public/najiz-sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Sync-Token": SYNC_TOKEN },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) return { ok: true, data };
      console.warn(`⚠️ فشل الإرسال (${res.status}):`, JSON.stringify(data).slice(0, 300));
      if (res.status < 500) return { ok: false, data };
    } catch (e) {
      console.warn(`⚠️ خطأ شبكة (محاولة ${attempt}/3):`, e.message);
    }
    await new Promise((r) => setTimeout(r, 2000 * attempt));
  }
  return { ok: false };
}

function countPayload(p) {
  return [
    "cases",
    "powers",
    "executions",
    "sessions",
    "documents",
    "lawsuit_requests",
    "case_details",
    "case_parties",
    "case_sessions_detail",
    "case_judgments",
  ].reduce((n, k) => n + (p[k]?.length || 0), 0);
}

// ============ تجميع Excel ============
const excelData = {};
function collectForExcel(payload) {
  for (const [k, v] of Object.entries(payload)) {
    if (!Array.isArray(v) || !v.length) continue;
    excelData[k] = (excelData[k] || []).concat(v);
  }
}
function writeExcel() {
  const outDir = path.join(__dirname, "output");
  fs.mkdirSync(outDir, { recursive: true });
  const wb = XLSX.utils.book_new();
  const sheetNames = {
    cases: "القضايا",
    case_details: "تفاصيل القضايا",
    case_parties: "أطراف الدعوى",
    case_sessions_detail: "الجلسات",
    case_judgments: "الأحكام",
    lawsuit_requests: "الطلبات",
    executions: "طلبات التنفيذ",
    powers: "الوكالات",
    sessions: "مواعيد الجلسات",
    documents: "المستندات",
  };
  let added = 0;
  for (const [k, rows] of Object.entries(excelData)) {
    if (!rows.length) continue;
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(rows),
      (sheetNames[k] || k).slice(0, 31),
    );
    added++;
  }
  if (!added) {
    console.log("ℹ️ لا توجد بيانات لتصدير Excel");
    return null;
  }
  const file = path.join(
    outDir,
    `najiz-data-${new Date().toISOString().replace(/[:.]/g, "-")}.xlsx`,
  );
  XLSX.writeFile(wb, file);
  console.log(`📊 تم حفظ ملف Excel: ${file}`);
  return file;
}

// ============ أدوات الصفحة ============
async function injectScraper(page) {
  await page.evaluate(CHROME_STUB);
  await page.evaluate(CONTENT_JS).catch(() => {});
  await page.waitForFunction(() => !!window.__ADALA_NAJIZ__, { timeout: 10000 });
}
async function fullScroll(page) {
  await page
    .evaluate(async () => {
      await window.__ADALA_NAJIZ__.autoScrollFull();
    })
    .catch(() => {});
}
async function safeGoto(page, url) {
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
  } catch {}
  await page.waitForTimeout(FIXTURE_BASE ? 300 : 2500);
}
async function clickRowByIdentifier(page, identifier) {
  const clicked = await page.evaluate((id) => {
    // v4.8: النقر الدقيق على خانة الرقم نفسها (رقم الطلب/القضية/الوكالة) أولاً
    const A = window.__ADALA_NAJIZ__;
    if (A && A.clickNumberElement && A.clickNumberElement(id)) return true;
    const clean = (v) => (v || "").toString().replace(/\s+/g, " ").trim();
    const sel = "tr, [role='row'], [class*='row'], [class*='item'], [class*='card'], li, a, button";
    for (const el of Array.from(document.querySelectorAll(sel))) {
      const t = clean(el.innerText || "");
      if (t.includes(id)) {
        (el.querySelector("a, button, [role='button']") || el).click();
        return true;
      }
    }
    return false;
  }, identifier);
  if (clicked) {
    await page.waitForTimeout(FIXTURE_BASE ? 500 : 3000);
  }
  return clicked;
}

// Improved click with Playwright fallback: when the in-page helper fails,
// try locating elements that contain the identifier and click their inner
// anchor/button using Playwright's robust click which handles visibility.
async function clickRowByIdentifierWithFallback(page, identifier) {
  const ok = await clickRowByIdentifier(page, identifier);
  if (ok) return true;
  try {
    // Find elements whose text contains the identifier
    const els = await page.$$(
      'xpath=//*[contains(normalize-space(string(.)), "' + String(identifier) + '")]',
    );
    for (const el of els) {
      try {
        // Try to click a descendant link/button first
        const anchor = await el.$('a, button, [role="button"], [role="link"]');
        if (anchor) {
          await anchor.scrollIntoViewIfNeeded();
          await anchor.click({ timeout: 5000 });
          await page.waitForTimeout(FIXTURE_BASE ? 300 : 1200);
          return true;
        }
        // Otherwise click the element itself
        await el.scrollIntoViewIfNeeded();
        await el.click({ timeout: 5000 });
        await page.waitForTimeout(FIXTURE_BASE ? 300 : 1200);
        return true;
      } catch (e) {
        /* try next */
      }
    }
  } catch (e) {
    /* ignore fallback errors */
  }
  return false;
}

async function waitForLogin(page) {
  console.log("");
  console.log("═".repeat(60));
  console.log("🔐 سجّل الدخول الآن عبر النفاذ الوطني في نافذة المتصفح");
  console.log("   البوت ينتظر تلقائياً حتى اكتمال الدخول (مهلة 10 دقائق)");
  console.log("═".repeat(60));
  const deadline = Date.now() + 10 * 60 * 1000;
  while (Date.now() < deadline) {
    try {
      const url = page.url();
      const onNajiz = /najiz\.sa/.test(url) && !/login|auth|nafath/i.test(url);
      if (onNajiz) {
        const marker = await page
          .evaluate(() =>
            /تسجيل\s*الخروج|الملف\s*الشخصي|صحيفة|لوحة|خدمات/.test(document.body?.innerText || ""),
          )
          .catch(() => false);
        if (marker) {
          console.log("✅ تم استشعار تسجيل الدخول — بدء العمل الآلي");
          return;
        }
      }
    } catch {}
    await page.waitForTimeout(3000);
  }
  throw new Error("انتهت مهلة انتظار تسجيل الدخول");
}

// ============ التعمق حسب النوع ============
async function deepDiveCases(page, step, summary) {
  const links = await page.evaluate((k) => window.__ADALA_NAJIZ__.findDetailLinks(k), "cases");
  const toVisit = (links || []).slice(0, MAX_DETAILS);
  console.log(`  🔬 تعمق القضايا: ${toVisit.length} قضية`);
  let batch = {
    case_details: [],
    cases: [],
    case_parties: [],
    case_sessions_detail: [],
    case_judgments: [],
    lawsuit_requests: [],
  };

  const flush = async () => {
    const payload = { kind: "mixed", sourceUrl: step.url };
    for (const k of Object.keys(batch)) if (batch[k].length) payload[k] = batch[k];
    const n = countPayload(payload);
    if (!n) return;
    collectForExcel(payload);
    const res = await postSync(payload);
    if (res.ok) {
      summary.sent += n;
      console.log(`  📤 أُرسلت دفعة معمقة (${n} عنصر) ✓`);
    }
    batch = {
      case_details: [],
      cases: [],
      case_parties: [],
      case_sessions_detail: [],
      case_judgments: [],
      lawsuit_requests: [],
    };
  };

  for (let i = 0; i < toVisit.length; i++) {
    const link = toVisit[i];
    try {
      if (link.url && link.url !== "__CLICK__") await safeGoto(page, link.url);
      else if (!(await clickRowByIdentifierWithFallback(page, link.identifier))) continue;
      await injectScraper(page);
      await fullScroll(page);

      const bundle = await page.evaluate(async () => {
        const A = window.__ADALA_NAJIZ__;
        const detail = A.scrapeCaseDetailFields();
        await A.clickSidebarTab(["أطراف الدعوى", "أطراف الدعوي", "اطراف الدعوى"]);
        const parties = A.scrapeSidebarContent(["أطراف الدعوى"]);
        await A.clickSidebarTab(["الجلسات"]);
        const sessions = A.scrapeSidebarContent(["الجلسات"]);
        await A.clickSidebarTab(["الأحكام", "الاحكام"]);
        const judgments = A.scrapeSidebarContent(["الأحكام"]);
        await A.clickSidebarTab(["الطلبات"]);
        const requests = A.scrapeSidebarContent(["الطلبات"]);
        const p = (v) => A.parseDateISO(v);
        const caseNum = String(detail.case_number || "").replace(/\s/g, "");
        const out = { detail, caseNum, parties: [], sessions: [], judgments: [], requests: [] };
        const plaintiffs = parties?.plaintiffs || [];
        const defendants = parties?.defendants || [];
        for (const x of plaintiffs)
          out.parties.push({
            case_number: caseNum,
            party_type: "plaintiff",
            party_name: x.name || x.party_name,
            party_id_number: x.id_number,
            party_nationality: x.nationality,
            party_identity_type: x.id_type,
            party_capacity: x.capacity,
            party_status_in_case: x.poa_status,
          });
        for (const x of defendants)
          out.parties.push({
            case_number: caseNum,
            party_type: "defendant",
            party_name: x.name || x.party_name,
            party_id_number: x.id_number,
            party_nationality: x.nationality,
            party_identity_type: x.id_type,
            party_capacity: x.capacity,
            party_status_in_case: x.poa_status,
          });
        for (const s of sessions?.sessions || [])
          out.sessions.push({
            case_number: caseNum,
            session_status: s.session_status,
            court_name: s.court_name,
            circuit_number: s.circuit_number,
            mechanism: s.mechanism,
            degree: s.degree,
            session_date: p(s.session_date),
            session_time: s.session_time,
            session_details: s.session_details,
          });
        for (const j of judgments?.judgments || [])
          out.judgments.push({
            case_number: caseNum,
            judgment_finality: j.judgment_finality || j.finality,
            deed_number: j.deed_number,
            deed_date: p(j.deed_date),
            court_name: j.court_name || j.court,
            circuit_number: j.circuit_number || j.circuit,
            degree: j.degree,
            appeal_deed_date: p(j.appeal_deed_date),
            appeal_circuit_number: j.appeal_circuit_number || j.appeal_circuit,
            judgment_details: j.judgment_details || j.details,
          });
        for (const r of requests?.requests || [])
          out.requests.push({
            case_number: caseNum,
            case_date: p(r.case_date),
            request_number: r.request_number,
            request_date: p(r.request_date),
            request_status: r.request_status,
            court_name: r.court_name,
            circuit_number: r.circuit_number,
            case_status: r.case_status,
            case_classification: r.case_classification,
            case_type_detail: r.case_type_detail,
            applicant_name: r.applicant_name,
            request_type: r.request_type,
            judgment_number: r.judgment_number,
            submissions: r.submissions,
            request_reasons: r.request_reasons,
            reason_1: r.reason_1,
            reason_2: r.reason_2,
            reason_3: r.reason_3,
            reason_4: r.reason_4,
            reason_5: r.reason_5,
            reason_6: r.reason_6,
          });
        return out;
      });

      const d = bundle.detail || {};
      const caseNum = bundle.caseNum || link.identifier;
      if (caseNum) {
        console.log(
          `  📁 قضية ${caseNum}: أطراف=${bundle.parties.length} جلسات=${bundle.sessions.length} أحكام=${bundle.judgments.length} طلبات=${bundle.requests.length}`,
        );
        batch.case_details.push({
          case_number: caseNum,
          case_classification: d.case_classification,
          case_type_detail: d.case_type_detail,
          case_date: d.case_date_iso,
          subject_matter: d.subject_matter?.slice(0, 5000),
          plaintiff_requests: d.plaintiff_requests?.slice(0, 5000),
          case_foundations: d.case_foundations?.slice(0, 5000),
          court_name: d.court_name,
          circuit_number: d.circuit_number,
        });
        batch.cases.push({
          najiz_id: `case_${caseNum}`,
          case_number: caseNum,
          title: (d.subject_matter || `قضية ${caseNum}`).slice(0, 500),
          court: d.court_name,
          case_type: d.case_type_detail,
          opened_at: d.case_date_iso,
        });
        batch.case_parties.push(...bundle.parties.filter((x) => x.party_name || x.party_id_number));
        batch.case_sessions_detail.push(...bundle.sessions);
        batch.case_judgments.push(...bundle.judgments);
        batch.lawsuit_requests.push(...bundle.requests);
      }
      if ((i + 1) % 5 === 0) await flush();
      if (i < toVisit.length - 1) {
        await safeGoto(page, step.url);
        await injectScraper(page);
        await fullScroll(page);
      }
    } catch (e) {
      console.warn(`  ⚠️ تخطي قضية: ${e.message}`);
    }
  }
  await flush();
}

async function deepDiveGeneric(page, step, summary) {
  const kind = step.kind;
  const links = await page.evaluate((k) => window.__ADALA_NAJIZ__.findDetailLinks(k), kind);
  const toVisit = (links || []).slice(0, MAX_DETAILS);
  console.log(`  🔬 تعمق ${step.label}: ${toVisit.length} عنصر`);
  let rows = [];

  const flush = async () => {
    if (!rows.length) return;
    const payload = {
      kind: kind === "lawsuit_requests" ? "lawsuit_requests" : "mixed",
      sourceUrl: step.url,
    };
    payload[kind === "lawsuit_requests" ? "lawsuit_requests" : kind] = rows;
    collectForExcel(payload);
    const res = await postSync(payload);
    if (res.ok) {
      summary.sent += rows.length;
      console.log(`  📤 أُرسلت ${rows.length} عنصر ✓`);
    }
    rows = [];
  };

  for (let i = 0; i < toVisit.length; i++) {
    const link = toVisit[i];
    try {
      if (link.url && link.url !== "__CLICK__") await safeGoto(page, link.url);
      else if (!(await clickRowByIdentifierWithFallback(page, link.identifier))) continue;
      await injectScraper(page);
      await fullScroll(page);

      if (kind === "powers") {
        const f = await page.evaluate(() => window.__ADALA_NAJIZ__.scrapePowerDetail());
        const wn = String(f?.wakalah_number || link.identifier || "").replace(/\s/g, "");
        if (wn)
          rows.push({
            najiz_id: `power_${wn}`,
            wakalah_number: wn,
            issuer_name: f.issuer_name,
            agent_name: f.agent_name,
            status: f.status,
            issue_date: f.issue_date_iso || undefined,
            expiry_date: f.expiry_date_iso || undefined,
            issuer_id_number: f.issuer_id_number,
            agent_id_number: f.agent_id_number,
            issuer_entity: f.issuer_entity,
            usage_method: f.usage_method,
            issuer_capacity: f.issuer_capacity,
            issuer_nationality: f.issuer_nationality,
            issuer_identity_type: f.issuer_identity_type,
            issuer_status_in_agency: f.issuer_status_in_agency,
            agent_capacity: f.agent_capacity,
            agent_nationality: f.agent_nationality,
            agent_identity_type: f.agent_identity_type,
            agent_status_in_agency: f.agent_status_in_agency,
            agency_clauses: f.agency_clauses?.slice(0, 2000),
            agency_text: f.agency_text?.slice(0, 5000),
            agency_data: f.agency_data || null,
          });
      } else if (kind === "executions") {
        const f = await page.evaluate(() => window.__ADALA_NAJIZ__.scrapeExecutionDetail());
        const en = String(f?.execution_number || link.identifier || "").replace(/\s/g, "");
        if (en)
          rows.push({
            najiz_id: `exec_${en}`,
            execution_number: en,
            court: f.court,
            amount: typeof f.amount === "number" ? f.amount : undefined,
            debtor_name: f.debtor_name,
            creditor_name: f.creditor_name,
            creditor_id_number: f.creditor_id_number,
            debtor_id_number: f.debtor_id_number,
            request_type: f.request_type,
            execution_data: f.execution_data?.slice(0, 5000),
            status: f.status,
            filed_date: f.filed_date_iso,
          });
      } else if (kind === "lawsuit_requests") {
        // v4.8: ماسح صفحة التفاصيل المخصص + دمج حقول البطاقة من القائمة
        const reqs = await page.evaluate(() => {
          const A = window.__ADALA_NAJIZ__;
          const p = (v) => A.parseDateISO(v);
          if (A.scrapeRequestDetail) {
            const d = A.scrapeRequestDetail();
            if (
              d &&
              (d.case_number ||
                d.judgment_number ||
                d.request_type ||
                d.submissions ||
                d.request_reasons)
            ) {
              return [{ ...d, case_date: p(d.case_date), request_date: p(d.request_date) }];
            }
          }
          return (A.scrapeLawsuitRequests() || []).map((r) => ({
            ...r,
            case_date: p(r.case_date),
            request_date: p(r.request_date),
          }));
        });
        const lf = link.listFields || {};
        for (const r of reqs) {
          const merged = {
            ...lf,
            ...Object.fromEntries(Object.entries(r).filter(([, v]) => v != null && v !== "")),
          };
          rows.push({
            ...merged,
            case_number: (merged.case_number || "").replace(/\s/g, "") || undefined,
            request_number: merged.request_number || link.identifier,
          });
        }
      }
      if ((i + 1) % 5 === 0) await flush();
      if (i < toVisit.length - 1) {
        await safeGoto(page, step.url);
        await injectScraper(page);
        await fullScroll(page);
      }
    } catch (e) {
      console.warn(`  ⚠️ تخطي عنصر: ${e.message}`);
    }
  }
  await flush();
}

// ============ التشغيل الرئيسي ============
(async () => {
  console.log("⚖️  بوت ناجز — منصة العدالة v1.0");
  console.log(`   API: ${API_BASE} | خطوات: ${STEPS.map((s) => s.kind).join(", ")}`);
  const userDataDir = path.join(__dirname, "chrome-profile");
  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: HEADLESS,
    viewport: HEADLESS ? { width: 1440, height: 900 } : null,
    args: HEADLESS ? [] : ["--start-maximized"],
  });
  const page = context.pages()[0] || (await context.newPage());
  const summary = { sent: 0, steps: [] };

  try {
    if (!FIXTURE_BASE) {
      await safeGoto(page, NAJIZ_LOGIN);
      await waitForLogin(page);
    }

    for (const step of STEPS) {
      console.log(`\n▶ ${step.label} (${step.kind})`);
      await safeGoto(page, step.url);
      await injectScraper(page);
      await fullScroll(page);

      // سحب صفحة القائمة كاملة
      const payload = await page.evaluate(
        async (k) => await window.__ADALA_NAJIZ__.scrape(k),
        step.kind,
      );
      const n = countPayload(payload || {});
      if (n) {
        collectForExcel(payload);
        const res = await postSync(payload);
        console.log(
          res.ok
            ? `  📤 قائمة ${step.label}: ${n} عنصر ✓ (جديد ${res.data?.inserted ?? "?"} · محدّث ${res.data?.updated ?? "?"})`
            : `  ⚠️ فشل إرسال قائمة ${step.label}`,
        );
        if (res.ok) summary.sent += n;
      } else {
        console.log(`  ℹ️ لا توجد بيانات في قائمة ${step.label}`);
      }

      if (step.deep) {
        if (step.kind === "cases") await deepDiveCases(page, step, summary);
        else await deepDiveGeneric(page, step, summary);
      }
      summary.steps.push(step.kind);
    }

    writeExcel();
    console.log(`\n✅ اكتملت المزامنة — إجمالي العناصر المرسلة للنظام: ${summary.sent}`);
  } catch (e) {
    console.error("❌ خطأ:", e.message);
    writeExcel();
    process.exitCode = 1;
  } finally {
    await context.close();
  }
})();
