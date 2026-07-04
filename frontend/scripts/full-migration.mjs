#!/usr/bin/env node
/**
 * سكربت شامل لتنفيذ جميع الترحيلات والهجرة والاختبارات
 * Comprehensive migration and testing script for all database changes
 *
 * تشغيل: DATABASE_URL="postgresql://..." node scripts/full-migration.mjs
 */

import pg from "pg";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ──────────────────────────────────────────────────────────────
// Configuration
// ──────────────────────────────────────────────────────────────

const DATABASE_URL =
  process.env.DATABASE_URL ||
  "postgresql://postgres:YOUR_DB_PASSWORD@db.sofurxihjwgmbosyzeib.supabase.co:5432/postgres";
const SUPABASE_URL = "https://sofurxihjwgmbosyzeib.supabase.co";
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "YOUR_SERVICE_ROLE_KEY";

// ──────────────────────────────────────────────────────────────
// Database Client
// ──────────────────────────────────────────────────────────────

const client = new pg.Client({ connectionString: DATABASE_URL });

async function connectDB() {
  try {
    await client.connect();
    console.log("✅ Connected to database\n");
    return true;
  } catch (error) {
    console.error("❌ Failed to connect:", error.message);
    return false;
  }
}

async function closeDB() {
  await client.end();
}

// ──────────────────────────────────────────────────────────────
// Step 1: Schema Migration
// ──────────────────────────────────────────────────────────────

async function runSchemaMigration() {
  console.log("📊 STEP 1: Running Schema Migration\n");
  console.log("─".repeat(70));

  const migrationPath = path.join(
    __dirname,
    "../db/pending/20260702120000_add_portal_config_and_najiz.sql",
  );

  if (!fs.existsSync(migrationPath)) {
    throw new Error(`Migration file not found: ${migrationPath}`);
  }

  const sqlContent = fs.readFileSync(migrationPath, "utf-8");

  try {
    await client.query(sqlContent);
    console.log("✅ Schema migration executed successfully!\n");
    return true;
  } catch (error) {
    console.error("❌ Schema migration failed:", error.message);
    throw error;
  }
}

// ──────────────────────────────────────────────────────────────
// Step 2: Verify Schema Changes
// ──────────────────────────────────────────────────────────────

async function verifySchema() {
  console.log("🔍 STEP 2: Verifying Schema Changes\n");
  console.log("─".repeat(70));

  const checks = [
    {
      table: "clients",
      column: "portal_config",
      query: `SELECT column_name, data_type FROM information_schema.columns 
               WHERE table_name = 'clients' AND column_name = 'portal_config'`,
    },
    {
      table: "employees",
      column: "portal_config",
      query: `SELECT column_name, data_type FROM information_schema.columns 
               WHERE table_name = 'employees' AND column_name = 'portal_config'`,
    },
    {
      table: "najiz_sync_logs",
      column: "needs_review_count",
      query: `SELECT column_name, data_type FROM information_schema.columns 
               WHERE table_name = 'najiz_sync_logs' AND column_name = 'needs_review_count'`,
    },
  ];

  let allVerified = true;

  for (const check of checks) {
    try {
      const result = await client.query(check.query);
      if (result.rows.length > 0) {
        const row = result.rows[0];
        console.log(`✅ ${check.table}.${check.column} (${row.data_type})`);
      } else {
        console.log(`❌ ${check.table}.${check.column} - NOT FOUND`);
        allVerified = false;
      }
    } catch (error) {
      console.log(`❌ ${check.table}.${check.column} - Error: ${error.message}`);
      allVerified = false;
    }
  }

  console.log();
  return allVerified;
}

// ──────────────────────────────────────────────────────────────
// Step 3: Migrate Legacy Portal Configs
// ──────────────────────────────────────────────────────────────

async function migratePortalConfigs() {
  console.log("📦 STEP 3: Migrating Legacy Portal Configs\n");
  console.log("─".repeat(70));

  const tables = ["clients", "employees"];
  let totalMigrated = 0;

  for (const table of tables) {
    try {
      // Find records with legacy config format
      const query = `
        SELECT id, notes, portal_config 
        FROM ${table}
        WHERE portal_config IS NULL 
          AND notes LIKE '%<!--PORTAL_CONFIG:%'
        LIMIT 100
      `;

      const result = await client.query(query);

      if (result.rows.length === 0) {
        console.log(`ℹ️  ${table}: No legacy configs to migrate`);
        continue;
      }

      console.log(`📝 Found ${result.rows.length} ${table} with legacy configs`);

      for (const row of result.rows) {
        try {
          // Extract JSON from notes
          const match = row.notes.match(/<!--PORTAL_CONFIG:([\s\S]*?):END-->/);
          if (match) {
            const cfg = JSON.parse(match[1]);
            const user_notes = row.notes.replace(/<!--PORTAL_CONFIG:[\s\S]*?:END-->/g, "").trim();

            const portal_config = { ...cfg, user_notes };

            await client.query(`UPDATE ${table} SET portal_config = $1 WHERE id = $2`, [
              JSON.stringify(portal_config),
              row.id,
            ]);

            totalMigrated++;
            console.log(`  ✅ Migrated ${table} ID: ${row.id}`);
          }
        } catch (parseError) {
          console.log(`  ⚠️  Failed to parse config for ${table} ID: ${row.id}`);
        }
      }
    } catch (error) {
      console.log(`⚠️  Error migrating ${table}: ${error.message}`);
    }
  }

  console.log(`\n✅ Migrated ${totalMigrated} legacy configs\n`);
}

// ──────────────────────────────────────────────────────────────
// Step 4: Check Database State
// ──────────────────────────────────────────────────────────────

async function checkDatabaseState() {
  console.log("📋 STEP 4: Checking Database State\n");
  console.log("─".repeat(70));

  const checks = [
    {
      name: "Total clients",
      query: "SELECT COUNT(*) as count FROM clients",
    },
    {
      name: "Total employees",
      query: "SELECT COUNT(*) as count FROM employees",
    },
    {
      name: "Najiz sync logs",
      query: "SELECT COUNT(*) as count FROM najiz_sync_logs",
    },
    {
      name: "Pending najiz syncs (needs_review)",
      query: `SELECT COUNT(*) as count FROM najiz_sync_logs 
               WHERE status = 'needs_review' OR needs_review_count > 0`,
    },
  ];

  for (const check of checks) {
    try {
      const result = await client.query(check.query);
      console.log(`${check.name}: ${result.rows[0].count}`);
    } catch (error) {
      console.log(`${check.name}: ⚠️  Error - ${error.message}`);
    }
  }

  console.log();
}

// ──────────────────────────────────────────────────────────────
// Step 5: Verify RLS and Permissions
// ──────────────────────────────────────────────────────────────

async function verifyPermissions() {
  console.log("🔐 STEP 5: Verifying Database Permissions\n");
  console.log("─".repeat(70));

  const tables = ["clients", "employees", "najiz_sync_logs"];

  for (const table of tables) {
    try {
      const query = `
        SELECT grantee, privilege_type
        FROM information_schema.role_table_grants
        WHERE table_name = '${table}'
        GROUP BY grantee, privilege_type
        ORDER BY grantee
      `;

      const result = await client.query(query);
      console.log(`\n${table}:`);

      if (result.rows.length === 0) {
        console.log("  ⚠️  No explicit grants found (using public/default)");
      } else {
        for (const row of result.rows) {
          console.log(`  ✅ ${row.grantee}: ${row.privilege_type}`);
        }
      }
    } catch (error) {
      console.log(`  ⚠️  Could not check permissions: ${error.message}`);
    }
  }

  console.log();
}

// ──────────────────────────────────────────────────────────────
// Step 6: Summary Report
// ──────────────────────────────────────────────────────────────

function printSummary(success) {
  console.log("\n" + "═".repeat(70));
  console.log("  📊 MIGRATION SUMMARY");
  console.log("═".repeat(70) + "\n");

  if (success) {
    console.log("✅ All migration steps completed successfully!\n");
    console.log("Next actions:");
    console.log("1. Rebuild frontend: cd frontend && npm run build");
    console.log("2. Deploy backend changes");
    console.log("3. Run smoke tests (see tests/ folder)");
    console.log("4. Verify portal provisioning and Najiz integration in production");
  } else {
    console.log("❌ Some migration steps failed. Check logs above.\n");
    console.log("Please review errors and retry.");
  }

  console.log("\n" + "═".repeat(70) + "\n");
}

// ──────────────────────────────────────────────────────────────
// Main Execution
// ──────────────────────────────────────────────────────────────

async function main() {
  console.log("\n" + "═".repeat(70));
  console.log("  🚀 COMPREHENSIVE DATABASE MIGRATION EXECUTION");
  console.log("═".repeat(70) + "\n");

  try {
    // Step 0: Connect
    const connected = await connectDB();
    if (!connected) {
      throw new Error("Failed to connect to database");
    }

    // Step 1: Schema migration
    await runSchemaMigration();

    // Step 2: Verify schema
    const schemaOk = await verifySchema();
    if (!schemaOk) {
      throw new Error("Schema verification failed");
    }

    // Step 3: Migrate legacy configs
    await migratePortalConfigs();

    // Step 4: Check state
    await checkDatabaseState();

    // Step 5: Verify permissions
    await verifyPermissions();

    // Success
    printSummary(true);
  } catch (error) {
    console.error("\n❌ MIGRATION FAILED:", error.message);
    console.error(error.stack);
    printSummary(false);
    process.exit(1);
  } finally {
    await closeDB();
  }
}

main();
