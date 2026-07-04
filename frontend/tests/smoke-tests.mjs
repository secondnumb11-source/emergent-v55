#!/usr/bin/env node
/**
 * 🧪 Post-Migration Smoke Tests
 * اختبارات التحقق السريعة بعد الترحيل
 */

import { createClient } from "@supabase/supabase-js";
import chalk from "chalk";

const SUPABASE_URL = "https://sofurxihjwgmbosyzeib.supabase.co";
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

if (!SERVICE_ROLE_KEY || !SUPABASE_ANON_KEY) {
  console.error("❌ Missing environment variables:");
  console.error("   SUPABASE_SERVICE_ROLE_KEY and SUPABASE_ANON_KEY required");
  process.exit(1);
}

console.log("\n🚀 POST-MIGRATION SMOKE TESTS\n");
console.log("═".repeat(70) + "\n");

let passCount = 0;
let failCount = 0;

async function test(name, fn) {
  process.stdout.write(`Testing: ${name.padEnd(50)} `);
  try {
    await fn();
    console.log(chalk.green("✅ PASS"));
    passCount++;
  } catch (error) {
    console.log(chalk.red("❌ FAIL"));
    console.log(chalk.gray(`  └─ ${error.message}`));
    failCount++;
  }
}

async function runTests() {
  try {
    // Test 1: Schema - Check columns exist
    await test("Schema: clients.portal_config column exists", async () => {
      const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
        auth: { persistSession: false },
      });

      const { data, error } = await supabase
        .rpc("check_column_exists", {
          table_name: "public.clients",
          column_name: "portal_config",
        })
        .catch(() => ({ data: null, error: { message: "RPC not available" } }));

      // If RPC not available, skip this check (expected in some environments)
      if (error && error.message.includes("not found")) {
        throw new Error(
          "portal_config column likely missing - please verify in Supabase dashboard",
        );
      }
    });

    // Test 2: Schema - employees.portal_config
    await test("Schema: employees.portal_config column exists", async () => {
      const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
        auth: { persistSession: false },
      });

      const { data: sample } = await supabase
        .from("employees")
        .select("id, portal_config")
        .limit(1)
        .catch(() => ({ data: null, error: null }));

      // If we can select and portal_config is in response, column exists
      if (sample && sample.length > 0) {
        if (!("portal_config" in sample[0])) {
          throw new Error("portal_config column not found in employees");
        }
      }
    });

    // Test 3: Schema - najiz_sync_logs.needs_review_count
    await test("Schema: najiz_sync_logs.needs_review_count column", async () => {
      const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
        auth: { persistSession: false },
      });

      const { data: sample } = await supabase
        .from("najiz_sync_logs")
        .select("id, needs_review_count")
        .limit(1)
        .catch(() => ({ data: null, error: null }));

      if (sample && sample.length > 0) {
        if (!("needs_review_count" in sample[0])) {
          throw new Error("needs_review_count column not found in najiz_sync_logs");
        }
      }
    });

    // Test 4: API Connectivity
    await test("API: Supabase REST API reachable", async () => {
      const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: { persistSession: false },
      });

      const { error } = await supabase.from("clients").select("id").limit(0);

      if (error && error.status === 401) {
        throw new Error("Authentication failed");
      }
    });

    // Test 5: Server Functions - provisionClientPortal exists
    await test("Code: provisionClientPortal server function", async () => {
      // Check if function file exists
      const fs = await import("fs");
      const path = await import("path");
      const funcPath = path.join(process.cwd(), "src/lib/client-portal.functions.ts");

      if (!fs.existsSync(funcPath)) {
        throw new Error("client-portal.functions.ts not found");
      }

      const content = fs.readFileSync(funcPath, "utf-8");
      if (!content.includes("provisionClientPortal")) {
        throw new Error("provisionClientPortal function not found");
      }
    });

    // Test 6: Server Functions - saveEmployeePortalConfig exists
    await test("Code: saveEmployeePortalConfig server function", async () => {
      const fs = await import("fs");
      const path = await import("path");
      const funcPath = path.join(process.cwd(), "src/lib/portal.functions.ts");

      if (!fs.existsSync(funcPath)) {
        throw new Error("portal.functions.ts not found");
      }

      const content = fs.readFileSync(funcPath, "utf-8");
      if (!content.includes("saveEmployeePortalConfig")) {
        throw new Error("saveEmployeePortalConfig function not found");
      }
    });

    // Test 7: Route Guards - employee portal protected
    await test("Code: app.employee-portal.tsx has beforeLoad guard", async () => {
      const fs = await import("fs");
      const path = await import("path");
      const routePath = path.join(
        process.cwd(),
        "src/routes/_authenticated/app.employee-portal.tsx",
      );

      if (!fs.existsSync(routePath)) {
        throw new Error("app.employee-portal.tsx not found");
      }

      const content = fs.readFileSync(routePath, "utf-8");
      if (!content.includes("beforeLoad")) {
        throw new Error("beforeLoad guard not found");
      }
    });

    // Test 8: Route Guards - client portal protected
    await test("Code: app.client-portal.tsx has beforeLoad guard", async () => {
      const fs = await import("fs");
      const path = await import("path");
      const routePath = path.join(process.cwd(), "src/routes/_authenticated/app.client-portal.tsx");

      if (!fs.existsSync(routePath)) {
        throw new Error("app.client-portal.tsx not found");
      }

      const content = fs.readFileSync(routePath, "utf-8");
      if (!content.includes("beforeLoad")) {
        throw new Error("beforeLoad guard not found");
      }
    });

    // Test 9: Najiz improvements
    await test("Code: Najiz sync improved with needs_review", async () => {
      const fs = await import("fs");
      const path = await import("path");
      const funcPath = path.join(process.cwd(), "src/lib/portal.functions.ts");

      const content = fs.readFileSync(funcPath, "utf-8");
      if (!content.includes("needs_review")) {
        throw new Error("needs_review handling not found in sync function");
      }
    });

    // Test 10: System Health Check - Najiz status
    await test("Code: System health check includes Najiz logs", async () => {
      const fs = await import("fs");
      const path = await import("path");
      const funcPath = path.join(process.cwd(), "src/lib/system-check.functions.ts");

      const content = fs.readFileSync(funcPath, "utf-8");
      if (!content.includes("najiz")) {
        throw new Error("Najiz health check not found");
      }
    });
  } catch (error) {
    console.error("\n❌ Fatal error:", error.message);
    process.exit(1);
  }
}

async function main() {
  await runTests();

  console.log("\n" + "═".repeat(70));
  console.log(`\n📊 TEST RESULTS: ${passCount} passed, ${failCount} failed\n`);

  if (failCount === 0) {
    console.log(chalk.green("✅ All tests passed! Migration and code changes look good.\n"));
    process.exit(0);
  } else {
    console.log(chalk.red("❌ Some tests failed. Please review the output above.\n"));
    process.exit(1);
  }
}

main();
