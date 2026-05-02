# Configuration Reference

This document covers every file in the `config/` directory: what each field does, its type and constraints, and how the pipeline consumes it.

For the overall pipeline design see [SPEC.md](./SPEC.md). For environment variables see the [Environment variables](#environment-variables) section at the bottom of this file.

---

## How configuration works

`config/` is `.gitignored`. Users copy `config.example/` to `config/` and edit the files there. The pipeline reads `config/` at runtime — no rebuild required after changes.

```
config.example/          # shipped with the repo — worked example
config/                  # .gitignored — your brand's config
```

The `npm run setup` wizard creates the core brand files interactively. All other files can be copied from `config.example/` and edited manually.

---

## `config/brand/copy.json`

Fixed brand copy injected into every carousel and prompt.

**Schema:** [`BrandCopySchema`](../src/types/index.ts)

| Field | Type | Required | Constraints | Notes |
|---|---|---|---|---|
| `brand_name` | string | yes | non-empty | Displayed on every slide's brand line |
| `tagline` | string | yes | non-empty | Short value-prop line; appears on CTA slide |
| `hero_line` | string | yes | non-empty | Longer anchor statement; injected into prompts |
| `cta_keywords` | string[] | yes | ≥ 1 item | One is picked per carousel for the comment CTA (e.g. `["SAMPLE", "INFO", "SHARE"]`) |
| `default_handle` | string | no | — | Instagram handle (e.g. `"@yourbrand"`) — shown on slides if set |
| `default_hashtags` | string[] | no | default `[]` | Always-on hashtags appended to every caption |

**Example:**
```json
{
  "brand_name": "Your Brand",
  "tagline": "Your tagline goes here.",
  "hero_line": "The one-liner that anchors your brand value.",
  "cta_keywords": ["SAMPLE", "INFO", "SHARE"],
  "default_handle": "@yourbrand",
  "default_hashtags": ["#yourbrand", "#yourcategory"]
}
```

---

## `config/brand/tokens.json`

Visual design system. Used by Stage 3 (composition) to inject CSS variables into the slide template, and by Stage 1 (content generation) for `slide_count`.

**Schema:** [`BrandTokensSchema`](../src/types/index.ts)

### `colors`

`Record<string, string>` — arbitrary color name → CSS color value (hex, rgb, hsl).

Recommended names (referenced in `templates/slide.html` as CSS variables):
- `primary` — brand primary color
- `accent` — highlight / CTA color
- `text` — body text
- `background` — neutral slide background
- `muted` — secondary text / citation card background

**Example:**
```json
"colors": {
  "primary": "#1a1a2e",
  "accent": "#e94560",
  "text": "#f0f0f0",
  "background": "#f5f5f5",
  "muted": "#9e9e9e"
}
```

### `color_usage_ratio`

`Record<string, number>` — optional guidance for how often each color appears across a carousel. Used only as a reference for the template designer; not enforced by code.

### `typography`

`Record<string, { family: string; weight?: number; fallback?: string }>` — font definitions.

Recommended keys: `headline_font`, `body_font`.

Fonts must be self-hosted as `.woff2` files in `templates/fonts/`. Never rely on system fonts in production — Puppeteer's Chromium may not have them.

**Example:**
```json
"typography": {
  "headline_font": { "family": "Inter", "weight": 700, "fallback": "system-ui" },
  "body_font":     { "family": "Inter", "weight": 400, "fallback": "system-ui" }
}
```

### `slide_dimensions`

```json
"slide_dimensions": { "width": 1080, "height": 1350 }
```

Instagram 4:5 portrait. Puppeteer screenshots at this exact size. Changing these values requires updating `templates/slide.html` accordingly.

### `carousel`

```json
"carousel": { "slide_count": 10 }
```

Number of slides per carousel. Must match the template structure in `config/templates/*.md`. Range: 2–20 (Instagram's carousel limit). The default template assumes 10.

---

## `config/brand/voice.md`

Plain text (markdown) describing the brand's content voice. Loaded verbatim and injected into the content-generation prompt as `{{brand_voice}}`.

**Format:** No required structure. Write it the way you'd brief a copywriter:
- What the brand stands for
- The audience and their context
- Do/don't examples for tone and phrasing
- Attribution rules specific to your domain

**Example structure:**
```
## Who we are
[brand description]

## Audience
[who reads this content and what they care about]

## Voice — do
- Attribute findings to researchers, not to us
- Use past tense for study findings ("researchers found", "the study showed")
- Keep claims specific: name the journal, year, sample size when space allows

## Voice — don't
- Don't imply causation from correlation data
- Don't use first-person plural to describe research ("we found")
- Don't stack multiple claims on one slide
```

**Important:** Changes to `voice.md` take effect on the next pipeline run — no rebuild needed. If a voice change should also affect which phrases are banned, update `tripwires.json` too.

---

## `config/brand/tripwires.json`

The list of phrases the runtime tripwire checker (`src/lib/tripwire-check.ts`) bans from generated copy.

**Schema:** [`TripwireConfigSchema`](../src/types/index.ts)

### Top-level fields

| Field | Type | Notes |
|---|---|---|
| `version` | string | Bump this when you make breaking changes to the list |
| `categories` | TripwireCategory[] | One category per risk area |

### Category fields

| Field | Type | Notes |
|---|---|---|
| `id` | string | Stable slug. Referenced in violation reports. |
| `description` | string | What risk this category covers. Shown in the review UI when a tripwire fires. |
| `rationale` | string | Why this exists — the real-world incident or policy that prompted it. Write for your future self. |
| `phrases` | TripwirePhrase[] | One or more match rules. |

### Phrase types

**Literal:**
```json
{ "match": "literal", "value": "example banned phrase" }
```
Case-insensitive substring match. Matches anywhere in the field, including as part of a larger word.

**Regex:**
```json
{ "match": "regex", "value": "\\b(word1|word2)\\s+pattern\\b", "flags": "i" }
```
JavaScript `RegExp`. `flags` defaults to `"i"` if omitted. Escape backslashes (JSON requires `\\b` for `\b`).

**What gets scanned:** Every slide's `headline`, `body`, and `highlight_word`, plus the top-level `caption`.

**When a match fires:** The run fails at Stage 1. The draft directory is written for inspection but not advanced to Stage 2. The review UI shows which phrase fired and in which slide.

**Operational rule:** Never remove or soften a tripwire entry without an explicit human decision and a written rationale in the commit message. The list should grow over time, not shrink.

---

## `config/items.json`

The source item bank. Every item you want to turn into a carousel must be here.

**Schema:** [`ItemBankSchema`](../src/types/index.ts)

### Top-level

```json
{
  "version": "1.0.0",
  "items": [ ... ]
}
```

### Item fields

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | string | yes | Format: `item-NNN` with leading zeros (e.g. `item-007`). Stable forever — never reused after retirement. |
| `number` | integer | yes | Human-facing sequence number from your source spreadsheet. |
| `raw_content` | string | yes | Verbatim source text. Audit trail. **Never edit after seed.** |
| `sanitized_content` | string | yes | Brand-safe rewrite. The only version Claude sees. Must attribute every claim to its source in past tense. |
| `attribution` | string | yes | Full citation as it will appear on the source slide (e.g. `"Smith et al., Journal of X, 2023"`). |
| `source_url` | string | yes | Valid URL to the original source. |
| `tags` | string[] | no | Free-form topic tags. Default `[]`. |
| `template` | string | no | Template ID — must match a file in `config/templates/`. Default `"default"`. |
| `status` | enum | yes | `unused \| drafted \| approved \| published \| retired` |
| `date_added` | string | yes | ISO date (e.g. `"2026-01-15"`). |
| `notes` | string | no | Optional context for the human who added the item. |

### Status lifecycle

```
unused ──→ drafted ──→ approved ──→ published
              │
              └──→ rejected (human edits then re-runs, or retires)

any state ──→ retired  (manual — set status field directly)
```

- Only items with `status: "unused"` are picked up by `npm run pipeline:daily` (batch mode).
- The pipeline sets `drafted` after Stage 1 completes; `approved` after human approval; `published` after Buffer push is confirmed.
- `retired` is set manually. Retired IDs are never reused.

### Adding items

Use `npm run items:add` (interactive CLI) or `POST /agent/items` (agent API). Do not edit `raw_content` after an item has been seeded — it is the audit trail.

---

## `config/prompts/content-gen.md`

The content-generation system prompt. Loaded by `src/pipeline/generate-content.ts` and filled with `{{placeholder}}` values before being sent to Claude.

**Do not put brand-specific values directly in this file.** All brand content comes from `config/` via placeholders.

### Placeholder reference

| Placeholder | Source |
|---|---|
| `{{brand_voice}}` | `config/brand/voice.md` (entire file, verbatim) |
| `{{tripwires_summary}}` | `config/brand/tripwires.json` (reformatted into a bulleted list with rationale) |
| `{{example_correct_attribution}}` | `config/brand/copy.json` → `example_attributions.correct` |
| `{{example_wrong_attribution}}` | `config/brand/copy.json` → `example_attributions.wrong` |
| `{{tagline}}` | `config/brand/copy.json` → `tagline` |
| `{{slide_count}}` | `config/brand/tokens.json` → `carousel.slide_count` |
| `{{template_id}}` | item's `template` field |
| `{{template_blueprint}}` | `config/templates/{template_id}.md` (verbatim) |
| `{{cta_example}}` | first entry of `config/brand/copy.json` → `cta_keywords` |
| `{{few_shot_examples}}` | `config/few-shot.json` (optional; 1–3 worked examples) |
| `{{item_id}}`, `{{sanitized_content}}`, `{{attribution}}`, `{{source_url}}`, `{{tags}}` | the source item being processed |

**Editing this file:** Changes take effect on the next pipeline run. If you change phrasing that affects what should be banned, also update `tripwires.json`.

---

## `config/templates/*.md`

One file per carousel template. The file content is injected verbatim into the prompt as `{{template_blueprint}}`.

### `default.md`

The 10-slide structure: Hook → Setup → Evidence (×3) → Context (×2) → Takeaway → Source → CTA. See [SPEC.md §3](./SPEC.md#3-stage-contracts) for full role descriptions.

### Adding templates

1. Create `config/templates/my-template.md` with the slide-by-slide structure.
2. Reference it from source items via the `template` field: `"template": "my-template"`.
3. No code changes needed — `config-loader.ts` loads templates by name at runtime.

**Constraint:** The number of slides described in the template must match `config/brand/tokens.json → carousel.slide_count`. Mismatches cause Stage 1 to fail schema validation (`SlideDraftSchema` enforces exactly `slide_count` slides).

---

## `config/few-shot.json` (optional)

One to three worked examples shown to Claude to anchor tone and format. If this file does not exist, the `{{few_shot_examples}}` placeholder is substituted with an empty string.

**Format:** Array of example input/output pairs. Structure is flexible — the file is injected verbatim as a string.

**Recommendation:** Include at least one example that shows correct attribution phrasing and one that shows a rejected (tripwire-hitting) version alongside the corrected alternative.

---

## Environment variables

Defined in `.env` (copy from `.env.example`). Never commit `.env`.

### Content generation

| Variable | Required | Default | Notes |
|---|---|---|---|
| `ANTHROPIC_API_KEY` | yes | — | Anthropic API key. Get one at console.anthropic.com. |
| `ANTHROPIC_MODEL` | no | `claude-opus-4-7` | Claude model for Stage 1. Do not downgrade to Haiku — brand-safety reasoning matters more than cost. |

### Image generation

| Variable | Required | Default | Notes |
|---|---|---|---|
| `GOOGLE_API_KEY` | yes | — | Google API key for Gemini. Get one at aistudio.google.com. |

### Publishing

| Variable | Required | Default | Notes |
|---|---|---|---|
| `BUFFER_ACCESS_TOKEN` | yes (Stage 5 only) | — | Buffer API access token. Generate at buffer.com/developers/api. |
| `BUFFER_PROFILE_ID` | yes (Stage 5 only) | — | Profile ID of the Instagram Business account in Buffer. |

### Metrics

| Variable | Required | Default | Notes |
|---|---|---|---|
| `META_GRAPH_TOKEN` | yes (Stage 6 only) | — | Long-lived Meta Graph API token. Requires `instagram_basic`, `instagram_manage_insights`, `pages_show_list`, `business_management` permissions. |
| `META_IG_USER_ID` | yes (Stage 6 only) | — | Numeric Instagram Business account ID (not the handle). |
| `META_GRAPH_VERSION` | no | `v19.0` | Meta Graph API version. Update when Meta deprecates the current one. |

### Runtime

| Variable | Required | Default | Notes |
|---|---|---|---|
| `NODE_ENV` | no | `development` | Must be `production` to push to Buffer. The push-to-buffer stage refuses to run otherwise — protects against accidental dev publishes. |
| `REVIEW_PORT` | no | `3000` | Port for the Fastify review server. |
| `DB_PATH` | no | `data/pipeline.db` | Path to the SQLite database file. |
