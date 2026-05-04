# Minimalist Carousel Template

This file describes the slide-by-slide structure for the `minimalist` template ID. Designed for dark-mode tech aesthetics: developer tools, infrastructure content, technical benchmarks, product launches.

Minimalist is about restraint. Each slide has one claim, maximum contrast, zero decoration. The visual energy comes from the typography and the background, not from layered elements.

The block below is read verbatim into the prompt's `{{template_blueprint}}` placeholder.

---

## Structure

**Slide 1 — Statement**
One declarative sentence. No question marks, no ellipses. State the fact or claim that earns the swipe.
- Headline: the full claim in ≤ 10 words.
- Body: empty, or ≤ 10 words of necessary context. If you can leave the body empty, do.

**Slide 2 — Why It Matters: Point 1**
First clean, self-contained statement expanding the core claim. No connective tissue. No "furthermore."
- Headline: ≤ 8 words. Active voice, past or present tense.
- Body: ≤ 20 words. One supporting detail. Optional — leave blank if the headline is sufficient.

**Slide 3 — Why It Matters: Point 2**
Second supporting statement. Same format as Slide 2.
- Headline: ≤ 8 words.
- Body: ≤ 20 words. Optional.

**Slide 4 — Why It Matters: Point 3**
Third supporting statement. Same format as Slides 2–3.
- Headline: ≤ 8 words.
- Body: ≤ 20 words. Optional.

**Slide 5 — Number 1**
First key metric. The number is the headline.
- Headline: the number or the result. ≤ 6 words.
- Body: what was measured, over what period, against what baseline. ≤ 25 words.
- Use `highlight_word` for the number itself.

**Slide 6 — Number 2**
Second key metric. Same format as Slide 5.
- Headline: ≤ 6 words.
- Body: ≤ 25 words.
- Use `highlight_word` for the number itself.

**Slide 7 — Number 3**
Third key metric. Same format as Slides 5–6.
- Headline: ≤ 6 words.
- Body: ≤ 25 words.
- Use `highlight_word` for the number itself.

**Slide 8 — The Contrast**
What changed. Before vs. after, or problem vs. outcome. State both sides neutrally.
- Headline: ≤ 8 words.
- Body: two-part statement. ≤ 25 words total.

**Slide 9 — Source**
Citation card. Minimal — just the source name, year, and URL.
- Headline: "Source"
- Body: citation as written in the item's `attribution` field.

**Slide 10 — Close**
A single line that closes the loop on the opening Slide 1 statement. Not a CTA — a landing point. The ask comes last.
- Headline: ≤ 8 words. Echo or complete the opening statement.
- Body: one CTA keyword prompt. ≤ 15 words.

## Visual conventions

- Every slide: dark background (`--color-primary` should be near-black or deep navy for this template). High-contrast white or near-white text.
- No decorative elements. No gradients unless they are part of the brand's design tokens.
- Slide 1 and Slide 10: full bleed background color. No background image. The text is the design.
- Slides 5–7 (numbers): the `highlight_word` value should be the key figure. Render it in `--color-accent` at a larger size than surrounding text.
- Slide 9 (citation): use a monospaced typeface for the citation line if available in `templates/fonts/`.
- Generous vertical padding on every slide. Dark mode fails when it feels cramped.
