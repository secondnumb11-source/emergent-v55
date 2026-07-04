#!/usr/bin/env node
/**
 * Seed realistic test data for local development and CI Playwright runs.
 *
 * Creates a coherent set of:
 *   • clients (individuals + companies)
 *   • cases attached to those clients across different court types & statuses
 *   • documents attached to a subset of cases (in `documents` table only —
 *     Storage upload is skipped so this script has zero side effects on
 *     the storage bucket)
 *   • archived cases grouped by year/court so the archive screen has
 *     multiple groups to render
 *
 * Prereqs (same env as scripts/seed-test-accounts.sh):
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 * Optional:
 *   SEED_OWNER_EMAIL   which lawyer account owns the seeded rows
 *                      (default: lawyer@test.local — created by seed:test)
 *   SEED_CASES_PER     how many active cases to seed per court type (default 4)
 *   SEED_ARCHIVE_PER   how many archived cases per (year, court) group (default 3)
 *
 * Idempotent by "seed tag": every row it inserts is tagged with a
 * deterministic marker in `notes` / metadata so re-runs upsert cleanly
 * without duplicating data.
 *
 * Usage:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
 *     node scripts/seed-realistic-data.mjs
 */

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const OWNER_EMAIL = (process.env.SEED_OWNER_EMAIL || "lawyer@test.local").toLowerCase();
const CASES_PER = Number(process.env.SEED_CASES_PER || 4);
const ARCHIVE_PER = Number(process.env.SEED_ARCHIVE_PER || 3);
const SEED_TAG = "seed:realistic";

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("✗ SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
  process.exit(1);
}

const sb = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const COURTS = ["عام", "جزائي", "تجاري", "أحوال شخصية", "عمالي", "إداري"];
const STATUSES = ["نشطة", "قيد النظر", "معلقة", "مؤجلة"];
const ARCHIVE_YEARS = [2022, 2023, 2024, 2025];

const INDIVIDUALS = [
  "عبدالله بن محمد الغامدي",
  "فاطمة بنت سالم الحربي",
  "خالد بن يوسف القحطاني",
  "نورة بنت عبدالرحمن العتيبي",
  "سعد بن حمد الشمري",
  "منى بنت فيصل الدوسري",
];
const COMPANIES = [
  "شركة الأفق للتقنية المحدودة",
  "مؤسسة الرواسي للمقاولات",
  "شركة تجارة المستقبل",
  "مجموعة الرياض الاستثمارية",
];

function log(...a) {
  console.log("→", ...a);
}
function ok(...a) {
  console.log("  ✓", ...a);
}
function warn(...a) {
  console.warn("  !", ...a);
}

async function resolveOwnerId() {
  // Auth Admin listUsers is paginated; fetch pages until match found.
  for (let page = 1; page < 20; page++) {
    const { data, error } = await sb.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const hit = data.users.find((u) => (u.email || "").toLowerCase() === OWNER_EMAIL);
    if (hit) return hit.id;
    if (data.users.length < 200) break;
  }
  throw new Error(
    `No auth user with email=${OWNER_EMAIL}. Run \`bun run seed:test\` first, or set SEED_OWNER_EMAIL to an existing account.`,
  );
}

/** Upsert a row keyed by (owner_id, notes-tagged marker). */
async function upsertTagged(table, marker, payload) {
  const notes = `[${SEED_TAG}:${marker}] ${payload.notes || ""}`.trim();
  const row = { ...payload, notes };
  // Find by tag first.
  const { data: existing, error: findErr } = await sb
    .from(table)
    .select("id")
    .eq("owner_id", payload.owner_id)
    .ilike("notes", `%${SEED_TAG}:${marker}]%`)
    .limit(1);
  if (findErr) throw findErr;
  if (existing && existing[0]) {
    const { data, error } = await sb
      .from(table)
      .update(row)
      .eq("id", existing[0].id)
      .select("id")
      .single();
    if (error) throw error;
    return data.id;
  }
  const { data, error } = await sb.from(table).insert(row).select("id").single();
  if (error) throw error;
  return data.id;
}

async function seedClients(ownerId) {
  log(`clients (${INDIVIDUALS.length + COMPANIES.length})`);
  const ids = [];
  for (let i = 0; i < INDIVIDUALS.length; i++) {
    const name = INDIVIDUALS[i];
    const id = await upsertTagged("clients", `ind-${i}`, {
      owner_id: ownerId,
      full_name: name,
      client_type: "individual",
      phone: `+9665${String(1000000 + i * 7331).slice(0, 8)}`,
      email: `client.ind${i}@example.test`,
      national_id: `1${String(100000000 + i * 9973).slice(0, 9)}`,
      notes: "عميل تجريبي",
    });
    ids.push({ id, name });
  }
  for (let i = 0; i < COMPANIES.length; i++) {
    const name = COMPANIES[i];
    const id = await upsertTagged("clients", `co-${i}`, {
      owner_id: ownerId,
      full_name: name,
      client_type: "company",
      phone: `+9661${String(2000000 + i * 5171).slice(0, 8)}`,
      email: `contact${i}@company.test`,
      notes: "شركة تجريبية",
    });
    ids.push({ id, name });
  }
  ok(`${ids.length} clients ready`);
  return ids;
}

async function seedActiveCases(ownerId, clients) {
  log(`active cases (${CASES_PER} × ${COURTS.length} court types)`);
  const created = [];
  let n = 0;
  for (const court of COURTS) {
    for (let i = 0; i < CASES_PER; i++) {
      const client = clients[n % clients.length];
      const status = STATUSES[i % STATUSES.length];
      const id = await upsertTagged("cases", `active-${court}-${i}`, {
        owner_id: ownerId,
        client_id: client.id,
        case_number: `${court.slice(0, 2)}-${new Date().getFullYear()}-${String(100 + n).padStart(4, "0")}`,
        subject: `${court} — نزاع ${i + 1} (${client.name.split(" ")[0]})`,
        court_type: court,
        status,
        opened_at: new Date(Date.now() - (30 + i * 15) * 86_400_000).toISOString().slice(0, 10),
        notes: `قضية تجريبية للاختبار`,
      });
      created.push({ id, court, client });
      n++;
    }
  }
  ok(`${created.length} active cases ready`);
  return created;
}

async function seedDocuments(ownerId, cases) {
  log(`documents (metadata only, no storage upload)`);
  const sample = cases.slice(0, Math.min(cases.length, 15));
  let inserted = 0;
  for (let i = 0; i < sample.length; i++) {
    const c = sample[i];
    try {
      await upsertTagged("documents", `doc-${c.id}-1`, {
        owner_id: ownerId,
        case_id: c.id,
        title: `صحيفة الدعوى - ${c.court}`,
        file_name: `dawa-${i + 1}.pdf`,
        mime_type: "application/pdf",
        size_bytes: 128 * 1024 + i * 1024,
        storage_path: `seed/${c.id}/dawa-${i + 1}.pdf`,
        notes: "مستند تجريبي",
      });
      inserted++;
    } catch (e) {
      warn(`skip document for case ${c.id}: ${e.message}`);
    }
  }
  ok(`${inserted} documents ready`);
}

async function seedArchive(ownerId, clients) {
  log(`archived cases (${ARCHIVE_PER} × ${COURTS.length} courts × ${ARCHIVE_YEARS.length} years)`);
  let n = 0;
  for (const year of ARCHIVE_YEARS) {
    for (const court of COURTS) {
      for (let i = 0; i < ARCHIVE_PER; i++) {
        const client = clients[n % clients.length];
        try {
          await upsertTagged("cases", `arch-${year}-${court}-${i}`, {
            owner_id: ownerId,
            client_id: client.id,
            case_number: `${court.slice(0, 2)}-${year}-A${String(n).padStart(4, "0")}`,
            subject: `${court} ${year} - أرشيف ${i + 1}`,
            court_type: court,
            status: "مؤرشفة",
            opened_at: `${year}-01-${String((i % 27) + 1).padStart(2, "0")}`,
            closed_at: `${year}-12-${String((i % 27) + 1).padStart(2, "0")}`,
            archived_at: `${year}-12-31T00:00:00Z`,
            notes: `أرشيف تجريبي`,
          });
        } catch (e) {
          warn(`skip archive row ${year}/${court}/${i}: ${e.message}`);
        }
        n++;
      }
    }
  }
  ok(`archive: ${n} rows across ${ARCHIVE_YEARS.length} years`);
}

async function main() {
  log(`resolve owner: ${OWNER_EMAIL}`);
  const ownerId = await resolveOwnerId();
  ok(`owner_id=${ownerId}`);

  const clients = await seedClients(ownerId);
  const cases = await seedActiveCases(ownerId, clients);
  await seedDocuments(ownerId, cases);
  await seedArchive(ownerId, clients);

  console.log("\n✓ realistic seed complete");
  console.log(`  tag=${SEED_TAG}  owner=${OWNER_EMAIL}`);
  console.log(`  re-run this script anytime — inserts are idempotent by tag.`);
}

main().catch((e) => {
  console.error("\n✗ seed failed:", e.message);
  if (e.stack) console.error(e.stack);
  process.exit(1);
});
