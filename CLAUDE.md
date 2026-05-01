# CLAUDE.md

Guidance for Claude Code working in this repository. Read this file first on every session. If you need more detail, see [docs/SPEC.md](./docs/SPEC.md).

---

## What this project is

An automated pipeline that turns a curated bank of structured source items into brand-safe Instagram carousels. The pipeline runs Claude for content generation, Gemini for imagery, Puppeteer for slide composition, and Buffer for scheduled publishing. Metrics are polled daily from Meta Graph for 30 days per post.

Six stages: `items → content → images → composition → review → publish → metrics`. Each stage writes to disk and is independently replayable.

This is an **unmaintained open-source framework**. The user has cloned it for their own project. Brand voice, source material, tripwires, and templates all live in `config/` — never in `src/`.

---

## The single most important thing

**The tripwire layer is the primary brand-safety mechanism.** Generated copy is scanned for phrases the user has explicitly banned in `config/brand/tripwires.json`. If a generated post hits a tripwire, the run fails and is held for review.

Two guardrails enforce this:

1. **Seed-time sanitization** — When source items are added, raw input is rewritten into a sanitized form before entering the pipeline. The Claude prompt only ever sees the sanitized form. This is the user's responsibility, but `scripts/add-item.ts` should help.
2. **Runtime tripwire check** — `src/lib/tripwire-check.ts` scans generated copy for banned phrases. Any hit blocks the post from advancing. The list lives in `config/brand/tripwires.json`.

If you're ever about to write code that weakens either guardrail, **stop and surface the conflict to the human before proceeding.** Loosening tripwires without explicit human direction is never the answer to a false positive — rewrite the prompt or the example, not the checker.

---

## The decoupling principle

This codebase was extracted from a brand-specific implementation. The architectural rule is now:

**Anything brand-specific lives in `config/`. Anything generic lives in `src/`.**

If you find yourself adding hardcoded brand voice rules, color values, banned phrases, or example copy to a TypeScript file, stop and move it to `config/`. The pipeline must remain usable across domains — health content, finance content, food content, education content — by editing only `config/`.

Concrete checks:

- No hex colors in `templates/` or `src/`. They come from `config/brand/tokens.json` via CSS variables.
- No example brand voice text in `src/pipeline/prompts/content-gen.md`. The prompt is a template with `{{brand_voice}}`, `{{tagline}}`, `{{tripwire_rules}}` placeholders filled at runtime.
- No banned phrases in `src/lib/tripwire-check.ts`. The checker reads `config/brand/tripwires.json`.
- No hardcoded slide structure assumptions ("4 carousel formats: A, B, C, D"). The user supplies templates in `config/templates/`.

When in doubt: would this code still make sense for a user in a completely different industry? If no, it belongs in config.

---

## Repository layout

```
config.example/              # worked example brand config — users copy to config/
  brand/
    voice.md                 # voice rules, do/don't framings
    tokens.json              # colors, fonts, usage ratios
    copy.json                # tagline, hero line, fixed lines
    tripwires.json           # banned phrases by category
  templates/                 # carousel format templates
  prompts/
    content-gen.md           # content-generation prompt (templated)
  items.json                 # source bank example

config/                      # .gitignored — user's own brand config

src/
  pipeline/                  # the six stages
  review/                    # Fastify server for human review UI
  metrics/                   # daily polling jobs
  lib/                       # Claude/Gemini/Buffer clients, schema validators,
                             # tripwire checker, SQLite wrapper
  types/                     # shared TS types (generated from Zod schemas)

drafts/                      # generation output — .gitignored
queue/{pending,approved,rejected,failed}/
data/pipeline.db             # SQLite — .gitignored
scripts/                     # init-db, seed-items, run-pipeline orchestrator
docs/                        # SPEC.md, CONFIGURATION.md
```

Full layout and rationale: [docs/SPEC.md](./docs/SPEC.md) §3.

---

## Commands

```bash
# setup (first time)
npm install
cp -r config.example config             # bring up a starter brand config
npm run db:init                         # creates data/pipeline.db from schema
npm run items:seed                      # validates and imports config/items.json

# dev loop
npm run pipeline -- --item item-001     # generate a single carousel end-to-end
npm run review                          # localhost:3000 — approve/reject/edit the queue
npm run pipeline:daily                  # batch-generate tomorrow's drafts

# publish + metrics
npm run push-approved                   # push everything in queue/approved/ to Buffer
npm run metrics:refresh                 # poll Meta Graph for all posts <30d old

# testing
npm test                                # unit tests (tripwire checker, schemas)
npm run test:e2e                        # dry-run one item through the full pipeline
npm run lint
npm run typecheck
```

If you change commands in `package.json`, update this section. Out-of-date commands here mean the next session wastes 20 minutes guessing.

---

## Code conventions

### Language and tooling

- **TypeScript 5.x**, strict mode, target ES2022, module NodeNext.
- **Runtime Node.js 20+**. Use top-level await, native `fetch`, `node:test` where possible.
- **Zod** for all external boundaries (API responses, file I/O, DB rows). Never `as any`.
- **better-sqlite3** for the database. Synchronous API is a feature for this use case, not a bug.
- **Fastify** for the review server. (Not Express — schema validation should live in the router.)
- **dotenv** for env vars in dev. Never commit `.env`.

### Style

- Functions over classes. Classes only where wrapping stateful external services (`ClaudeClient`, `BufferClient`).
- `async/await` throughout. No raw promise chains.
- Error handling: throw `PipelineError` subclasses with the stage name and item ID attached. Never swallow errors silently — failures go to `generation_runs` and surface in the review UI.
- Prefer composable small files over large orchestrators. Each pipeline stage = one file, one default export.

### Naming

- Files: `kebab-case.ts`
- Types: `PascalCase`
- Variables/functions: `camelCase`
- Constants: `SCREAMING_SNAKE_CASE` only for env-like constants
- Item IDs: always `item-NNN` with leading zeros (e.g. `item-007`, not `item-7`)

### What not to do

- Don't inline prompts in TypeScript. They live in `config/prompts/*.md` and are loaded at runtime.
- Don't catch exceptions in `pipeline/*.ts`. Let them propagate to the orchestrator, which logs to `generation_runs`.
- Don't retry inside a stage function. The orchestrator owns retry policy.
- Don't write "backwards compatible" changes to JSON schemas. Bump `pipeline_version` in metadata and migrate on read.
- Don't hit external APIs in tests. Mock at the client boundary.
- Don't hardcode brand-specific values anywhere in `src/`. See "The decoupling principle" above.

---

## Integration notes

### Claude API (Anthropic SDK)

- Default model is `claude-opus-4-7` for content generation. The brand-safety reasoning matters more than cost optimization.
- Keep prompts under the 200K context window by a wide margin.
- Parse the response as JSON. If parsing fails, retry once with the parse error in the followup turn.
- Pass `system` separately from `messages` — better for prompt caching when that gets enabled.

### Gemini Image (`@google/genai`)

- **Never ask for text in images.** Every `image_prompt` includes a negative constraint: "NO TEXT, NO LOGOS." Text is composed later in Puppeteer.
- If the model returns a text-containing image (rare but happens), fall back to a configured background and log.
- Output: 1024×1024 PNG. Crop/letterbox to 1080×1350 in Step 3.

### Buffer API

- Endpoint: `https://api.bufferapp.com/1/`
- Auth: single access token per IG account (env var `BUFFER_ACCESS_TOKEN`).
- `update_id` returned from `/updates/create.json` is the link between local post state and Buffer's queue. Store it in `posts.buffer_update_id`.
- Don't trust Buffer's reported publish time. Confirm against Meta Graph API before considering a post "published."

### Meta Graph API (Instagram Business)

- Endpoint: `https://graph.facebook.com/v19.0/` (update version when needed)
- Rate limit: 200 calls/hour per user token.
- Insights fields: `reach, impressions, likes, comments, shares, saves, profile_visits, follows`
- For carousel posts, use `/{media-id}/insights` — don't walk children.

### Puppeteer

- Pin the Chromium version via `puppeteer` (not `puppeteer-core`).
- Each composition launches a fresh browser per carousel to avoid memory leaks.
- Self-host fonts in `templates/fonts/` — never rely on system fonts in production.

---

## How to approach common tasks

### "Add a new source item"

1. Don't edit `config/items.json` by hand. Use `scripts/add-item.ts`: takes raw content + attribution, guides through sanitization, validates schema, writes.
2. Sanitization is the critical step. The rule: every claim must be attributed to its source, in past tense, without implying the brand affects any outcome. If unsure, raise to a human — don't guess.

### "A post's copy looks off in one slide"

1. Don't re-run the full pipeline. Use the review UI's "edit" action to adjust the slide copy directly.
2. Re-running Step 3 alone (composition) regenerates the PNG from the edited copy without re-hitting Claude or Gemini.

### "Tripwire checker is flagging a false positive"

1. Do NOT loosen the checker. Rewrite the copy.
2. If the same phrasing legitimately trips multiple times, the issue is in the prompt's few-shot examples. Adjust there, not in the checker.

### "Buffer pushed a post but it didn't publish"

1. Check Buffer's UI — usually the issue is an IG-side rejection (aspect ratio, caption length).
2. Meta Graph's `/media` endpoint on the stored `ig_media_id` tells you whether IG actually received it.
3. Common IG rejection causes: caption >2200 chars, hashtag count wrong, media size mismatch. Validate at push time, not at publish time.

### "We need to change a brand voice rule"

1. Edit `config/brand/voice.md`. That's the source of truth.
2. The prompt at `config/prompts/content-gen.md` reads it at runtime, so no rebuild needed.
3. If voice change affects what should be banned, also update `config/brand/tripwires.json`.
4. Run the eval suite (`npm run test:prompt-eval`) to check that prompt changes don't regress.

### "A source item has been retracted or invalidated"

1. Set `status: "retired"` on the item in `config/items.json`.
2. If any published post used this item, decide a remediation policy (delete, edit, append correction). The pipeline doesn't dictate this.
3. Do not reuse a retired item ID for a new item. IDs are stable forever.

---

## Things Claude Code should NEVER do in this repo

- Remove or soften any entry in `config/brand/tripwires.json` without explicit human instruction referencing the specific phrase.
- Commit API keys, tokens, or `.env` files.
- Publish to Buffer from a dev environment (check `NODE_ENV` before calling `push-to-buffer.ts`).
- Modify a post that's already in `queue/approved/` without routing it back through review.
- Edit `raw_content` on an existing item in `config/items.json`. It's the audit trail; it never changes after seed.
- Generate imagery with text in it. See Integration notes → Gemini Image.
- Hardcode brand-specific values in `src/`. See "The decoupling principle" above.
- Introduce a new dependency without updating `package.json` and this file's "Code conventions" section if it changes the stack.

---

## Things Claude Code SHOULD default to doing

- Writing tests alongside code, especially for anything touching the tripwire checker or schema validators.
- Adding a comment with a link to the relevant `docs/SPEC.md` section when implementing a non-obvious design decision.
- Running `npm run typecheck` before finishing a task that touched TypeScript.
- Running `npm run test` before committing.
- Logging structured JSON (one line per log event, Pino-style) with `item_id`, `stage`, and `duration_ms`.

---

## Known gotchas

- **Puppeteer on macOS + Apple Silicon:** needs `PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=false` explicitly to pick up the ARM Chromium build. If PNG output looks wrong, this is probably why.
- **Buffer's scheduled_at field is in UTC**, not the profile's timezone. Convert in `push-to-buffer.ts`.
- **Emoji in Claude's output** can pass tripwire regex but break Puppeteer font rendering. Strip high-codepoint emoji from slide body before composition (keep in caption — IG renders those fine).
- **better-sqlite3 is native.** CI needs a build step. Cache `node_modules` in CI or builds get slow.
- **Meta Graph API insights** have a ~6-hour delay for new posts. Don't poll before then.
- **Item IDs are stable forever.** Retired items don't free up their ID for reuse.

---

## Versioning and migration

- `docs/SPEC.md` has a version header. Breaking changes bump it.
- The pipeline writes its current version into `drafts/{id}/metadata.json` as `pipeline_version`.
- Never migrate already-drafted posts across a pipeline version bump — regenerate or retire.
- SQLite schema changes require a migration script in `scripts/migrations/NNN-description.ts` and a manual run.

---

## When in doubt

1. The user's brand config (`config/brand/`) wins over any code pattern.
2. The spec (`docs/SPEC.md`) wins over this file for implementation detail.
3. This file wins for day-to-day operational guidance.
4. A human wins over all of the above. If any conflict with explicit human direction, follow the human and flag the conflict.

---

*This file is part of an unmaintained open-source framework. Edit it freely for your own fork — it's only useful if it's current.*
