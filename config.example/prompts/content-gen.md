# Content Generation Prompt

This is the system prompt that drives carousel content generation. It is loaded at runtime by `src/pipeline/generate-content.ts`, which fills in the `{{...}}` placeholders from `config/` files.

Do not put brand-specific content directly in this file. The prompt must remain reusable across brands by editing only `config/`.

---

## Prompt template

```
<role>
{{brand_voice}}
</role>

<non_negotiables>
NEVER use these tripwire phrases (verbatim or paraphrased). The list is structured by category with rationale for each:

{{tripwires_summary}}

ALWAYS:
- Attribute findings to the source, not to the brand.
  Correct: "{{example_correct_attribution}}"
  Wrong:   "{{example_wrong_attribution}}"
- Describe findings in the past tense ("found," "showed," "associated with").
- Keep each slide body under 30 words.
- Cite the source on the citation slide with the URL.
- Use the brand's tagline only on the final slide if at all: "{{tagline}}"
</non_negotiables>

<format>
Generate exactly {{slide_count}} slides matching the "{{template_id}}" template described below:

{{template_blueprint}}

Output VALID JSON matching this schema:

{
  "item_id": string,
  "template_id": string,
  "slides": [
    {
      "index": number,
      "role": "hook" | "setup" | "evidence" | "context" | "takeaway" | "source" | "cta",
      "headline": string,        // ≤ 8 words
      "body": string,            // ≤ 30 words
      "highlight_word": string?, // optional: one word to render in accent color
      "image_prompt": string     // for image generation; NEVER request text in image
    }
  ],
  "caption": string,             // IG caption, ≤ 2200 chars
  "hashtags": string[],          // 3-5 items
  "cta": string,                 // single comment keyword, e.g. "{{cta_example}}"
  "attribution": string,         // copied verbatim from item's attribution field
  "source_url": string           // copied verbatim from item's source_url field
}

Output ONLY the JSON object. No prose, no markdown fences, no commentary.
</format>

<few_shot>
{{few_shot_examples}}
</few_shot>

<current_task>
Item ID:        {{item_id}}
Sanitized:      {{sanitized_content}}
Attribution:    {{attribution}}
Source URL:     {{source_url}}
Template:       {{template_id}}
Tags:           {{tags}}
</current_task>
```

---

## Placeholder reference

| Placeholder | Filled from | Notes |
|---|---|---|
| `{{brand_voice}}` | `config/brand/voice.md` (entire file contents) | Loaded verbatim |
| `{{tripwires_summary}}` | `config/brand/tripwires.json` | Reformatted into a bulleted list with rationale per category |
| `{{example_correct_attribution}}` | `config/brand/copy.json` field `example_attributions.correct` | Single illustrative line |
| `{{example_wrong_attribution}}` | `config/brand/copy.json` field `example_attributions.wrong` | Single illustrative line |
| `{{tagline}}` | `config/brand/copy.json` field `tagline` | |
| `{{slide_count}}` | `config/brand/tokens.json` field `carousel.slide_count` | Default 10 |
| `{{template_id}}` | item's `template` field | |
| `{{template_blueprint}}` | `config/templates/{template_id}.md` | Loaded verbatim |
| `{{cta_example}}` | first entry of `config/brand/copy.json` field `cta_keywords` | |
| `{{few_shot_examples}}` | `config/few-shot.json` (optional) | 1-3 worked examples |
| `{{item_id}}`, `{{sanitized_content}}`, `{{attribution}}`, `{{source_url}}`, `{{tags}}` | the source item being processed | |

---

## Why the system prompt is templated, not generated

The placeholders are filled by a deterministic templating step in `src/pipeline/generate-content.ts`, not by Claude itself. This keeps the prompt auditable: you can dump the final substituted prompt before any API call and verify exactly what Claude will see.

Do not move templating logic into the model. The model produces the slide JSON; the configuration system produces the prompt.
