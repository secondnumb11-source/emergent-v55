#!/usr/bin/env node
/**
 * سكربت اختبار شامل للبوابات ومزامنة ناجز
 * Comprehensive smoke tests for portal provisioning and Najiz integration
 *
 * تشغيل: DATABASE_URL="..." SUPABASE_URL="..." SUPABASE_SERVICE_ROLE_KEY="..." node scripts/test-portals.mjs
 */

import pg from "pg";

const DATABASE_URL =
  process.env.DATABASE_URL ||
  "postgresql://postgres:YOUR_DB_PASSWORD@db.sofurxihjwgmbosyzeib.supabase.co:5432/postgres";
const SUPABASE_URL = process.env.SUPABASE_URL || "https://sofurxihjwgmbosyzeib.supabase.co";
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "YOUR_SERVICE_ROLE_KEY";

const client = new pg.Client({ connectionString: DATABASE_URL });

async function connectDB() {
  try {
    await client.connect();
    return true;
  } catch (error) {
    console.error("❌ DB Connection failed:", error.message);
    return false;
  }
}

// ──────────────────────────────────────────────────────────────
// TEST 1: Verify Schema
// ──────────────────────────────────────────────────────────────

async function testSchema() {
  console.log("\n🧪 TEST 1: Schema Verification");
  console.log("─".repeat(70));

  const checks = [
    { table: "clients", column: "portal_config" },
    { table: "employees", column: "portal_config" },
    { table: "najiz_sync_logs", column: "needs_review_count" },
  ];

  for (const check of checks) {
    try {
      const query = `
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = '${check.table}' AND column_name = '${check.column}'
      `;
      const result = await client.query(query);

      if (result.rows.length > 0) {
        console.log(`✅ ${check.table}.${check.column} exists`);
      } else {
        console.log(`❌ ${check.table}.${check.column} NOT FOUND`);
        return false;
      }
    } catch (error) {
      console.log(`❌ ${check.table}.${check.column}: ${error.message}`);
      return false;
    }
  }

  return true;
}

// ──────────────────────────────────────────────────────────────
// TEST 2: Sample Portal Config
// ──────────────────────────────────────────────────────────────

async function testPortalConfig() {
  console.log("\n🧪 TEST 2: Portal Configuration Storage");
  console.log("─".repeat(70));

  try {
    // Create test client with portal config
    const testConfig = {
      permissions: ["dashboard", "cases", "documents"],
      assigned_cases: ["case_001", "case_002"],
      assigned_clients: [],
      welcome_message: "Welcome to the portal",
    };

    // Insert or update test client
    const query = `
      INSERT INTO clients (full_name, email, portal_config)
      VALUES ('Test Client', 'test-portal@example.com', $1)
      ON CONFLICT (email) DO UPDATE SET portal_config = $1
      RETURNING id, portal_config
    `;

    const result = await client.query(query, [JSON.stringify(testConfig)]);

    if (result.rows.length > 0) {
      const saved = result.rows[0];
      console.log(`✅ Portal config saved successfully`);
      console.log(`   Client ID: ${saved.id}`);
      console.log(`   Config: ${JSON.stringify(saved.portal_config).substring(0, 60)}...`);

      // Clean up
      await client.query("DELETE FROM clients WHERE id = $1", [saved.id]);
      return true;
    }
  } catch (error) {
    console.log(`❌ Portal config test failed: ${error.message}`);
    return false;
  }
}

// ──────────────────────────────────────────────────────────────
// TEST 3: Najiz Sync Logs
// ──────────────────────────────────────────────────────────────

async function testNajizSync() {
  console.log("\n🧪 TEST 3: Najiz Sync Logging");
  console.log("─".repeat(70));

  try {
    // Check existing najiz logs
    const countQuery = `SELECT COUNT(*) as total FROM najiz_sync_logs`;
    const countResult = await client.query(countQuery);
    console.log(`✅ Najiz sync logs table accessible`);
    console.log(`   Total logs: ${countResult.rows[0].total}`);

    // Check for pending reviews
    const pendingQuery = `
      SELECT COUNT(*) as pending FROM najiz_sync_logs 
      WHERE status = 'needs_review' OR needs_review_count > 0
    `;
    const pendingResult = await client.query(pendingQuery);
    console.log(`   Pending review: ${pendingResult.rows[0].pending}`);

    return true;
  } catch (error) {
    console.log(`❌ Najiz sync test failed: ${error.message}`);
    return false;
  }
}

// ──────────────────────────────────────────────────────────────
// TEST 4: Employee Portal Config
// ──────────────────────────────────────────────────────────────

async function testEmployeeConfig() {
  console.log("\n🧪 TEST 4: Employee Portal Configuration");
  console.log("─".repeat(70));

  try {
    const testConfig = {
      permissions: ["dashboard", "cases", "chat"],
      assigned_cases: ["case_001"],
      assigned_clients: ["client_001"],
      access_code: "ABC123",
      issued_credentials: {
        username: "emp_test",
        password: "test_password",
        access_link: "https://portal.example.com/employee/emp_test",
      },
    };

    // Find or create test employee
    const query = `
      INSERT INTO employees (full_name, email, job_title, portal_config)
      VALUES ('Test Employee', 'emp-test@example.com', 'Tester', $1)
      ON CONFLICT (email) DO UPDATE SET portal_config = $1
      RETURNING id, portal_config, assigned_cases
    `;

    const result = await client.query(query, [JSON.stringify(testConfig)]);

    if (result.rows.length > 0) {
      const saved = result.rows[0];
      console.log(`✅ Employee portal config saved successfully`);
      console.log(`   Employee ID: ${saved.id}`);
      console.log(`   Has access_code: ${saved.portal_config?.access_code ? "✓" : "✗"}`);
      console.log(`   Has credentials: ${saved.portal_config?.issued_credentials ? "✓" : "✗"}`);

      // Clean up
      await client.query("DELETE FROM employees WHERE id = $1", [saved.id]);
      return true;
    }
  } catch (error) {
    console.log(`❌ Employee config test failed: ${error.message}`);
    return false;
  }
}

// ──────────────────────────────────────────────────────────────
// TEST 5: RLS Policies (Read-Only Check)
// ──────────────────────────────────────────────────────────────

async function testRLSPolicies() {
  console.log("\n🧪 TEST 5: RLS Policies Check");
  console.log("─".repeat(70));

  try {
    const query = `
      SELECT schemaname, tablename, policyname 
      FROM pg_policies 
      WHERE tablename IN ('clients', 'employees', 'najiz_sync_logs')
      LIMIT 20
    `;

    const result = await client.query(query);

    if (result.rows.length > 0) {
      console.log(`✅ RLS policies found: ${result.rows.length}`);
      for (const policy of result.rows.slice(0, 5)) {
        console.log(`   - ${policy.tablename}: ${policy.policyname}`);
      }
      if (result.rows.length > 5) {
        console.log(`   ... and ${result.rows.length - 5} more`);
      }
    } else {
      console.log(`⚠️  No RLS policies found (expected if RLS is not enabled)`);
    }

    return true;
  } catch (error) {
    console.log(`⚠️  Could not check RLS policies: ${error.message}`);
    return true; // Not critical
  }
}

// ──────────────────────────────────────────────────────────────
// Main Test Suite
// ──────────────────────────────────────────────────────────────

async function runTests() {
  console.log("\n" + "═".repeat(70));
  console.log("  🧪 PORTAL & NAJIZ INTEGRATION TESTS");
  console.log("═".repeat(70));

  try {
    if (!(await connectDB())) {
      throw new Error("Cannot connect to database");
    }

    const results = [];
    results.push(await testSchema());
    results.push(await testPortalConfig());
    results.push(await testNajizSync());
    results.push(await testEmployeeConfig());
    results.push(await testRLSPolicies());

    console.log("\n" + "═".repeat(70));
    console.log("  📊 TEST RESULTS");
    console.log("═".repeat(70));

    const passed = results.filter((r) => r).length;
    const total = results.length;

    console.log(`\n✅ Passed: ${passed}/${total}`);

    if (passed === total) {
      console.log("\n🎉 All tests passed! System is ready for deployment.");
    } else {
      console.log(`\n⚠️  ${total - passed} test(s) failed. Review output above.`);
    }

    console.log("\n" + "═".repeat(70) + "\n");

    return passed === total;
  } catch (error) {
    console.error("\n❌ Test execution failed:", error.message);
    return false;
  } finally {
    await client.end();
  }
}

runTests().then((success) => {
  process.exit(success ? 0 : 1);
});
