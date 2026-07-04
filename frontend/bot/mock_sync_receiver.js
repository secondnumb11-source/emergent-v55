const http = require("http");
const fs = require("fs");
const path = require("path");
const PORT = process.env.PORT || 4000;
const EXPECTED_TOKEN = process.env.SYNC_TOKEN || "testtoken";
const OUT = path.join(__dirname, "received_payload.json");

function countItems(payload) {
  const keys = [
    "cases",
    "powers",
    "executions",
    "sessions",
    "documents",
    "case_details",
    "case_parties",
    "case_sessions_detail",
    "case_judgments",
    "lawsuit_requests",
  ];
  let total = 0;
  let counts = {};
  for (const k of keys) {
    const n = Array.isArray(payload[k]) ? payload[k].length : 0;
    counts[k] = n;
    total += n;
  }
  return { total, counts };
}

const server = http.createServer((req, res) => {
  if (req.url === "/api/public/najiz-sync") {
    if (req.method === "OPTIONS") return res.end();
    if (req.method !== "POST") return res.writeHead(405).end("Method");
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      const token = (req.headers["x-sync-token"] || "").toString();
      if (!token || token !== EXPECTED_TOKEN) {
        res.writeHead(401, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: "unauthorized" }));
        console.log("[mock] rejected request missing/invalid token");
        return;
      }
      let payload = null;
      try {
        payload = JSON.parse(body);
      } catch (e) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: "invalid json" }));
        return;
      }
      const info = countItems(payload || {});
      const out = {
        received_at: new Date().toISOString(),
        headers: req.headers,
        counts: info.counts,
        total: info.total,
        kind: payload.kind,
      };
      try {
        fs.writeFileSync(OUT, JSON.stringify({ meta: out, payload }, null, 2));
      } catch (e) {
        console.error("[mock] write error", e.message);
      }
      console.log("[mock] received", out);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true, total: out.total, inserted: out.total, updated: 0 }));
    });
    return;
  }
  if (req.method === "GET") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, msg: "mock sync receiver" }));
    return;
  }
  res.writeHead(404).end();
});

server.listen(PORT, () =>
  console.log(`[mock] najiz-sync receiver listening on http://localhost:${PORT}`),
);
