import crypto from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { SlideDraftSchema, type SlideDraft, type SourceItem } from "../types/index.js";
import { ClaudeClient } from "../lib/claude-client.js";
import { extractJson } from "../lib/extract-json.js";
import { PipelineError } from "../lib/errors.js";
import { log } from "../lib/log.js";
import {
  loadBrandCopy,
  loadBrandTokens,
  loadBrandVoice,
  loadFewShotExamples,
  loadTemplate,
  loadTripwires,
} from "../lib/config-loader.js";
import { checkTripwires } from "../lib/tripwire-check.js";
import type { TripwireConfig } from "../types/index.js";

const STAGE = "content";
const PIPELINE_VERSION = "1.0.0";
const PROMPT_PATH = path.join("config", "prompts", "content-gen.md");

/**
 * Stage 1: generate slide copy and caption from a source item.
 *
 * Reads config from config/ at runtime, calls Claude, validates the response,
 * runs the tripwire check, and writes drafts/{item_id}/slides.json +
 * drafts/{item_id}/metadata.json.
 *
 * Throws PipelineError on tripwire violations or unrecoverable API failures.
 * Does NOT catch errors from the Claude client — let them propagate to the
 * orchestrator, which owns retry policy.
 *
 * Docs: docs/SPEC.md §3.1
 */
export default async function generateContent(item: SourceItem): Promise<SlideDraft> {
  const start = Date.now();

  if (!existsSync(PROMPT_PATH)) {
    throw new PipelineError(
      `Prompt file not found at ${PROMPT_PATH}. Copy config.example/prompts/ to config/prompts/.`,
      { stage: STAGE, item_id: item.id }
    );
  }

  const templatePath = path.join("config", "templates", `${item.template}.md`);
  if (!existsSync(templatePath)) {
    throw new PipelineError(
      `Template '${item.template}' not found at ${templatePath}`,
      { stage: STAGE, item_id: item.id }
    );
  }

  const [voice, tripwires, tokens, copy, templateBlueprint, fewShot, promptMd] =
    await Promise.all([
      loadBrandVoice(),
      loadTripwires(),
      loadBrandTokens(),
      loadBrandCopy(),
      loadTemplate(item.template),
      loadFewShotExamples(),
      readFile(PROMPT_PATH, "utf8"),
    ]);

  // The prompt lives inside a markdown code fence in the .md file.
  const fenceMatch = promptMd.match(/^```\n([\s\S]+?)^```/m);
  const promptText = fenceMatch ? fenceMatch[1].trim() : promptMd;

  const copyAny = copy as Record<string, unknown>;
  const vars: Record<string, string> = {
    brand_voice: voice,
    tripwires_summary: summarizeTripwires(tripwires),
    example_correct_attribution:
      String((copyAny.example_attributions as Record<string, string> | undefined)?.correct ?? "[Author et al., Year] found that..."),
    example_wrong_attribution:
      String((copyAny.example_attributions as Record<string, string> | undefined)?.wrong ?? "Our data shows..."),
    tagline: copy.tagline,
    slide_count: String(tokens.carousel.slide_count),
    template_id: item.template,
    template_blueprint: templateBlueprint,
    cta_example: copy.cta_keywords[0] ?? "SAVE",
    few_shot_examples: fewShot,
    item_id: item.id,
    sanitized_content: item.sanitized_content,
    attribution: item.attribution,
    source_url: item.source_url,
    tags: item.tags.join(", "),
  };

  const filledPrompt = renderTemplate(promptText, vars);
  const client = new ClaudeClient();

  // Attempt 1
  let rawText = await client.complete({
    system: filledPrompt,
    messages: [
      { role: "user", content: `Generate the carousel JSON for item ${item.id}.` },
    ],
  });

  let parsed: unknown;
  let attempts = 1;

  try {
    parsed = extractJson(rawText);
  } catch (parseErr) {
    // Single retry: append the parse error so Claude can self-correct.
    attempts = 2;
    rawText = await client.complete({
      system: filledPrompt,
      messages: [
        { role: "user", content: `Generate the carousel JSON for item ${item.id}.` },
        { role: "assistant", content: rawText },
        {
          role: "user",
          content: `JSON parse failed: ${String(parseErr)}. Output only a valid JSON object — no prose, no markdown fences.`,
        },
      ],
    });
    parsed = extractJson(rawText);
  }

  const draft = SlideDraftSchema.parse(parsed);

  // Tripwire check
  const violations = checkTripwires(draft, tripwires);
  const passed = violations.length === 0;

  // Write outputs
  const draftDir = path.join("drafts", item.id);
  await mkdir(draftDir, { recursive: true });

  const slidesJson = JSON.stringify(draft, null, 2);
  await writeFile(path.join(draftDir, "slides.json"), slidesJson, "utf8");

  const hash = crypto.createHash("sha256").update(slidesJson).digest("hex");
  const metadata = {
    item_id: item.id,
    created_at: new Date().toISOString(),
    pipeline_version: PIPELINE_VERSION,
    generation_attempts: attempts,
    tripwire_checks: { passed, violations },
    hash,
  };
  await writeFile(
    path.join(draftDir, "metadata.json"),
    JSON.stringify(metadata, null, 2),
    "utf8"
  );

  const duration_ms = Date.now() - start;
  log.info(
    { item_id: item.id, stage: STAGE, duration_ms, tripwire_passed: passed, attempts },
    "content generated"
  );

  if (!passed) {
    throw new PipelineError(
      `Tripwire violations: ${violations.map((v) => `"${v.phrase}" (${v.category_id})`).join(", ")}`,
      { stage: STAGE, item_id: item.id }
    );
  }

  return draft;
}

/** Replace {{key}} placeholders with values from vars. */
function renderTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => vars[key] ?? "");
}

function summarizeTripwires(config: TripwireConfig): string {
  return config.categories
    .map(
      (cat) =>
        `**${cat.id}** — ${cat.description}\n` +
        `Rationale: ${cat.rationale}\n` +
        cat.phrases
          .map((p) => `  - "${p.value}" (${p.match})`)
          .join("\n")
    )
    .join("\n\n");
}
