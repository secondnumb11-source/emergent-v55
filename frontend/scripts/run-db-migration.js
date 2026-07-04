#!/usr/bin/env node
/**
 * تنفيذ ترحيل قاعدة البيانات عبر الاتصال المباشر بـ Postgres
 * هذا السكربت يتطلب ملف .env بـ DATABASE_URL أو متغيرات بيئة Postgres
 */

const fs = require("fs");
const path = require("path");

// محاولة استخدام pg library
let Client;
try {
  ({ Client } = require("pg"));
} catch (e) {
  console.log('⚠️  "pg" library not installed. Installing...\n');
  const { execSync } = require("child_process");
  try {
    execSync("npm install pg --save-dev", { stdio: "inherit", cwd: __dirname });
    ({ Client } = require("pg"));
  } catch (installErr) {
    console.error("❌ Failed to install pg. Please install manually: npm install pg --save-dev");
    process.exit(1);
  }
}

// الحصول على بيانات الاتصال
const DATABASE_URL =
  process.env.DATABASE_URL ||
  (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
    ? `postgres://postgres:${process.env.SUPABASE_SERVICE_ROLE_KEY.split("_")[1]}@${process.env.SUPABASE_URL.split("//")[1]}/postgres`
    : null);

if (!DATABASE_URL) {
  console.error("❌ DATABASE_URL or SUPABASE environment variables not set");
  console.error("Please provide one of:");
  console.error('  export DATABASE_URL="postgres://user:password@host:port/database"');
  console.error("  OR set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

async function runMigration() {
  const client = new Client({ connectionString: DATABASE_URL });

  try {
    console.log("🔌 Connecting to database...");
    await client.connect();
    console.log("✅ Connected to database\n");

    // Read migration SQL file
    const migrationPath = path.join(
      __dirname,
      "../db/pending/20260702120000_add_portal_config_and_najiz.sql",
    );
    if (!fs.existsSync(migrationPath)) {
      throw new Error(`Migration file not found: ${migrationPath}`);
    }

    const sqlContent = fs.readFileSync(migrationPath, "utf-8");
    console.log("📄 Migration file loaded. Executing...\n");

    // Execute the entire migration
    await client.query(sqlContent);
    console.log("✅ Migration executed successfully!\n");

    // Verify columns
    console.log("🔍 Verifying schema changes...\n");

    // Check clients table
    const clientsCheck = await client.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'clients' AND column_name IN ('portal_config')
      ORDER BY ordinal_position
    `);

    if (clientsCheck.rows.some((r) => r.column_name === "portal_config")) {
      console.log("✅ clients.portal_config column created");
    } else {
      console.log("⚠️  clients.portal_config column not found");
    }

    // Check employees table
    const empCheck = await client.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'employees' AND column_name IN ('portal_config')
      ORDER BY ordinal_position
    `);

    if (empCheck.rows.some((r) => r.column_name === "portal_config")) {
      console.log("✅ employees.portal_config column created");
    } else {
      console.log("⚠️  employees.portal_config column not found");
    }

    // Check najiz_sync_logs table
    const najizCheck = await client.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'najiz_sync_logs' AND column_name IN ('needs_review_count')
      ORDER BY ordinal_position
    `);

    if (najizCheck.rows.some((r) => r.column_name === "needs_review_count")) {
      console.log("✅ najiz_sync_logs.needs_review_count column created");
    } else {
      console.log("⚠️  najiz_sync_logs.needs_review_count column not found");
    }

    console.log("\n✅ Migration verification complete!");
  } catch (error) {
    console.error("❌ Migration failed:", error.message);
    if (error.message.includes("connect")) {
      console.error("\n⚠️  Connection error. Verify DATABASE_URL is correct.");
    }
    process.exit(1);
  } finally {
    await client.end();
  }
}

runMigration();
