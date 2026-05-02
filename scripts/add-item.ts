/**
 * Interactive helper for adding a new source item to config/items.json.
 *
 * Usage:
 *   tsx scripts/add-item.ts
 *
 * Prompts for raw content, sanitized content, attribution, source URL, and
 * tags. Validates the result against SourceItemSchema before writing.
 *
 * Sanitization is the critical step. The rule:
 *   Every claim must be attributed to its source, in past tense, without
 *   implying the brand affects any outcome. If unsure, raise to a human —
 *   don't guess.
 */
import "dotenv/config";
import { readFile, writeFile } from "node:fs/promises";
import { createInterface } from "node:readline";
import { ItemBankSchema, SourceItemSchema } from "../src/types/index.js";

const rl = createInterface({ input: process.stdin, output: process.stdout });
const ask = (q: string): Promise<string> =>
  new Promise((resolve) => rl.question(q, resolve));

async function main() {
  console.log("\n=== Add New Source Item ===\n");
  console.log(
    "Sanitization rule: every claim must be attributed to its source,\n" +
    "in past tense, without implying the brand affects any outcome.\n"
  );

  const bankRaw = await readFile("config/items.json", "utf8");
  const bank = ItemBankSchema.parse(JSON.parse(bankRaw));

  const nextNumber = Math.max(0, ...bank.items.map((i) => i.number)) + 1;
  const nextId = `item-${String(nextNumber).padStart(3, "0")}`;

  console.log(`New item ID will be: ${nextId}\n`);

  const rawContent = await ask("Raw content (verbatim from source):\n> ");
  console.log(
    "\nNow write the sanitized version. It must:\n" +
    "  - Attribute findings to the source, not the brand\n" +
    "  - Use past tense (found, showed, associated with)\n" +
    "  - Not imply the brand causes any outcome\n"
  );
  const sanitizedContent = await ask("Sanitized content:\n> ");
  const attribution = await ask("Attribution (e.g. 'Smith et al., 2024'):\n> ");
  const sourceUrl = await ask("Source URL:\n> ");
  const tagsInput = await ask("Tags (comma-separated, e.g. 'nutrition,fiber'):\n> ");
  const template = await ask("Template ID (default: 'default'):\n> ") || "default";
  const notes = await ask("Notes (optional):\n> ");

  const tags = tagsInput
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);

  const newItem = SourceItemSchema.parse({
    id: nextId,
    number: nextNumber,
    raw_content: rawContent.trim(),
    sanitized_content: sanitizedContent.trim(),
    attribution: attribution.trim(),
    source_url: sourceUrl.trim(),
    tags,
    template,
    status: "unused",
    date_added: new Date().toISOString().slice(0, 10),
    notes: notes.trim() || undefined,
  });

  console.log("\n--- Preview ---");
  console.log(JSON.stringify(newItem, null, 2));
  const confirm = await ask("\nWrite to config/items.json? (y/N) ");

  if (confirm.trim().toLowerCase() !== "y") {
    console.log("Aborted.");
    rl.close();
    return;
  }

  bank.items.push(newItem);
  await writeFile(
    "config/items.json",
    JSON.stringify(bank, null, 2) + "\n",
    "utf8"
  );

  console.log(`\nAdded ${nextId} to config/items.json.`);
  console.log("Run `npm run items:seed` to validate the full bank.");
  rl.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
