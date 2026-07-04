#!/usr/bin/env node
/**
 * محاولة استخراج DATABASE_URL من Supabase Management API
 * Attempt to extract DATABASE_URL from Supabase Management API
 */

import https from "https";

const SUPABASE_PROJECT_ID = "sofurxihjwgmbosyzeib";
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SERVICE_ROLE_KEY) {
  console.error("❌ SUPABASE_SERVICE_ROLE_KEY not set");
  process.exit(1);
}

// Try to get database password from Supabase Management API
function fetchDatabase() {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: "api.supabase.com",
      path: `/v1/projects/${SUPABASE_PROJECT_ID}/database/ssl-enforcement`,
      method: "GET",
      headers: {
        Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json",
      },
    };

    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          const json = JSON.parse(data);
          resolve(json);
        } catch (e) {
          reject(new Error(`HTTP ${res.statusCode}: ${data}`));
        }
      });
    });

    req.on("error", reject);
    req.end();
  });
}

async function main() {
  try {
    console.log("🔍 Attempting to connect to Supabase database...\n");

    // Supabase Management API might require specific access
    // Alternative: directly try connecting with common postgres credentials

    const { spawn } = await import("child_process");

    // Try common Supabase connection strings
    const hostnames = [
      `db.${SUPABASE_PROJECT_ID}.supabase.co`,
      `${SUPABASE_PROJECT_ID}.supabase.co`,
    ];

    // Attempt to get database info
    const apiResult = await fetchDatabase().catch((e) => ({ error: e.message }));

    if (apiResult.error) {
      console.log("⚠️  Could not access Management API:", apiResult.error);
      console.log("\n📌 Next step: Provide DATABASE_URL manually");
    } else {
      console.log("✅ API access successful");
      console.log(JSON.stringify(apiResult, null, 2));
    }
  } catch (error) {
    console.error("Error:", error.message);
  }
}

main();
