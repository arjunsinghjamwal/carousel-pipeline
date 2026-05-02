import { mkdir } from "node:fs/promises";
import path from "node:path";

import { GeminiClient } from "../lib/gemini-client.js";
import { log } from "../lib/log.js";
import type { SlideDraft } from "../types/index.js";

const STAGE = "images";

/**
 * Stage 2: generate background images for each slide via Gemini.
 *
 * Writes PNGs to drafts/{item_id}/images/slide-NN.png.
 * Returns the list of output paths in slide order.
 *
 * If a single image fails, logs a warning and continues — the composition
 * step handles a missing image path gracefully (solid-color fallback).
 *
 * Docs: docs/SPEC.md §3.2
 */
export default async function generateImages(
  draft: SlideDraft,
  itemId: string
): Promise<string[]> {
  const start = Date.now();
  const client = new GeminiClient();

  const imageDir = path.join("drafts", itemId, "images");
  await mkdir(imageDir, { recursive: true });

  const imagePaths: string[] = [];

  for (const slide of draft.slides) {
    const paddedIndex = slide.index.toString().padStart(2, "0");
    const outputPath = path.join(imageDir, `slide-${paddedIndex}.png`);

    try {
      await client.generateImage(slide.image_prompt, outputPath);
      imagePaths.push(outputPath);
    } catch (err) {
      log.warn(
        { item_id: itemId, stage: STAGE, slide_index: slide.index, err },
        "image generation failed — slide will use solid-color fallback in composition"
      );
      // Push an empty string so imagePaths stays aligned with slide indices.
      imagePaths.push("");
    }
  }

  const successCount = imagePaths.filter(Boolean).length;
  const duration_ms = Date.now() - start;
  log.info(
    { item_id: itemId, stage: STAGE, duration_ms, success: successCount, total: draft.slides.length },
    "images generated"
  );

  return imagePaths;
}
