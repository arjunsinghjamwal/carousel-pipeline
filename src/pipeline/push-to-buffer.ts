import { PipelineError } from "../lib/errors.js";
import { log } from "../lib/log.js";
import { BufferClient } from "../lib/buffer-client.js";
import type { SlideDraft } from "../types/index.js";

const STAGE = "publish";

/**
 * Stage 5: push a composed carousel to Buffer's scheduled queue.
 *
 * Refuses to run unless NODE_ENV=production. This is a hard guard against
 * accidentally publishing from a dev environment.
 *
 * @param draft The approved SlideDraft (caption + hashtags).
 * @param itemId The source item ID (for error context).
 * @param mediaUrls Public URLs for the composed slide PNGs (in slide order).
 *                  Buffer fetches these at publish time — they must be
 *                  publicly accessible.
 * @param scheduledAt UTC datetime to publish. Buffer scheduled_at is always
 *                    UTC regardless of the profile's timezone setting.
 * @returns The Buffer update_id (stored in posts.buffer_update_id).
 *
 * Docs: docs/SPEC.md §3.5
 */
export default async function pushToBuffer(
  draft: SlideDraft,
  itemId: string,
  mediaUrls: string[],
  scheduledAt: Date
): Promise<string> {
  if (process.env.NODE_ENV !== "production") {
    throw new PipelineError(
      `Refusing to publish: NODE_ENV="${process.env.NODE_ENV}". Set NODE_ENV=production to enable publishing.`,
      { stage: STAGE, item_id: itemId }
    );
  }

  const start = Date.now();
  const client = new BufferClient();

  // Assemble caption: body + hashtags
  const caption = [draft.caption, ...draft.hashtags].join(" ");

  if (caption.length > 2200) {
    throw new PipelineError(
      `Caption is ${caption.length} chars — Instagram rejects captions over 2200 chars. Edit the caption before pushing.`,
      { stage: STAGE, item_id: itemId }
    );
  }

  if (mediaUrls.length === 0) {
    throw new PipelineError(
      "No media URLs provided. Compose slides before publishing.",
      { stage: STAGE, item_id: itemId }
    );
  }

  const updateId = await client.schedulePost({
    media_urls: mediaUrls,
    text: caption,
    scheduled_at: scheduledAt,
  });

  const duration_ms = Date.now() - start;
  log.info(
    { item_id: itemId, stage: STAGE, duration_ms, buffer_update_id: updateId },
    "pushed to Buffer"
  );

  return updateId;
}
