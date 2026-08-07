/**
 * Build a STATIC snapshot of the public display data from D1.
 *
 * Cloudflare Pages serves static assets free and unlimited, while Pages
 * Functions have a daily request ceiling. The app reads this snapshot whenever
 * the live API is unavailable, so TVs and dashboards keep showing real data
 * instead of erroring. Regenerate with: node scripts/snapshot-d1.mjs
 */
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";

// PUBLIC display data only — never users/invites/audit/notifications, which
// would otherwise be readable as a plain static file.
const COLLECTIONS = [
  { name: "branches" },
  { name: "exchange_rates" },
  { name: "transfer_rates" },
  { name: "currencies" },
  { name: "ticker_messages" },
  { name: "videos" },
  // Skip docs still carrying inline base64 media — they would bloat the file.
  { name: "image_adverts", maxLen: 20000 },
  { name: "branch_display_prefs" },
  { name: "app_config" },
];

function query(sql) {
  const out = execFileSync(
    "npx",
    ["wrangler", "d1", "execute", "unimoni", "--remote", "--json", "--command", sql],
    { encoding: "utf8", maxBuffer: 512 * 1024 * 1024 },
  );
  const start = out.indexOf("[");
  return JSON.parse(out.slice(start))[0].results ?? [];
}

const snapshot = { generatedAt: new Date().toISOString(), collections: {} };
for (const { name, maxLen } of COLLECTIONS) {
  const where = maxLen ? ` AND LENGTH(data_json) < ${maxLen}` : "";
  const rows = query(
    `SELECT id, data_json, updated_at FROM documents WHERE collection = '${name}'${where}`,
  );
  snapshot.collections[name] = rows.map((r) => {
    let data = {};
    try {
      data = JSON.parse(r.data_json || "{}");
    } catch {
      data = {};
    }
    return { id: r.id, ...data, updatedAt: data.updatedAt || r.updated_at };
  });
  console.log(`  ${name}: ${snapshot.collections[name].length} docs`);
}

const json = JSON.stringify(snapshot);
writeFileSync("public/data/snapshot.json", json);
console.log(`snapshot written: ${(json.length / 1024 / 1024).toFixed(2)} MB`);
