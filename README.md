# carousel-pipeline

> A pipeline for turning structured source material into brand-safe Instagram carousels using LLM-generated copy, AI-generated imagery, Puppeteer composition, and a human review queue. Pluggable for any brand, any source format.

**Status:** Open source, **unmaintained**. Released as-is under Apache 2.0. Issues and PRs will not be reviewed. Fork freely.

---

## What this is

A six-stage pipeline that takes a curated bank of source items (research findings, product specs, statistics, recipes, anything structured) and produces published Instagram carousels:

```
source items → content generation → image generation → composition → human review → publish → metrics
```

Every stage writes to disk and is independently replayable. Every post goes through a human review queue before publishing. A configurable "tripwire" checker scans generated copy against a banned-phrases list, blocking unsafe posts from advancing.

The original use case was translating peer-reviewed health research into legally defensible carousels for a grocery brand. The pipeline has been generalized so the brand voice, banned phrases, color system, source schema, and slide templates are all user-supplied configuration — not hardcoded.

## What this is not

- **Not a hosted service.** You run it. You bring your API keys.
- **Not maintained.** The original author published it for use, not for support. There is no roadmap, no issue tracker triage, and no guarantee of compatibility with future versions of the upstream APIs (Claude, Gemini, Buffer, Meta Graph). When those APIs change, this code will break, and you will fix it.
- **Not a turnkey solution.** You will spend several hours configuring the brand layer, writing your prompt, populating your source bank, and tuning your tripwires before the pipeline produces anything you would publish.

If you need a maintained, hosted equivalent, this is not it.

---

## Architecture overview

The six stages, each a separate executable that reads from disk and writes to disk:

| Stage | Input | Output | External dependency |
|---|---|---|---|
| 1. Content generation | One source item + brand config | `slides.json`, `caption.txt`, `metadata.json` | Anthropic API |
| 2. Image generation | `slides.json` | `bg-01.png` … `bg-N.png` | Google GenAI (Gemini Image) |
| 3. Composition | slides + backgrounds + slide template | `slide-01.png` … `slide-N.png` | Puppeteer |
| 4. Review | composed slides | approval verdict | Fastify UI on localhost |
| 5. Publish | approved post | scheduled queue entry | Buffer API |
| 6. Metrics | published post | daily insights snapshot | Meta Graph API |

Each stage has an explicit Zod schema for its inputs and outputs. A stage refuses to run on malformed input. This catches errors at the previous step rather than three steps later.

See [docs/SPEC.md](./docs/SPEC.md) for the full design — schemas, retry policy, tripwire semantics, and the brand-safety reasoning behind the pipeline.

---

## Quick start

```bash
# 1. Install
npm install

# 2. Copy the example configuration and edit for your brand
cp -r config.example config
# Edit config/brand/voice.md, config/brand/tokens.json, config/brand/tripwires.json
# Add your source items to config/items.json

# 3. Set up secrets
cp .env.example .env
# Fill in ANTHROPIC_API_KEY, GOOGLE_API_KEY, BUFFER_ACCESS_TOKEN, META_GRAPH_TOKEN

# 4. Initialize the database
npm run db:init

# 5. Generate a single carousel end-to-end (dry run, no publish)
npm run pipeline -- --item item-001 --dry-run

# 6. Open the review UI
npm run review
# → localhost:3000
```

You will not get publishable output on the first run. The brand voice, prompt, and tripwires need iteration. Plan to spend a few hours on configuration before the output is acceptable.

## Bringing your own brand

Everything brand-specific lives in `config/`. The repository ships a worked example at `config.example/` derived from the original use case (a health-anxious-parents grocery brand) so you can see the shape, not because you should copy it.

```
config/
├── brand/
│   ├── voice.md            # narrative voice rules, tone principles, do/don't framings
│   ├── tokens.json         # colors, font stacks, brand color usage ratios
│   ├── copy.json           # tagline, hero line, fixed lines used across slides
│   └── tripwires.json      # banned phrases (regex + literal), grouped by category
├── templates/              # carousel format templates referenced by your source items
│   └── default.md          # slide-by-slide structural blueprint
├── prompts/
│   └── content-gen.md      # the content-generation prompt (templated)
└── items.json              # your source bank (replaces facts/upf-facts.json)
```

The pipeline has no opinion about your domain. If you write health content, the tripwires file blocks unattributed disease claims. If you write financial content, it blocks "guaranteed return" language. If you write recipes, it might be empty. You decide what's dangerous.

See [docs/CONFIGURATION.md](./docs/CONFIGURATION.md) for the configuration schema, validation rules, and how each file is consumed at runtime.

---

## What's actually implemented vs. designed

The original v0.1 codebase implemented stages 1 and 3 (content generation and a slide template) and the tripwire checker. Stages 2 (images), 4 (review), 5 (publish), and 6 (metrics) were designed in the spec but not built.

When you fork this, you are forking the design and the partial implementation. You will need to finish at least the composition stage to get usable PNG output. Image generation and Buffer publishing are optional — many users will swap them for whatever they prefer (manual design, Later, manual posting, etc.).

The repository's CI runs unit and integration tests for what was built. It does not run end-to-end tests against live APIs.

---

## License

This project is licensed under the Apache License 2.0. See [LICENSE](./LICENSE) for the full text and [NOTICE](./NOTICE) for third-party attributions.

By using this software, you accept it AS-IS without warranty of any kind. See LICENSE Section 7 for the full disclaimer.

## Contributing

This project is **not maintained**. Pull requests will not be reviewed and issues will not be answered. You are welcome to:

- Fork and modify under the Apache 2.0 license terms.
- Open issues if it helps you organize your own thinking — but expect no response.
- Reference this code in your own projects, with attribution as required by the license.

If you want to keep building on this in public, fork it and maintain your fork. That fork can be the actively-maintained version of this idea.

## Security

If you find a vulnerability and want to report it responsibly: there is no email to write to. The repository is unmaintained. If the vulnerability would affect downstream users (e.g. a tripwire bypass or an injection vector in the Puppeteer layer), open an issue describing it publicly so other forks can patch their copies.

Do not commit `.env`, API keys, or any other secrets. The `.gitignore` excludes them; verify before pushing.

## Acknowledgments

This pipeline was originally built for an internal use case where translating peer-reviewed research into Instagram carousels at a brand-safe quality bar required automation. It was open-sourced so others working on the same problem in different domains could benefit from the architecture without rebuilding from scratch.
