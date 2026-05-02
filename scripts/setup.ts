/**
 * Guided first-run setup wizard.
 *
 * Usage:
 *   npm run setup
 *
 * Copies config.example/ → config/, prompts for brand values, writes
 * config/brand/copy.json and config/brand/tokens.json, then runs db:init.
 *
 * Uses Node built-ins only (readline, fs, child_process). No extra packages.
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

const rl = createInterface({ input: process.stdin, output: process.stdout });
const ask = (q: string): Promise<string> =>
  new Promise((resolve) => rl.question(q, resolve));

const HEX_RE = /^#[0-9A-Fa-f]{6}$/;

async function askHex(label: string, defaultVal: string): Promise<string> {
  while (true) {
    const val = (await ask(`  ${label} [${defaultVal}]: `)).trim() || defaultVal;
    if (HEX_RE.test(val)) return val;
    console.log("    Must be a 6-digit hex color, e.g. #1A2B3C. Try again.");
  }
}

async function main() {
  console.log("\n╔══════════════════════════════════════════╗");
  console.log("║   Carousel Pipeline — First-Run Setup    ║");
  console.log("╚══════════════════════════════════════════╝\n");

  // ── 1. Guard: check for existing config ──────────────────────────────────
  if (existsSync("config")) {
    console.log("Warning: config/ already exists.");
    const overwrite = (await ask("Overwrite it? This cannot be undone. (y/N) ")).trim();
    if (overwrite.toLowerCase() !== "y") {
      console.log("Setup cancelled. Your existing config/ was not changed.");
      rl.close();
      return;
    }
  }

  // ── 2. Copy config.example/ → config/ ────────────────────────────────────
  if (!existsSync("config.example")) {
    console.error(
      "Error: config.example/ not found. Make sure you are running this from the project root."
    );
    rl.close();
    process.exit(1);
  }

  cpSync("config.example", "config", { recursive: true });
  console.log("Copied config.example/ → config/\n");

  // ── 3. Brand copy ─────────────────────────────────────────────────────────
  console.log("── Brand copy ───────────────────────────────────");
  const brandName = (await ask("  Brand name: ")).trim() || "Your Brand";
  const tagline = (await ask("  Tagline: ")).trim() || "Your tagline goes here.";
  const heroLine = (await ask("  Hero line (short value prop): ")).trim() || tagline;
  const handle = (await ask("  Instagram handle (e.g. @yourbrand): ")).trim() || "@yourbrand";
  const hashtagsInput = (await ask("  Default hashtags (comma-separated, e.g. #yourbrand,#topic): ")).trim();
  const hashtags = hashtagsInput
    ? hashtagsInput.split(",").map((h) => h.trim()).filter(Boolean)
    : ["#yourbrand", "#topic"];

  const ctaInput = (await ask("  CTA keywords (comma-separated, e.g. SAVE,SHARE): ")).trim();
  const ctaKeywords = ctaInput
    ? ctaInput.split(",").map((k) => k.trim().toUpperCase()).filter(Boolean)
    : ["SAVE", "SHARE", "INFO"];

  // ── 4. Brand colors ───────────────────────────────────────────────────────
  console.log("\n── Brand colors (hex, e.g. #1A2B3C) ────────────");
  const primary = await askHex("Primary color", "#000000");
  const accent = await askHex("Accent color", "#FFFFFF");
  const text = await askHex("Text color", "#1F2937");
  const background = await askHex("Background color", "#FFFFFF");
  const muted = await askHex("Muted color", "#F3F4F6");

  // ── 5. Write config/brand/copy.json ──────────────────────────────────────
  const copyPath = path.join("config", "brand", "copy.json");
  const existingCopy = JSON.parse(readFileSync(copyPath, "utf8"));
  const updatedCopy = {
    ...existingCopy,
    brand_name: brandName,
    tagline,
    hero_line: heroLine,
    default_handle: handle,
    default_hashtags: hashtags,
    cta_keywords: ctaKeywords,
  };
  writeFileSync(copyPath, JSON.stringify(updatedCopy, null, 2) + "\n", "utf8");

  // ── 6. Write config/brand/tokens.json ────────────────────────────────────
  const tokensPath = path.join("config", "brand", "tokens.json");
  const existingTokens = JSON.parse(readFileSync(tokensPath, "utf8"));
  const updatedTokens = {
    ...existingTokens,
    colors: {
      ...existingTokens.colors,
      primary,
      accent,
      text,
      background,
      muted,
    },
  };
  writeFileSync(tokensPath, JSON.stringify(updatedTokens, null, 2) + "\n", "utf8");

  console.log("\nWrote config/brand/copy.json and config/brand/tokens.json.");

  // ── 7. Run db:init ────────────────────────────────────────────────────────
  console.log("\nInitializing database...");
  const dbInit = spawnSync("npm", ["run", "db:init"], {
    stdio: "inherit",
    shell: true,
  });
  if (dbInit.status !== 0) {
    console.error("db:init failed. Run `npm run db:init` manually to retry.");
  }

  // ── 8. Next steps ─────────────────────────────────────────────────────────
  console.log(`
╔══════════════════════════════════════════════════════════════╗
║                        Setup complete!                       ║
╚══════════════════════════════════════════════════════════════╝

Next steps:

  1. Add your API keys to a .env file in the project root:
       ANTHROPIC_API_KEY=your-key-here
       GEMINI_API_KEY=your-key-here
       BUFFER_ACCESS_TOKEN=your-token-here (optional, for publishing)

  2. Edit config/brand/voice.md to define your brand voice.
     Write it as a brief for a writer — principles, do/don't examples, taboos.

  3. Edit config/brand/tripwires.json to add banned phrases for your domain.

  4. Add your source items:
       npm run items:add          # interactive guided CLI
     Or edit config/items.json directly, then:
       npm run items:seed         # validate and import into the DB

  5. Generate your first carousel:
       npm run pipeline -- --item item-001

  6. Review it in the browser:
       npm run review             # opens localhost:3000
`);

  rl.close();
}

main().catch((err) => {
  console.error(err);
  rl.close();
  process.exit(1);
});
