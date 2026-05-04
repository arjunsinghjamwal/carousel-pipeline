/**
 * Pipeline orchestrator.
 *
 * Single item:
 *   npm run pipeline -- --item item-001
 *
 * Batch (all unused items):
 *   npm run pipeline:daily
 *
 * Dry run (no API calls — validates config and item, then exits):
 *   npm run test:e2e
 *
 * Docs: docs/SPEC.md §2 (pipeline overview)
 */
import "dotenv/config";
import { parseArgs } from "node:util";
import { mkdirSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { getDb, closeDb } from "../src/lib/db.js";
import { loadItemBank } from "../src/lib/config-loader.js";
import { PipelineError } from "../src/lib/errors.js";
import { log } from "../src/lib/log.js";
import generateContent from "../src/pipeline/generate-content.js";
import generateImages from "../src/pipeline/generate-images.js";
import composeSlides from "../src/pipeline/compose-slides.js";
import { mockSlideDraft } from "../src/lib/mock-draft.js";
import type { SourceItem } from "../src/types/index.js";

const { values: args } = parseArgs({
  args: process.argv.slice(2),
  options: {
    item:      { type: "string" },
    batch:     { type: "boolean", default: false },
    "dry-run": { type: "boolean", default: false },
    mock:      { type: "boolean", default: false },
  },
});

const isDryRun = args["dry-run"] as boolean;
const isMock = args["mock"] as boolean;

async function runItem(item: SourceItem): Promise<void> {
  const db = getDb();
  const startedAt = new Date().toISOString();

  const logRun = (stage: string, status: "started" | "completed" | "failed", error?: string) => {
    db.prepare(
      `INSERT INTO generation_runs (item_id, stage, status, started_at, completed_at, error_message, pipeline_version)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(
      item.id,
      stage,
      status,
      startedAt,
      status !== "started" ? new Date().toISOString() : null,
      error ?? null,
      "1.0.0"
    );
  };

  log.info({ item_id: item.id }, "pipeline started");
  if (isMock) log.warn({ item_id: item.id }, "[mock] demo mode — no API calls will be made");

  // Stage 1: content generation
  logRun("content", "started");
  let draft;
  try {
    if (isDryRun) {
      log.info({ item_id: item.id }, "[dry-run] skipping content generation");
      logRun("content", "completed");
      return;
    }
    draft = isMock ? mockSlideDraft(item) : await generateContent(item);
    if (isMock) {
      // generateContent writes slides.json + metadata.json; mock mode skips it,
      // so write both here so the review server can find the draft.
      const draftDir = path.join("drafts", item.id);
      mkdirSync(draftDir, { recursive: true });
      await Promise.all([
        writeFile(
          path.join(draftDir, "slides.json"),
          JSON.stringify(draft, null, 2),
          "utf8"
        ),
        writeFile(
          path.join(draftDir, "metadata.json"),
          JSON.stringify({
            item_id: item.id,
            pipeline_version: "1.0.0",
            created_at: new Date().toISOString(),
            model: "mock",
            generation_attempts: 1,
            tripwire_checks: { passed: true, violations: [] },
          }, null, 2),
          "utf8"
        ),
      ]);
    }
    logRun("content", "completed");
  } catch (err) {
    const msg = err instanceof PipelineError ? err.message : String(err);
    logRun("content", "failed", msg);
    log.error({ item_id: item.id, stage: "content", err }, "stage failed");
    throw err;
  }

  // Stage 2: image generation
  logRun("images", "started");
  let imagePaths: string[];
  try {
    if (isMock) {
      imagePaths = [];
      log.info({ item_id: item.id }, "[mock] skipping image generation");
    } else {
      imagePaths = await generateImages(draft, item.id);
    }
    logRun("images", "completed");
  } catch (err) {
    const msg = err instanceof PipelineError ? err.message : String(err);
    logRun("images", "failed", msg);
    log.error({ item_id: item.id, stage: "images", err }, "stage failed");
    throw err;
  }

  // Stage 3: slide composition
  logRun("compose", "started");
  try {
    await composeSlides(draft, item.id, imagePaths);
    logRun("compose", "completed");
  } catch (err) {
    const msg = err instanceof PipelineError ? err.message : String(err);
    logRun("compose", "failed", msg);
    log.error({ item_id: item.id, stage: "compose", err }, "stage failed");
    throw err;
  }

  log.info({ item_id: item.id }, "pipeline completed — draft ready for review");
}

async function main() {
  const bank = await loadItemBank();

  let items: SourceItem[];

  if (args.item) {
    const found = bank.items.find((i) => i.id === args.item);
    if (!found) {
      log.error({ item_id: args.item }, "item not found in config/items.json");
      process.exit(1);
    }
    items = [found];
  } else if (args.batch) {
    items = bank.items.filter((i) => i.status === "unused");
    log.info({ count: items.length }, "batch run: processing unused items");
  } else {
    console.error("Usage: npm run pipeline -- --item item-001  OR  npm run pipeline:daily");
    process.exit(1);
  }

  let failed = 0;
  for (const item of items) {
    try {
      await runItem(item);
    } catch {
      failed++;
      // Batch runs continue on failure; single runs exit after logging.
      if (!args.batch) process.exit(1);
    }
  }

  if (failed > 0) {
    log.warn({ failed, total: items.length }, "batch completed with failures");
    process.exit(1);
  }
}

main()
  .catch((err) => {
    log.error({ err }, "orchestrator error");
    process.exit(1);
  })
  .finally(() => closeDb());
