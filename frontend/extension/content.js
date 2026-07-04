// منصة العدالة — Najiz hybrid scraper v4.8
// يدمج: (1) ماسحات v13 المتخصصة للجداول المرئية + (2) سحب DOM + (3) التقاط شبكة + (4) سحب الشاشة
// ويُخرج البيانات بصيغة API النظام: /api/public/najiz-sync { kind, cases, powers, executions, sessions, documents }

(function () {
  if (window.__ADALA_NAJIZ_LOADED__) return;
  window.__ADALA_NAJIZ_LOADED__ = true;

  // =====================================================
  // أدوات أساسية
  // =====================================================
  // تحويل الأرقام العربية-الهندية إلى ASCII (٠١٢٣ → 0123) — ناجز يعرض التواريخ بأرقام عربية
  const AR_DIGITS = {
    "٠": "0",
    "١": "1",
    "٢": "2",
    "٣": "3",
    "٤": "4",
    "٥": "5",
    "٦": "6",
    "٧": "7",
    "٨": "8",
    "٩": "9",
    "۰": "0",
    "۱": "1",
    "۲": "2",
    "۳": "3",
    "۴": "4",
    "۵": "5",
    "۶": "6",
    "۷": "7",
    "۸": "8",
    "۹": "9",
  };
  const toAsciiDigits = (s) => String(s || "").replace(/[٠-٩۰-۹]/g, (d) => AR_DIGITS[d] || d);
  const clean = (v) =>
    toAsciiDigits((v || "").toString())
      .replace(/\s+/g, " ")
      .trim();
  // تطبيع النص العربي للمقارنة: توحيد الهمزات + ى/ي + ة/ه وإزالة التشكيل
  const normalizeArabic = (s) =>
    toAsciiDigits(String(s || ""))
      .replace(/[أإآ]/g, "ا")
      .replace(/ى/g, "ي")
      .replace(/ة/g, "ه")
      .replace(/ـ/g, "")
      .replace(/[\u064B-\u065F\u0670]/g, "")
      .replace(/\s+/g, " ")
      .trim();
  const arIncludes = (haystack, needle) =>
    normalizeArabic(haystack).includes(normalizeArabic(needle));
  const text = (el) => clean(el?.textContent || el?.innerText || "");
  const $all = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // =====================================================
  // قنطرة التقاط شبكة (injected.js)
  // =====================================================
  const CAPTURE_KEY = "adalaNajizNetworkCaptures";
  const MAX_CAPTURED = 80;
  const captured = [];

  function injectNetworkBridge() {
    try {
      const script = document.createElement("script");
      script.src = chrome.runtime.getURL("injected.js");
      script.async = false;
      script.onload = () => script.remove();
      (document.head || document.documentElement).appendChild(script);
    } catch (e) {
      console.warn("[adala] injectNetworkBridge failed", e);
    }
  }

  window.addEventListener("message", (event) => {
    if (event.source !== window || event.data?.source !== "ADALA_NAJIZ_BRIDGE") return;
    rememberNetworkPayload(event.data.payload);
  });

  async function rememberNetworkPayload(payload) {
    if (!payload?.url || payload.status >= 400) return;
    const entry = {
      url: payload.url,
      method: payload.method || "GET",
      status: payload.status,
      ts: payload.ts || Date.now(),
      body: payload.body,
    };
    captured.unshift(entry);
    if (captured.length > MAX_CAPTURED) captured.length = MAX_CAPTURED;
    try {
      const stored = await chrome.storage.local.get(CAPTURE_KEY);
      const merged = [entry, ...(stored[CAPTURE_KEY] || [])].slice(0, MAX_CAPTURED);
      await chrome.storage.local.set({ [CAPTURE_KEY]: merged });
    } catch {}
  }

  injectNetworkBridge();

  // =====================================================
  // كشف نوع الصفحة
  // =====================================================
  function detectKindFromUrl() {
    const u = (location.pathname + location.search + location.hash).toLowerCase();
    if (u.includes("/wekalat") || u.includes("procurations-query") || u.includes("agency"))
      return "powers";
    if (u.includes("/iexecution") || u.includes("execution")) return "executions";
    if (u.includes("/appointment-requests") || u.includes("session")) return "sessions";
    if (u.includes("/lawsuit/requests")) return "documents";
    if (u.includes("/lawsuit") || u.includes("/cases")) return "cases";
    if (u.includes("/dashboard")) return "sessions";
    return null;
  }

  // =====================================================
  // أدوات تنسيق التاريخ — النظام يطلب YYYY-MM-DD
  // =====================================================
  // أسماء الأشهر الهجرية (بصيغتها المطبَّعة) → رقم الشهر
  const HIJRI_MONTH_NAMES = [
    ["محرم", 1],
    ["صفر", 2],
    ["ربيع الاول", 3],
    ["ربيع الاخر", 4],
    ["ربيع الثاني", 4],
    ["جمادي الاولي", 5],
    ["جمادي الاول", 5],
    ["جمادي الاخره", 6],
    ["جمادي الثانيه", 6],
    ["جمادي الاخر", 6],
    ["رجب", 7],
    ["شعبان", 8],
    ["رمضان", 9],
    ["شوال", 10],
    ["ذو القعده", 11],
    ["ذي القعده", 11],
    ["ذو الحجه", 12],
    ["ذي الحجه", 12],
  ];

  function parseDateISO(s) {
    if (!s) return undefined;
    const str = toAsciiDigits(String(s)).trim();
    // 2024-01-15 or 2024/01/15
    let m = str.match(/(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})/);
    if (m) {
      // إذا كانت السنة هجرية (14xx) حوّلها
      if (/^14\d{2}$/.test(m[1]))
        return hijriToGregorian(parseInt(m[1]), parseInt(m[2]), parseInt(m[3]));
      return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
    }
    // 15-01-1445 (Hijri) — يجب فحصها قبل الصيغة الميلادية العامة
    m = str.match(/(\d{1,2})[-\/](\d{1,2})[-\/](14\d{2})/);
    if (m) return hijriToGregorian(parseInt(m[3]), parseInt(m[2]), parseInt(m[1]));
    // 15-01-2024 or 15/01/2024
    m = str.match(/(\d{1,2})[-\/](\d{1,2})[-\/](\d{4})/);
    if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
    // "25 جمادى الآخرة 1447" أو "٢٥ جمادى الآخرة ١٤٤٧هـ" — اسم شهر هجري
    const norm = normalizeArabic(str);
    m = norm.match(/(\d{1,2})\s+([\u0600-\u06FF][\u0600-\u06FF\s]{2,20}?)\s+(14\d{2})/);
    if (m) {
      const monthName = m[2].trim();
      const found = HIJRI_MONTH_NAMES.find(
        ([name]) => monthName.includes(name) || name.includes(monthName),
      );
      if (found) return hijriToGregorian(parseInt(m[3]), found[1], parseInt(m[1]));
    }
    return undefined;
  }

  // تحويل تقريبي للهجري إلى الميلادي (دقة كافية للتواريخ القانونية)
  function hijriToGregorian(hy, hm, hd) {
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
    const m = j + 2 - 12 * l4;
    const y = 100 * (n - 49) + i + l4;
    return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  }

  function parseAmount(s) {
    if (!s) return undefined;
    const n = Number(String(s).replace(/[^\d.]/g, ""));
    return Number.isFinite(n) ? n : undefined;
  }

  // =====================================================
  // تمرير تلقائي سريع (lazy-load + virtual scroll) — مُحسَّن للسرعة
  // =====================================================
  async function autoScrollFull() {
    try {
      const vh = window.innerHeight;
      const step = Math.max(300, Math.floor(vh * 0.7));
      const DELAY = 250;
      const MAX_STEPS = 60;
      const STABLE_THRESHOLD = 3;

      // Phase 1: Scroll to top first
      window.scrollTo({ top: 0, behavior: "instant" });
      await sleep(200);

      // Phase 2: Scroll down slowly to trigger lazy loading
      let lastHeight = -1,
        stable = 0;
      for (let i = 0; i < MAX_STEPS; i++) {
        const y = (i + 1) * step;
        window.scrollTo({ top: y, behavior: "instant" });
        await sleep(DELAY);
        const h = document.documentElement.scrollHeight;
        if (h > lastHeight + 50) {
          stable = 0;
          lastHeight = h;
        } else {
          stable++;
          if (stable >= STABLE_THRESHOLD) break;
        }
        if (y > h + vh) break;
      }
      await sleep(300);

      // Phase 3: Scroll back to top
      window.scrollTo({ top: 0, behavior: "instant" });
      await sleep(200);

      // Phase 4: Scroll down again slowly to ensure all content rendered
      lastHeight = -1;
      stable = 0;
      for (let i = 0; i < MAX_STEPS; i++) {
        const y = (i + 1) * step;
        window.scrollTo({ top: y, behavior: "instant" });
        await sleep(DELAY);
        const h = document.documentElement.scrollHeight;
        if (h > lastHeight + 50) {
          stable = 0;
          lastHeight = h;
        } else {
          stable++;
          if (stable >= STABLE_THRESHOLD) break;
        }
        if (y > h + vh) break;
      }
      await sleep(300);

      // Phase 4.5: تمرير الحاويات الداخلية القابلة للتمرير (virtual scroll / مربعات النصوص الطويلة)
      // مربعات "موضوع الدعوى" وغيرها في ناجز لها scrollbar داخلي — يجب تمريرها لتحميل كامل النص
      try {
        const scrollables = $all(
          "div, section, main, article, textarea, [class*='scroll'], [class*='content'], [class*='body']",
        )
          .filter((el) => el.scrollHeight > el.clientHeight + 60 && el.clientHeight > 60)
          .slice(0, 20);
        for (const sc of scrollables) {
          const innerStep = Math.max(150, Math.floor(sc.clientHeight * 0.8));
          for (let y = 0; y <= sc.scrollHeight + innerStep; y += innerStep) {
            sc.scrollTop = y;
            await sleep(100);
            if (y > sc.scrollHeight + innerStep) break;
          }
          sc.scrollTop = 0;
          await sleep(80);
        }
      } catch {}

      // Phase 5: Try to click "load more" buttons
      await tryLoadMore();
      await sleep(300);

      // Phase 6: Final scroll to top
      window.scrollTo({ top: 0, behavior: "instant" });
      await sleep(200);
    } catch (e) {
      console.warn("[adala] scroll failed", e);
    }
  }

  async function tryLoadMore() {
    const buttons = $all("button, a, [role='button']");
    for (const b of buttons) {
      const t = text(b);
      if (!t || t.length > 40) continue;
      if (/تحميل المزيد|عرض المزيد|المزيد|show more|load more|التالي|next/i.test(t)) {
        try {
          b.click();
          await sleep(800);
        } catch {}
        break;
      }
    }
  }

  async function clickSubTab(labels) {
    const cands = $all("button, a, [role='tab'], .tab, .nav-link, li, mat-tab, [class*='tab']");
    for (const el of cands) {
      const t = text(el);
      if (!t || t.length > 40) continue;
      if (labels.some((k) => t.includes(k))) {
        try {
          el.click();
          await sleep(800);
          return true;
        } catch {}
      }
    }
    return false;
  }

  // =====================================================
  // ماسحات الجداول المتخصصة (مأخوذة من v13 العاملة)
  // =====================================================

  // 1) جدول القضايا: مرن جداً لأي جدول يحتوي على رقم قضية + حقول مساعدة
  function scrapeLawsuitTable() {
    const out = [];
    const HEADERS = [
      { k: "case_number", re: /رقم\s*القضية|رقم\s*الدعوى|رقم\s*الملف/ },
      {
        k: "opened_at",
        re: /تاريخ\s*القضية|تاريخ\s*الدعوى|تاريخ\s*القيد|تاريخ\s*الإيداع|تاريخ\s*الفتح/,
      },
      { k: "case_type", re: /نوع\s*القضية|نوع\s*الدعوى|التصنيف/ },
      { k: "capacity", re: /^الصفة$|الصفة/ },
      { k: "plaintiff", re: /^المدعي|المدعي$|صاحب\s*الطلب|الخصوم/ },
      { k: "defendant", re: /المدعى\s*عليه|المدعي\s*عليه|الخصم/ },
      { k: "status", re: /^الحالة$|حالة\s*القضية|حالة\s*الملف/ },
      { k: "court", re: /^المحكمة$|اسم\s*المحكمة|الدائرة/ },
      { k: "subject", re: /الموضوع|موضوع\s*الدعوى/ },
    ];
    const matchKey = (t) => {
      const c = clean(t);
      if (/المدعى\s*عليه|المدعي\s*عليه/.test(c)) return "defendant";
      for (const h of HEADERS) if (h.k !== "defendant" && h.re.test(c)) return h.k;
      return null;
    };

    $all("table").forEach((table) => {
      const headers = $all("thead th, thead td", table).map(text);
      const altHeaders = headers.length
        ? headers
        : $all("tr:first-child th, tr:first-child td", table).map(text);
      // More relaxed: any header containing "قضية" OR "دعوى" OR "ملف"
      const ok = altHeaders.some((h) => /قضية|دعوى|ملف|رقم/i.test(h));
      if (!ok) return;
      const colKeys = altHeaders.map(matchKey);
      // If no case_number column detected, try to find case-number pattern in cells
      const hasCaseNumberCol = colKeys.includes("case_number");
      const rows = $all("tbody tr", table).length ? $all("tbody tr", table) : $all("tr", table);
      rows.forEach((row, i) => {
        if (i === 0 && $all("th", row).length && !$all("td", row).length) return;
        const cells = $all("td, th", row).map(text);
        if (cells.length < 2) return;
        const f = {};
        cells.forEach((v, j) => {
          const k = colKeys[j];
          if (k && v) f[k] = v;
        });
        if (!f.case_number) {
          const found = cells.find((v) => /\d{4}\s*\/\s*\d{3,}|\d{9,}/.test(v));
          if (found)
            f.case_number = (found.match(/\d{4}\s*\/\s*\d{3,}|\d{9,}/) || [""])[0].replace(
              /\s/g,
              "",
            );
        }
        if (!f.case_number) return;
        if (!f.title && f.subject) f.title = f.subject;
        out.push({ _kind: "case", fields: f, text: cells.join(" | ") });
      });
    });
    return out;
  }

  // 1.b) Aggressive fallback: any DOM block that visually looks like a case row
  function scrapeCasesAggressive() {
    const out = [];
    const seen = new Set();
    // Match standalone Najiz case-number patterns like "1234/2024" or "401014502104732" inside text blocks
    const sel =
      "div, li, article, section, [role='row'], [role='listitem'], tr, [class*='row'], [class*='item'], [class*='card']";
    $all(sel).forEach((el) => {
      if (el.children.length > 30) return; // skip huge containers
      const t = clean(el.innerText || "");
      if (!t || t.length < 10 || t.length > 600) return;
      if (!/قضية|دعوى|الموكل|المدعي|محكمة/.test(t)) return;
      const cnMatch = t.match(/\d{4}\s*\/\s*\d{3,}|\d{10,}/);
      if (!cnMatch) return;
      const cn = cnMatch[0].replace(/\s/g, "");
      if (seen.has(cn)) return;
      seen.add(cn);
      const f = { case_number: cn };
      // Try to grab type
      const typeMatch = t.match(/(?:نوع\s*(?:القضية|الدعوى)?\s*[:\-]?\s*)([^\n|،]{2,40})/);
      if (typeMatch) f.case_type = clean(typeMatch[1]);
      // status
      const statusMatch = t.match(/(?:الحالة\s*[:\-]?\s*)([^\n|،]{2,40})/);
      if (statusMatch) f.status = clean(statusMatch[1]);
      // court
      const courtMatch = t.match(/([^\n|،]{0,40}محكمة[^\n|،]{0,40})/);
      if (courtMatch) f.court = clean(courtMatch[0]);
      // date
      const dateMatch = t.match(
        /\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4}|\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2}|\d{1,2}[\/\-]\d{1,2}[\/\-]14\d{2}/,
      );
      if (dateMatch) f.opened_at = dateMatch[0];
      // plaintiff
      const plaintiffMatch = t.match(/(?:المدعي|الموكل|صاحب\s*الطلب)\s*[:\-]?\s*([^\n|،]{2,60})/);
      if (plaintiffMatch) f.plaintiff = clean(plaintiffMatch[1]);
      out.push({ _kind: "case", fields: f, text: t.slice(0, 400) });
    });
    return out;
  }

  // 2) جدول الأحكام/الصكوك — مرن ليتعامل مع التغير في عناوين الأعمدة
  function scrapeJudgmentTable() {
    const out = [];
    const matchKey = (t) => {
      const c = clean(t);
      if (/المدعى\s*عليه|المدعي\s*عليه/.test(c)) return "defendant";
      // رقم الصك / رقم الحكم — صريح
      if (/رقم\s*الصك|رقم\s*الحكم|^الصك$|^رقم\s*صك$/.test(c)) return "deed_number";
      if (/نوع\s*الحكم|نوع\s*الصك|^نوع\s*صك$/.test(c)) return "judgment_type";
      if (/رقم\s*القضية|رقم\s*الدعوى/.test(c)) return "case_number";
      if (/نوع\s*القضية|نوع\s*الدعوى/.test(c)) return "case_type";
      if (/^المحكمة$|اسم\s*المحكمة|المحكمة|الدائرة/.test(c)) return "court";
      if (/^المدعي$|اسم\s*المدعي/.test(c)) return "plaintiff";
      // تاريخ الصك / تاريخ الحكم — صريح
      if (/تاريخ\s*الصك|تاريخ\s*الحكم|تاريخ\s*الإصدار|^تاريخ\s*صك$/.test(c)) return "filed_date";
      if (/^الحالة$|حالة\s*الحكم|حالة\s*الصك/.test(c)) return "status";
      return null;
    };
    $all("table").forEach((table) => {
      const headers = $all("thead th, thead td", table).map(text);
      const altHeaders = headers.length
        ? headers
        : $all("tr:first-child th, tr:first-child td", table).map(text);
      // مرن: أي عمود يحتوي حكم/صك/رقم الصك/تاريخ الصك
      const ok = altHeaders.some((h) =>
        /حكم|صك|رقم\s*الصك|تاريخ\s*الصك|رقم\s*الحكم|تاريخ\s*الحكم/.test(h),
      );
      if (!ok) return;
      const colKeys = altHeaders.map(matchKey);
      const rows = $all("tbody tr", table).length ? $all("tbody tr", table) : $all("tr", table);
      rows.forEach((row, i) => {
        if (i === 0 && $all("th", row).length && !$all("td", row).length) return;
        const cells = $all("td, th", row).map(text);
        if (cells.length < 2) return;
        const f = {};
        cells.forEach((v, j) => {
          const k = colKeys[j];
          if (k && v) f[k] = v;
        });
        if (!f.deed_number && !f.case_number) {
          const found = cells.find((v) => /\d{4}\s*\/\s*\d{3,}|\d{9,}/.test(v));
          if (found)
            f.deed_number = (found.match(/\d{4}\s*\/\s*\d{3,}|\d{9,}/) || [""])[0].replace(
              /\s/g,
              "",
            );
        }
        if (!f.deed_number && !f.case_number) return;
        out.push({ _kind: "judgment", fields: f, text: cells.join(" | ") });
      });
    });
    return out;
  }

  // 2.b) Aggressive judgment fallback — for non-table layouts (cards, divs)
  function scrapeJudgmentsAggressive() {
    const out = [];
    const seen = new Set();
    const sel =
      "div, li, article, section, [role='row'], [role='listitem'], tr, [class*='row'], [class*='item'], [class*='card'], [class*='judgment'], [class*='deed']";
    $all(sel).forEach((el) => {
      if (el.children.length > 30) return;
      const t = clean(el.innerText || "");
      if (!t || t.length < 10 || t.length > 700) return;
      // كلمات مفتاحية صريحة: حكم، صك، رقم الصك، تاريخ الصك، قرار، استئناف
      if (!/حكم|صك|رقم\s*الصك|تاريخ\s*الصك|قرار|استئناف/.test(t)) return;
      const idMatch = t.match(/\d{4}\s*\/\s*\d{3,}|\d{9,}/);
      if (!idMatch) return;
      const id = idMatch[0].replace(/\s/g, "");
      if (seen.has(id)) return;
      seen.add(id);
      const f = { deed_number: id };
      // محاولة استخراج رقم صك صريح
      const deedMatch = t.match(/(?:رقم\s*الصك|رقم\s*الحكم)\s*[:\-]?\s*(\d{4,})/);
      if (deedMatch) f.deed_number = deedMatch[1];
      // محاولة استخراج تاريخ الصك صريح
      const deedDateMatch = t.match(
        /(?:تاريخ\s*الصك|تاريخ\s*الحكم|تاريخ\s*الإصدار)\s*[:\-]?\s*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4}|\d{1,2}[\/\-]\d{1,2}[\/\-]14\d{2}|\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2})/,
      );
      if (deedDateMatch) {
        f.filed_date = deedDateMatch[1];
      } else {
        const dateMatch = t.match(
          /\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4}|\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2}|\d{1,2}[\/\-]\d{1,2}[\/\-]14\d{2}/,
        );
        if (dateMatch) f.filed_date = dateMatch[0];
      }
      const courtMatch = t.match(/([^\n|،]{0,40}محكمة[^\n|،]{0,40})/);
      if (courtMatch) f.court = clean(courtMatch[0]);
      const typeMatch = t.match(/(?:نوع\s*(?:الحكم|الصك)?\s*[:\-]?\s*)([^\n|،]{2,40})/);
      if (typeMatch) f.judgment_type = clean(typeMatch[1]);
      out.push({ _kind: "judgment", fields: f, text: t.slice(0, 400) });
    });
    return out;
  }

  // 2.c) Lawsuit requests scraper — /applications/lawsuit/requests
  // عمود تقريبي: رقم الطلب | نوع الطلب | تاريخ الطلب | حالة الطلب | رقم القضية | المحكمة
  function scrapeLawsuitRequestsTable() {
    const out = [];
    const matchKey = (t) => {
      const c = clean(t);
      if (/رقم\s*الطلب/.test(c)) return "request_number";
      if (/نوع\s*الطلب/.test(c)) return "request_type";
      if (/تاريخ\s*الطلب|تاريخ\s*تقديم/.test(c)) return "filed_date";
      if (/حالة\s*الطلب|^الحالة$/.test(c)) return "status";
      if (/رقم\s*القضية|رقم\s*الدعوى/.test(c)) return "case_number";
      if (/اسم\s*المحكمة|^المحكمة$|المحكمة/.test(c)) return "court";
      return null;
    };
    $all("table").forEach((table) => {
      const headers = $all("thead th, thead td", table).map(text);
      const altHeaders = headers.length
        ? headers
        : $all("tr:first-child th, tr:first-child td", table).map(text);
      const ok =
        altHeaders.some((h) => /رقم\s*الطلب/.test(h)) &&
        altHeaders.some((h) => /نوع\s*الطلب|تاريخ\s*الطلب|حالة\s*الطلب/.test(h));
      if (!ok) return;
      const colKeys = altHeaders.map(matchKey);
      const rows = $all("tbody tr", table).length ? $all("tbody tr", table) : $all("tr", table);
      rows.forEach((row, i) => {
        if (i === 0 && $all("th", row).length && !$all("td", row).length) return;
        const cells = $all("td, th", row).map(text);
        if (cells.length < 2) return;
        const f = {};
        cells.forEach((v, j) => {
          const k = colKeys[j];
          if (k && v) f[k] = v;
        });
        if (!f.request_number) {
          const found = cells.find((v) => /\d{6,}/.test(v));
          if (found) f.request_number = (found.match(/\d{6,}/) || [""])[0];
        }
        if (!f.request_number) return;
        out.push({ _kind: "lawsuit_request", fields: f, text: cells.join(" | ") });
      });
    });
    return out;
  }

  // 2.d) Aggressive lawsuit requests fallback
  function scrapeLawsuitRequestsAggressive() {
    const out = [];
    const seen = new Set();
    const sel =
      "div, li, article, section, [role='row'], [role='listitem'], tr, [class*='row'], [class*='item'], [class*='card'], [class*='request']";
    $all(sel).forEach((el) => {
      if (el.children.length > 30) return;
      const t = clean(el.innerText || "");
      if (!t || t.length < 10 || t.length > 700) return;
      if (!/طلب|الطلبات/.test(t)) return;
      const idMatch = t.match(/\d{6,}/);
      if (!idMatch) return;
      const id = idMatch[0];
      if (seen.has(id)) return;
      seen.add(id);
      const f = { request_number: id };
      const typeMatch = t.match(/(?:نوع\s*الطلب\s*[:\-]?\s*)([^\n|،]{2,40})/);
      if (typeMatch) f.request_type = clean(typeMatch[1]);
      const dateMatch = t.match(
        /\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4}|\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2}|\d{1,2}[\/\-]\d{1,2}[\/\-]14\d{2}/,
      );
      if (dateMatch) f.filed_date = dateMatch[0];
      const caseMatch = t.match(
        /(?:رقم\s*القضية|رقم\s*الدعوى)\s*[:\-]?\s*(\d{4}\s*\/\s*\d{3,}|\d{9,})/,
      );
      if (caseMatch) f.case_number = caseMatch[1].replace(/\s/g, "");
      const statusMatch = t.match(
        /(?:^|\s)(مقبول|مرفوض|قيد\s*الدراسة|قيد\s*المراجعة|منجز|مكتمل|قيد\s*النظر)(?:\s|$)/,
      );
      if (statusMatch) f.status = statusMatch[1];
      out.push({ _kind: "lawsuit_request", fields: f, text: t.slice(0, 400) });
    });
    return out;
  }

  // 3) جدول طلبات التنفيذ: رقم الطلب | نوع الطلب | نوع السند | تاريخ تقديم الطلب | اسم المنفذ ضده | المحكمة | الحالة
  function scrapeExecutionTable() {
    const out = [];
    const matchKey = (t) => {
      const c = clean(t);
      if (/نوع\s*السند/.test(c)) return "deed_type";
      if (/نوع\s*الطلب/.test(c)) return "request_type";
      if (/رقم\s*الطلب/.test(c)) return "execution_number";
      if (/تاريخ\s*تقديم\s*الطلب|تاريخ\s*الطلب/.test(c)) return "filed_date";
      if (/المنفذ\s*ضده|المنفذ\s*عليه/.test(c)) return "debtor_name";
      if (/اسم\s*المحكمة|^المحكمة$|المحكمة/.test(c)) return "court";
      if (/حالة\s*الطلب|^الحالة$|الحالة/.test(c)) return "status";
      if (/مبلغ|قيمة/.test(c)) return "amount";
      return null;
    };
    $all("table").forEach((table) => {
      const headers = $all("thead th, thead td", table).map(text);
      const altHeaders = headers.length
        ? headers
        : $all("tr:first-child th, tr:first-child td", table).map(text);
      const ok =
        altHeaders.some((h) => /رقم\s*الطلب/.test(h)) &&
        altHeaders.some((h) => /نوع\s*السند|المنفذ\s*ضده|حالة\s*الطلب/.test(h));
      if (!ok) return;
      const colKeys = altHeaders.map(matchKey);
      const rows = $all("tbody tr", table).length ? $all("tbody tr", table) : $all("tr", table);
      rows.forEach((row, i) => {
        if (i === 0 && $all("th", row).length && !$all("td", row).length) return;
        const cells = $all("td, th", row).map(text);
        if (cells.length < 3) return;
        const f = {};
        cells.forEach((v, j) => {
          const k = colKeys[j];
          if (k && v) f[k] = v;
        });
        if (!f.execution_number) {
          const found = cells.find((v) => /\d{9,}/.test(v));
          if (found) f.execution_number = (found.match(/\d{9,}/) || [""])[0];
        }
        if (!f.execution_number) return;
        out.push({ _kind: "execution", fields: f, text: cells.join(" | ") });
      });
    });
    return out;
  }

  // 4) جدول الوكالات: رقم الوكالة | تاريخ الإصدار | تاريخ الانتهاء | اسم الوكيل | الحالة
  // 4) جدول الوكالات: مرن ليتعامل مع الجدول + البطاقات (الـ Najiz يستخدم layouts مختلفة)
  function scrapeAgencyTable() {
    const out = [];
    const matchKey = (t) => {
      const c = clean(t);
      if (/رقم\s*الوكالة|^الرقم$|رقم\s*الصك/.test(c)) return "wakalah_number";
      if (/تاريخ\s*إصدار|تاريخ\s*الإصدار|تاريخ\s*الاصدار|تاريخ\s*التحرير/.test(c))
        return "issue_date";
      if (/تاريخ\s*انتهاء|تاريخ\s*الانتهاء|تاريخ\s*الإنتهاء|تاريخ\s*الصلاحية/.test(c))
        return "expiry_date";
      if (/اسم\s*الوكيل|^الوكيل$|الوكيل/.test(c)) return "agent_name";
      if (/اسم\s*الموكل|^الموكل$|الموكل|المُوكِّل|الأصيل/.test(c)) return "issuer_name";
      if (/حالة\s*الوكالة|^الحالة$|حالة\s*الصك/.test(c)) return "status";
      if (/نطاق|نوع\s*الوكالة|الموضوع|نوع\s*الصك/.test(c)) return "scope";
      return null;
    };
    $all("table").forEach((table) => {
      const headers = $all("thead th, thead td", table).map(text);
      const altHeaders = headers.length
        ? headers
        : $all("tr:first-child th, tr:first-child td", table).map(text);
      const ok = altHeaders.some((h) => /وكال|موكل|وكيل/.test(h));
      if (!ok) return;
      const colKeys = altHeaders.map(matchKey);
      const rows = $all("tbody tr", table).length ? $all("tbody tr", table) : $all("tr", table);
      rows.forEach((row, i) => {
        if (i === 0 && $all("th", row).length && !$all("td", row).length) return;
        const cells = $all("td, th", row).map(text);
        if (cells.length < 2) return;
        const f = {};
        cells.forEach((v, j) => {
          const k = colKeys[j];
          if (k && v) f[k] = v;
        });
        if (!f.wakalah_number) {
          const found = cells.find((v) => /\d{5,}/.test(v));
          if (found) f.wakalah_number = (found.match(/\d{5,}/) || [""])[0];
        }
        if (!f.wakalah_number) {
          const alphaNum = cells.find((v) => /^[A-Za-z0-9\-]{4,}$/.test(v.replace(/\s/g, "")));
          if (alphaNum) f.wakalah_number = alphaNum.replace(/\s/g, "");
        }
        if (!f.wakalah_number) return;
        out.push({ _kind: "power", fields: f, text: cells.join(" | ") });
      });
    });
    return out;
  }

  // 4.b) Aggressive agency fallback — يلتقط كل وكالة من بطاقات/divs/grids
  function scrapeAgenciesAggressive() {
    const out = [];
    const seen = new Map(); // wakalah_number → richest fields
    const sel =
      "div, li, article, section, [role='row'], [role='listitem'], tr, [class*='row'], [class*='item'], [class*='card'], [class*='agency'], [class*='wakala'], [class*='procuration']";
    $all(sel).forEach((el) => {
      if (el.children.length > 40) return;
      const t = clean(el.innerText || "");
      if (!t || t.length < 8 || t.length > 900) return;
      // Must look like an agency block
      if (!/وكال|موكل|وكيل/.test(t)) return;
      // Find ALL wakalah numbers in this block (some blocks have multiple — pagination scenarios)
      const allMatches = [...t.matchAll(/\d{5,}/g)].map((m) => m[0]);
      if (!allMatches.length) return;

      for (const wn of allMatches) {
        // Skip if this number is clearly NOT a wakalah (e.g., a phone or ID)
        if (wn.length > 15) continue;
        const existing = seen.get(wn) || { wakalah_number: wn };
        // Enrich
        const issMatch = t.match(/(?:الموكل|اسم\s*الموكل|الأصيل)\s*[:\-]?\s*([^\n|،]{2,60})/);
        if (issMatch && !existing.issuer_name) existing.issuer_name = clean(issMatch[1]);
        const agMatch = t.match(/(?:الوكيل|اسم\s*الوكيل)\s*[:\-]?\s*([^\n|،]{2,60})/);
        if (agMatch && !existing.agent_name) existing.agent_name = clean(agMatch[1]);
        const issueDate = t.match(
          /(?:تاريخ\s*(?:الإصدار|الاصدار|التحرير))\s*[:\-]?\s*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4}|\d{1,2}[\/\-]\d{1,2}[\/\-]14\d{2}|\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2})/,
        );
        if (issueDate && !existing.issue_date) existing.issue_date = issueDate[1];
        const expiryDate = t.match(
          /(?:تاريخ\s*(?:الانتهاء|الإنتهاء|الصلاحية))\s*[:\-]?\s*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4}|\d{1,2}[\/\-]\d{1,2}[\/\-]14\d{2}|\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2})/,
        );
        if (expiryDate && !existing.expiry_date) existing.expiry_date = expiryDate[1];
        const statusMatch = t.match(
          /(?:^|\s)(سارية|منتهية|ملغاة|نافذة|موقوفة|معتمدة|قيد\s*المراجعة)(?:\s|$)/,
        );
        if (statusMatch && !existing.status) existing.status = statusMatch[1];
        seen.set(wn, existing);
      }
    });
    // Also independently scan for standalone agency-number patterns inside the entire page
    // (catches numbers shown in expandable rows or sub-content)
    const pageText = clean(document.body.innerText || "");
    if (/وكال|موكل|وكيل/.test(pageText)) {
      // Look for "رقم الوكالة" labels followed by numbers
      const labelMatches = pageText.matchAll(/(?:رقم\s*الوكالة)\s*[:\-]?\s*(\d{5,15})/g);
      for (const m of labelMatches) {
        if (!seen.has(m[1])) seen.set(m[1], { wakalah_number: m[1] });
      }
    }
    for (const [wn, fields] of seen) {
      out.push({ _kind: "power", fields, text: `wakalah ${wn}` });
    }
    return out;
  }

  // 5) جدول الجلسات والمواعيد — أكثر مرونة
  function scrapeSessionsTable() {
    const out = [];
    const matchKey = (t) => {
      const c = clean(t);
      if (/رقم\s*القضية|رقم\s*الدعوى|^القضية$|^الدعوى$/.test(c)) return "case_number";
      if (/تاريخ\s*الجلسة|^الموعد$|الموعد\s*|^التاريخ$|تاريخ\s*الموعد/.test(c))
        return "session_date";
      if (/^وقت$|الساعة|^الوقت$|توقيت/.test(c)) return "time";
      if (/اسم\s*المحكمة|^المحكمة$|^محكمة$/.test(c)) return "court";
      if (/قاعة|^الدائرة$|الدائرة\s*القضائية/.test(c)) return "room";
      if (/^الحالة$|حالة\s*الجلسة|حالة\s*الموعد/.test(c)) return "status";
      if (/^النوع$|نوع\s*الجلسة/.test(c)) return "type";
      return null;
    };
    $all("table").forEach((table) => {
      const headers = $all("thead th, thead td", table).map(text);
      const altHeaders = headers.length
        ? headers
        : $all("tr:first-child th, tr:first-child td", table).map(text);
      // Relaxed: any header has "جلسة" OR "موعد" OR "تاريخ" OR "قاعة"
      const ok = altHeaders.some((h) => /جلسة|موعد|تاريخ|قاعة|الدائرة/.test(h));
      if (!ok) return;
      const colKeys = altHeaders.map(matchKey);
      const rows = $all("tbody tr", table).length ? $all("tbody tr", table) : $all("tr", table);
      rows.forEach((row, i) => {
        if (i === 0 && $all("th", row).length && !$all("td", row).length) return;
        const cells = $all("td, th", row).map(text);
        if (cells.length < 2) return;
        const f = {};
        cells.forEach((v, j) => {
          const k = colKeys[j];
          if (k && v) f[k] = v;
        });
        const date = parseDateISO(f.session_date) || parseDateISO(cells.join(" "));
        if (!date) return;
        f.session_date = date;
        if (!f.case_number) {
          const found = cells.find((v) => /\d{4}\s*\/\s*\d{3,}|\d{9,}/.test(v));
          if (found)
            f.case_number = (found.match(/\d{4}\s*\/\s*\d{3,}|\d{9,}/) || [""])[0].replace(
              /\s/g,
              "",
            );
        }
        out.push({ _kind: "session", fields: f, text: cells.join(" | ") });
      });
    });
    return out;
  }

  // 5.b) Aggressive sessions fallback — any block containing date + case/hearing context
  function scrapeSessionsAggressive() {
    const out = [];
    const seen = new Set();
    const sel =
      "div, li, article, section, [role='row'], [role='listitem'], tr, [class*='row'], [class*='item'], [class*='card'], [class*='session'], [class*='hearing'], [class*='appointment']";
    $all(sel).forEach((el) => {
      if (el.children.length > 30) return;
      const t = clean(el.innerText || "");
      if (!t || t.length < 8 || t.length > 600) return;
      const dm = t.match(
        /\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4}|\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2}|\d{1,2}[\/\-]\d{1,2}[\/\-]14\d{2}/,
      );
      if (!dm) return;
      // Must mention hearing/session/court/calendar
      if (!/جلسة|موعد|محكمة|قضية|دعوى|قاعة|الدائرة|التقويم/.test(t)) return;
      const date = parseDateISO(dm[0]);
      if (!date) return;
      const cn = (t.match(/\d{4}\s*\/\s*\d{3,}|\d{10,}/) || [""])[0].replace(/\s/g, "");
      const key = `${date}|${cn || t.slice(0, 30)}`;
      if (seen.has(key)) return;
      seen.add(key);
      const courtMatch = t.match(/([^\n|،]{0,40}محكمة[^\n|،]{0,40})/);
      const roomMatch = t.match(/(?:قاعة|قاعه)\s*(?:رقم)?\s*([\d\u0660-\u0669]+|[^\n|،]{1,20})/);
      out.push({
        _kind: "session",
        fields: {
          session_date: date,
          case_number: cn,
          court: courtMatch ? clean(courtMatch[0]) : undefined,
          room: roomMatch ? clean(roomMatch[1]) : undefined,
          status: "قادمة",
        },
        text: t.slice(0, 400),
      });
    });
    return out;
  }

  // =====================================================
  // سحب التقويم العدلي من لوحة المعلومات (dashboard) — مرن ليجد كل المواعيد
  // =====================================================
  function scrapeDashboardCalendar() {
    const out = [];
    const seen = new Set();
    // Step 1: find calendar container by various means (text content, class names, location)
    const containerCandidates = [];

    // Strategy A: containers with explicit calendar text
    $all(
      "div, section, article, aside, [class*='card' i], [class*='calendar' i], [class*='appointment' i], [class*='widget' i], [class*='schedule' i]",
    ).forEach((container) => {
      const txt = clean(container.innerText || "");
      if (!txt || txt.length > 6000) return;
      if (
        /التقويم\s*العدلي|المواعيد\s*(?:المستقبلية|القادمة|القريبة)|مواعيد\s*الجلسات|أقرب\s*المواعيد/.test(
          txt,
        )
      ) {
        containerCandidates.push(container);
      }
    });

    // Strategy B: any column/sidebar with multiple date entries
    $all("div, section, aside, ul, [class*='col-'], [class*='sidebar' i]").forEach((container) => {
      if (containerCandidates.includes(container)) return;
      const txt = clean(container.innerText || "");
      if (!txt || txt.length < 30 || txt.length > 6000) return;
      const dateCount = (
        txt.match(
          /\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4}|\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2}|\d{1,2}[\/\-]\d{1,2}[\/\-]14\d{2}/g,
        ) || []
      ).length;
      if (dateCount >= 1 && /جلسة|موعد|قضية|دعوى|محكمة|قاعة|الدائرة/.test(txt)) {
        containerCandidates.push(container);
      }
    });

    // Step 2: extract appointments from each candidate
    containerCandidates.forEach((container) => {
      // Sub-rows
      const rows = container.querySelectorAll(
        "[class*='item' i], [class*='row' i], [class*='event' i], [class*='appointment' i], [class*='session' i], [class*='entry' i], li, tr, [role='listitem'], [class*='card' i]",
      );
      const cands = rows.length ? Array.from(rows) : [container];

      cands.forEach((row) => {
        if (row.children.length > 30) return;
        const t = clean(row.innerText || "");
        if (t.length < 6 || t.length > 800) return;
        const dm = t.match(
          /\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4}|\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2}|\d{1,2}[\/\-]\d{1,2}[\/\-]14\d{2}/,
        );
        if (!dm) return;
        const date = parseDateISO(dm[0]);
        if (!date) return;
        // Must look like an appointment (not arbitrary text with a date)
        if (!/جلسة|موعد|قضية|دعوى|محكمة|قاعة|الدائرة|التنفيذ/.test(t)) return;
        const cn = (t.match(/\d{4}\s*\/\s*\d{3,}|\d{9,}/) || [""])[0].replace(/\s/g, "");
        const key = `${date}-${cn || t.slice(0, 30)}`;
        if (seen.has(key)) return;
        seen.add(key);
        const courtMatch = t.match(/([^\n|،]{0,40}(?:محكمة|دائرة)[^\n|،]{0,40})/);
        const roomMatch = t.match(/(?:قاعة|قاعه|الدائرة)\s*(?:رقم)?\s*([\d\u0660-\u0669A-Za-z]+)/);
        const timeMatch = t.match(/(\d{1,2}:\d{2}(?:\s*[صم])?)/);
        out.push({
          _kind: "session",
          fields: {
            session_date: date,
            case_number: cn,
            court: courtMatch ? clean(courtMatch[0]) : undefined,
            room: roomMatch ? clean(roomMatch[1]) : undefined,
            time: timeMatch ? timeMatch[1] : undefined,
            status: "قادمة",
          },
          text: t.slice(0, 400),
        });
      });
    });

    // Step 3: as a final safety net, scan the WHOLE page for "موعد الجلسة" / "تاريخ الجلسة" patterns
    const pageText = clean(document.body.innerText || "");
    if (/التقويم\s*العدلي|مواعيد\s*الجلسات/.test(pageText)) {
      // Look for patterns: "DD/MM/YYYY ... رقم القضية: ..."
      const lines = pageText.split(/[\n\r]+/);
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line || line.length > 200) continue;
        const dm = line.match(
          /\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4}|\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2}|\d{1,2}[\/\-]\d{1,2}[\/\-]14\d{2}/,
        );
        if (!dm) continue;
        const date = parseDateISO(dm[0]);
        if (!date) continue;
        // Look at neighboring lines for context (case number, court)
        const context = [lines[i - 1], lines[i], lines[i + 1], lines[i + 2]]
          .filter(Boolean)
          .join(" | ");
        if (!/جلسة|موعد|قضية|دعوى|محكمة/.test(context)) continue;
        const cnMatch = context.match(/\d{4}\s*\/\s*\d{3,}|\d{9,}/);
        const cn = cnMatch ? cnMatch[0].replace(/\s/g, "") : "";
        const key = `${date}-${cn || line.slice(0, 30)}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const courtMatch = context.match(/([^\n|،]{0,30}محكمة[^\n|،]{0,30})/);
        out.push({
          _kind: "session",
          fields: {
            session_date: date,
            case_number: cn,
            court: courtMatch ? clean(courtMatch[0]) : undefined,
            status: "قادمة",
          },
          text: context.slice(0, 300),
        });
      }
    }
    return out;
  }

  // =====================================================
  // سحب البطاقات (fallback)
  // =====================================================
  function collectCards(keywords) {
    const out = [];
    const seen = new Set();
    const sel =
      "[class*='card'], [class*='Card'], [class*='item'], [class*='Item'], [class*='box'], li, [class*='panel'], [class*='tile']";
    for (const el of $all(sel)) {
      const t = clean(el.innerText || "");
      if (!t || t.length < 8 || t.length > 1200) continue;
      const hits = keywords.filter((k) => t.includes(k)).length;
      if (hits < 2) continue;
      if (Array.from(seen).some((s) => s.contains(el) || el.contains(s))) continue;
      seen.add(el);
      out.push(el);
    }
    return out;
  }

  function fieldFromContainer(container, labels) {
    const nodes = $all("*", container);
    for (const n of nodes) {
      const t = clean(n.textContent);
      if (!t || t.length > 120) continue;
      for (const lbl of labels) {
        if (
          t === lbl ||
          t === lbl + ":" ||
          t.startsWith(lbl + " ") ||
          t.startsWith(lbl + ":") ||
          t.startsWith(lbl + " :")
        ) {
          const after = t
            .slice(lbl.length)
            .replace(/^[:\s\-–]+/, "")
            .trim();
          if (after) return after;
          const sib = n.nextElementSibling;
          if (sib) {
            const sv = clean(sib.textContent);
            if (sv) return sv;
          }
          const last = n.lastElementChild;
          if (last) {
            const lv = clean(last.textContent);
            if (lv && lv !== t) return lv;
          }
        }
      }
    }
    return "";
  }

  // =====================================================
  // محوّلات إلى صيغة API النظام
  // =====================================================
  function makeNajizId(prefix, value) {
    const v = (value || "").toString().replace(/\s/g, "");
    return v
      ? `${prefix}_${v}`
      : `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }

  function toCasePayload(items) {
    const seen = new Set();
    const out = [];
    for (const it of items) {
      const f = it.fields || {};
      const cn = (f.case_number || "").toString().replace(/\s/g, "");
      if (!cn) continue;
      const id = makeNajizId("case", cn);
      if (seen.has(id)) continue;
      seen.add(id);
      out.push({
        najiz_id: id.slice(0, 120),
        case_number: cn.slice(0, 200),
        title: (f.title || f.subject || f.plaintiff || cn).toString().slice(0, 500),
        court: (f.court || "").slice(0, 200) || undefined,
        case_type: (f.case_type || "").slice(0, 200) || undefined,
        status: (f.status || "").slice(0, 200) || undefined,
        opened_at: parseDateISO(f.opened_at),
        client_name: (f.plaintiff || f.client_name || "").slice(0, 200) || undefined,
      });
    }
    return out;
  }

  function toPowerPayload(items) {
    const seen = new Set();
    const out = [];
    for (const it of items) {
      const f = it.fields || {};
      const wn = (f.wakalah_number || "").toString().replace(/\s/g, "");
      if (!wn) continue;
      const id = makeNajizId("power", wn);
      if (seen.has(id)) continue;
      seen.add(id);
      out.push({
        najiz_id: id.slice(0, 120),
        wakalah_number: wn.slice(0, 200),
        issuer_name: (f.issuer_name || "").slice(0, 200) || undefined,
        agent_name: (f.agent_name || "").slice(0, 200) || undefined,
        issue_date: parseDateISO(f.issue_date),
        expiry_date: parseDateISO(f.expiry_date),
        scope: (f.scope || "").slice(0, 500) || undefined,
        status: (f.status || "").slice(0, 100) || undefined,
        issuer_id_number: (f.issuer_id_number || "").slice(0, 100) || undefined,
        agent_id_number: (f.agent_id_number || "").slice(0, 100) || undefined,
      });
    }
    return out;
  }

  function toExecutionPayload(items) {
    const seen = new Set();
    const out = [];
    for (const it of items) {
      const f = it.fields || {};
      const en = (f.execution_number || "").toString().replace(/\s/g, "");
      if (!en) continue;
      const id = makeNajizId("exec", en);
      if (seen.has(id)) continue;
      seen.add(id);
      out.push({
        najiz_id: id.slice(0, 120),
        execution_number: en.slice(0, 200),
        court: (f.court || "").slice(0, 200) || undefined,
        amount: parseAmount(f.amount),
        debtor_name: (f.debtor_name || "").slice(0, 200) || undefined,
        creditor_name: (f.creditor_name || "").slice(0, 200) || undefined,
        creditor_id_number: (f.creditor_id_number || "").slice(0, 100) || undefined,
        debtor_id_number: (f.debtor_id_number || "").slice(0, 100) || undefined,
        request_type: (f.request_type || "").slice(0, 200) || undefined,
        execution_data: (f.execution_data || "").slice(0, 5000) || undefined,
        status: (f.status || "").slice(0, 200) || undefined,
        filed_date: parseDateISO(f.filed_date),
      });
    }
    return out;
  }

  function toSessionPayload(items) {
    const seen = new Set();
    const out = [];
    for (const it of items) {
      const f = it.fields || {};
      const date = parseDateISO(f.session_date);
      if (!date) continue;
      const cn = (f.case_number || "").toString().replace(/\s/g, "") || `unknown_${Date.now()}`;
      const id = makeNajizId("case", cn);
      const key = `${id}|${date}|${f.court || ""}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        najiz_case_id: id.slice(0, 120),
        session_date: date,
        court: (f.court || "").slice(0, 200) || undefined,
        room: (f.room || "").slice(0, 200) || undefined,
        status: (f.status || "").slice(0, 200) || undefined,
      });
    }
    return out;
  }

  function toDocumentPayload(items) {
    const seen = new Set();
    const out = [];
    for (const it of items) {
      const f = it.fields || {};
      const dn = (f.deed_number || f.case_number || "").toString().replace(/\s/g, "");
      if (!dn) continue;
      const id = makeNajizId("doc", dn);
      if (seen.has(id)) continue;
      seen.add(id);
      const title = (f.judgment_type || f.title || `صك ${dn}`).toString().slice(0, 200);
      out.push({
        najiz_id: id.slice(0, 120),
        title,
        case_number: (f.case_number || "").toString().replace(/\s/g, "").slice(0, 200) || undefined,
        court: (f.court || "").slice(0, 200) || undefined,
        status: (f.status || "").slice(0, 200) || undefined,
        filed_date: parseDateISO(f.filed_date),
        source_url: location.href.slice(0, 1000),
      });
    }
    return out;
  }

  // =====================================================
  // Deep-dive helpers — يجدون روابط التفاصيل ويستخلصون البيانات الغنية من صفحة التفاصيل
  // =====================================================

  // Find detail-page links on the current list page, based on the kind hint
  function findDetailLinks(kindHint) {
    const links = [];
    const seen = new Set();
    // Strategy 1: <a href> with path containing kind-specific keywords
    const kindPatterns = {
      cases: /lawsuit\/(view|details|case)|cases?\/\d+|lawsuit\/\d+/i,
      executions: /iexecution\/(view|details|request)|execution\/\d+/i,
      powers: /wekalat\/(view|details|procuration)|agency\/\d+|procuration\/\d+/i,
    };
    const pattern = kindPatterns[kindHint] || /\/(view|details|show|info)\//i;

    // v4.8: صفحة الطلبات لا تحتوي روابط <a> قياسية — يجب النقر على خانة "رقم الطلب" في كل بطاقة
    if (kindHint === "lawsuit_requests") {
      const cards = findRequestCards();
      if (cards.length) return cards;
    }

    $all("a[href]").forEach((a) => {
      const href = a.getAttribute("href") || "";
      if (!href || href === "#" || href.startsWith("javascript:")) return;
      if (!pattern.test(href)) return;
      // Resolve to absolute
      const abs = href.startsWith("http") ? href : new URL(href, location.origin).toString();
      if (seen.has(abs)) return;
      seen.add(abs);
      // Try to capture an identifier (case_number or row text) for matching back later
      const row = a.closest("tr, [role='row'], [class*='row'], li, [class*='item']");
      const rowText = row ? clean(row.innerText || "") : clean(a.innerText || "");
      const idMatch = rowText.match(/\d{4}\s*\/\s*\d{3,}|\d{9,}/);
      links.push({
        url: abs,
        identifier: idMatch ? idMatch[0].replace(/\s/g, "") : null,
        rowText: rowText.slice(0, 200),
      });
    });

    // Strategy 2: buttons with onclick / data-* that navigate (look for trigger elements)
    if (links.length === 0) {
      $all("button, [role='button'], [class*='action']").forEach((b) => {
        const t = clean(b.innerText || "");
        if (/(عرض|التفاصيل|التفصيل|تفاصيل|details|view)/i.test(t)) {
          // We can't extract URL from onclick, but we can flag the row
          const row = b.closest("tr, [role='row'], [class*='row'], li, [class*='item']");
          if (row) {
            const rowText = clean(row.innerText || "");
            const idMatch = rowText.match(/\d{4}\s*\/\s*\d{3,}|\d{9,}/);
            // Use placeholder url — the bot will click instead of navigate
            links.push({
              url: "__CLICK__",
              clickTarget: true,
              identifier: idMatch ? idMatch[0].replace(/\s/g, "") : null,
              rowText: rowText.slice(0, 200),
            });
          }
        }
      });
    }
    return links;
  }

  // Extract rich detail-page key-value pairs (generic, works for case/execution/agency detail pages)
  function scrapeDetailPage() {
    const fields = {};

    // Strategy A: <dt>/<dd> pairs
    $all("dt").forEach((dt) => {
      const label = clean(dt.textContent);
      const dd = dt.nextElementSibling;
      if (dd && dd.tagName === "DD") {
        const value = clean(dd.textContent);
        if (label && value) fields[label] = value;
      }
    });

    // Strategy B: label-value side-by-side via "field" containers (Najiz uses Angular components)
    $all(
      "[class*='field'], [class*='form-row'], [class*='detail'], [class*='info-row'], [class*='label-value']",
    ).forEach((row) => {
      if (row.children.length < 2 || row.children.length > 6) return;
      const t = clean(row.innerText || "");
      if (t.length > 300) return;
      // Look for pattern "label : value" or "label\nvalue"
      const labelEl = row.querySelector(
        "[class*='label'], label, .lbl, dt, .title, .key, strong, b",
      );
      const valueEl = row.querySelector("[class*='value'], [class*='val'], dd, .data, .content");
      if (labelEl && valueEl) {
        const label = clean(labelEl.textContent);
        const value = clean(valueEl.textContent);
        if (label && value && label !== value) fields[label] = value;
      } else {
        // Heuristic split by ":" or "::" or first child as label
        const parts = t.split(/[:：]\s*/);
        if (parts.length === 2 && parts[0].length < 60 && parts[1].length < 300) {
          fields[clean(parts[0])] = clean(parts[1]);
        }
      }
    });

    // Strategy C: tables on detail pages (often have inline data)
    $all("table").forEach((tbl) => {
      $all("tr", tbl).forEach((tr) => {
        const cells = $all("td, th", tr).map(text);
        if (cells.length === 2 && cells[0].length < 60 && cells[1] && cells[0] !== cells[1]) {
          fields[cells[0]] = cells[1];
        }
      });
    });

    // Strategy D: card grids ("col-md-3" pattern with label above value)
    $all("[class*='col-'], [class*='grid-item'], [class*='item-cell']").forEach((col) => {
      if (col.children.length !== 2) return;
      const [label, val] = Array.from(col.children).map((c) => clean(c.textContent));
      if (label && val && label !== val && label.length < 60 && val.length < 200) {
        if (!/[a-z0-9]{20,}/i.test(label)) fields[label] = val;
      }
    });

    return fields;
  }

  // Map raw detail fields (Arabic labels) to schema keys per kind
  function detailToSchema(kind, raw) {
    const get = (...keys) => {
      for (const k of keys) {
        for (const rk of Object.keys(raw)) {
          if (rk.includes(k)) return raw[rk];
        }
      }
      return undefined;
    };
    if (kind === "cases") {
      return {
        case_number: get("رقم القضية", "رقم الدعوى"),
        title: get("الموضوع", "موضوع الدعوى", "وصف القضية"),
        court: get("اسم المحكمة", "المحكمة", "الدائرة"),
        case_type: get("نوع القضية", "نوع الدعوى", "التصنيف"),
        status: get("حالة القضية", "الحالة"),
        opened_at: get("تاريخ القضية", "تاريخ القيد", "تاريخ الإيداع"),
        client_name: get("المدعي", "اسم المدعي", "الموكل", "العميل"),
        description: get("ملخص", "تفاصيل", "الوصف"),
      };
    }
    if (kind === "executions") {
      return {
        execution_number: get("رقم الطلب", "رقم التنفيذ"),
        court: get("اسم المحكمة", "المحكمة"),
        amount: get("مبلغ", "قيمة المطالبة", "المبلغ"),
        debtor_name: get("المنفذ ضده", "المدين", "اسم المدعى عليه"),
        creditor_name: get("طالب التنفيذ", "اسم المنفذ", "المنفذ له"),
        creditor_id_number: get("هوية طالب التنفيذ", "هوية المنفذ"),
        debtor_id_number: get("هوية المنفذ ضده", "رقم هوية المنفذ ضده"),
        request_type: get("نوع الطلب", "نوع السند"),
        status: get("حالة الطلب", "الحالة"),
        filed_date: get("تاريخ تقديم الطلب", "تاريخ الطلب", "تاريخ الإيداع"),
      };
    }
    if (kind === "powers") {
      return {
        wakalah_number: get("رقم الوكالة", "رقم الصك"),
        issuer_name: get("اسم الموكل", "الموكل", "الأصيل"),
        agent_name: get("اسم الوكيل", "الوكيل"),
        issue_date: get("تاريخ الإصدار", "تاريخ التحرير", "تاريخ الاصدار"),
        expiry_date: get("تاريخ الانتهاء", "تاريخ الإنتهاء", "تاريخ الصلاحية"),
        scope: get("نطاق الوكالة", "نوع الوكالة", "موضوع الوكالة", "الموضوع"),
        status: get("حالة الوكالة", "الحالة"),
      };
    }
    return raw;
  }

  // =====================================================
  // ماسحات متقدمة لبيانات ناجز التفصيلية
  // =====================================================

  function _extractFieldValue(label) {
    const re = new RegExp(
      label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\s*[:\\-–]?\\s*([^\\n|،]{2,300})",
    );
    const pageText = clean(document.body.innerText || "");
    const m = pageText.match(re);
    return m ? clean(m[1]) : undefined;
  }

  function _findValueByLabel(labels) {
    for (const lbl of labels) {
      const candidates = $all(
        "[class*='label'], [class*='key'], [class*='title'], label, dt, strong, b, th, .lbl",
      );
      for (const el of candidates) {
        const t = clean(el.textContent);
        if (!t || t.length > 80) continue;
        if (!labels.some((l) => t.includes(l))) continue;
        const parent = el.closest(
          "[class*='field'], [class*='row'], [class*='item'], [class*='col-'], [class*='card'], tr, [class*='detail'], [class*='info'], [class*='form']",
        );
        if (parent) {
          const valueEl = parent.querySelector(
            "[class*='value'], [class*='val'], [class*='data'], [class*='content'], dd, .value, .data",
          );
          if (valueEl && valueEl !== el) {
            const v = clean(valueEl.textContent);
            if (v && v !== t) return v;
          }
          const allText = clean(parent.innerText || "");
          const afterColon = allText.split(/[:：]/);
          if (afterColon.length >= 2) {
            const val = clean(afterColon.slice(1).join(":"));
            if (val && val !== t && val.length < 500) return val;
          }
          const siblings = parent.children;
          if (siblings.length >= 2) {
            for (let i = 0; i < siblings.length; i++) {
              if (siblings[i] === el || siblings[i].contains(el)) {
                for (let j = i + 1; j < siblings.length; j++) {
                  const sv = clean(siblings[j].textContent);
                  if (sv && sv !== t && sv.length < 500) return sv;
                }
              }
            }
          }
        }
        const sib = el.nextElementSibling;
        if (sib) {
          const sv = clean(sib.textContent);
          if (sv && sv !== t && sv.length < 500) return sv;
        }
      }
      const direct = _extractFieldValue(lbl);
      if (direct) return direct;
    }
    return undefined;
  }

  // قراءة قيم عناصر النماذج (select/input/textarea) بجانب عنوان معيّن —
  // صفحات تفاصيل الطلبات في ناجز تعرض "رقم الحكم" و"بيانات مقدم الطلب" كقوائم منسدلة
  // لا تظهر قيمها في innerText، لذا يجب قراءتها من عناصر النموذج مباشرة.
  function _readFormValueByLabel(labels) {
    const readCtl = (ctl) => {
      if (!ctl) return undefined;
      try {
        if (ctl.tagName === "SELECT") {
          const opt = ctl.selectedOptions && ctl.selectedOptions[0];
          const v = clean(opt ? opt.textContent : ctl.value);
          return v && !/^(اختر|حدد|--|—)/.test(v) ? v : undefined;
        }
        const v = clean(ctl.value || "");
        return v || undefined;
      } catch {
        return undefined;
      }
    };
    for (const el of $all("label, [class*='label'], dt, strong, b, th, span, div")) {
      if (el.children.length > 2) continue;
      const t = clean(el.textContent || "");
      if (!t || t.length > 60) continue;
      if (!labels.some((l) => arIncludes(t, l))) continue;
      if (el.tagName === "LABEL" && el.htmlFor) {
        const v = readCtl(document.getElementById(el.htmlFor));
        if (v) return v;
      }
      const scope =
        el.closest(
          "[class*='field'], [class*='form-group'], [class*='form-row'], [class*='col-'], [class*='item'], [class*='section'], [class*='row']",
        ) || el.parentElement;
      if (scope) {
        const v = readCtl(
          scope.querySelector(
            "select, input:not([type='hidden']):not([type='button']):not([type='submit']), textarea",
          ),
        );
        if (v) return v;
      }
      let sib = el.nextElementSibling;
      for (let hop = 0; sib && hop < 3; hop++, sib = sib.nextElementSibling) {
        const ctl =
          sib.matches && sib.matches("select, input, textarea")
            ? sib
            : sib.querySelector &&
              sib.querySelector("select, input:not([type='hidden']), textarea");
        const v = readCtl(ctl);
        if (v) return v;
      }
    }
    return undefined;
  }

  // =====================================================
  // استخراج نص قسم كامل متعدد الأسطر (موضوع الدعوى / طلبات المدعي / أسانيد الدعوى)
  // المشكلة القديمة: regex كان يتوقف عند أول سطر جديد فيفقد معظم النص
  // =====================================================
  const SECTION_STOP_LABELS = [
    "موضوع الدعوي",
    "طلبات المدعي",
    "اسانيد الدعوي",
    "اسس الدعوي",
    "مذكره الدفاع",
    "اطراف الدعوي",
    "الجلسات",
    "الاحكام",
    "الطلبات",
    "الاجراءات",
    "القرارات",
    "التكاليف القضائيه",
    "المرفقات",
    "رقم القضيه",
    "تصنيف القضيه",
    "نوع القضيه",
    "تاريخ القضيه",
    "ملف القضيه",
    "الصفحه الرئيسيه",
    "القضاء",
    "بيانات القضيه",
    "بيانات مقدم الطلب",
    "رقم الحكم",
    "اسباب الطلب",
    "التسبيبات",
    "الطلبات علي القضايا",
  ].map((s) => normalizeArabic(s));

  function extractSectionText(labels) {
    const normLabels = labels.map((l) => normalizeArabic(l));
    const isStopLine = (line) => {
      const n = normalizeArabic(line).replace(/[:\s]+$/, "");
      if (!n || line.length > 45) return false;
      return SECTION_STOP_LABELS.some((s) => n === s || n.startsWith(s + " ") || n === s + " :");
    };

    // الاستراتيجية 1: إيجاد عنصر العنوان ثم سحب نص الصندوق التالي كاملاً
    const headerEls = $all("h1,h2,h3,h4,h5,h6,strong,b,label,dt,span,p,div");
    for (const el of headerEls) {
      if (el.children.length > 2) continue;
      const t = normalizeArabic(el.textContent || "").replace(/[:\s]+$/, "");
      if (!t || t.length > 45) continue;
      if (!normLabels.some((l) => t === l || t.startsWith(l))) continue;
      let node = el.nextElementSibling || el.parentElement?.nextElementSibling;
      for (let hop = 0; hop < 4 && node; hop++) {
        const v = toAsciiDigits(node.innerText || "").trim();
        if (v && v.length > 15 && !isStopLine(v.split(/\n/)[0])) {
          return v.replace(/\n{3,}/g, "\n\n").slice(0, 5000);
        }
        node = node.nextElementSibling;
      }
    }

    // الاستراتيجية 2: تقسيم نص الصفحة إلى أسطر وجمع ما بين العنوان والقسم التالي
    const lines = toAsciiDigits(document.body.innerText || "")
      .split(/\n+/)
      .map((x) => x.trim())
      .filter(Boolean);
    for (const label of normLabels) {
      for (let i = 0; i < lines.length; i++) {
        const ln = normalizeArabic(lines[i]).replace(/[:\s]+$/, "");
        if (ln !== label && !(ln.startsWith(label) && lines[i].length < 45)) continue;
        const buf = [];
        const inline = lines[i].split(/[:：]/).slice(1).join(":").trim();
        if (inline && inline.length > 10) buf.push(inline);
        for (let j = i + 1; j < lines.length; j++) {
          if (isStopLine(lines[j])) break;
          buf.push(lines[j]);
          if (buf.join(" ").length > 4800) break;
        }
        const out = buf.join("\n").trim();
        if (out && out.length > 5) return out.slice(0, 5000);
      }
    }
    return undefined;
  }

  function scrapeCaseDetailFields() {
    const fields = {};
    const pageText = document.body.innerText || "";

    // Extract case number from URL or page
    fields.case_number =
      _findValueByLabel(["رقم القضية", "رقم الدعوى", "رقم الملف"]) ||
      (pageText.match(/(\d{4}\s*\/\s*\d{3,})/) || [])[1]?.replace(/\s/g, "") ||
      (location.pathname.match(/(\d{4,})/) || [])[1];

    // Extract basic fields using multiple strategies
    fields.case_classification = _findValueByLabel(["تصنيف القضية", "التصنيف"]);
    fields.case_type_detail = _findValueByLabel(["نوع القضية", "نوع الدعوى"]);
    fields.case_date = _findValueByLabel([
      "تاريخ القضية",
      "تاريخ الدعوى",
      "تاريخ القيد",
      "تاريخ الإيداع",
    ]);
    fields.subject_matter = _findValueByLabel(["موضوع الدعوي", "موضوع الدعوى", "موضوع القضية"]);
    fields.plaintiff_requests = _findValueByLabel(["طلبات المدعي", "طلبات المدّعي"]);
    fields.case_foundations = _findValueByLabel(["أسانيد الدعوي", "أسانيد الدعوى", "أسس الدعوى"]);
    fields.court_name = _findValueByLabel(["اسم المحكمة", "المحكمة"]);
    fields.circuit_number = _findValueByLabel(["الدائرة", "رقم الدائرة"]);

    // Strategy 1: dt/dd pairs
    $all("dt").forEach((dt) => {
      const label = clean(dt.textContent);
      const dd = dt.nextElementSibling;
      if (!dd || dd.tagName !== "DD") return;
      const value = clean(dd.textContent);
      if (!label || !value) return;
      if (/تصنيف/.test(label)) fields.case_classification = fields.case_classification || value;
      if (/نوع\s*القضية|نوع\s*الدعوى/.test(label))
        fields.case_type_detail = fields.case_type_detail || value;
      if (/تاريخ\s*القضية|تاريخ\s*الدعوى/.test(label)) fields.case_date = fields.case_date || value;
      if (/موضوع/.test(label)) fields.subject_matter = fields.subject_matter || value;
      if (/طلبات\s*المدعي/.test(label))
        fields.plaintiff_requests = fields.plaintiff_requests || value;
      if (/أسانيد|أسس\s*الدعوى/.test(label))
        fields.case_foundations = fields.case_foundations || value;
      if (/المحكمة/.test(label)) fields.court_name = fields.court_name || value;
      if (/الدائرة/.test(label)) fields.circuit_number = fields.circuit_number || value;
    });

    // Strategy 2: table rows with 2 cells
    $all("table").forEach((table) => {
      $all("tr", table).forEach((row) => {
        const cells = $all("td, th", row).map(text);
        if (cells.length === 2 && cells[0].length < 60 && cells[1]) {
          const l = cells[0],
            v = cells[1];
          if (/تصنيف/.test(l)) fields.case_classification = fields.case_classification || v;
          if (/نوع\s*القضية|نوع\s*الدعوى/.test(l))
            fields.case_type_detail = fields.case_type_detail || v;
          if (/تاريخ\s*القضية|تاريخ\s*الدعوى/.test(l)) fields.case_date = fields.case_date || v;
          if (/موضوع/.test(l)) fields.subject_matter = fields.subject_matter || v;
          if (/طلبات\s*المدعي/.test(l)) fields.plaintiff_requests = fields.plaintiff_requests || v;
          if (/أسانيد/.test(l)) fields.case_foundations = fields.case_foundations || v;
          if (/المحكمة/.test(l)) fields.court_name = fields.court_name || v;
          if (/الدائرة/.test(l)) fields.circuit_number = fields.circuit_number || v;
        }
      });
    });

    // Strategy 3: Angular/Najiz specific - look for field containers
    $all(
      "[class*='field'], [class*='form-row'], [class*='detail'], [class*='info-row'], [class*='label-value']",
    ).forEach((row) => {
      if (row.children.length < 2 || row.children.length > 6) return;
      const t = clean(row.innerText || "");
      if (t.length > 300) return;

      const labelEl = row.querySelector(
        "[class*='label'], label, .lbl, dt, .title, .key, strong, b",
      );
      const valueEl = row.querySelector("[class*='value'], [class*='val'], dd, .data, .content");

      if (labelEl && valueEl) {
        const label = clean(labelEl.textContent);
        const value = clean(valueEl.textContent);
        if (label && value && label !== value) {
          if (/تصنيف/.test(label)) fields.case_classification = fields.case_classification || value;
          if (/نوع\s*القضية|نوع\s*الدعوى/.test(label))
            fields.case_type_detail = fields.case_type_detail || value;
          if (/تاريخ\s*القضية|تاريخ\s*الدعوى/.test(label))
            fields.case_date = fields.case_date || value;
          if (/موضوع/.test(label)) fields.subject_matter = fields.subject_matter || value;
          if (/طلبات\s*المدعي/.test(label))
            fields.plaintiff_requests = fields.plaintiff_requests || value;
          if (/أسانيد|أسس\s*الدعوى/.test(label))
            fields.case_foundations = fields.case_foundations || value;
          if (/المحكمة/.test(label)) fields.court_name = fields.court_name || value;
          if (/الدائرة/.test(label)) fields.circuit_number = fields.circuit_number || value;
        }
      }
    });

    // Strategy 4: Extract from page text using regex patterns
    const extractFromText = (pattern, fieldName) => {
      const match = pageText.match(pattern);
      if (match && match[1]) {
        fields[fieldName] = fields[fieldName] || clean(match[1]);
      }
    };

    extractFromText(/تصنيف\s*القضية\s*[:\-]?\s*([^\n|،]{2,60})/, "case_classification");
    extractFromText(/نوع\s*القضية\s*[:\-]?\s*([^\n|،]{2,60})/, "case_type_detail");
    extractFromText(/تاريخ\s*القضية\s*[:\-]?\s*([^\n|،]{2,60})/, "case_date");
    extractFromText(/موضوع\s*الدعوى?\s*[:\-]?\s*([^\n]{2,500})/, "subject_matter");
    extractFromText(/طلبات\s*المدعي\s*[:\-]?\s*([^\n]{2,500})/, "plaintiff_requests");
    extractFromText(/أسانيد\s*الدعوى?\s*[:\-]?\s*([^\n]{2,500})/, "case_foundations");
    extractFromText(/(?:اسم\s*)?المحكمة\s*[:\-]?\s*([^\n|،]{2,60})/, "court_name");
    extractFromText(/(?:رقم\s*)?الدائرة\s*[:\-]?\s*([^\n|،]{1,30})/, "circuit_number");

    // تاريخ القضية بصيغة ISO جاهزة للنظام (يدعم الأرقام العربية وأسماء الأشهر الهجرية)
    fields.case_date_iso = parseDateISO(fields.case_date);

    return fields;
  }

  function scrapeCaseParties() {
    const parties = [];

    function _extractPartyFromRow(cells) {
      const party = {};
      const matchKey = (t) => {
        const c = clean(t);
        if (/الصفة|صفة\s*الخصم/.test(c)) return "party_role";
        if (/الاسم|اسم\s*الخصم|اسم\s*الطرف/.test(c)) return "name";
        if (/الجنسية|جنسية/.test(c)) return "nationality";
        if (/نوع\s*الهوية|نوع\s*التعريف|نوع\s*الوثيقة/.test(c)) return "id_type";
        if (/رقم\s*الهوية|رقم\s*التعريف|رقم\s*السجل/.test(c)) return "id_number";
        if (/الصفة\s*في\s*الدعوى|صفة\s*المدعي|صفة\s*الوكيل|الصفة\s*القانونية/.test(c))
          return "capacity";
        if (/الوكالة|حالة\s*الوكالة|وكالة/.test(c)) return "poa_status";
        return null;
      };
      return matchKey;
    }

    function _extractPartyFromText(t) {
      const party = {};
      const nameMatch = t.match(/(?:الاسم|اسم)\s*[:\-]?\s*([^\n|،]{2,80})/);
      if (nameMatch) party.name = clean(nameMatch[1]);
      const natMatch = t.match(/(?:الجنسية|جنسية)\s*[:\-]?\s*([^\n|،]{2,40})/);
      if (natMatch) party.nationality = clean(natMatch[1]);
      const idTypeMatch = t.match(
        /(?:نوع\s*(?:الهوية|التعريف|الوثيقة))\s*[:\-]?\s*([^\n|،]{2,40})/,
      );
      if (idTypeMatch) party.id_type = clean(idTypeMatch[1]);
      const idNumMatch = t.match(/(?:رقم\s*(?:الهوية|التعريف|السجل))\s*[:\-]?\s*(\d{6,15})/);
      if (idNumMatch) party.id_number = clean(idNumMatch[1]);
      const capMatch = t.match(
        /(?:الصفة\s*(?:في\s*الدعوى|القانونية)?|صفة)\s*[:\-]?\s*([^\n|،]{2,40})/,
      );
      if (capMatch) party.capacity = clean(capMatch[1]);
      const poaMatch = t.match(/(?:الوكالة|حالة\s*الوكالة)\s*[:\-]?\s*([^\n|،]{2,40})/);
      if (poaMatch) party.poa_status = clean(poaMatch[1]);
      return party;
    }

    $all("table").forEach((table) => {
      const headers = $all("thead th, thead td, tr:first-child th, tr:first-child td", table).map(
        text,
      );
      const hasPartyHeader = headers.some((h) =>
        /الاسم|الصفة|المدعي|المدعي\s*عليه|الهوية|الجنسية/.test(h),
      );
      if (!hasPartyHeader) return;
      const matchKey = _extractPartyFromRow();
      const colKeys = headers.map(matchKey);
      const rows = $all("tbody tr", table).length ? $all("tbody tr", table) : $all("tr", table);
      rows.forEach((row, i) => {
        if (i === 0 && $all("th", row).length && !$all("td", row).length) return;
        const cells = $all("td, th", row).map(text);
        if (cells.length < 2) return;
        const party = {};
        cells.forEach((v, j) => {
          const k = colKeys[j];
          if (k && v) party[k] = v;
        });
        if (!party.name && !party.id_number) return;
        parties.push(party);
      });
    });

    const partiesSection = [];
    $all(
      "[class*='party'], [class*='parties'], [class*='خصم'], [class*='طرف'], [class*='litigant']",
    ).forEach((el) => {
      partiesSection.push(el);
    });
    if (partiesSection.length === 0) {
      $all("div, section").forEach((el) => {
        const t = clean(el.innerText || "");
        if (t.length > 2000 || t.length < 10) return;
        if (/أطراف\s*الدعوي|أطراف\s*الدعوى/.test(t) && /المدعي|المدعي\s*عليه/.test(t)) {
          partiesSection.push(el);
        }
      });
    }
    partiesSection.forEach((section) => {
      const items = section.querySelectorAll(
        "[class*='item'], [class*='row'], tr, li, [class*='card'], [class*='entry']",
      );
      const targets = items.length ? Array.from(items) : [section];
      targets.forEach((item) => {
        const t = clean(item.innerText || "");
        if (!t || t.length < 5 || t.length > 500) return;
        if (!/المدعي|المدعي\s*عليه|خصم|طرف/.test(t)) return;
        const party = _extractPartyFromText(t);
        if (/مدعي\s*عليه|مدعى\s*عليه/.test(t)) party.party_role = "defendant";
        else if (/مدعي$|مدعي\s/.test(t) || /plaintiff/i.test(t)) party.party_role = "plaintiff";
        if (party.name || party.id_number) {
          const exists = parties.some(
            (p) => p.name === party.name && p.id_number === party.id_number,
          );
          if (!exists) parties.push(party);
        }
      });
    });

    return parties;
  }

  function scrapeCaseSessionsDetail() {
    const sessions = [];

    $all("table").forEach((table) => {
      const headers = $all("thead th, thead td, tr:first-child th, tr:first-child td", table).map(
        text,
      );
      const hasSessionHeader = headers.some((h) =>
        /الجلسة|التاريخ|الوقت|المحكمة|الدائرة|حالة|الدرجة|الية/.test(h),
      );
      if (!hasSessionHeader) return;
      const matchKey = (t) => {
        const c = clean(t);
        if (/حالة\s*الجلسة|حالة/.test(c)) return "session_status";
        if (/المحكمة|اسم\s*المحكمة/.test(c)) return "court_name";
        if (/الدائرة|رقم\s*الدائرة/.test(c)) return "circuit_number";
        if (/الية|آلية|الية\s*الانعقاد/.test(c)) return "mechanism";
        if (/الدرجة|درجة/.test(c)) return "degree";
        if (/التاريخ|تاريخ\s*الجلسة/.test(c)) return "session_date";
        if (/الوقت|وقت\s*الجلسة/.test(c)) return "session_time";
        if (/التفاصيل|تفاصيل\s*الجلسة/.test(c)) return "session_details";
        return null;
      };
      const colKeys = headers.map(matchKey);
      const rows = $all("tbody tr", table).length ? $all("tbody tr", table) : $all("tr", table);
      rows.forEach((row, i) => {
        if (i === 0 && $all("th", row).length && !$all("td", row).length) return;
        const cells = $all("td, th", row).map(text);
        if (cells.length < 2) return;
        const s = {};
        cells.forEach((v, j) => {
          const k = colKeys[j];
          if (k && v) s[k] = v;
        });
        if (s.session_date) s.session_date = parseDateISO(s.session_date) || s.session_date;
        if (s.session_date || s.session_status) sessions.push(s);
      });
    });

    $all("dt").forEach((dt) => {
      const label = clean(dt.textContent);
      const dd = dt.nextElementSibling;
      if (!dd || dd.tagName !== "DD") return;
      const value = clean(dd.textContent);
      if (!label || !value) return;
    });

    const sessionContainers = [];
    $all("[class*='session'], [class*='hearing'], [class*='جلسة']").forEach((el) =>
      sessionContainers.push(el),
    );
    if (sessionContainers.length === 0) {
      $all("div, section").forEach((el) => {
        const t = clean(el.innerText || "");
        if (t.length > 2000 || t.length < 10) return;
        if (/الجلسات/.test(t) && /التاريخ|المحكمة|الدرجة/.test(t)) sessionContainers.push(el);
      });
    }
    sessionContainers.forEach((container) => {
      const items = container.querySelectorAll(
        "[class*='item'], [class*='row'], tr, li, [class*='card'], [class*='entry']",
      );
      const targets = items.length ? Array.from(items) : [container];
      targets.forEach((item) => {
        const t = clean(item.innerText || "");
        if (!t || t.length < 5 || t.length > 600) return;
        if (!/جلسة|التاريخ|المحكمة/.test(t)) return;
        const s = {};
        const statusMatch = t.match(/(?:حالة\s*الجلسة|حالة\s*الجلس)\s*[:\-]?\s*([^\n|،]{2,40})/);
        if (statusMatch) s.session_status = clean(statusMatch[1]);
        const courtMatch = t.match(/(?:المحكمة|اسم\s*المحكمة)\s*[:\-]?\s*([^\n|،]{2,60})/);
        if (courtMatch) s.court_name = clean(courtMatch[1]);
        const circuitMatch = t.match(/(?:الدائرة|رقم\s*الدائرة)\s*[:\-]?\s*([^\n|،]{1,30})/);
        if (circuitMatch) s.circuit_number = clean(circuitMatch[1]);
        const mechMatch = t.match(/(?:الية|آلية)\s*(?:الانعقاد)?\s*[:\-]?\s*([^\n|،]{2,40})/);
        if (mechMatch) s.mechanism = clean(mechMatch[1]);
        const degMatch = t.match(/(?:الدرجة)\s*[:\-]?\s*([^\n|،]{1,20})/);
        if (degMatch) s.degree = clean(degMatch[1]);
        const dateMatch = t.match(
          /(?:التاريخ|تاريخ\s*الجلسة)\s*[:\-]?\s*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4}|\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2}|\d{1,2}[\/\-]\d{1,2}[\/\-]14\d{2})/,
        );
        if (dateMatch) s.session_date = parseDateISO(dateMatch[1]) || dateMatch[1];
        const timeMatch = t.match(/(?:الوقت)\s*[:\-]?\s*(\d{1,2}:\d{2}(?:\s*[صم])?)/);
        if (timeMatch) s.session_time = clean(timeMatch[1]);
        const detMatch = t.match(/(?:تفاصيل|تفاصيل\s*الجلسة)\s*[:\-]?\s*([^\n]{2,300})/);
        if (detMatch) s.session_details = clean(detMatch[1]);
        if (s.session_date || s.session_status) {
          const exists = sessions.some(
            (ex) => ex.session_date === s.session_date && ex.court_name === s.court_name,
          );
          if (!exists) sessions.push(s);
        }
      });
    });

    return sessions;
  }

  function scrapeCaseJudgments() {
    const judgments = [];

    $all("table").forEach((table) => {
      const headers = $all("thead th, thead td, tr:first-child th, tr:first-child td", table).map(
        text,
      );
      const hasJudgmentHeader = headers.some((h) =>
        /الصك|الحكم|نهائي|الدائرة|الدرجة|المحكمة|تاريخ\s*الصك|تاريخ\s*الحكم/.test(h),
      );
      if (!hasJudgmentHeader) return;
      const matchKey = (t) => {
        const c = clean(t);
        if (/نهائي|قطعي/.test(c)) return "judgment_finality";
        if (/رقم\s*الصك|رقم\s*الحكم|الصك/.test(c)) return "deed_number";
        if (/تاريخ\s*صك\s*الحكم|تاريخ\s*صك|تاريخ\s*الحكم/.test(c)) return "deed_date";
        if (/المحكمة/.test(c)) return "court";
        if (/الدائرة/.test(c)) return "circuit";
        if (/الدرجة/.test(c)) return "degree";
        if (/تاريخ\s*صك\s*الاستئناف|تاريخ\s*استئناف|صك\s*الاستئناف/.test(c))
          return "appeal_deed_date";
        if (/دائرة\s*الاستئناف|دائرة\s*استئناف/.test(c)) return "appeal_circuit";
        if (/تفاصيل|تفاصيل\s*الحكم/.test(c)) return "judgment_details";
        return null;
      };
      const colKeys = headers.map(matchKey);
      const rows = $all("tbody tr", table).length ? $all("tbody tr", table) : $all("tr", table);
      rows.forEach((row, i) => {
        if (i === 0 && $all("th", row).length && !$all("td", row).length) return;
        const cells = $all("td, th", row).map(text);
        if (cells.length < 2) return;
        const j = {};
        cells.forEach((v, ci) => {
          const k = colKeys[ci];
          if (k && v) j[k] = v;
        });
        if (j.deed_date) j.deed_date = parseDateISO(j.deed_date) || j.deed_date;
        if (j.appeal_deed_date)
          j.appeal_deed_date = parseDateISO(j.appeal_deed_date) || j.appeal_deed_date;
        if (j.deed_number || j.judgment_details) judgments.push(j);
      });
    });

    const judgmentContainers = [];
    $all("[class*='judgment'], [class*='deed'], [class*='حكم'], [class*='صك']").forEach((el) =>
      judgmentContainers.push(el),
    );
    if (judgmentContainers.length === 0) {
      $all("div, section").forEach((el) => {
        const t = clean(el.innerText || "");
        if (t.length > 3000 || t.length < 10) return;
        if (/الأحكام|الاحكام/.test(t) && /الصك|الحكم|المحكمة/.test(t)) judgmentContainers.push(el);
      });
    }
    judgmentContainers.forEach((container) => {
      const items = container.querySelectorAll(
        "[class*='item'], [class*='row'], tr, li, [class*='card'], [class*='entry']",
      );
      const targets = items.length ? Array.from(items) : [container];
      targets.forEach((item) => {
        const t = clean(item.innerText || "");
        if (!t || t.length < 5 || t.length > 800) return;
        if (!/صك|حكم|الأحكام/.test(t)) return;
        const j = {};
        const finalityMatch = t.match(/(نهائي|غير\s*قطعي|قطعي|ابتدائي)/);
        if (finalityMatch) j.judgment_finality = finalityMatch[1];
        const deedNumMatch = t.match(/(?:رقم\s*الصك|رقم\s*الحكم)\s*[:\-]?\s*(\d{4,})/);
        if (deedNumMatch) j.deed_number = deedNumMatch[1];
        const deedDateMatch = t.match(
          /(?:تاريخ\s*صك\s*الحكم|تاريخ\s*صك|تاريخ\s*الحكم)\s*[:\-]?\s*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4}|\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2}|\d{1,2}[\/\-]\d{1,2}[\/\-]14\d{2})/,
        );
        if (deedDateMatch) j.deed_date = parseDateISO(deedDateMatch[1]) || deedDateMatch[1];
        const courtMatch = t.match(/(?:المحكمة)\s*[:\-]?\s*([^\n|،]{2,60})/);
        if (courtMatch) j.court = clean(courtMatch[1]);
        const circuitMatch = t.match(/(?:الدائرة)\s*[:\-]?\s*([^\n|،]{1,30})/);
        if (circuitMatch) j.circuit = clean(circuitMatch[1]);
        const degMatch = t.match(/(?:الدرجة)\s*[:\-]?\s*([^\n|،]{1,20})/);
        if (degMatch) j.degree = clean(degMatch[1]);
        const appealDateMatch = t.match(
          /(?:تاريخ\s*صك\s*الاستئناف|تاريخ\s*الاستئناف)\s*[:\-]?\s*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4}|\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2}|\d{1,2}[\/\-]\d{1,2}[\/\-]14\d{2})/,
        );
        if (appealDateMatch)
          j.appeal_deed_date = parseDateISO(appealDateMatch[1]) || appealDateMatch[1];
        const appealCircuitMatch = t.match(
          /(?:دائرة\s*الاستئناف|دائرة\s*استئناف)\s*[:\-]?\s*([^\n|،]{1,30})/,
        );
        if (appealCircuitMatch) j.appeal_circuit = clean(appealCircuitMatch[1]);
        const detMatch = t.match(/(?:تفاصيل|تفاصيل\s*الحكم)\s*[:\-]?\s*([^\n]{2,400})/);
        if (detMatch) j.judgment_details = clean(detMatch[1]);
        if (j.deed_number || j.judgment_details) {
          const exists = judgments.some((ex) => ex.deed_number === j.deed_number && j.deed_number);
          if (!exists) judgments.push(j);
        }
      });
    });

    return judgments;
  }

  function scrapeLawsuitRequests() {
    const requests = [];

    $all("table").forEach((table) => {
      const headers = $all("thead th, thead td, tr:first-child th, tr:first-child td", table).map(
        text,
      );
      const hasRequestHeader = headers.some((h) =>
        /نوع\s*الطلب|الطلب|التسبيبات|أسباب|الطلبات/.test(h),
      );
      if (!hasRequestHeader) return;
      const matchKey = (t) => {
        const c = clean(t);
        if (/رقم\s*الطلب/.test(c)) return "request_number";
        if (/تاريخ\s*(?:تقديم\s*)?الطلب/.test(c)) return "request_date";
        if (/حالة\s*الطلب/.test(c)) return "request_status";
        if (/رقم\s*القضية|رقم\s*الدعوى/.test(c)) return "case_number";
        if (/تاريخ\s*القضية|تاريخ\s*الدعوى/.test(c)) return "case_date";
        if (/المحكمة|اسم\s*المحكمة/.test(c)) return "court_name";
        if (/الدائرة|رقم\s*الدائرة/.test(c)) return "circuit_number";
        if (/حالة\s*القضية|حالة\s*الدعوى|حالة/.test(c)) return "case_status";
        if (/تصنيف\s*القضية|التصنيف/.test(c)) return "case_classification";
        if (/نوع\s*القضية|نوع\s*الدعوى/.test(c)) return "case_type_detail";
        if (/مقدم\s*الطلب/.test(c)) return "applicant_name";
        if (/نوع\s*الطلب|الطلب/.test(c)) return "request_type";
        if (/رقم\s*الحكم/.test(c)) return "judgment_number";
        if (/التسبيبات|تسبيبات/.test(c)) return "submissions";
        if (/أسباب\s*الطلب|أسباب/.test(c)) return "request_reasons";
        return null;
      };
      const colKeys = headers.map(matchKey);
      const rows = $all("tbody tr", table).length ? $all("tbody tr", table) : $all("tr", table);
      rows.forEach((row, i) => {
        if (i === 0 && $all("th", row).length && !$all("td", row).length) return;
        const cells = $all("td, th", row).map(text);
        if (cells.length < 2) return;
        const r = {};
        cells.forEach((v, j) => {
          const k = colKeys[j];
          if (k && v) r[k] = v;
        });
        if (r.case_number) requests.push(r);
      });
    });

    const requestContainers = [];
    $all("[class*='request'], [class*='طلب']").forEach((el) => requestContainers.push(el));
    if (requestContainers.length === 0) {
      $all("div, section").forEach((el) => {
        const t = clean(el.innerText || "");
        if (t.length > 3000 || t.length < 15) return;
        if (/طلبات|الطلبات|طلب/.test(t) && /نوع\s*الطلب|القضية|التسبيبات|أسباب/.test(t))
          requestContainers.push(el);
      });
    }
    requestContainers.forEach((container) => {
      const items = container.querySelectorAll(
        "[class*='item'], [class*='row'], tr, li, [class*='card'], [class*='entry']",
      );
      const targets = items.length ? Array.from(items) : [container];
      targets.forEach((item) => {
        const t = clean(item.innerText || "");
        if (!t || t.length < 10 || t.length > 800) return;
        if (!/طلب/.test(t)) return;
        const r = {};
        const cnMatch = t.match(
          /(?:رقم\s*القضية|رقم\s*الدعوى)\s*[:\-]?\s*(\d{4}\s*\/\s*\d{3,}|\d{9,})/,
        );
        if (cnMatch) r.case_number = cnMatch[1].replace(/\s/g, "");
        const cdMatch = t.match(
          /(?:تاريخ\s*القضية|تاريخ\s*الدعوى)\s*[:\-]?\s*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4}|\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2}|\d{1,2}[\/\-]\d{1,2}[\/\-]14\d{2})/,
        );
        if (cdMatch) r.case_date = parseDateISO(cdMatch[1]) || cdMatch[1];
        const courtMatch = t.match(/(?:المحكمة|اسم\s*المحكمة)\s*[:\-]?\s*([^\n|،]{2,60})/);
        if (courtMatch) r.court_name = clean(courtMatch[1]);
        const circuitMatch = t.match(/(?:الدائرة|رقم\s*الدائرة)\s*[:\-]?\s*([^\n|،]{1,30})/);
        if (circuitMatch) r.circuit_number = clean(circuitMatch[1]);
        const statusMatch = t.match(
          /(?:حالة\s*(?:القضية|الدعوى|الطلب))\s*[:\-]?\s*([^\n|،]{2,40})/,
        );
        if (statusMatch) r.case_status = clean(statusMatch[1]);
        const classMatch = t.match(/(?:تصنيف\s*(?:القضية|الدعوى))\s*[:\-]?\s*([^\n|،]{2,40})/);
        if (classMatch) r.case_classification = clean(classMatch[1]);
        const typeMatch = t.match(/(?:نوع\s*(?:القضية|الدعوى|الطلب))\s*[:\-]?\s*([^\n|،]{2,40})/);
        if (typeMatch) {
          if (/نوع\s*القضية|نوع\s*الدعوى/.test(typeMatch[0]))
            r.case_type_detail = clean(typeMatch[1]);
          else r.request_type = clean(typeMatch[1]);
        }
        const jnMatch = t.match(/(?:رقم\s*الحكم)\s*[:\-]?\s*(\d{4,})/);
        if (jnMatch) r.judgment_number = jnMatch[1];
        const rnMatch = t.match(/(?:رقم\s*الطلب)\s*[:\-]?\s*(\d{4,})/);
        if (rnMatch) r.request_number = rnMatch[1];
        const rdMatch = t.match(/(?:تاريخ\s*(?:تقديم\s*)?الطلب)\s*[:\-]?\s*([\d\/\-\s]{6,14})/);
        if (rdMatch) r.request_date = parseDateISO(rdMatch[1]) || undefined;
        const rsMatch = t.match(/(?:حالة\s*الطلب)\s*[:\-]?\s*([^\n|،]{2,40})/);
        if (rsMatch) r.request_status = clean(rsMatch[1]);
        const appMatch = t.match(
          /(?:مقدم\s*الطلب|بيانات\s*مقدم\s*الطلب)\s*[:\-]?\s*([^\n|،]{2,60})/,
        );
        if (appMatch) r.applicant_name = clean(appMatch[1]);
        const subMatch = t.match(/(?:التسبيبات|تسبيبات)\s*[:\-]?\s*([^\n]{2,400})/);
        if (subMatch) r.submissions = clean(subMatch[1]);
        const reasonsMatch = t.match(/(?:أسباب\s*الطلب|أسباب)\s*[:\-]?\s*([^\n]{2,400})/);
        if (reasonsMatch) r.request_reasons = clean(reasonsMatch[1]);

        for (let idx = 1; idx <= 6; idx++) {
          const reasonLabels = [
            `السبب ${idx}`,
            `سبب ${idx}`,
            `السبب ${["الأول", "الثاني", "الثالث", "الرابع", "الخامس", "السادس"][idx - 1]}`,
            `reason_${idx}`,
            `reason${idx}`,
          ];
          for (const lbl of reasonLabels) {
            const re = new RegExp(
              lbl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\s*[:\\-–]?\\s*([^\\n|،]{2,300})",
            );
            const m = t.match(re);
            if (m) {
              r[`reason_${idx}`] = clean(m[1]);
              break;
            }
          }
        }

        if (r.case_number || r.request_type) {
          const exists = requests.some(
            (ex) => ex.case_number === r.case_number && ex.request_type === r.request_type,
          );
          if (!exists) requests.push(r);
        }
      });
    });

    return requests;
  }

  // ماسح تفاصيل طلب التنفيذ — يُستخدم في وضع التعمق داخل صفحة تفاصيل الطلب
  function scrapeExecutionDetail() {
    const fields = {};
    const body = toAsciiDigits(document.body.innerText || "");
    fields.execution_number = _findValueByLabel(["رقم طلب التنفيذ", "رقم الطلب", "رقم التنفيذ"]);
    if (!fields.execution_number) {
      const m =
        body.match(/رقم\s*(?:طلب\s*)?التنفيذ\s*[:\-]?\s*(\d{6,})/) ||
        location.pathname.match(/(\d{6,})/);
      if (m) fields.execution_number = m[1];
    }
    fields.status = _findValueByLabel(["حالة الطلب", "حالة طلب التنفيذ", "الحالة"]);
    fields.request_type = _findValueByLabel(["نوع الطلب", "نوع السند", "نوع سند التنفيذ"]);
    // المنفذ ضده أولاً (الأكثر تحديداً) ثم المنفذ/طالب التنفيذ
    fields.debtor_name = _findValueByLabel([
      "اسم المنفذ ضده",
      "المنفذ ضده",
      "المنفذ عليه",
      "المدين",
    ]);
    const credMatch = body.match(
      /(?:طالب\s*التنفيذ|المنفذ\s*له|اسم\s*المنفذ(?!\s*ضده|\s*عليه))\s*[:\-]?\s*([^\n|،]{2,60})/,
    );
    fields.creditor_name =
      _findValueByLabel(["اسم طالب التنفيذ", "طالب التنفيذ", "المنفذ له"]) ||
      (credMatch ? clean(credMatch[1]) : undefined);
    fields.debtor_id_number = _findValueByLabel(["هوية المنفذ ضده", "رقم هوية المنفذ ضده"]);
    fields.creditor_id_number = _findValueByLabel([
      "هوية طالب التنفيذ",
      "رقم هوية طالب التنفيذ",
      "هوية المنفذ له",
    ]);
    if (!fields.creditor_id_number || !fields.debtor_id_number) {
      const ids = body.match(/رقم\s*الهوية\s*[:\-]?\s*(\d{8,12})/g) || [];
      const nums = ids.map((s) => (s.match(/(\d{8,12})/) || [])[1]).filter(Boolean);
      if (!fields.creditor_id_number && nums[0]) fields.creditor_id_number = nums[0];
      if (!fields.debtor_id_number && nums[1]) fields.debtor_id_number = nums[1];
    }
    fields.court = _findValueByLabel(["محكمة التنفيذ", "اسم المحكمة", "المحكمة"]);
    fields.amount = parseAmount(
      _findValueByLabel(["مبلغ التنفيذ", "قيمة المطالبة", "المبلغ", "مبلغ المطالبة"]),
    );
    fields.filed_date = _findValueByLabel(["تاريخ تقديم الطلب", "تاريخ الطلب", "تاريخ الإيداع"]);
    fields.filed_date_iso = parseDateISO(fields.filed_date);
    fields.execution_data = extractSectionText([
      "بيانات طلب التنفيذ",
      "بيانات الطلب",
      "تفاصيل الطلب",
      "بيانات السند",
      "بيانات سند التنفيذ",
    ]);
    return fields;
  }

  // =====================================================
  // الطلبات على القضايا — التعمق الدقيق (v4.8)
  // =====================================================
  // يجد بطاقات الطلبات في صفحة القائمة، ويستخرج من كل بطاقة رقم الطلب
  // (وهو هدف النقر للدخول إلى التفاصيل) + الحقول الظاهرة في البطاقة نفسها.
  function findRequestCards() {
    const out = [];
    const seen = new Set();
    const labelValuePairs = (rawText) => {
      // يدعم الشكلين: "رقم الطلب: 123" و "رقم الطلب" في سطر والقيمة في السطر التالي
      const fields = {};
      const lines = toAsciiDigits(rawText || "")
        .split(/\n+/)
        .map((s) => s.trim())
        .filter(Boolean);
      const labelMap = [
        [/رقم\s*الطلب/, "request_number"],
        [/تاريخ\s*(?:تقديم\s*)?الطلب/, "request_date"],
        [/نوع\s*الطلب/, "request_type"],
        [/مقدم\s*الطلب/, "applicant_name"],
        [/رقم\s*القضية|رقم\s*الدعوى/, "case_number"],
        [/تاريخ\s*القضية|تاريخ\s*الدعوى/, "case_date"],
        [/حالة\s*الطلب/, "request_status"],
        [/^الحالة$/, "request_status"],
        [/المحكمة/, "court_name"],
        [/الدائرة/, "circuit_number"],
      ];
      for (let i = 0; i < lines.length; i++) {
        const ln = clean(lines[i]);
        for (const [re, key] of labelMap) {
          const lblOnly = ln.replace(/[:：\-–\s]+$/, "");
          if (!re.test(lblOnly) || lblOnly.length > 30) continue;
          // القيمة بعد النقطتين في نفس السطر أو في السطر التالي
          let val = "";
          const parts = ln.split(/[:：]/);
          if (parts.length >= 2) val = clean(parts.slice(1).join(":"));
          if (!val && i + 1 < lines.length) {
            const next = clean(lines[i + 1]);
            const isNextLabel = labelMap.some(
              ([r]) => r.test(next.replace(/[:：\-–\s]+$/, "")) && next.length <= 30,
            );
            if (!isNextLabel) val = next;
          }
          if (val && !fields[key]) fields[key] = val.slice(0, 200);
        }
      }
      return fields;
    };

    const candidates = $all(
      "tr, [role='row'], [class*='row'], [class*='item'], [class*='card'], [class*='list'], li, section, div",
    );
    for (const el of candidates) {
      if (el.children.length > 25) continue;
      const raw = el.innerText || "";
      const t = clean(raw);
      if (!t || t.length < 15 || t.length > 900) continue;
      if (!/رقم\s*الطلب/.test(t)) continue;
      const allNums = [...t.matchAll(/رقم\s*الطلب\s*[:：\-–]?\s*(\d{7,15})/g)].map((m) => m[1]);
      if (allNums.length !== 1) continue; // نتجاهل الحاويات الأبوية التي تضم أكثر من طلب
      const rn = allNums[0];
      if (seen.has(rn)) continue;
      seen.add(rn);
      const listFields = labelValuePairs(raw);
      listFields.request_number = rn;
      out.push({
        url: "__CLICK__",
        clickTarget: true,
        identifier: rn,
        listFields,
        rowText: t.slice(0, 200),
      });
    }
    return out;
  }

  // نقر دقيق: يجد أعمق عنصر يعرض الرقم المطلوب (خانة رقم الطلب في البطاقة)
  // ثم يصعد لأقرب عنصر قابل للنقر وينقر عليه بأحداث فأرة حقيقية.
  function clickNumberElement(identifier) {
    const id = String(identifier || "").replace(/\s/g, "");
    if (!id) return false;
    let best = null;
    let bestLen = Infinity;
    for (const el of $all(
      "a, button, td, th, span, p, strong, b, h1, h2, h3, h4, h5, h6, [role='button'], [role='link'], [role='cell'], [role='gridcell'], div, li",
    )) {
      if (el.children.length > 3) continue;
      const own = clean(el.innerText || el.textContent || "").replace(/\s/g, "");
      if (!own || !own.includes(id)) continue;
      if (own.length < bestLen) {
        best = el;
        bestLen = own.length;
      }
      if (own === id) break;
    }
    if (!best) return false;
    let target = best;
    let n = best;
    for (let hops = 0; n && hops < 7; hops++, n = n.parentElement) {
      const tag = (n.tagName || "").toLowerCase();
      const role = n.getAttribute ? n.getAttribute("role") || "" : "";
      let cursor = "";
      try {
        cursor = getComputedStyle(n).cursor;
      } catch {}
      if (
        tag === "a" ||
        tag === "button" ||
        role === "button" ||
        role === "link" ||
        typeof n.onclick === "function" ||
        cursor === "pointer"
      ) {
        target = n;
        break;
      }
    }
    try {
      target.scrollIntoView({ behavior: "instant", block: "center" });
    } catch {}
    const fire = (type, Ctor) => {
      try {
        target.dispatchEvent(
          new (Ctor || MouseEvent)(type, { bubbles: true, cancelable: true, view: window }),
        );
      } catch {}
    };
    fire("pointerdown", window.PointerEvent);
    fire("mousedown");
    fire("pointerup", window.PointerEvent);
    fire("mouseup");
    try {
      target.click();
    } catch {
      fire("click");
    }
    return true;
  }

  // ماسح صفحة تفاصيل الطلب (تظهر بعد النقر على رقم الطلب):
  // بيانات القضية (جدول) + بيانات مقدم الطلب + رقم الحكم (قوائم منسدلة) + التسبيبات + أسباب الطلب
  function scrapeRequestDetail() {
    const f = {};
    const body = toAsciiDigits(document.body.innerText || "");

    // نوع الطلب من عنوان الصفحة — مثال: "طلب نقض"، "طلب استئناف"
    for (const h of $all(
      "h1, h2, h3, h4, [class*='title'], [class*='heading'], [class*='page-header']",
    )) {
      if (h.children.length > 3) continue;
      const t = clean(h.innerText || "");
      if (/^طلب\s+\S/.test(t) && t.length < 60 && !/الطلبات\s*عل/.test(t)) {
        f.request_type = t;
        break;
      }
    }

    // جدول "بيانات القضية" — رؤوس أعمدة: رقم القضية/تاريخ القضية/المحكمة/الدائرة/حالة القضية/تصنيف القضية/نوع القضية
    $all("table").forEach((table) => {
      if (f.case_number) return;
      const headers = $all("thead th, thead td", table).map(text);
      const altHeaders = headers.length
        ? headers
        : $all("tr:first-child th, tr:first-child td", table).map(text);
      if (!altHeaders.some((h) => /رقم\s*القضية/.test(h))) return;
      const bodyRows = $all("tbody tr", table).length
        ? $all("tbody tr", table)
        : $all("tr", table).slice(1);
      const row = bodyRows.find((r) => $all("td, th", r).map(text).some(Boolean));
      if (!row) return;
      const cells = $all("td, th", row).map(text);
      altHeaders.forEach((h, j) => {
        const v = cells[j];
        if (!v) return;
        if (/رقم\s*القضية/.test(h)) f.case_number = v.replace(/\s/g, "");
        else if (/تاريخ\s*القضية/.test(h)) f.case_date = v;
        else if (/حالة\s*القضية/.test(h)) f.case_status = v;
        else if (/تصنيف\s*القضية/.test(h)) f.case_classification = v;
        else if (/نوع\s*القضية/.test(h)) f.case_type_detail = v;
        else if (/المحكمة/.test(h)) f.court_name = v;
        else if (/الدائرة/.test(h)) f.circuit_number = v;
      });
    });

    // قيم النماذج (القوائم المنسدلة) ثم النص الظاهر كاحتياط
    f.applicant_name =
      _readFormValueByLabel(["بيانات مقدم الطلب", "مقدم الطلب"]) ||
      _findValueByLabel(["بيانات مقدم الطلب", "مقدم الطلب"]);
    f.judgment_number =
      _readFormValueByLabel(["رقم الحكم"]) ||
      (body.match(/رقم\s*الحكم\s*[:：\-–]?\s*(\d{4,})/) || [])[1];
    f.request_number =
      (body.match(/رقم\s*الطلب\s*[:：\-–]?\s*(\d{7,15})/) || [])[1] ||
      _readFormValueByLabel(["رقم الطلب"]) ||
      (location.pathname.match(/(\d{7,15})/) || [])[1];
    f.request_date = _findValueByLabel(["تاريخ تقديم الطلب", "تاريخ الطلب"]);
    f.request_status = _findValueByLabel(["حالة الطلب"]);
    if (!f.case_number) {
      const m = body.match(/رقم\s*القضية\s*[:：\-–]?\s*(\d{4}\s*\/\s*\d{3,}|\d{7,15})/);
      if (m) f.case_number = m[1].replace(/\s/g, "");
    }
    if (!f.case_date) f.case_date = _findValueByLabel(["تاريخ القضية"]);
    if (!f.court_name) f.court_name = _findValueByLabel(["المحكمة", "اسم المحكمة"]);
    if (!f.circuit_number) f.circuit_number = _findValueByLabel(["الدائرة", "رقم الدائرة"]);
    if (!f.case_status) f.case_status = _findValueByLabel(["حالة القضية"]);
    if (!f.case_classification) f.case_classification = _findValueByLabel(["تصنيف القضية"]);
    if (!f.case_type_detail) f.case_type_detail = _findValueByLabel(["نوع القضية"]);

    // الأقسام النصية الطويلة
    f.submissions =
      extractSectionText(["التسبيبات", "تسبيبات الطلب", "التسبيب"]) ||
      _readFormValueByLabel(["التسبيبات"]);
    f.request_reasons =
      extractSectionText(["أسباب الطلب", "اسباب الطلب"]) ||
      _readFormValueByLabel(["أسباب الطلب", "اسباب الطلب"]);

    // الأسباب المرقمة (السبب الأول..السادس)
    const ordinals = ["الأول", "الثاني", "الثالث", "الرابع", "الخامس", "السادس"];
    for (let idx = 1; idx <= 6; idx++) {
      const labels = [`السبب ${idx}`, `سبب ${idx}`, `السبب ${ordinals[idx - 1]}`];
      for (const lbl of labels) {
        const re = new RegExp(
          lbl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\s*[:：\\-–]?\\s*([^\\n]{2,300})",
        );
        const m = body.match(re);
        if (m) {
          f[`reason_${idx}`] = clean(m[1]);
          break;
        }
      }
    }

    return f;
  }

  function scrapePowerDetail() {
    const fields = {};
    const body = toAsciiDigits(document.body.innerText || "");

    // v4.8: رقم الوكالة + الأسماء + التواريخ + الحالة + أرقام الهوية — حتى لا تفقد صفوف التعمق بيانات القائمة
    fields.wakalah_number =
      _findValueByLabel(["رقم الوكالة", "رقم الصك"]) ||
      (body.match(/رقم\s*الوكالة\s*[:：\-–]?\s*(\d{5,15})/) || [])[1];
    if (fields.wakalah_number) fields.wakalah_number = fields.wakalah_number.replace(/\s/g, "");
    fields.issuer_name = _findValueByLabel(["اسم الموكل", "الموكل", "اسم المُوكِّل", "الأصيل"]);
    fields.agent_name = _findValueByLabel(["اسم الوكيل", "الوكيل"]);
    fields.status =
      _findValueByLabel(["حالة الوكالة", "حالة الصك", "الحالة"]) ||
      (body.match(/(?:^|\s)(سارية|منتهية|ملغاة|نافذة|موقوفة)(?:\s|$)/) || [])[1];
    fields.issue_date = _findValueByLabel([
      "تاريخ الإصدار",
      "تاريخ الاصدار",
      "تاريخ التحرير",
      "تاريخ إصدار الوكالة",
    ]);
    fields.issue_date_iso = parseDateISO(fields.issue_date);
    fields.expiry_date = _findValueByLabel([
      "تاريخ الانتهاء",
      "تاريخ الإنتهاء",
      "تاريخ انتهاء الوكالة",
      "تاريخ الصلاحية",
    ]);
    fields.expiry_date_iso = parseDateISO(fields.expiry_date);
    fields.issuer_id_number = _findValueByLabel([
      "رقم هوية الموكل",
      "هوية الموكل",
      "رقم هوية المُصدر",
      "هوية المُصدر",
      "رقم هوية المصدر",
    ]);
    fields.agent_id_number = _findValueByLabel(["رقم هوية الوكيل", "هوية الوكيل"]);
    if (!fields.issuer_id_number || !fields.agent_id_number) {
      const ids = [...body.matchAll(/رقم\s*الهوية\s*[:：\-–]?\s*(\d{8,12})/g)].map((m) => m[1]);
      if (!fields.issuer_id_number && ids[0]) fields.issuer_id_number = ids[0];
      if (!fields.agent_id_number && ids[1]) fields.agent_id_number = ids[1];
    }

    fields.issuer_entity = _findValueByLabel(["جهة الإصدار", "جهة الاصدار"]);
    fields.usage_method = _findValueByLabel([
      "كيفية الاستخدام",
      "كيفية الاستعمال",
      "طريقة الاستخدام",
    ]);
    fields.issuer_capacity = _findValueByLabel([
      "صفة المُصدر",
      "صفة المُوكِّل",
      "صفة المصدر",
      "صفة المُصدِّر",
    ]);
    fields.issuer_nationality = _findValueByLabel([
      "جنسية المُصدر",
      "جنسية المُوكِّل",
      "جنسية المصدر",
      "جنسية المُصدِّر",
    ]);
    fields.issuer_identity_type = _findValueByLabel([
      "نوع هوية المُصدر",
      "نوع هوية المُوكِّل",
      "نوع تعريف المُصدر",
    ]);
    fields.issuer_status_in_agency = _findValueByLabel([
      "حالة المُصدر في الوكالة",
      "حالة المُوكِّل في الوكالة",
      "حالة المصدر في الوكالة",
    ]);
    fields.agent_capacity = _findValueByLabel(["صفة الوكيل", "صفة المُوكَل"]);
    fields.agent_nationality = _findValueByLabel(["جنسية الوكيل", "جنسية المُوكَل"]);
    fields.agent_identity_type = _findValueByLabel(["نوع هوية الوكيل", "نوع تعريف الوكيل"]);
    fields.agent_status_in_agency = _findValueByLabel([
      "حالة الوكيل في الوكالة",
      "حالة المُوكَل في الوكالة",
    ]);
    fields.agency_clauses = _findValueByLabel(["بنود الوكالة", "البنود", "بنود"]);
    fields.agency_text = _findValueByLabel(["نص الوكالة", "النص"]);
    fields.agency_data = _findValueByLabel(["بيانات الوكالة", "البيانات"]);

    $all("dt").forEach((dt) => {
      const label = clean(dt.textContent);
      const dd = dt.nextElementSibling;
      if (!dd || dd.tagName !== "DD") return;
      const value = clean(dd.textContent);
      if (!label || !value) return;
      if (/جهة\s*الإصدار/.test(label)) fields.issuer_entity = fields.issuer_entity || value;
      if (/كيفية\s*الاستخدام/.test(label)) fields.usage_method = fields.usage_method || value;
      if (/صفة\s*(?:المُصدر|المُوكل|المصدر)/.test(label))
        fields.issuer_capacity = fields.issuer_capacity || value;
      if (/جنسية\s*(?:المُصدر|المُوكل|المصدر)/.test(label))
        fields.issuer_nationality = fields.issuer_nationality || value;
      if (/نوع\s*(?:هوية|تعريف)\s*(?:المُصدر|المُوكل|المصدر)/.test(label))
        fields.issuer_identity_type = fields.issuer_identity_type || value;
      if (/حالة\s*(?:المُصدر|المُوكل|المصدر)\s*في\s*الوكالة/.test(label))
        fields.issuer_status_in_agency = fields.issuer_status_in_agency || value;
      if (/صفة\s*الوكيل/.test(label)) fields.agent_capacity = fields.agent_capacity || value;
      if (/جنسية\s*الوكيل/.test(label))
        fields.agent_nationality = fields.agent_nationality || value;
      if (/نوع\s*(?:هوية|تعريف)\s*الوكيل/.test(label))
        fields.agent_identity_type = fields.agent_identity_type || value;
      if (/حالة\s*الوكيل\s*في\s*الوكالة/.test(label))
        fields.agent_status_in_agency = fields.agent_status_in_agency || value;
      if (/بنود\s*الوكالة/.test(label)) fields.agency_clauses = fields.agency_clauses || value;
      if (/نص\s*الوكالة/.test(label)) fields.agency_text = fields.agency_text || value;
      if (/بيانات\s*الوكالة/.test(label)) fields.agency_data = fields.agency_data || value;
    });

    $all("table").forEach((table) => {
      $all("tr", table).forEach((row) => {
        const cells = $all("td, th", row).map(text);
        if (cells.length === 2 && cells[0].length < 60 && cells[1]) {
          const l = cells[0],
            v = cells[1];
          if (/جهة\s*الإصدار/.test(l)) fields.issuer_entity = fields.issuer_entity || v;
          if (/كيفية\s*الاستخدام/.test(l)) fields.usage_method = fields.usage_method || v;
          if (/صفة\s*(?:المُصدر|المُوكل|المصدر)/.test(l))
            fields.issuer_capacity = fields.issuer_capacity || v;
          if (/جنسية\s*(?:المُصدر|المُوكل|المصدر)/.test(l))
            fields.issuer_nationality = fields.issuer_nationality || v;
          if (/نوع\s*(?:هوية|تعريف)\s*(?:المُصدر|المُوكل|المصدر)/.test(l))
            fields.issuer_identity_type = fields.issuer_identity_type || v;
          if (/حالة\s*(?:المُصدر|المُوكل|المصدر)\s*في/.test(l))
            fields.issuer_status_in_agency = fields.issuer_status_in_agency || v;
          if (/صفة\s*الوكيل/.test(l)) fields.agent_capacity = fields.agent_capacity || v;
          if (/جنسية\s*الوكيل/.test(l)) fields.agent_nationality = fields.agent_nationality || v;
          if (/نوع\s*(?:هوية|تعريف)\s*الوكيل/.test(l))
            fields.agent_identity_type = fields.agent_identity_type || v;
          if (/حالة\s*الوكيل\s*في/.test(l))
            fields.agent_status_in_agency = fields.agent_status_in_agency || v;
          if (/بنود\s*الوكالة/.test(l)) fields.agency_clauses = fields.agency_clauses || v;
          if (/نص\s*الوكالة/.test(l)) fields.agency_text = fields.agency_text || v;
          if (/بيانات\s*الوكالة/.test(l)) fields.agency_data = fields.agency_data || v;
        }
      });
    });

    return fields;
  }

  async function clickSidebarTab(labelOrLabels) {
    // يقبل نصاً واحداً أو مصفوفة صيغ (أطراف الدعوى/أطراف الدعوي...) — المطابقة مطبَّعة عربياً
    const labels = Array.isArray(labelOrLabels) ? labelOrLabels : [labelOrLabels];
    const matches = (t) => labels.some((l) => arIncludes(t, l));
    // Strategy 1: Look for elements with exact or partial text match in sidebar-like containers
    // Najiz uses Angular components with specific class patterns
    const sidebarSelectors = [
      "[class*='sidebar']",
      "[class*='side-bar']",
      "[class*='sidenav']",
      "[class*='side-nav']",
      "[class*='menu']",
      "[class*='nav-tabs']",
      "[class*='tabset']",
      "[class*='accordion']",
      "[role='tablist']",
      "[role='navigation']",
      "nav",
      "aside",
      ".mat-tab-list",
      ".nav",
      ".tabs",
    ];

    // First try to find a sidebar container, then look for clickable items within it
    for (const sidebarSel of sidebarSelectors) {
      const sidebars = $all(sidebarSel);
      for (const sidebar of sidebars) {
        const items = $all(
          "a, button, [role='tab'], li, [class*='item'], [class*='tab'], [class*='link'], span, div",
          sidebar,
        );
        for (const item of items) {
          const t = clean(item.textContent || item.innerText || "");
          if (!t || t.length > 80) continue;
          if (matches(t)) {
            try {
              // Scroll the item into view first
              item.scrollIntoView({ behavior: "instant", block: "center" });
              await sleep(300);
              item.click();
              await sleep(2000);
              // After clicking, scroll the main content area to load all data
              await autoScrollFull();
              return true;
            } catch {}
          }
        }
      }
    }

    // Strategy 2: Search the entire page for clickable elements with the label
    // This is a fallback for when the sidebar doesn't have distinctive classes
    const allClickable = $all(
      "a, button, [role='tab'], [role='button'], li, [class*='tab'], [class*='nav-item'], [class*='menu-item'], [class*='sidebar'] *, [class*='side'] *",
    );
    for (const el of allClickable) {
      const t = clean(el.textContent || el.innerText || "");
      if (!t || t.length > 60) continue;
      if (matches(t)) {
        // Verify this looks like a navigation element (not random text)
        const parent = el.parentElement;
        const parentClass = (parent?.className || "").toLowerCase();
        const isNavLike =
          /tab|nav|menu|side|list|item|link|btn|button|accordion/i.test(parentClass) ||
          parent?.getAttribute("role") === "tablist" ||
          parent?.tagName === "NAV" ||
          parent?.tagName === "ASIDE" ||
          parent?.tagName === "UL";
        if (isNavLike || t.length < 30) {
          try {
            el.scrollIntoView({ behavior: "instant", block: "center" });
            await sleep(300);
            el.click();
            await sleep(2000);
            await autoScrollFull();
            return true;
          } catch {}
        }
      }
    }

    // Strategy 3: Last resort - look for any element with the exact label text
    const allElements = $all("*");
    for (const el of allElements) {
      if (el.children.length > 5) continue;
      const t = normalizeArabic(el.textContent || el.innerText || "").replace(/[:\s]+$/, "");
      if (labels.some((l) => t === normalizeArabic(l))) {
        try {
          el.scrollIntoView({ behavior: "instant", block: "center" });
          await sleep(300);
          el.click();
          await sleep(2000);
          await autoScrollFull();
          return true;
        } catch {}
      }
    }

    return false;
  }

  function scrapeSidebarContent(sectionLabel) {
    const firstLabel = Array.isArray(sectionLabel) ? sectionLabel[0] : sectionLabel;
    const nsec = normalizeArabic(firstLabel);
    const result = { section: firstLabel };

    if (nsec.includes("اطراف")) {
      const plaintiffs = [];
      const defendants = [];
      $all("table").forEach((table) => {
        const headers = $all("thead th, thead td, tr:first-child th, tr:first-child td", table).map(
          text,
        );
        const rows = $all("tbody tr", table).length ? $all("tbody tr", table) : $all("tr", table);
        rows.forEach((row, i) => {
          if (i === 0 && $all("th", row).length && !$all("td", row).length) return;
          const cells = $all("td, th", row).map(text);
          if (cells.length < 2) return;
          const party = {};
          cells.forEach((v, j) => {
            const h = headers[j] || "";
            if (/الاسم|اسم\s*الخصم|اسم\s*الطرف/.test(h)) party.name = v;
            if (/الجنسية|جنسية/.test(h)) party.nationality = v;
            if (/نوع\s*الهوية|نوع\s*التعريف/.test(h)) party.id_type = v;
            if (/رقم\s*الهوية|رقم\s*التعريف|رقم\s*السجل/.test(h)) party.id_number = v;
            if (/الصفة|صفة\s*الخصم/.test(h)) party.capacity = v;
            if (/الوكالة|حالة\s*الوكالة/.test(h)) party.poa_status = v;
          });
          if (party.name || party.id_number) {
            const rowText = cells.join(" ");
            if (/مدعي\s*عليه|مدعى\s*عليه/.test(rowText)) defendants.push(party);
            else plaintiffs.push(party);
          }
        });
      });
      if (plaintiffs.length === 0 && defendants.length === 0) {
        const allParties = scrapeCaseParties();
        for (const p of allParties) {
          if (p.party_role === "defendant") defendants.push(p);
          else plaintiffs.push(p);
        }
      }
      result.plaintiffs = plaintiffs;
      result.defendants = defendants;
      return result;
    }

    if (nsec.includes("جلسات")) {
      result.sessions = scrapeCaseSessionsDetail();
      return result;
    }

    if (nsec.includes("احكام")) {
      result.judgments = scrapeCaseJudgments();
      return result;
    }

    if (nsec.includes("طلبات")) {
      result.requests = scrapeLawsuitRequests();
      return result;
    }

    result.fields = scrapeDetailPage();
    return result;
  }

  // =====================================================
  // API الرئيسي — sccrape() يُرجع payload بصيغة /api/public/najiz-sync
  // =====================================================
  window.__ADALA_NAJIZ__ = {
    detectKindFromUrl,
    autoScrollFull,
    clickSubTab,
    findDetailLinks,
    scrapeDetailPage,
    detailToSchema,
    scrapeCaseDetailFields,
    scrapeCaseParties,
    scrapeCaseSessionsDetail,
    scrapeCaseJudgments,
    scrapeLawsuitRequests,
    findRequestCards,
    clickNumberElement,
    scrapeRequestDetail,
    scrapePowerDetail,
    scrapeExecutionDetail,
    clickSidebarTab,
    scrapeSidebarContent,
    parseDateISO,
    extractSectionText,

    async scrape(kindFilter) {
      console.log("[منصة العدالة] بدء السحب — kindFilter:", kindFilter, "URL:", location.href);
      await autoScrollFull();
      await sleep(200);

      // اجمع من كل الماسحات المتخصصة (Hybrid)
      const allCases = scrapeLawsuitTable();
      const allPowers = scrapeAgencyTable();
      const allExecs = scrapeExecutionTable();
      const allSessions = [...scrapeSessionsTable(), ...scrapeDashboardCalendar()];
      const allJudgments = scrapeJudgmentTable();
      const allRequests = scrapeLawsuitRequestsTable();

      const urlKind = detectKindFromUrl();
      const focus = kindFilter || urlKind;

      // Aggressive fallback for cases — works on any layout (cards, virtual scroll, custom grid)
      if ((focus === "cases" || !focus) && allCases.length === 0) {
        const aggressive = scrapeCasesAggressive();
        console.log("[منصة العدالة] aggressive cases fallback found:", aggressive.length);
        allCases.push(...aggressive);
      }

      // ALWAYS run aggressive for sessions on dashboard/appointment pages
      if (focus === "sessions" || !focus) {
        const aggressive = scrapeSessionsAggressive();
        const existingKeys = new Set(
          allSessions.map((s) => `${s.fields?.session_date}|${s.fields?.case_number || ""}`),
        );
        const additions = aggressive.filter(
          (s) => !existingKeys.has(`${s.fields?.session_date}|${s.fields?.case_number || ""}`),
        );
        if (additions.length) {
          console.log("[منصة العدالة] aggressive sessions added:", additions.length);
          allSessions.push(...additions);
        }
      }

      // ALWAYS run aggressive for agencies — catches rows the table scraper missed (cards/grids/lazy-loaded)
      if (focus === "powers" || !focus) {
        const aggressive = scrapeAgenciesAggressive();
        const existingNumbers = new Set(allPowers.map((p) => p.fields?.wakalah_number));
        const additions = aggressive.filter((p) => !existingNumbers.has(p.fields?.wakalah_number));
        if (additions.length) {
          console.log("[منصة العدالة] aggressive agencies added:", additions.length);
          allPowers.push(...additions);
        }
      }

      // ALWAYS run aggressive for judgments — catches all on judgments page + cards layouts
      if (focus === "cases" || focus === "documents" || !focus) {
        const aggressive = scrapeJudgmentsAggressive();
        const existingDeeds = new Set(
          allJudgments.map((j) => j.fields?.deed_number).filter(Boolean),
        );
        const additions = aggressive.filter((j) => !existingDeeds.has(j.fields?.deed_number));
        if (additions.length) {
          console.log("[منصة العدالة] aggressive judgments added:", additions.length);
          allJudgments.push(...additions);
        }
      }

      // Aggressive fallback for lawsuit requests
      if (focus === "documents" || !focus) {
        if (allRequests.length === 0) {
          const aggressive = scrapeLawsuitRequestsAggressive();
          console.log("[منصة العدالة] aggressive requests fallback found:", aggressive.length);
          allRequests.push(...aggressive);
        }
      }

      // Merge requests into judgments stream (both go to documents in the system)
      allJudgments.push(
        ...allRequests.map((r) => ({
          _kind: "request",
          fields: {
            deed_number: r.fields?.request_number,
            case_number: r.fields?.case_number,
            judgment_type: r.fields?.request_type || "طلب على قضية",
            court: r.fields?.court,
            filed_date: r.fields?.filed_date,
            status: r.fields?.status,
          },
          text: r.text,
        })),
      );

      // Context-aware: when forced to "documents" on /lawsuit (the الأحكام/القرارات sub-tab),
      // capture EVERY visible table row as a judgment record, regardless of header text.
      // Also explicitly detects "الصك", "رقم الصك", "تاريخ الصك" as deed indicators.
      if (focus === "documents" && /\/lawsuit(?!\/requests)/i.test(location.href)) {
        const contextRows = [];
        // Look at page headers/labels for explicit deed terminology hint
        const pageHasDeedTerms = /الصك|رقم\s*الصك|تاريخ\s*الصك|رقم\s*الحكم|تاريخ\s*الحكم/.test(
          document.body.innerText || "",
        );
        $all("table").forEach((table) => {
          const headers = $all("thead th, thead td, tr:first-child th, tr:first-child td", table)
            .map(text)
            .join(" ");
          const tableHasDeedTerms = /الصك|رقم\s*الصك|تاريخ\s*الصك|رقم\s*الحكم|تاريخ\s*الحكم/.test(
            headers,
          );
          const rows = $all("tbody tr", table).length ? $all("tbody tr", table) : $all("tr", table);
          rows.forEach((row, i) => {
            if (i === 0 && $all("th", row).length && !$all("td", row).length) return;
            const cells = $all("td, th", row).map(text);
            if (cells.length < 2) return;
            const idMatch = cells.find((v) => /\d{4}\s*\/\s*\d{3,}|\d{9,}/.test(v));
            if (!idMatch) return;
            // Only emit if either page or table mentions deed/judgment terms
            if (!pageHasDeedTerms && !tableHasDeedTerms) return;
            const dateMatch = cells.find((v) =>
              /\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4}|\d{1,2}[\/\-]\d{1,2}[\/\-]14\d{2}/.test(v),
            );
            const id = (idMatch.match(/\d{4}\s*\/\s*\d{3,}|\d{9,}/) || [""])[0].replace(/\s/g, "");
            contextRows.push({
              _kind: "judgment",
              fields: {
                deed_number: id,
                case_number: id,
                judgment_type: cells.find((v) => /حكم|صك|قرار|قضائي/.test(v)) || "صك",
                court: cells.find((v) => /محكمة|دائرة/.test(v)),
                filed_date: dateMatch || undefined,
                status: cells.find((v) => /^(قطعي|ابتدائي|نهائي|مكتمل|قيد)/.test(v.trim())),
              },
              text: cells.join(" | "),
            });
          });
        });
        const existingDeeds = new Set(
          allJudgments.map((j) => j.fields?.deed_number).filter(Boolean),
        );
        const adds = contextRows.filter((r) => !existingDeeds.has(r.fields.deed_number));
        if (adds.length) {
          console.log("[منصة العدالة] context-aware deeds captured:", adds.length);
          allJudgments.push(...adds);
        }
      }

      console.log("[منصة العدالة] استخلاص خام:", {
        cases: allCases.length,
        powers: allPowers.length,
        executions: allExecs.length,
        sessions: allSessions.length,
        judgments: allJudgments.length,
        requests: allRequests.length,
        url: location.href,
      });

      if (focus === "cases" && allCases.length === 0) {
        collectCards(["القضية", "رقم القضية", "الموضوع", "الدعوى"]).forEach((el, i) => {
          const cn = fieldFromContainer(el, ["رقم القضية", "رقم الدعوى", "رقم"]);
          if (!cn) return;
          allCases.push({
            _kind: "case",
            fields: {
              case_number: cn,
              title: fieldFromContainer(el, ["الموضوع", "موضوع"]),
              court: fieldFromContainer(el, ["المحكمة"]),
              case_type: fieldFromContainer(el, ["النوع", "نوع القضية"]),
              status: fieldFromContainer(el, ["الحالة"]),
              plaintiff: fieldFromContainer(el, ["المدعي", "الموكل", "العميل"]),
            },
            text: clean(el.innerText || "").slice(0, 400),
          });
        });
      }
      if (focus === "powers" && allPowers.length === 0) {
        collectCards(["الوكالة", "رقم الوكالة", "الموكل", "الوكيل"]).forEach((el, i) => {
          const wn = fieldFromContainer(el, ["رقم الوكالة", "رقم"]);
          if (!wn) return;
          allPowers.push({
            _kind: "power",
            fields: {
              wakalah_number: wn,
              issuer_name: fieldFromContainer(el, ["الموكل", "اسم الموكل"]),
              agent_name: fieldFromContainer(el, ["الوكيل", "اسم الوكيل"]),
              issue_date: fieldFromContainer(el, ["تاريخ الإصدار", "تاريخ الاصدار"]),
              expiry_date: fieldFromContainer(el, ["تاريخ الانتهاء", "الانتهاء"]),
              scope: fieldFromContainer(el, ["النطاق", "نطاق"]),
            },
            text: clean(el.innerText || "").slice(0, 400),
          });
        });
      }
      if (focus === "executions" && allExecs.length === 0) {
        collectCards(["التنفيذ", "رقم الطلب", "المبلغ", "المنفذ"]).forEach((el, i) => {
          const en = fieldFromContainer(el, ["رقم الطلب", "رقم التنفيذ", "رقم"]);
          if (!en) return;
          allExecs.push({
            _kind: "execution",
            fields: {
              execution_number: en,
              court: fieldFromContainer(el, ["المحكمة"]),
              amount: fieldFromContainer(el, ["المبلغ"]),
              debtor_name: fieldFromContainer(el, ["المنفذ ضده", "المدين"]),
              status: fieldFromContainer(el, ["الحالة"]),
              filed_date: fieldFromContainer(el, ["تاريخ الإيداع", "التاريخ", "تاريخ تقديم الطلب"]),
            },
            text: clean(el.innerText || "").slice(0, 400),
          });
        });
      }

      // بناء الـ payload بصيغة API النظام
      const cases = toCasePayload(allCases);
      const powers = toPowerPayload(allPowers);
      const executions = toExecutionPayload(allExecs);
      const sessions = toSessionPayload(allSessions);
      const documents = toDocumentPayload(allJudgments);

      // كم سيتم إرسال؟
      const total =
        cases.length + powers.length + executions.length + sessions.length + documents.length;
      const sections = [];
      if (cases.length) sections.push("cases");
      if (powers.length) sections.push("powers");
      if (executions.length) sections.push("executions");
      if (sessions.length) sections.push("sessions");
      if (documents.length) sections.push("documents");

      // حدد kind: إذا كان فلتر — التزم به، وإلا استنتج
      let kind = "mixed";
      if (sections.length === 1) kind = sections[0];
      else if (kindFilter && sections.includes(kindFilter)) kind = kindFilter;
      else if (urlKind && sections.includes(urlKind)) kind = urlKind;

      const payload = {
        kind,
        sourceUrl: location.href.slice(0, 1000),
      };
      if (cases.length) payload.cases = cases;
      if (powers.length) payload.powers = powers;
      if (executions.length) payload.executions = executions;
      if (sessions.length) payload.sessions = sessions;
      if (documents.length) payload.documents = documents;

      // ==========================================================
      // إذا كنا داخل صفحة تفاصيل قضية (ملف القضية) — اسحب البيانات المعمقة أيضاً
      // موضوع الدعوى + طلبات المدعي + أسانيد الدعوى + الأطراف + الجلسات + الأحكام
      // ==========================================================
      try {
        const pageNorm = normalizeArabic(document.body.innerText || "");
        const isCaseDetailPage =
          pageNorm.includes("موضوع الدعوي") && pageNorm.includes("رقم القضيه");
        if (isCaseDetailPage) {
          const detail = scrapeCaseDetailFields();
          const caseNum = String(detail.case_number || "").replace(/\s/g, "");
          if (caseNum) {
            payload.case_details = [
              {
                case_number: caseNum.slice(0, 200),
                case_classification: detail.case_classification?.slice(0, 200),
                case_type_detail: detail.case_type_detail?.slice(0, 200),
                case_date: detail.case_date_iso,
                subject_matter: detail.subject_matter?.slice(0, 5000),
                plaintiff_requests: detail.plaintiff_requests?.slice(0, 5000),
                case_foundations: detail.case_foundations?.slice(0, 5000),
                court_name: detail.court_name?.slice(0, 200),
                circuit_number: detail.circuit_number?.slice(0, 100),
              },
            ];
            if (!(payload.cases || []).some((c) => c.case_number === caseNum)) {
              payload.cases = [
                ...(payload.cases || []),
                {
                  najiz_id: `case_${caseNum}`.slice(0, 120),
                  case_number: caseNum.slice(0, 200),
                  title: (detail.subject_matter || `قضية ${caseNum}`).slice(0, 500),
                  court: detail.court_name?.slice(0, 200),
                  case_type: detail.case_type_detail?.slice(0, 200),
                  opened_at: detail.case_date_iso,
                },
              ];
            }
            const parties = scrapeCaseParties();
            if (parties.length) {
              payload.case_parties = parties
                .map((p) => ({
                  case_number: caseNum,
                  party_type:
                    p.party_role === "defendant" ||
                    /مدعي عليه/.test(normalizeArabic(p.party_role || p.capacity || ""))
                      ? "defendant"
                      : "plaintiff",
                  party_name: (p.name || p.party_name || "").slice(0, 200) || undefined,
                  party_id_number: (p.id_number || "").slice(0, 200) || undefined,
                  party_nationality: (p.nationality || "").slice(0, 200) || undefined,
                  party_identity_type: (p.id_type || "").slice(0, 200) || undefined,
                  party_capacity: (p.capacity || "").slice(0, 200) || undefined,
                  party_status_in_case: (p.poa_status || "").slice(0, 200) || undefined,
                }))
                .filter((p) => p.party_name || p.party_id_number);
            }
            const sess = scrapeCaseSessionsDetail();
            if (sess.length) {
              payload.case_sessions_detail = sess.map((s) => ({
                case_number: caseNum,
                session_status: s.session_status?.slice(0, 200),
                court_name: s.court_name?.slice(0, 200),
                circuit_number: s.circuit_number?.slice(0, 200),
                mechanism: s.mechanism?.slice(0, 200),
                degree: s.degree?.slice(0, 200),
                session_date: parseDateISO(s.session_date),
                session_time: s.session_time?.slice(0, 200),
                session_details: s.session_details?.slice(0, 1000),
              }));
            }
            const judg = scrapeCaseJudgments();
            if (judg.length) {
              payload.case_judgments = judg.map((j) => ({
                case_number: caseNum,
                judgment_finality: j.judgment_finality?.slice(0, 200),
                deed_number: (j.deed_number || "").slice(0, 200) || undefined,
                deed_date: parseDateISO(j.deed_date),
                court_name: (j.court_name || j.court || "").slice(0, 200) || undefined,
                circuit_number: (j.circuit_number || j.circuit || "").slice(0, 200) || undefined,
                degree: j.degree?.slice(0, 200),
                appeal_deed_date: parseDateISO(j.appeal_deed_date),
                appeal_circuit_number:
                  (j.appeal_circuit_number || j.appeal_circuit || "").slice(0, 200) || undefined,
                judgment_details: j.judgment_details?.slice(0, 2000),
              }));
            }
            payload.kind = "mixed";
            console.log("[منصة العدالة] صفحة تفاصيل قضية — أُضيفت البيانات المعمقة:", caseNum);
          }
        }
      } catch (e) {
        console.warn("[adala] detail-page capture failed", e);
      }

      console.log("[منصة العدالة] payload نهائي:", {
        kind,
        total,
        cases: cases.length,
        powers: powers.length,
        executions: executions.length,
        sessions: sessions.length,
        documents: documents.length,
      });

      return payload;
    },
  };

  // =====================================================
  // زر عائم داخل صفحة ناجز
  // =====================================================
  function injectFab() {
    if (document.getElementById("adala-najiz-fab")) return;
    const fab = document.createElement("button");
    fab.id = "adala-najiz-fab";
    fab.title = "منصة العدالة — مزامنة بيانات ناجز";
    fab.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>`;
    const menu = document.createElement("div");
    menu.id = "adala-najiz-menu";
    menu.innerHTML = `
      <div class="ad-title">⚖️ منصة العدالة — مزامنة ناجز v4.8</div>
      <button class="ad-primary" id="ad-bot" style="background:linear-gradient(135deg,#16a34a,#065f46);color:#fff;border:1.5px solid #10b981;margin-bottom:6px">🚀 تشغيل البوت (سحب كل الصفحات)</button>
      <button class="ad-primary" data-k="">مزامنة الصفحة الحالية فقط</button>
      <div class="ad-grid">
        <button class="ad-chip" data-k="cases">القضايا</button>
        <button class="ad-chip" data-k="sessions">الجلسات</button>
        <button class="ad-chip" data-k="powers">الوكالات</button>
        <button class="ad-chip" data-k="executions">التنفيذ</button>
      </div>
      <div class="ad-status" id="ad-status"></div>`;
    document.body.appendChild(fab);
    document.body.appendChild(menu);
    fab.addEventListener("click", () => menu.classList.toggle("open"));

    const setS = (msg, cls) => {
      const s = menu.querySelector("#ad-status");
      s.className = "ad-status show " + cls;
      s.textContent = msg;
    };

    menu.querySelector("#ad-bot").addEventListener("click", async () => {
      try {
        const cfg = await chrome.storage.local.get(["baseUrl", "syncToken"]);
        if (!cfg.baseUrl || !cfg.syncToken) {
          setS("افتح الإعدادات وأدخل الرابط والرمز أولاً", "err");
          return;
        }
        setS("🤖 جارٍ تشغيل البوت التلقائي...", "info");
        chrome.runtime.sendMessage({
          type: "ADALA_AUTOPILOT_START_HERE",
          baseUrl: cfg.baseUrl,
          syncToken: cfg.syncToken,
        });
      } catch (e) {
        setS("خطأ: " + (e?.message || e), "err");
      }
    });

    menu.querySelectorAll("[data-k]").forEach((b) => {
      b.addEventListener("click", async () => {
        const kf = b.dataset.k || null;
        try {
          const cfg = await chrome.storage.local.get(["baseUrl", "syncToken"]);
          if (!cfg.baseUrl || !cfg.syncToken) {
            setS("افتح إعدادات الإضافة وأدخل الرابط والرمز أولاً", "err");
            return;
          }
          setS("جارٍ التمرير والسحب...", "info");
          const payload = await window.__ADALA_NAJIZ__.scrape(kf);
          const total =
            (payload.cases?.length || 0) +
            (payload.powers?.length || 0) +
            (payload.executions?.length || 0) +
            (payload.sessions?.length || 0) +
            (payload.documents?.length || 0) +
            (payload.case_details?.length || 0) +
            (payload.case_parties?.length || 0) +
            (payload.case_sessions_detail?.length || 0) +
            (payload.case_judgments?.length || 0) +
            (payload.lawsuit_requests?.length || 0);
          if (!total) {
            setS("لم يتم العثور على بيانات في هذه الصفحة", "err");
            return;
          }
          setS(`جارٍ إرسال ${total} عنصر إلى النظام...`, "info");
          const resp = await chrome.runtime.sendMessage({
            type: "ADALA_SYNC",
            baseUrl: cfg.baseUrl,
            syncToken: cfg.syncToken,
            payload,
          });
          if (resp?.ok) {
            const d = resp.data || {};
            setS(
              `✓ تمت المزامنة — ${d.total ?? total} عنصر · ${d.inserted ?? 0} جديد · ${d.updated ?? 0} محدّث`,
              "ok",
            );
            chrome.storage.local.set({ lastSync: new Date().toISOString() });
          } else setS("فشل: " + (resp?.error || "خطأ غير معروف"), "err");
        } catch (e) {
          setS("خطأ: " + (e?.message || e), "err");
        }
      });
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", injectFab);
  else injectFab();

  // استقبل أوامر السحب من popup عبر background
  chrome.runtime.onMessage?.addListener?.((msg, _sender, sendResponse) => {
    if (msg?.action === "SCRAPE_KIND") {
      window.__ADALA_NAJIZ__
        .scrape(msg.kind || null)
        .then((payload) => sendResponse({ ok: true, payload }))
        .catch((err) => sendResponse({ ok: false, error: err?.message || String(err) }));
      return true;
    }
    return false;
  });

  console.log(
    "[منصة العدالة v4.7] تمرير شامل + تعمق كامل (أطراف/جلسات/أحكام/طلبات) — نوع الصفحة:",
    detectKindFromUrl(),
  );
})();
