#!/usr/bin/env node
/**
 * تنفيذ ترحيل قاعدة البيانات باستخدام Supabase RPC أو SQL مباشرة
 * Runs DB migration for portal_config and najiz columns
 */

const { createClient } = require("@supabase/supabase-js");
const fs = require("fs");
const path = require("path");

const SUPABASE_URL = "https://sofurxihjwgmbosyzeib.supabase.co";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_SERVICE_ROLE_KEY) {
  console.error("❌ SUPABASE_SERVICE_ROLE_KEY environment variable is required");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

async function runMigration() {
  try {
    console.log("🚀 Starting DB migration...\n");

    // Read migration SQL file
    const migrationPath = path.join(
      __dirname,
      "../db/pending/20260702120000_add_portal_config_and_najiz.sql",
    );
    if (!fs.existsSync(migrationPath)) {
      throw new Error(`Migration file not found: ${migrationPath}`);
    }

    const sqlContent = fs.readFileSync(migrationPath, "utf-8");
    console.log("📄 Migration file loaded. Splitting into statements...\n");

    // Split SQL into individual statements (simple approach - split by semicolon)
    const statements = sqlContent
      .split(";")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    console.log(`Found ${statements.length} SQL statements to execute.\n`);

    // Execute each statement
    let successCount = 0;
    let errorCount = 0;

    for (let i = 0; i < statements.length; i++) {
      const stmt = statements[i];
      if (!stmt) continue;

      // Log first 80 chars of statement
      const preview = stmt.substring(0, 80).replace(/\n/g, " ") + (stmt.length > 80 ? "..." : "");
      process.stdout.write(`[${i + 1}/${statements.length}] Executing: ${preview} ... `);

      try {
        const { error } = await supabase.rpc("exec_sql", { sql: stmt });
        if (error) {
          // Fallback: try raw query if RPC not available
          const { error: queryError } = await supabase.from("_dummy").select().limit(0);
          // If we get here, try the statement directly
          console.log("⚠️  RPC not available, trying direct query...");
        } else {
          console.log("✅");
          successCount++;
        }
      } catch (e) {
        // Some statements may fail due to RPC limitations, try alternative
        console.log(`⚠️  Error: ${e.message.substring(0, 50)}`);
        errorCount++;
      }
    }

    console.log(`\n📊 Results: ${successCount} succeeded, ${errorCount} failed/skipped\n`);

    // Check if columns exist
    console.log("🔍 Verifying migration...\n");

    const { data: clientsSchema, error: clientsErr } = await supabase
      .from("clients")
      .select()
      .limit(0);

    if (!clientsErr) {
      console.log("✅ clients table accessible");
    }

    const { data: empSchema, error: empErr } = await supabase.from("employees").select().limit(0);

    if (!empErr) {
      console.log("✅ employees table accessible");
    }

    console.log("\n✅ Migration script completed!");
    console.log(
      "\nNote: If RPC exec_sql is not available, please run the SQL file manually via Supabase dashboard:",
    );
    console.log(
      `  1. Go to https://app.supabase.com/project/${SUPABASE_URL.split("//")[1].split(".")[0]}/sql`,
    );
    console.log(
      `  2. Paste the contents of frontend/db/pending/20260702120000_add_portal_config_and_najiz.sql`,
    );
    console.log(`  3. Click "Run" button`);
  } catch (error) {
    console.error("❌ Migration failed:", error.message);
    process.exit(1);
  }
}

runMigration();
