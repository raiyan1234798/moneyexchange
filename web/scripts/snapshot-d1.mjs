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

// PUBLIC display data only. NEVER include collections that can hold secrets or
// personal data — users, invites, audit, notifications, and app_config (it
// carries the upload-lock password + granted emails). This file is served
// unauthenticated, so anything listed here is world-readable.
// A safety net below refuses to write a snapshot containing credential-ish keys.
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
// Safety net: never ship a snapshot carrying anything credential-shaped.
const FORBIDDEN = /"(password|passwordHash|secret|token|apiKey|grantedEmails|refreshToken)"\s*:/i;
const hit = json.match(FORBIDDEN);
if (hit) {
  throw new Error(
    `Refusing to write snapshot: it contains ${hit[1]}. This file is served publicly — ` +
      `remove that collection/field from COLLECTIONS above.`,
  );
}
writeFileSync("public/data/snapshot.json", json);
console.log(`snapshot written: ${(json.length / 1024 / 1024).toFixed(2)} MB`);
