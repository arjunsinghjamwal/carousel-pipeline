/**
 * Push all approved drafts to Buffer.
 *
 *   npm run push-approved
 *
 * A draft is considered approved if drafts/{item_id}/approved.json exists and
 * drafts/{item_id}/rejected.json does not.
 *
 * Composed slides must be uploaded to a publicly accessible URL before calling
 * this script. Update the getMediaUrls() function below to match your hosting
 * strategy (e.g. upload to S3/GCS and return the public URLs).
 *
 * Docs: docs/SPEC.md §3.5
 */
import "dotenv/config";
import { readdir, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

import { getDb, closeDb } from "../src/lib/db.js";
import { SlideDraftSchema } from "../src/types/index.js";
import { log } from "../src/lib/log.js";
import pushToBuffer from "../src/pipeline/push-to-buffer.js";

const DRAFTS_DIR = "drafts";

async function getApprovedItemIds(): Promise<string[]> {
  const entries = await readdir(DRAFTS_DIR, { withFileTypes: true }).catch(() => []);
  const approved: string[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const draftDir = path.join(DRAFTS_DIR, entry.name);
    if (
      existsSync(path.join(draftDir, "approved.json")) &&
      !existsSync(path.join(draftDir, "rejected.json"))
    ) {
      approved.push(entry.name);
    }
  }
  return approved;
}

/**
 * Return public URLs for the composed slides.
 *
 * TODO: Replace this stub with your actual hosting logic (S3, GCS, CDN, etc.).
 * Buffer fetches these URLs at publish time — they must be publicly accessible.
 */
async function getMediaUrls(itemId: string): Promise<string[]> {
  const slidesDir = path.join(DRAFTS_DIR, itemId, "slides");
  if (!existsSync(slidesDir)) return [];

  const files = (await readdir(slidesDir))
    .filter((f) => f.endsWith(".png"))
    .sort();

  // Placeholder — replace with real upload + URL generation
  throw new Error(
    `getMediaUrls() is not implemented. Upload slides for ${itemId} to a public host and return their URLs.`
  );

  // Example implementation:
  // return Promise.all(files.map(f => uploadToS3(path.join(slidesDir, f))));
}

async function main() {
  const db = getDb();
  const approvedIds = await getApprovedItemIds();

  if (approvedIds.length === 0) {
    log.info("No approved drafts to push.");
    return;
  }

  log.info({ count: approvedIds.length }, "pushing approved drafts to Buffer");

  for (const itemId of approvedIds) {
    try {
      const slidesRaw = await readFile(
        path.join(DRAFTS_DIR, itemId, "slides.json"),
        "utf8"
      );
      const draft = SlideDraftSchema.parse(JSON.parse(slidesRaw));
      const mediaUrls = await getMediaUrls(itemId);

      // Schedule for tomorrow noon UTC by default.
      // Adjust this logic to match your posting schedule.
      const scheduledAt = new Date();
      scheduledAt.setUTCDate(scheduledAt.getUTCDate() + 1);
      scheduledAt.setUTCHours(12, 0, 0, 0);

      const updateId = await pushToBuffer(draft, itemId, mediaUrls, scheduledAt);

      db.prepare(
        `INSERT OR IGNORE INTO posts (id, item_id, buffer_update_id, scheduled_at, caption, created_at)
         VALUES (?, ?, ?, ?, ?, datetime('now'))`
      ).run(
        itemId,
        itemId,
        updateId,
        scheduledAt.toISOString(),
        draft.caption
      );

      log.info({ item_id: itemId, buffer_update_id: updateId }, "pushed");
    } catch (err) {
      log.error({ item_id: itemId, err }, "push failed — skipping");
    }
  }
}

main()
  .catch((err) => {
    log.error({ err }, "push-approved failed");
    process.exit(1);
  })
  .finally(() => closeDb());
