import pg from "pg";

const connectionString =
  "postgresql://postgres:YOUR_DB_PASSWORD@db.sofurxihjwgmbosyzeib.supabase.co:5432/postgres";

const client = new pg.Client({ connectionString });

console.log("🔌 Attempting database connection...\n");

try {
  await client.connect();
  console.log("✅ Connection successful!\n");

  const result = await client.query("SELECT version();");
  console.log("Database version:");
  console.log(result.rows[0].version.substring(0, 80));

  await client.end();
} catch (error) {
  console.error("❌ Connection failed:", error.message);
  process.exit(1);
}
