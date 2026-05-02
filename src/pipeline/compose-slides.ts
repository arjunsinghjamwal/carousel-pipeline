import { mkdir, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

import puppeteer from "puppeteer";

import { loadBrandCopy, loadBrandTokens } from "../lib/config-loader.js";
import { log } from "../lib/log.js";
import type { SlideDraft } from "../types/index.js";

const STAGE = "compose";

/**
 * Stage 3: compose each slide into a final PNG using Puppeteer.
 *
 * Loads templates/slide.html, injects CSS variables from config/brand/tokens.json,
 * renders each slide with its Gemini-generated background and Claude-generated
 * copy, and screenshots to drafts/{item_id}/slides/slide-NN.png.
 *
 * Each carousel launches a fresh browser instance to avoid memory leaks across
 * batch runs.
 *
 * Fonts must be self-hosted in templates/fonts/ as woff2. Do not rely on
 * system fonts — they are not available in headless Chromium.
 *
 * Docs: docs/SPEC.md §3.3
 */
export default async function composeSlides(
  draft: SlideDraft,
  itemId: string,
  imagePaths: string[]
): Promise<string[]> {
  const start = Date.now();

  const [tokens, copy] = await Promise.all([loadBrandTokens(), loadBrandCopy()]);
  const { width, height } = tokens.slide_dimensions;

  const templateHtmlPath = path.join("templates", "slide.html");
  if (!existsSync(templateHtmlPath)) {
    throw new Error(
      `Slide template not found at ${templateHtmlPath}. Create templates/slide.html to enable composition.`
    );
  }
  const templateHtml = await readFile(templateHtmlPath, "utf8");

  // Build CSS custom properties from brand tokens (skip annotation keys)
  const cssVars = Object.entries(tokens.colors)
    .filter(([k]) => !k.startsWith("_"))
    .map(([k, v]) => `--color-${k}: ${v};`)
    .join(" ");

  const outputDir = path.join("drafts", itemId, "slides");
  await mkdir(outputDir, { recursive: true });

  const browser = await puppeteer.launch({ headless: true });
  const composedPaths: string[] = [];

  try {
    for (const slide of draft.slides) {
      const page = await browser.newPage();
      await page.setViewport({ width, height, deviceScaleFactor: 1 });

      const imagePath = imagePaths[slide.index - 1];
      const imageDataUrl =
        imagePath && existsSync(imagePath)
          ? await fileToDataUrl(imagePath)
          : "";

      const html = templateHtml
        .replace(/\{\{CSS_VARS\}\}/g, cssVars)
        .replace(/\{\{SLIDE_ROLE\}\}/g, slide.role)
        .replace(/\{\{SLIDE_INDEX\}\}/g, String(slide.index))
        .replace(/\{\{HEADLINE\}\}/g, escapeHtml(slide.headline))
        // Strip high-codepoint emoji from body — they break Puppeteer font rendering.
        // Caption emoji are fine (IG renders those); slide body emoji are not.
        .replace(/\{\{BODY\}\}/g, escapeHtml(stripHighCpEmoji(slide.body)))
        .replace(/\{\{HIGHLIGHT_WORD\}\}/g, escapeHtml(slide.highlight_word ?? ""))
        .replace(/\{\{IMAGE_URL\}\}/g, imageDataUrl)
        .replace(/\{\{BRAND_NAME\}\}/g, escapeHtml(copy.brand_name))
        .replace(/\{\{TAGLINE\}\}/g, escapeHtml(copy.tagline));

      await page.setContent(html, { waitUntil: "networkidle0" });

      const paddedIndex = slide.index.toString().padStart(2, "0");
      const outputPath = path.join(outputDir, `slide-${paddedIndex}.png`);

      await page.screenshot({ path: outputPath as `${string}.png`, type: "png" });
      composedPaths.push(outputPath);

      await page.close();
    }
  } finally {
    await browser.close();
  }

  const duration_ms = Date.now() - start;
  log.info(
    { item_id: itemId, stage: STAGE, duration_ms, slide_count: composedPaths.length },
    "slides composed"
  );

  return composedPaths;
}

async function fileToDataUrl(filePath: string): Promise<string> {
  const data = await readFile(filePath);
  const ext = path.extname(filePath).slice(1);
  return `data:image/${ext};base64,${data.toString("base64")}`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function stripHighCpEmoji(s: string): string {
  return s.replace(/[\u{10000}-\u{10FFFF}]/gu, "");
}
