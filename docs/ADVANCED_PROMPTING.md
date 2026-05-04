# Advanced Prompting Guide

This guide covers Chain-of-Thought (CoT) prompting techniques for getting "insight, not summary" from Claude in the content-generation stage.

The default prompt template is intentionally general. If your carousels are reading like compressed Wikipedia summaries, the solution is not a better source item — it is a better prompt scaffold. This document shows you what to change and why.

---

## The core problem: summary vs. insight

A **summary** restates the source: "The study found that X causes Y in population Z."

An **insight** reframes the source around a tension, a surprise, or a non-obvious implication: "Most people assume X. The study found the opposite — and the mechanism is what makes it surprising."

Claude defaults to summary because summary is the statistically safest response to a generation request. It requires no reasoning about what is surprising, no judgment about what an audience doesn't already know, no construction of a narrative arc. Your prompting job is to push Claude past that default.

---

## Technique 1: Explicit reasoning steps in the voice file

The most impactful place to introduce CoT is in `config/brand/voice.md`, inside the persona description. Instead of describing what output should look like, describe the *thinking process* Claude should follow before generating output.

**Before (persona description):**
```
You translate financial data into Instagram carousel copy.
```

**After (with CoT scaffold):**
```
You translate financial data into Instagram carousel copy. Before writing any slide, complete these reasoning steps silently:

1. What is the single most surprising number in this source? Surprising means: most people in the target audience would not have predicted it, or would have predicted wrong.
2. What assumption does that number challenge? Name the assumption explicitly.
3. What is the minimum number of supporting data points needed to make a skeptical reader believe the surprising number? (Usually 2–3.)
4. What is the most credible objection a reader would raise, and how does the source itself address it?
5. What is the one concrete action a reader could take in the next 48 hours based on this data?

Now generate the carousel using these answers as the structural skeleton. The surprising number becomes slide 1. The challenged assumption becomes slide 2. The supporting data becomes slides 3–5. The objection becomes slides 6–7. The action becomes slide 8.
```

This technique works because Claude has strong reasoning capabilities when given explicit scaffolding. The reasoning steps become the intermediate output that guides the generation, rather than a direct prompt-to-output mapping.

---

## Technique 2: Contrast examples with reasoning in the voice file

Few-shot examples in `voice.md` (the do/don't table) are already a form of implicit CoT. But a simple do/don't table treats generation as pattern matching. You can upgrade it by showing the *reasoning* that produces the better output.

**Standard do/don't:**

| Don't | Do |
|---|---|
| NVIDIA crushed earnings | NVIDIA reported Q4 revenue of $39.3B, up 69% year-over-year |

**CoT-enhanced do/don't:**

| Pattern | Example | Why Claude avoids this |
|---|---|---|
| Editorializing verb | "NVIDIA crushed earnings" | "Crushed" is an opinion, not a measurement. The slide body contradicts it if the copy then states a specific figure. |
| Missing comparison base | "Revenue grew 69%" | 69% of what? Over what period? The audience cannot evaluate the claim without both numbers. |
| Correct form | "NVIDIA reported Q4 revenue of $39.3B, up 69% vs. Q4 FY2025" | States the metric, the figure, the period, and the comparison base. Complete without editorializing. |

Adding the "why Claude avoids this" column teaches the reasoning, not just the pattern. Claude generalizes better from reasoning than from examples alone.

---

## Technique 3: Reasoning constraints at the slide level in template files

`config/templates/*.md` is read verbatim into the prompt. Slide-level constraints ("≤ 8 words") are already there. You can add *reasoning constraints* at the slide level.

**Standard slide constraint:**
```
**Slide 2 — Setup**
One sentence framing why this matters to the audience.
- Headline: ≤ 8 words.
- Body: ≤ 30 words.
```

**With CoT reasoning constraint:**
```
**Slide 2 — Setup**
Surface the assumption the audience currently holds that slide 1 challenges. Do NOT explain what the finding means — that comes later. Your only job on this slide is to name the assumption so the audience recognizes themselves holding it.

To find the assumption: ask "What would a person who had NOT seen this data think was true about [the topic]?" That belief is the assumption to name.

- Headline: ≤ 8 words. State the assumption, not the challenge.
- Body: ≤ 30 words. Anchor it in lived experience ("Most [audience] assume...", "The conventional view is...").
```

---

## Technique 4: The "insight, not summary" instruction as a non-negotiable

Add an explicit constraint to `config/prompts/content-gen.md` inside the `<non_negotiables>` block:

```
INSIGHT, NOT SUMMARY:
- A summary restates what the source says. A carousel slide does not restate — it reframes.
- For every slide, ask: does this give the reader something they would not have concluded from the raw source alone?
- If the answer is no, the slide needs to be rewritten, not formatted differently.
- The hook slide (slide 1) must be specific enough that a reader who already knows the topic learns something new from it. If it could have been written without reading the source, it is not specific enough.
```

This works because it converts a stylistic preference ("be insightful") into a checkable quality criterion ("would the reader learn something new without reading the source?"). Claude can evaluate its own output against a criterion more reliably than it can evaluate against a style description.

---

## Technique 5: Chain the few-shot examples in `config/few-shot.json`

`config/few-shot.json` accepts 1–3 worked examples. Most users provide one example of good output. A higher-leverage use is to show the source item, an intermediate reasoning step, and the resulting slide copy:

```json
[
  {
    "label": "Worked example with reasoning trace",
    "source_item": {
      "sanitized_content": "...",
      "attribution": "..."
    },
    "reasoning_trace": "Surprising number: X (most assume Y). Challenged assumption: that [Z]. Supporting data needed: at least 2 specifics. Credible objection: [objection]. Reader action: [action].",
    "output": {
      "slides": []
    }
  }
]
```

The `reasoning_trace` field is not part of the `SlideDraft` schema — it is injected into the few-shot section of the prompt as a demonstration that the model should reason before it generates. Because the trace appears in the `<few_shot>` block (not the `<format>` block), it does not affect output schema validation.

---

## When to use each technique

| Symptom | Technique |
|---|---|
| All carousels read like bullet-point summaries | Technique 1 — add reasoning steps to voice.md persona |
| Copy is generic ("studies show," "experts agree") | Technique 4 — add insight vs. summary non-negotiable |
| Slide 1 hook is not stopping anyone | Technique 3 — add "find the assumption" constraint to template |
| Model gets attribution format right but tone wrong | Technique 2 — upgrade do/don't table with reasoning |
| Hard to get consistency across many items | Technique 5 — add reasoning trace to few-shot examples |

---

## Evaluating your changes

Run `npm run test:e2e` with a mock item after any prompt change to verify the output still passes schema validation. If your CoT instructions push the model toward longer reasoning output, check that slide word counts still pass the schema constraints (≤ 8 words headline, ≤ 30 words body). CoT prompting occasionally makes models verbose — the word count constraints in the template are your safeguard.

The `tripwire-check.ts` tests (`npm test`) will catch any reasoning that accidentally introduces banned phrases. This is rare but possible if the model uses a banned phrase in its reasoning and then echoes it in the output.
