import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  BrandCopySchema,
  BrandTokensSchema,
  ItemBankSchema,
  TripwireConfigSchema,
  type BrandCopy,
  type BrandTokens,
  type ItemBank,
  type TripwireConfig,
} from "../types/index.js";

const CONFIG_DIR = "config";

/**
 * Parse a JSON file, tolerating the _comment / $schema annotation keys that
 * config.example files use. Zod strips unknown top-level keys; nested
 * _comment keys inside z.record() fields are filtered at call sites.
 */
async function loadJson(relPath: string): Promise<unknown> {
  const fullPath = path.join(CONFIG_DIR, relPath);
  const text = await readFile(fullPath, "utf8");
  return JSON.parse(text);
}

export async function loadTripwires(): Promise<TripwireConfig> {
  return TripwireConfigSchema.parse(await loadJson("brand/tripwires.json"));
}

export async function loadBrandTokens(): Promise<BrandTokens> {
  return BrandTokensSchema.parse(await loadJson("brand/tokens.json"));
}

export async function loadBrandCopy(): Promise<BrandCopy> {
  return BrandCopySchema.parse(await loadJson("brand/copy.json"));
}

export async function loadBrandVoice(): Promise<string> {
  return readFile(path.join(CONFIG_DIR, "brand/voice.md"), "utf8");
}

export async function loadItemBank(): Promise<ItemBank> {
  return ItemBankSchema.parse(await loadJson("items.json"));
}

/**
 * Load the optional few-shot examples file. Returns an empty string if the
 * file doesn't exist — few-shot.json is not required.
 */
export async function loadFewShotExamples(): Promise<string> {
  try {
    const raw = await loadJson("few-shot.json");
    return JSON.stringify(raw, null, 2);
  } catch {
    return "";
  }
}

export async function loadTemplate(templateId: string): Promise<string> {
  const templatePath = path.join(CONFIG_DIR, "templates", `${templateId}.md`);
  return readFile(templatePath, "utf8");
}
