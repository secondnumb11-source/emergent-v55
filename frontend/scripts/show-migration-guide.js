#!/usr/bin/env node
/**
 * دليل تنفيذ الترحيل - يعرض SQL وخطوات التنفيذ
 * Migration execution guide - shows SQL and instructions
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const SUPABASE_PROJECT_ID = "sofurxihjwgmbosyzeib";
const migrationPath = path.join(
  __dirname,
  "../db/pending/20260702120000_add_portal_config_and_najiz.sql",
);

console.log("\n" + "═".repeat(70));
console.log("  🚀 DATABASE MIGRATION EXECUTION GUIDE");
console.log("═".repeat(70) + "\n");

if (!fs.existsSync(migrationPath)) {
  console.error("❌ Migration file not found:", migrationPath);
  process.exit(1);
}

const sqlContent = fs.readFileSync(migrationPath, "utf-8");

console.log("📄 MIGRATION SQL CONTENT:");
console.log("─".repeat(70));
console.log(sqlContent);
console.log("─".repeat(70) + "\n");

console.log("📋 HOW TO EXECUTE THIS MIGRATION:\n");

console.log("✅ OPTION 1: Via Supabase Web Dashboard (Easiest & Safest)");
console.log("────────────────────────────────────────────────────────────");
console.log(`1. Go to: https://app.supabase.com/project/${SUPABASE_PROJECT_ID}/sql/new`);
console.log("2. Copy and paste the SQL above");
console.log('3. Click "Run" button or press CTRL+ENTER');
console.log('4. Verify "Success" message\n');

console.log("✅ OPTION 2: Via psql Command Line");
console.log("────────────────────────────────────────────────────────────");
console.log("Prerequisites: DATABASE_URL environment variable must be set");
console.log("");
console.log(`Command:
$ export DATABASE_URL="postgres://user:password@db.${SUPABASE_PROJECT_ID}.supabase.co:5432/postgres"
$ psql "$DATABASE_URL" -f ${migrationPath}`);
console.log("");
console.log("Note: You can find your DATABASE_URL in:");
console.log(`  → Supabase Dashboard → Project Settings → Database → Connection Pooling`);
console.log('  → Copy the "Session mode" or "Transaction mode" connection string\n');

console.log("✅ OPTION 3: Programmatically (if you have DATABASE_URL)");
console.log("────────────────────────────────────────────────────────────");
console.log(`
$ cd frontend
$ export DATABASE_URL="postgres://..."
$ node scripts/run-db-migration.js
`);

console.log("═".repeat(70));
console.log("\n⚠️  IMPORTANT:");
console.log("─────────────");
console.log("• This migration adds JSONB columns for portal configuration");
console.log("• It is safe to run - uses IF NOT EXISTS to avoid errors");
console.log("• Migration should be executed on BOTH staging and production");
console.log("• After migration, run: npm run migrate:portal-config");
console.log("  (This migrates legacy portal configs from notes to portal_config)");
console.log("\n");

console.log("═".repeat(70) + "\n");

console.log("💡 Next steps after migration:");
console.log("1. Execute the migration using one of the options above");
console.log("2. Run portal config migration: npm run migrate:portal-config");
console.log("3. Rebuild and deploy frontend/backend");
console.log("4. Run smoke tests (portal provisioning, Najiz sync)");
console.log("\n");
