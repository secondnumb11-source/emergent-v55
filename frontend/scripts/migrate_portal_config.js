#!/usr/bin/env node
// Migrate legacy <!--PORTAL_CONFIG:...:END--> from clients.notes and employees.notes
// into the new portal_config JSONB column for clients and employees.

const { createClient } = require("@supabase/supabase-js");

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Please set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in environment");
  process.exit(1);
}

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const CONFIG_MARK = "<!--PORTAL_CONFIG:";
const CONFIG_END = ":END-->";

async function migrateTable(table) {
  console.log("Scanning", table);
  const { data, error } = await supabase.from(table).select("id, notes, portal_config").limit(1000);
  if (error) throw error;
  for (const row of data) {
    if (row.portal_config) continue; // already has structured config
    if (!row.notes) continue;
    const m = row.notes.match(new RegExp(`${CONFIG_MARK}([\\s\\S]*?)${CONFIG_END}`));
    if (!m) continue;
    try {
      const cfg = JSON.parse(m[1]);
      const user_notes = row.notes
        .replace(new RegExp(`${CONFIG_MARK}[\\s\\S]*?${CONFIG_END}`, "g"), "")
        .trim();
      const portal_config = { ...cfg, user_notes };
      const { error: up } = await supabase.from(table).update({ portal_config }).eq("id", row.id);
      if (up) console.error("Failed to update", table, row.id, up.message);
      else console.log("Migrated", table, row.id);
    } catch (e) {
      console.error("Failed parse for", table, row.id, e.message);
    }
  }
}

(async () => {
  try {
    await migrateTable("clients");
    await migrateTable("employees");
    console.log("Done");
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
})();
