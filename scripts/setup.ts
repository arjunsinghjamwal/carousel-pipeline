/**
 * Guided first-run setup wizard.
 *
 * Usage:
 *   npm run setup
 *
 * Phases:
 *   0 — API keys (.env, masked terminal input)
 *   1 — Brand copy  (config/brand/copy.json)
 *   2 — Brand colors (config/brand/tokens.json)
 *   3 — Voice wizard (config/brand/voice.md)
 *   4 — Tripwire setup (config/brand/tripwires.json)
 *   5 — Source item entry (config/items.json, looped)
 *   6 — Checklist summary + first-run offer
 *
 * Uses Node built-ins only. No extra packages.
 */
import { createInterface } from "node:readline";
import {
  existsSync,
  mkdirSync,
  cpSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";

// ── readline interface ────────────────────────────────────────────────────────

const rl = createInterface({ input: process.stdin, output: process.stdout });
const ask = (q: string): Promise<string> =>
  new Promise((resolve) => rl.question(q, resolve));

// Prompt with a default value shown in brackets. Returns default if user hits Enter.
async function askDefault(label: string, defaultVal: string): Promise<string> {
  const val = (await ask(`  ${label} [${defaultVal}]: `)).trim();
  return val || defaultVal;
}

// Yes/No prompt — returns true if user answers Y/y, false for N/n or Enter.
async function askYN(label: string, defaultYes = true): Promise<boolean> {
  const hint = defaultYes ? "(Y/n)" : "(y/N)";
  const raw = (await ask(`  ${label} ${hint}: `)).trim().toLowerCase();
  if (raw === "") return defaultYes;
  return raw === "y";
}

const HEX_RE = /^#[0-9A-Fa-f]{6}$/;
async function askHex(label: string, defaultVal: string): Promise<string> {
  while (true) {
    const val = (await ask(`  ${label} [${defaultVal}]: `)).trim() || defaultVal;
    if (HEX_RE.test(val)) return val;
    console.log("    Must be a 6-digit hex color, e.g. #1A2B3C. Try again.");
  }
}

// ── masked input (Phase 0) ────────────────────────────────────────────────────

/**
 * Read a secret string from stdin without echoing characters.
 * Shows * for each keystroke. Ctrl+C exits; Enter confirms.
 *
 * Keys must NEVER appear in console output, logs, or error messages.
 */
function readMasked(prompt: string): Promise<string> {
  rl.pause(); // stop readline consuming stdin while we read raw bytes
  return new Promise<string>((resolve) => {
    process.stdout.write(prompt);
    const chars: string[] = [];

    const onData = (buf: Buffer) => {
      const ch = buf.toString("utf8");
      if (ch === "\r" || ch === "\n" || ch === "\u0004" /* Ctrl+D */) {
        process.stdin.setRawMode(false);
        process.stdin.removeListener("data", onData);
        process.stdout.write("\n");
        rl.resume();
        resolve(chars.join(""));
      } else if (ch === "\u0003" /* Ctrl+C */) {
        process.stdin.setRawMode(false);
        process.stdin.removeListener("data", onData);
        process.stdout.write("\n");
        rl.close();
        process.exit(1);
      } else if (ch === "\u007f" /* DEL/Backspace */ || ch === "\b") {
        if (chars.length > 0) {
          chars.pop();
          process.stdout.write("\b \b");
        }
      } else {
        chars.push(ch);
        process.stdout.write("*");
      }
    };

    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.on("data", onData);
  });
}

// ── .env helpers ─────────────────────────────────────────────────────────────

function readDotenv(): Record<string, string> {
  if (!existsSync(".env")) return {};
  const out: Record<string, string> = {};
  for (const line of readFileSync(".env", "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    out[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
  }
  return out;
}

function writeDotenv(env: Record<string, string>) {
  const lines = Object.entries(env).map(([k, v]) => `${k}=${v}`);
  writeFileSync(".env", lines.join("\n") + "\n", "utf8");
}

function masked(val: string | undefined): string {
  if (!val) return "(not set)";
  if (val.length <= 8) return "***";
  return val.slice(0, 4) + "****" + val.slice(-4);
}

// ── Phase 0: .env / API keys ──────────────────────────────────────────────────

async function phase0Dotenv(): Promise<boolean> {
  console.log("\n── Phase 0: API keys ─────────────────────────────────────");
  const skip = !(await askYN("Configure API keys in .env?", true));
  if (skip) {
    console.log("  Skipped.");
    return false;
  }

  const existing = readDotenv();
  const env: Record<string, string> = { ...existing };

  const keys: Array<{ key: string; label: string; required: boolean }> = [
    { key: "ANTHROPIC_API_KEY", label: "Anthropic API key (Claude)", required: true },
    { key: "GEMINI_API_KEY",    label: "Google Gemini API key",       required: true },
    { key: "BUFFER_ACCESS_TOKEN", label: "Buffer access token (optional — needed for publishing)", required: false },
    { key: "META_ACCESS_TOKEN",   label: "Meta Graph API token (optional — needed for metrics)",  required: false },
    { key: "IG_BUSINESS_ACCOUNT_ID", label: "Instagram Business Account ID (optional)",           required: false },
  ];

  for (const { key, label, required } of keys) {
    const current = existing[key];
    const status = current ? `currently ${masked(current)}` : "not set";
    const prompt = required ? "" : " (press Enter to skip)";
    const line = `  ${label} [${status}]${prompt}: `;
    const val = await readMasked(line);
    if (val) {
      env[key] = val;
    } else if (!current && !required) {
      // leave unset
    }
  }

  writeDotenv(env);
  console.log("  Written .env (keys never logged).");
  return true;
}

// ── Phase 1 + 2: Brand copy + colors (existing logic, refactored) ─────────────

async function phase12BrandCopyColors(): Promise<boolean> {
  console.log("\n── Phase 1: Brand copy ───────────────────────────────────");
  const skip = !(await askYN("Configure brand copy?", true));
  if (skip) { console.log("  Skipped."); return false; }

  const brandName  = await askDefault("Brand name", "Your Brand");
  const tagline    = await askDefault("Tagline", "Your tagline goes here.");
  const heroLine   = await askDefault("Hero line (short value prop)", tagline);
  const handle     = await askDefault("Instagram handle (e.g. @yourbrand)", "@yourbrand");
  const hashInput  = (await ask("  Default hashtags (comma-separated, e.g. #yourbrand,#topic): ")).trim();
  const hashtags   = hashInput
    ? hashInput.split(",").map((h) => h.trim()).filter(Boolean)
    : ["#yourbrand", "#topic"];
  const ctaInput   = (await ask("  CTA keywords (comma-separated, e.g. SAVE,SHARE): ")).trim();
  const ctaKeywords = ctaInput
    ? ctaInput.split(",").map((k) => k.trim().toUpperCase()).filter(Boolean)
    : ["SAVE", "SHARE", "INFO"];

  console.log("\n── Phase 2: Brand colors (hex, e.g. #1A2B3C) ────────────");
  const primary    = await askHex("Primary color",    "#000000");
  const accent     = await askHex("Accent color",     "#FFFFFF");
  const textColor  = await askHex("Text color",       "#1F2937");
  const background = await askHex("Background color", "#FFFFFF");
  const muted      = await askHex("Muted color",      "#F3F4F6");

  const copyPath = path.join("config", "brand", "copy.json");
  const existingCopy = JSON.parse(readFileSync(copyPath, "utf8"));
  writeFileSync(copyPath, JSON.stringify({
    ...existingCopy,
    brand_name: brandName,
    tagline,
    hero_line: heroLine,
    default_handle: handle,
    default_hashtags: hashtags,
    cta_keywords: ctaKeywords,
  }, null, 2) + "\n", "utf8");

  const tokensPath = path.join("config", "brand", "tokens.json");
  const existingTokens = JSON.parse(readFileSync(tokensPath, "utf8"));
  writeFileSync(tokensPath, JSON.stringify({
    ...existingTokens,
    colors: { ...existingTokens.colors, primary, accent, text: textColor, background, muted },
  }, null, 2) + "\n", "utf8");

  console.log("  Written config/brand/copy.json and tokens.json.");
  return true;
}

// ── Phase 3: Voice wizard ─────────────────────────────────────────────────────

async function phase3VoiceWizard(): Promise<boolean> {
  console.log("\n── Phase 3: Brand voice wizard ───────────────────────────");
  console.log("  Generates config/brand/voice.md — the creative brief Claude");
  console.log("  reads on every content-generation run. Keep it under 1500 words.");
  const skip = !(await askYN("Configure brand voice?", true));
  if (skip) { console.log("  Skipped."); return false; }

  // Persona
  console.log("\n  Persona — who does Claude act as when writing your carousels?");
  const roleTitle  = await askDefault("Role title (e.g. 'senior equity research associate')", "brand content writer");
  const audience   = await askDefault("Audience (e.g. 'retail investors, finance students')", "general audience");
  const sourceType = await askDefault("Source material type (e.g. 'earnings releases, research papers')", "factual sources");

  // Voice principles
  console.log("\n  Voice principles — enter 2–4 principles (e.g. 'Precise, not promotional').");
  console.log("  Format: 'Positive framing, not negative framing'. Press Enter with no input to stop.");
  const principles: string[] = [];
  let principleIdx = 1;
  while (principleIdx <= 4) {
    const p = (await ask(`  Principle ${principleIdx} (or Enter to finish): `)).trim();
    if (!p) break;
    principles.push(p);
    principleIdx++;
  }
  if (principles.length === 0) principles.push("Clear and factual, not promotional or opinionated");

  // Do / Don't pairs
  console.log("\n  Do / Don't examples — enter pairs to guide the model's tone.");
  console.log("  Press Enter with no input to stop.");
  const doDonts: Array<{ dont: string; doThis: string }> = [];
  let pairIdx = 1;
  while (pairIdx <= 5) {
    const dont   = (await ask(`  Don't write example ${pairIdx} (or Enter to finish): `)).trim();
    if (!dont) break;
    const doThis = (await ask(`  Do write instead:    `)).trim() || "(keep it factual and attributed)";
    doDonts.push({ dont, doThis });
    pairIdx++;
  }

  // Taboos
  console.log("\n  Taboos — topics or framings to avoid even if not formally banned.");
  console.log("  Press Enter with no input to stop.");
  const taboos: string[] = [];
  let tabooIdx = 1;
  while (tabooIdx <= 6) {
    const t = (await ask(`  Taboo ${tabooIdx} (or Enter to finish): `)).trim();
    if (!t) break;
    taboos.push(t);
    tabooIdx++;
  }
  if (taboos.length === 0) taboos.push("No claims of guaranteed outcomes");

  // Attribution format
  console.log("\n  Attribution — how should factual claims be sourced in copy?");
  const attrFormat = await askDefault(
    "Attribution format (e.g. '[Source] [year] reported that [finding]')",
    '"[Source] reported [finding] in [period], per [filing/release]."'
  );

  // ── Build voice.md ──────────────────────────────────────────────────────────
  const doDontTable = doDonts.length > 0
    ? [
        "| Don't write | Do write |",
        "|---|---|",
        ...doDonts.map(({ dont, doThis }) => `| ${dont} | ${doThis} |`),
      ].join("\n")
    : "| [bad example] | [good example] |\n|---|---|";

  const principlesBlock = principles
    .map((p) => `- **${p}.**`)
    .join("\n");

  const taboosBlock = taboos.map((t) => `- ${t}`).join("\n");

  const voiceMd = `# Brand Voice

This file is read at runtime by the content-generation prompt. Claude substitutes its
contents into the \`{{brand_voice}}\` placeholder in \`config/prompts/content-gen.md\`.

---

## Persona

You are a ${roleTitle} translating ${sourceType} into Instagram carousel copy
for an audience of ${audience}.

Your job is to surface what the source material shows — not to editorialize, predict,
or opine beyond the reported facts.

## Voice principles

${principlesBlock}

## Do / Don't framings

${doDontTable}

## Taboos

Beyond the formal tripwires in \`config/brand/tripwires.json\`, avoid these framings
even when not strictly forbidden:

${taboosBlock}

## Attribution rules

Every factual claim must cite its source. Use this format:

- ✅ ${attrFormat}
- ❌ Generic unattributed assertions ("Studies show...", "Experts say...")

Never imply that the brand causes, prevents, or affects any outcome described in the
source material. The brand surfaces information; users make decisions.

---

*Keep this file under 1500 words. Longer voice docs dilute the signal — Claude weighs
every token in the system prompt equally, and a bloated voice doc competes with the
template blueprint and tripwire rules.*
`;

  const voicePath = path.join("config", "brand", "voice.md");
  if (existsSync(voicePath)) {
    const overwrite = await askYN("voice.md already exists. Overwrite?", true);
    if (!overwrite) { console.log("  Skipped."); return false; }
  }
  writeFileSync(voicePath, voiceMd, "utf8");
  console.log("  Written config/brand/voice.md.");
  return true;
}

// ── Phase 4: Tripwire setup ───────────────────────────────────────────────────

type TripwirePhrase =
  | { match: "literal"; value: string }
  | { match: "regex";   value: string; flags: string };

interface TripwireCategory {
  id: string;
  description: string;
  rationale: string;
  phrases: TripwirePhrase[];
}

const DOMAIN_PRESETS: Record<string, TripwireCategory> = {
  financial: {
    id: "financial_guarantees",
    description: "Language implying guaranteed investment returns, risk-free outcomes, or directional market predictions.",
    rationale: "Regulatory risk under SEC and FCA guidelines. Any implication of guaranteed returns constitutes unlicensed investment advice.",
    phrases: [
      { match: "literal", value: "guaranteed return" },
      { match: "literal", value: "guaranteed returns" },
      { match: "literal", value: "risk-free" },
      { match: "literal", value: "risk free" },
      { match: "literal", value: "buy now" },
      { match: "literal", value: "buy the dip" },
      { match: "literal", value: "can't lose" },
      { match: "literal", value: "cannot lose" },
      { match: "literal", value: "sure thing" },
      { match: "regex",   value: "\\bwill\\s+(outperform|beat\\s+the\\s+market|double|triple|10x)\\b", flags: "i" },
      { match: "regex",   value: "\\b(100%|certain(ly)?|definite(ly)?)\\s+(return|gain|profit|growth)\\b", flags: "i" },
      { match: "regex",   value: "\\bprice\\s+target\\s+of\\b", flags: "i" },
    ],
  },
  health: {
    id: "unattributed_health_claims",
    description: "Health outcome claims lacking attribution to a named source.",
    rationale: "FTC guidelines require health marketing claims to be substantiated and attributed. The pipeline sanitizes inputs but the model can re-introduce generic attribution.",
    phrases: [
      { match: "literal", value: "studies show" },
      { match: "literal", value: "research shows" },
      { match: "literal", value: "science says" },
      { match: "literal", value: "proven to" },
      { match: "literal", value: "clinically proven" },
      { match: "regex",   value: "\\bhas\\s+been\\s+(shown|proven|demonstrated)\\s+to\\s+(cure|treat|prevent|reverse)\\b", flags: "i" },
      { match: "regex",   value: "\\b(cure|treat|prevent|reverse)\\s+(cancer|diabetes|heart disease|depression|anxiety|obesity)\\b", flags: "i" },
    ],
  },
  legal: {
    id: "legal_advice",
    description: "Language that implies the content constitutes legal advice or a legal recommendation.",
    rationale: "Publishing legal advice without a licence constitutes unauthorised practice of law in most jurisdictions. Informational content must be clearly distinguished from advice.",
    phrases: [
      { match: "literal", value: "you should sue" },
      { match: "literal", value: "you have a case" },
      { match: "literal", value: "this is not legal advice" },
      { match: "literal", value: "consult a lawyer" },
      { match: "regex",   value: "\\byou\\s+(are|were)\\s+entitled\\s+to\\b", flags: "i" },
      { match: "regex",   value: "\\b(win|winning|won)\\s+your\\s+(case|lawsuit|claim)\\b", flags: "i" },
      { match: "regex",   value: "\\bguaranteed\\s+(settlement|compensation|damages)\\b", flags: "i" },
    ],
  },
  food: {
    id: "unsubstantiated_food_claims",
    description: "Food and nutrition claims that imply medical benefit without clinical attribution.",
    rationale: "FDA and EU food regulations prohibit nutrient content claims and health claims without substantiation. 'Detox', 'superfood', and similar terms attract regulatory scrutiny.",
    phrases: [
      { match: "literal", value: "detox" },
      { match: "literal", value: "superfood" },
      { match: "literal", value: "miracle food" },
      { match: "literal", value: "burns fat" },
      { match: "regex",   value: "\\b(boosts|improves|enhances)\\s+your\\s+(immune system|metabolism|gut health)\\b", flags: "i" },
      { match: "regex",   value: "\\b(eliminates?|removes?)\\s+(toxins?|impurities)\\b", flags: "i" },
    ],
  },
};

const DOMAIN_MENU = [
  { key: "financial", label: "Financial / Investing (SEC/FCA compliance)" },
  { key: "health",    label: "Health & Wellness (FTC substantiation)" },
  { key: "legal",     label: "Legal / Professional Services (no legal advice)" },
  { key: "food",      label: "Food & Nutrition (FDA/EU food claim rules)" },
];

async function phase4Tripwires(): Promise<boolean> {
  console.log("\n── Phase 4: Tripwire setup ────────────────────────────────");
  console.log("  Tripwires are phrases banned from generated copy.");
  console.log("  A single match fails the run and holds it for review.");
  const skip = !(await askYN("Configure tripwires?", true));
  if (skip) { console.log("  Skipped."); return false; }

  // Domain presets
  console.log("\n  Select domain presets to pre-seed (you can combine multiple):");
  DOMAIN_MENU.forEach(({ key, label }, i) => console.log(`    ${i + 1}. ${label} [${key}]`));
  console.log("    0. None — start with empty categories (add custom only)");

  const selInput = (await ask("  Enter numbers separated by spaces (e.g. 1 2): ")).trim();
  const chosen = selInput === "0" ? [] : selInput
    .split(/\s+/)
    .map((s) => parseInt(s, 10) - 1)
    .filter((i) => i >= 0 && i < DOMAIN_MENU.length)
    .map((i) => DOMAIN_MENU[i].key);

  const categories: TripwireCategory[] = chosen.map((k) => DOMAIN_PRESETS[k]);

  // Custom literal phrases
  console.log("\n  Add custom banned phrases (literal, case-insensitive).");
  console.log("  Press Enter with no input to stop.");
  const customPhrases: TripwirePhrase[] = [];
  let phraseIdx = 1;
  while (phraseIdx <= 20) {
    const phrase = (await ask(`  Banned phrase ${phraseIdx} (or Enter to finish): `)).trim();
    if (!phrase) break;
    customPhrases.push({ match: "literal", value: phrase });
    phraseIdx++;
  }

  // Custom regex patterns
  if (await askYN("Add custom regex patterns?", false)) {
    let regexIdx = 1;
    while (regexIdx <= 10) {
      const pattern = (await ask(`  Regex pattern ${regexIdx} (or Enter to finish): `)).trim();
      if (!pattern) break;
      const flags = (await ask(`  Flags [i]: `)).trim() || "i";
      customPhrases.push({ match: "regex", value: pattern, flags });
      regexIdx++;
    }
  }

  if (customPhrases.length > 0) {
    const categoryId = (await askDefault("Custom category ID (snake_case)", "custom_phrases")).trim();
    const categoryDesc = (await askDefault("Category description", "Custom banned phrases for this brand")).trim();
    categories.push({
      id: categoryId,
      description: categoryDesc,
      rationale: "Manually added during setup wizard.",
      phrases: customPhrases,
    });
  }

  if (categories.length === 0) {
    console.log("  No categories configured — tripwires.json will have an empty categories array.");
    console.log("  Edit config/brand/tripwires.json manually to add phrases.");
  }

  const tripwiresPath = path.join("config", "brand", "tripwires.json");
  const existingData = existsSync(tripwiresPath)
    ? JSON.parse(readFileSync(tripwiresPath, "utf8"))
    : {};

  const output = {
    ...(existingData["$schema"] ? { "$schema": existingData["$schema"] } : {}),
    version: "1.0.0",
    categories,
  };

  writeFileSync(tripwiresPath, JSON.stringify(output, null, 2) + "\n", "utf8");
  console.log(`  Written config/brand/tripwires.json (${categories.length} category/categories, ${
    categories.reduce((sum, c) => sum + c.phrases.length, 0)
  } phrases).`);
  return true;
}

// ── Phase 5: Source item entry ────────────────────────────────────────────────

async function phase5SourceItems(): Promise<number> {
  console.log("\n── Phase 5: Source items ─────────────────────────────────");
  console.log("  Source items are the facts/data the pipeline turns into carousels.");
  console.log("  Sanitization rule: every claim must be attributed to its source,");
  console.log("  in past tense, without implying the brand affects any outcome.");

  const skip = !(await askYN("Add source items now?", true));
  if (skip) { console.log("  Skipped. Run `npm run items:add` later."); return 0; }

  const itemsPath = path.join("config", "items.json");
  const raw = readFileSync(itemsPath, "utf8");
  const bank = JSON.parse(raw) as { items: Array<Record<string, unknown>>; [k: string]: unknown };

  // Determine the highest existing number (example items start at 1, 2, 3)
  const existingNumbers = bank.items.map((i) => (i.number as number) ?? 0);
  let nextNumber = Math.max(0, ...existingNumbers) + 1;

  // If example items are still present, offer to clear them
  const exampleIds = bank.items
    .filter((i) => typeof i.raw_content === "string" && (i.raw_content as string).toUpperCase().startsWith("VERBATIM"))
    .map((i) => i.id);

  if (exampleIds.length > 0) {
    console.log(`\n  Found ${exampleIds.length} placeholder example item(s) (${exampleIds.join(", ")}).`);
    if (await askYN("Remove placeholder examples before adding real items?", true)) {
      bank.items = bank.items.filter((i) => !exampleIds.includes(i.id as string));
      nextNumber = Math.max(0, ...bank.items.map((i) => (i.number as number) ?? 0)) + 1;
    }
  }

  const availableTemplates = ["default", "data-scientist", "minimalist", "b2b-brand"];
  console.log(`\n  Available templates: ${availableTemplates.join(", ")}`);

  let addedCount = 0;
  while (true) {
    const nextId = `item-${String(nextNumber).padStart(3, "0")}`;
    console.log(`\n  --- New item: ${nextId} ---`);

    const rawContent = (await ask("  Raw content (verbatim from source):\n  > ")).trim();
    if (!rawContent) {
      console.log("  No content entered. Stopping item entry.");
      break;
    }

    console.log(
      "\n  Sanitized version must:\n" +
      "    - Attribute findings to the source, not the brand\n" +
      "    - Use past tense (found, showed, reported)\n" +
      "    - Not imply the brand causes any outcome\n"
    );
    const sanitizedContent = (await ask("  Sanitized content:\n  > ")).trim() || rawContent;
    const attribution = (await ask("  Attribution (e.g. 'Smith et al., 2024'):\n  > ")).trim();
    const sourceUrl   = (await ask("  Source URL:\n  > ")).trim();
    const tagsInput   = (await ask("  Tags (comma-separated, e.g. 'nutrition,fiber'):\n  > ")).trim();
    const template    = (await ask(`  Template [default]: `)).trim() || "default";
    const notes       = (await ask("  Notes (optional):\n  > ")).trim();

    const tags = tagsInput.split(",").map((t) => t.trim()).filter(Boolean);

    const newItem: Record<string, unknown> = {
      id: nextId,
      number: nextNumber,
      raw_content: rawContent,
      sanitized_content: sanitizedContent,
      attribution,
      source_url: sourceUrl,
      tags,
      template,
      status: "unused",
      date_added: new Date().toISOString().slice(0, 10),
    };
    if (notes) newItem.notes = notes;

    console.log("\n  Preview:");
    console.log("  " + JSON.stringify(newItem, null, 2).split("\n").join("\n  "));

    if (await askYN("Add this item?", true)) {
      bank.items.push(newItem);
      nextNumber++;
      addedCount++;
      console.log(`  Added ${nextId}.`);
    } else {
      console.log("  Discarded.");
    }

    if (!(await askYN("Add another item?", false))) break;
  }

  writeFileSync(itemsPath, JSON.stringify(bank, null, 2) + "\n", "utf8");
  console.log(`\n  Written config/items.json (${bank.items.length} item(s) total, ${addedCount} added this session).`);
  console.log("  Run `npm run items:seed` to validate and import into the database.");
  return addedCount;
}

// ── Phase 6: Checklist + first run ───────────────────────────────────────────

async function phase6Checklist(configured: {
  dotenv: boolean;
  brandCopy: boolean;
  voice: boolean;
  tripwires: boolean;
  itemsAdded: number;
}) {
  console.log(`
╔══════════════════════════════════════════════════════════════╗
║               Setup complete — what's configured             ║
╚══════════════════════════════════════════════════════════════╝`);

  const check = (ok: boolean) => (ok ? "✓" : "✗");

  const envVars = readDotenv();
  const hasAnthropicKey = Boolean(envVars["ANTHROPIC_API_KEY"]);
  const hasGeminiKey    = Boolean(envVars["GEMINI_API_KEY"]);
  const hasBufferToken  = Boolean(envVars["BUFFER_ACCESS_TOKEN"]);

  console.log(`
  ${check(hasAnthropicKey)} ANTHROPIC_API_KEY   ${hasAnthropicKey ? "(set)" : "(not set — required for content generation)"}
  ${check(hasGeminiKey)}    GEMINI_API_KEY      ${hasGeminiKey ? "(set)" : "(not set — required for image generation)"}
  ${check(hasBufferToken)}  BUFFER_ACCESS_TOKEN ${hasBufferToken ? "(set)" : "(not set — optional, needed for publishing)"}

  ${check(configured.brandCopy)}   Brand copy + colors    (config/brand/copy.json, tokens.json)
  ${check(configured.voice)}       Brand voice            (config/brand/voice.md)
  ${check(configured.tripwires)}   Tripwires              (config/brand/tripwires.json)
  ${check(configured.itemsAdded > 0)} Source items         (${configured.itemsAdded} added this session)`);

  const canRun = hasAnthropicKey && hasGeminiKey;
  if (!canRun) {
    console.log(`
  Note: ANTHROPIC_API_KEY and GEMINI_API_KEY are required to generate carousels.
  Add them to .env and re-run setup (or edit .env directly) before running the pipeline.`);
  }

  // Check whether items.json has any real items
  const itemsPath = path.join("config", "items.json");
  const bank = JSON.parse(readFileSync(itemsPath, "utf8")) as { items: Array<{ id: string }> };
  const firstItemId = bank.items[0]?.id;

  console.log("\n  What would you like to do next?");
  console.log("    1. Run demo (mock mode — no API calls, tests the review UI)");
  if (canRun && firstItemId) {
    console.log(`    2. Generate first carousel (${firstItemId}) — uses Claude + Gemini APIs`);
  }
  console.log("    3. Open review UI only (localhost:3000)");
  console.log("    0. Exit now");

  const choice = (await ask("  Choice [0]: ")).trim() || "0";

  if (choice === "1") {
    console.log("\n  Running demo mode...\n");
    spawnSync("npm", ["run", "demo"], { stdio: "inherit", shell: true });
  } else if (choice === "2" && canRun && firstItemId) {
    console.log(`\n  Seeding items and running pipeline for ${firstItemId}...\n`);
    spawnSync("npm", ["run", "items:seed"], { stdio: "inherit", shell: true });
    spawnSync("npm", ["run", "pipeline", "--", `--item`, firstItemId], { stdio: "inherit", shell: true });
    console.log("\n  Start the review UI with: npm run review");
  } else if (choice === "3") {
    console.log("\n  Starting review server...\n");
    spawnSync("npm", ["run", "review"], { stdio: "inherit", shell: true });
  } else {
    console.log(`
  Manual next steps:
    npm run items:seed            # validate and import items into DB
    npm run pipeline -- --item ${firstItemId ?? "item-001"}   # generate a carousel
    npm run review                # review UI at localhost:3000
    npm run push-approved         # publish approved carousels via Buffer
`);
  }
}

// ── main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log("\n╔══════════════════════════════════════════╗");
  console.log("║   Carousel Pipeline — First-Run Setup    ║");
  console.log("╚══════════════════════════════════════════╝");
  console.log("\nEvery phase is optional — press Enter to accept defaults or");
  console.log("answer N to skip a phase and configure it manually later.\n");

  // ── Scaffold config/ ────────────────────────────────────────────────────────
  if (!existsSync("config.example")) {
    console.error("Error: config.example/ not found. Run from the project root.");
    rl.close();
    process.exit(1);
  }

  if (!existsSync("config")) {
    cpSync("config.example", "config", { recursive: true });
    console.log("Scaffolded config/ from config.example/\n");
  } else {
    console.log("config/ already exists — updating existing configuration.\n");
  }

  // ── Run phases ──────────────────────────────────────────────────────────────
  const dotenvDone    = await phase0Dotenv();
  const brandCopyDone = await phase12BrandCopyColors();
  const voiceDone     = await phase3VoiceWizard();
  const tripwiresDone = await phase4Tripwires();
  const itemsAdded    = await phase5SourceItems();

  // ── Init DB ─────────────────────────────────────────────────────────────────
  console.log("\n── Initializing database ─────────────────────────────────");
  const dbInit = spawnSync("npm", ["run", "db:init"], { stdio: "inherit", shell: true });
  if (dbInit.status !== 0) {
    console.error("  db:init failed. Run `npm run db:init` manually.");
  } else {
    console.log("  data/pipeline.db initialized.");
  }

  // ── Phase 6: summary + first run ───────────────────────────────────────────
  await phase6Checklist({
    dotenv: dotenvDone,
    brandCopy: brandCopyDone,
    voice: voiceDone,
    tripwires: tripwiresDone,
    itemsAdded,
  });

  rl.close();
}

main().catch((err) => {
  console.error(err);
  rl.close();
  process.exit(1);
});
