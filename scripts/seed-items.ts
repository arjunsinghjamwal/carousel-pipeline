/**
 * Validate config/items.json against the ItemBankSchema.
 *
 * Run after editing items.json to catch schema errors before the pipeline sees them:
 *   npm run items:seed
 *
 * This does not write to the database — the pipeline reads items.json directly
 * at runtime. The purpose of this command is validation and a dry-run report.
 */
import "dotenv/config";
import { loadItemBank } from "../src/lib/config-loader.js";

const bank = await loadItemBank();

const total = bank.items.length;
const byStatus = bank.items.reduce<Record<string, number>>((acc, item) => {
  acc[item.status] = (acc[item.status] ?? 0) + 1;
  return acc;
}, {});

console.log(`items.json v${bank.version} — ${total} items`);
for (const [status, count] of Object.entries(byStatus)) {
  console.log(`  ${status}: ${count}`);
}

// Warn on duplicate IDs
const ids = bank.items.map((i) => i.id);
const dupes = ids.filter((id, idx) => ids.indexOf(id) !== idx);
if (dupes.length > 0) {
  console.error(`ERROR: duplicate item IDs: ${dupes.join(", ")}`);
  process.exit(1);
}

// Warn on items with raw_content === sanitized_content (likely unsanitized)
const unsanitized = bank.items.filter(
  (i) => i.raw_content === i.sanitized_content && i.status !== "retired"
);
if (unsanitized.length > 0) {
  console.warn(
    `WARN: ${unsanitized.length} item(s) have identical raw and sanitized content — review before running the pipeline:`
  );
  for (const item of unsanitized) {
    console.warn(`  ${item.id}`);
  }
}

console.log("Validation passed.");
