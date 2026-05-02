import type { SourceItem, SlideDraft } from "../types/index.js";

/**
 * Returns a hardcoded valid SlideDraft for demo mode (--mock flag).
 *
 * All fields satisfy SlideDraftSchema: exactly 10 slides, roles from the
 * enum, headline ≤ 8 words, body ≤ 30 words, CTA uppercase, caption ≤ 2200 chars.
 *
 * Compose stage (Puppeteer) runs normally on this draft, producing real PNGs
 * from the brand template without hitting any external API.
 *
 * Docs: docs/SPEC.md §2 (pipeline overview)
 */
export function mockSlideDraft(item: SourceItem): SlideDraft {
  return {
    item_id: item.id,
    template_id: item.template ?? "default",
    created_at: new Date().toISOString(),
    model: "mock",
    caption:
      "Demo caption — this is what your Instagram caption will look like. " +
      "Replace with real content once you configure your brand and API keys. #demo #carousel",
    hashtags: ["#demo", "#carousel", "#content"],
    cta: "DEMO",
    attribution: item.attribution,
    source_url: item.source_url,
    slides: [
      {
        index: 1,
        role: "hook",
        headline: "One striking fact stops scrollers",
        body: "A short hook that earns the next swipe. This is placeholder copy from demo mode.",
        highlight_word: "fact",
        image_prompt: "Abstract geometric background, deep blue tones, NO TEXT NO LOGOS",
      },
      {
        index: 2,
        role: "setup",
        headline: "Here is the context",
        body: "Two or three sentences framing why this matters to your reader. Demo mode — replace with real content.",
        highlight_word: "context",
        image_prompt: "Soft gradient background, muted warm tones, NO TEXT NO LOGOS",
      },
      {
        index: 3,
        role: "evidence",
        headline: "The research finding",
        body: "Researchers found a significant result in a study of participants. Attribution appears on slide nine.",
        highlight_word: "research",
        image_prompt: "Clean minimal background, cool neutral tones, NO TEXT NO LOGOS",
      },
      {
        index: 4,
        role: "evidence",
        headline: "What the data shows",
        body: "A supporting statistic or secondary finding that reinforces the main point from the source.",
        highlight_word: "data",
        image_prompt: "Abstract pattern background, structured geometric forms, NO TEXT NO LOGOS",
      },
      {
        index: 5,
        role: "evidence",
        headline: "A third supporting point",
        body: "Another detail from the source that builds the case and deepens the reader's understanding.",
        highlight_word: "point",
        image_prompt: "Geometric gradient background, brand primary color family, NO TEXT NO LOGOS",
      },
      {
        index: 6,
        role: "context",
        headline: "Why this matters",
        body: "The real-world implication for your audience. What changes for them once they know this?",
        highlight_word: "matters",
        image_prompt: "Warm inviting gradient background, soft light tones, NO TEXT NO LOGOS",
      },
      {
        index: 7,
        role: "context",
        headline: "What experts say",
        body: "An expert opinion or related finding that adds credibility and broadens the picture.",
        highlight_word: "experts",
        image_prompt: "Professional clean background, muted desaturated palette, NO TEXT NO LOGOS",
      },
      {
        index: 8,
        role: "takeaway",
        headline: "The bottom line",
        body: "One clear action or mindset shift your reader should take away from this carousel.",
        highlight_word: "bottom",
        image_prompt: "Bold minimal background, strong contrast, high impact, NO TEXT NO LOGOS",
      },
      {
        index: 9,
        role: "source",
        headline: "Source",
        body: item.attribution,
        highlight_word: "source",
        image_prompt: "Clean light background, academic aesthetic, NO TEXT NO LOGOS",
      },
      {
        index: 10,
        role: "cta",
        headline: "Want more like this?",
        body: "Comment DEMO below and we will send you the full breakdown.",
        highlight_word: "DEMO",
        image_prompt: "Energetic brand color background, bold and inviting, NO TEXT NO LOGOS",
      },
    ],
  };
}
