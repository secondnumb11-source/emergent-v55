#!/usr/bin/env node
/**
 * Direct HTTP request to Supabase to verify DB schema
 * استخدام HTTP requests لتحقق من الجداول بدون Realtime
 */

import https from "https";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const SUPABASE_URL = "https://sofurxihjwgmbosyzeib.supabase.co";
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SERVICE_ROLE_KEY) {
  console.error("❌ SUPABASE_SERVICE_ROLE_KEY not set");
  process.exit(1);
}

function makeRequest(path, method = "GET") {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: "sofurxihjwgmbosyzeib.supabase.co",
      path: path,
      method: method,
      headers: {
        Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
        Apikey: SERVICE_ROLE_KEY,
        "Content-Type": "application/json",
      },
    };

    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        resolve({
          status: res.statusCode,
          headers: res.headers,
          body: data,
        });
      });
    });

    req.on("error", reject);
    if (method !== "GET") {
      req.write("");
    }
    req.end();
  });
}

async function main() {
  console.log("🚀 Verifying Database Schema via Supabase REST API...\n");

  try {
    // Read migration SQL
    const migrationPath = path.join(
      __dirname,
      "../db/pending/20260702120000_add_portal_config_and_najiz.sql",
    );
    const sqlContent = fs.readFileSync(migrationPath, "utf-8");

    console.log("📄 Migration SQL Preview:");
    console.log("─".repeat(70));
    const lines = sqlContent.split("\n");
    for (let i = 0; i < Math.min(15, lines.length); i++) {
      if (lines[i].trim()) console.log(lines[i]);
    }
    console.log("...\n");

    // Test API connectivity
    console.log("🔌 Testing Supabase API connectivity...");
    const testRes = await makeRequest("/rest/v1/clients?select=id&limit=0");

    if (testRes.status === 200) {
      console.log("✅ API is accessible\n");
    } else if (testRes.status === 401) {
      console.log("⚠️  API Key issue - status 401");
      console.log("   This may be expected if running in restricted environment\n");
    } else {
      console.log(`⚠️  API returned status ${testRes.status}\n`);
    }

    // Verify tables exist
    console.log("📋 Checking table accessibility:\n");

    const tables = ["clients", "employees", "najiz_sync_logs"];
    for (const table of tables) {
      const res = await makeRequest(`/rest/v1/${table}?select=id&limit=0`);
      if (res.status === 200) {
        console.log(`  ✅ ${table.padEnd(20)} - accessible`);
      } else {
        console.log(`  ⚠️  ${table.padEnd(20)} - HTTP ${res.status}`);
      }
    }

    console.log("\n" + "═".repeat(70));
    console.log("📋 MIGRATION EXECUTION STATUS");
    console.log("═".repeat(70) + "\n");

    console.log("⚠️  IMPORTANT: SQL migration cannot be executed via REST API directly.");
    console.log("   You must execute it manually via one of these methods:\n");

    console.log("✅ METHOD 1: Supabase Web Dashboard (Recommended)");
    console.log("   └─ Steps:");
    console.log("      1. Go to: https://app.supabase.com/project/sofurxihjwgmbosyzeib/sql/new");
    console.log("      2. Copy & paste the SQL from below");
    console.log('      3. Click "Run" or press CTRL+ENTER');
    console.log("      4. Confirm success\n");

    console.log("SQL TO EXECUTE:");
    console.log("─".repeat(70));
    console.log(sqlContent);
    console.log("─".repeat(70) + "\n");

    console.log("✅ METHOD 2: Via Database Connections Tool");
    console.log("   └─ If you have direct DB access via pgAdmin or similar\n");

    console.log("═".repeat(70));
    console.log("💡 NEXT STEPS (After executing migration):");
    console.log("═".repeat(70) + "\n");
    console.log("1. ✅ Execute the SQL above manually");
    console.log("2. ✅ Run: npm run migrate:portal-config");
    console.log("   (This migrates legacy configs from notes → portal_config)");
    console.log("3. ✅ Rebuild & deploy: npm run build");
    console.log("4. ✅ Run tests: npm run test");
    console.log("\n");
  } catch (error) {
    console.error("❌ Error:", error.message);
  }
}

main();
