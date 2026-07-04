#!/usr/bin/env node
/**
 * تنفيذ ترحيل قاعدة البيانات عبر Supabase SQL API
 * Executes migration SQL file using Supabase SDK
 */

import fs from "fs";
import path from "path";
import https from "https";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const SUPABASE_URL = "https://sofurxihjwgmbosyzeib.supabase.co";
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SERVICE_ROLE_KEY) {
  console.error("❌ SUPABASE_SERVICE_ROLE_KEY environment variable is required");
  process.exit(1);
}

async function executeSql(sql) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ query: sql });

    const options = {
      hostname: SUPABASE_URL.split("//")[1],
      path: "/rest/v1/rpc/exec_sql",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body),
        Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
        Apikey: SERVICE_ROLE_KEY,
      },
    };

    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve({ success: true, status: res.statusCode });
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${data}`));
        }
      });
    });

    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

async function verifySchema() {
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  console.log("\n🔍 Verifying schema changes...\n");

  // Sample queries to verify tables are accessible
  const checks = [
    { name: "clients", label: "clients table" },
    { name: "employees", label: "employees table" },
    { name: "najiz_sync_logs", label: "najiz_sync_logs table" },
  ];

  for (const check of checks) {
    try {
      const { error } = await supabase.from(check.name).select().limit(0);

      if (!error) {
        console.log(`✅ ${check.label} is accessible`);
      } else {
        console.log(`⚠️  ${check.label}: ${error.message}`);
      }
    } catch (e) {
      console.log(`⚠️  ${check.label}: ${e.message}`);
    }
  }
}

async function runMigration() {
  try {
    console.log("🚀 Starting DB migration via Supabase SQL API...\n");

    // Read migration SQL file
    const migrationPath = path.join(
      __dirname,
      "../db/pending/20260702120000_add_portal_config_and_najiz.sql",
    );
    if (!fs.existsSync(migrationPath)) {
      throw new Error(`Migration file not found: ${migrationPath}`);
    }

    const sqlContent = fs.readFileSync(migrationPath, "utf-8");
    console.log("📄 Migration file loaded.\n");
    console.log("SQL Preview:");
    console.log("─".repeat(60));
    console.log(sqlContent.substring(0, 200) + "...\n");

    // Try executing with SQL API
    console.log("📤 Submitting migration to Supabase...");

    try {
      await executeSql(sqlContent);
      console.log("✅ Migration executed via SQL API!\n");
      await verifySchema();
    } catch (apiError) {
      console.log(`⚠️  SQL API call: ${apiError.message}`);
      console.log("\n⚠️  Falling back to direct verification...\n");

      // Try verification anyway
      await verifySchema();

      console.log("\n💡 NOTE: If migration did not run, please execute manually:");
      console.log("  1. Go to https://app.supabase.com/project/sofurxihjwgmbosyzeib/sql/new");
      console.log(
        "  2. Paste the contents of: frontend/db/pending/20260702120000_add_portal_config_and_najiz.sql",
      );
      console.log('  3. Click "Run" or use CTRL+Enter\n');
    }

    console.log("✅ Migration check complete!");
  } catch (error) {
    console.error("❌ Migration failed:", error.message);
    process.exit(1);
  }
}

runMigration();
