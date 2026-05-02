/**
 * Unit tests for generate-content.ts.
 *
 * All external dependencies (Claude API, file system, config loaders) are
 * mocked at the module boundary — no real API calls, no disk writes.
 *
 * Docs: CLAUDE.md §"Don't hit external APIs in tests. Mock at the client boundary."
 */
import { describe, it, mock, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { SlideDraftSchema } from "../src/types/index.js";

// ---- shared fixture builders ----

export function makeSlideDraft(overrides: Record<string, unknown> = {}) {
  return SlideDraftSchema.parse({
    item_id: "item-001",
    template_id: "default",
    created_at: new Date().toISOString(),
    model: "claude-opus-4-7",
    slides: Array.from({ length: 10 }, (_, i) => ({
      index: i + 1,
      role: i === 0 ? "hook" : i === 8 ? "source" : i === 9 ? "cta" : "evidence",
      headline: `Headline for slide ${i + 1}`,
      body: `Body text for slide ${i + 1} with safe attributed language.`,
      image_prompt: "Abstract background NO TEXT",
    })),
    caption: "Safe caption for the carousel.",
    hashtags: ["#health", "#research", "#evidence"],
    cta: "SAVE",
    attribution: "Smith et al., 2024",
    source_url: "https://example.com/study",
    ...overrides,
  });
}

// ---- extractJson tests ----
// These don't need mocking and cover the key edge cases Claude triggers.

describe("extractJson", async () => {
  const { extractJson } = await import("../src/lib/extract-json.js");

  it("parses a plain JSON object", () => {
    const result = extractJson('{"key": "value"}');
    assert.deepEqual(result, { key: "value" });
  });

  it("strips a ```json fence", () => {
    const result = extractJson("```json\n{\"key\": \"value\"}\n```");
    assert.deepEqual(result, { key: "value" });
  });

  it("strips a plain ``` fence", () => {
    const result = extractJson("```\n{\"key\": \"value\"}\n```");
    assert.deepEqual(result, { key: "value" });
  });

  it("throws SyntaxError on invalid JSON", () => {
    assert.throws(() => extractJson("not json"), SyntaxError);
  });

  it("throws SyntaxError on empty string", () => {
    assert.throws(() => extractJson(""), SyntaxError);
  });
});

// ---- SlideDraftSchema validation tests ----
// These test the Zod schema directly — critical for catching API contract drift.

describe("SlideDraftSchema", () => {
  it("accepts a valid draft", () => {
    assert.doesNotThrow(() => makeSlideDraft());
  });

  it("rejects a draft with wrong slide count", () => {
    assert.throws(() =>
      makeSlideDraft({
        slides: Array.from({ length: 5 }, (_, i) => ({
          index: i + 1,
          role: "evidence",
          headline: "Test",
          body: "Test body",
          image_prompt: "abstract NO TEXT",
        })),
      })
    );
  });

  it("rejects a headline over 8 words", () => {
    const slides = Array.from({ length: 10 }, (_, i) => ({
      index: i + 1,
      role: "evidence",
      headline: i === 0 ? "This headline is way too long and exceeds eight words limit" : "Short",
      body: "Body",
      image_prompt: "abstract NO TEXT",
    }));
    assert.throws(() => makeSlideDraft({ slides }));
  });

  it("rejects a body over 30 words", () => {
    const longBody = Array.from({ length: 31 }, (_, i) => `word${i}`).join(" ");
    const slides = Array.from({ length: 10 }, (_, i) => ({
      index: i + 1,
      role: "evidence",
      headline: "Short",
      body: i === 0 ? longBody : "Safe body",
      image_prompt: "abstract NO TEXT",
    }));
    assert.throws(() => makeSlideDraft({ slides }));
  });

  it("rejects a caption over 2200 chars", () => {
    assert.throws(() => makeSlideDraft({ caption: "x".repeat(2201) }));
  });

  it("rejects fewer than 3 hashtags", () => {
    assert.throws(() => makeSlideDraft({ hashtags: ["#one", "#two"] }));
  });

  it("rejects more than 5 hashtags", () => {
    assert.throws(() =>
      makeSlideDraft({ hashtags: ["#a", "#b", "#c", "#d", "#e", "#f"] })
    );
  });

  it("rejects a lowercase CTA keyword", () => {
    assert.throws(() => makeSlideDraft({ cta: "save" }));
  });

  it("accepts an uppercase CTA keyword", () => {
    assert.doesNotThrow(() => makeSlideDraft({ cta: "SHARE" }));
  });

  it("rejects an invalid source_url", () => {
    assert.throws(() => makeSlideDraft({ source_url: "not-a-url" }));
  });
});
