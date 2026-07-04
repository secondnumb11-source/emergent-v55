#!/usr/bin/env node
/**
 * Execute DB migration using Supabase Admin SDK
 * استخدم مفتاح الخدمة والاتصال الآمن لتنفيذ الترحيل
 */

import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const SUPABASE_URL = "https://sofurxihjwgmbosyzeib.supabase.co";
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SERVICE_ROLE_KEY) {
  console.error("❌ SUPABASE_SERVICE_ROLE_KEY environment variable is required");
  process.exit(1);
}

console.log("🚀 Starting DB migration using Supabase SDK...\n");

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
  realtime: { params: { eventsPerSecond: 0 } },
});

async function runMigration() {
  try {
    // Read migration SQL
    const migrationPath = path.join(
      __dirname,
      "../db/pending/20260702120000_add_portal_config_and_najiz.sql",
    );
    const sqlContent = fs.readFileSync(migrationPath, "utf-8");

    console.log("📄 Migration SQL loaded");
    console.log("SQL Preview:");
    console.log("─".repeat(60));
    console.log(sqlContent.substring(0, 300) + "...\n");

    // Since we can't directly execute SQL via REST API, let's verify tables and columns
    console.log("🔍 Verifying current schema...\n");

    // Check clients table
    console.log("Checking clients table...");
    const { data: clientsData, error: clientsErr } = await supabase
      .from("clients")
      .select()
      .limit(1);

    if (!clientsErr) {
      console.log("✅ clients table exists and is accessible");
    } else {
      console.error("❌ clients table error:", clientsErr.message);
    }

    // Check employees table
    console.log("Checking employees table...");
    const { data: empData, error: empErr } = await supabase.from("employees").select().limit(1);

    if (!empErr) {
      console.log("✅ employees table exists and is accessible");
    } else {
      console.error("❌ employees table error:", empErr.message);
    }

    // Check najiz_sync_logs table
    console.log("Checking najiz_sync_logs table...");
    const { data: najizData, error: najizErr } = await supabase
      .from("najiz_sync_logs")
      .select()
      .limit(1);

    if (!najizErr) {
      console.log("✅ najiz_sync_logs table exists and is accessible");
    } else {
      console.error("❌ najiz_sync_logs table error:", najizErr.message);
    }

    console.log("\n" + "═".repeat(60));
    console.log("⚠️  NOTE: Direct SQL execution via Supabase REST API requires");
    console.log("   a special RPC function or management API access.\n");
    console.log("✅ Recommended: Execute migration via Supabase Web Dashboard:");
    console.log("   1. Go to: https://app.supabase.com/project/sofurxihjwgmbosyzeib/sql/new");
    console.log(
      "   2. Paste SQL from: /app/frontend/db/pending/20260702120000_add_portal_config_and_najiz.sql",
    );
    console.log('   3. Click "Run"\n');
    console.log("✅ Alternative: Use direct psql with DATABASE_URL");
    console.log("   But note: Network access to DB host may be required\n");
    console.log("═".repeat(60));
  } catch (error) {
    console.error("❌ Error:", error.message);
    process.exit(1);
  }
}

runMigration();
