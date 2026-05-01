import { z } from "zod";

/**
 * Inter-stage data contracts for carousel-pipeline.
 *
 * All inter-stage data is validated with these schemas at the stage
 * boundary. A stage refuses to run if its input doesn't conform to its
 * declared schema — this catches errors at the previous step rather than
 * three steps later.
 *
 * These types replace the GoodMuncher-specific types (Fact, SlideDraft,
 * etc.) from the original codebase. The naming is generic; the structure
 * is identical in spirit.
 */

// ---------------------------------------------------------------------------
// Source items (the input bank — replaces facts/upf-facts.json)
// ---------------------------------------------------------------------------

export const ItemStatusSchema = z.enum([
  "unused",
  "drafted",
  "approved",
  "published",
  "retired",
]);
export type ItemStatus = z.infer<typeof ItemStatusSchema>;

export const SourceItemSchema = z.object({
  /** Stable slug like "item-001". Never reused, even after retirement. */
  id: z.string().regex(/^item-\d{3,}$/),

  /** Sequential number from the source spreadsheet, for human reference. */
  number: z.number().int().positive(),

  /** Verbatim source text. Preserved for audit trail. Never edited after seed. */
  raw_content: z.string().min(1),

  /** Brand-safe sanitized version. The only version Claude ever sees. */
  sanitized_content: z.string().min(1),

  /** Source citation as it should appear on the citation slide. */
  attribution: z.string().min(1),

  /** Canonical link to the original source. */
  source_url: z.string().url(),

  /** Free-form tags for search and analytics. */
  tags: z.array(z.string()).default([]),

  /**
   * Template ID — must reference a file at `config/templates/{template}.md`.
   * The pipeline's default template is "default".
   */
  template: z.string().min(1).default("default"),

  status: ItemStatusSchema,

  /** ISO date when the item was added to the bank. */
  date_added: z.string(),

  notes: z.string().optional(),
});
export type SourceItem = z.infer<typeof SourceItemSchema>;

export const ItemBankSchema = z.object({
  version: z.string(),
  items: z.array(SourceItemSchema),
});
export type ItemBank = z.infer<typeof ItemBankSchema>;

// ---------------------------------------------------------------------------
// Slide draft (Step 1 output — replaces SlideDraft from the original)
// ---------------------------------------------------------------------------

export const SlideRoleSchema = z.enum([
  "hook",
  "setup",
  "evidence",
  "context",
  "takeaway",
  "source",
  "cta",
]);
export type SlideRole = z.infer<typeof SlideRoleSchema>;

export const SlideSchema = z.object({
  index: z.number().int().min(1),
  role: SlideRoleSchema,
  headline: z.string().refine((s) => s.split(/\s+/).length <= 8, {
    message: "headline must be 8 words or fewer",
  }),
  body: z.string().refine((s) => s.split(/\s+/).length <= 30, {
    message: "body must be 30 words or fewer",
  }),
  highlight_word: z.string().optional(),
  /**
   * Prompt for the image-generation step. Must include negative
   * "NO TEXT" constraint or it will be auto-prepended.
   */
  image_prompt: z.string().min(10),
});
export type Slide = z.infer<typeof SlideSchema>;

export const SlideDraftSchema = z.object({
  item_id: z.string().regex(/^item-\d{3,}$/),
  template_id: z.string(),
  created_at: z.string(),
  model: z.string(),
  slides: z.array(SlideSchema).length(10),
  caption: z.string().max(2200),
  hashtags: z.array(z.string()).min(3).max(5),
  cta: z.string().regex(/^[A-Z]+$/, "CTA keyword must be uppercase"),
  attribution: z.string(),
  source_url: z.string().url(),
});
export type SlideDraft = z.infer<typeof SlideDraftSchema>;

// ---------------------------------------------------------------------------
// Metadata (per-draft sidecar — replaces metadata.json)
// ---------------------------------------------------------------------------

export const TripwireViolationSchema = z.object({
  category_id: z.string(),
  phrase: z.string(),
  slide_index: z.number().int().min(1).optional(),
  in_caption: z.boolean().default(false),
});
export type TripwireViolation = z.infer<typeof TripwireViolationSchema>;

export const MetadataSchema = z.object({
  item_id: z.string(),
  created_at: z.string(),
  pipeline_version: z.string(),
  generation_attempts: z.number().int().min(1),
  tripwire_checks: z.object({
    passed: z.boolean(),
    violations: z.array(TripwireViolationSchema),
  }),
  /** sha256 of slides.json — changes invalidate downstream output */
  hash: z.string().regex(/^[a-f0-9]{64}$/),
});
export type Metadata = z.infer<typeof MetadataSchema>;

// ---------------------------------------------------------------------------
// Brand configuration (loaded from config/ at runtime)
// ---------------------------------------------------------------------------

export const TripwirePhraseSchema = z.discriminatedUnion("match", [
  z.object({
    match: z.literal("literal"),
    value: z.string().min(1),
  }),
  z.object({
    match: z.literal("regex"),
    value: z.string().min(1),
    flags: z.string().optional(),
  }),
]);
export type TripwirePhrase = z.infer<typeof TripwirePhraseSchema>;

export const TripwireCategorySchema = z.object({
  id: z.string().min(1),
  description: z.string(),
  rationale: z.string(),
  phrases: z.array(TripwirePhraseSchema),
});
export type TripwireCategory = z.infer<typeof TripwireCategorySchema>;

export const TripwireConfigSchema = z.object({
  version: z.string(),
  categories: z.array(TripwireCategorySchema),
});
export type TripwireConfig = z.infer<typeof TripwireConfigSchema>;

export const BrandTokensSchema = z.object({
  colors: z.record(z.string(), z.string()),
  color_usage_ratio: z.record(z.string(), z.number()).optional(),
  typography: z.record(
    z.string(),
    z.object({
      family: z.string(),
      weight: z.number().optional(),
      fallback: z.string().optional(),
    })
  ),
  slide_dimensions: z.object({
    width: z.number().int().positive(),
    height: z.number().int().positive(),
  }),
  carousel: z.object({
    slide_count: z.number().int().min(2).max(20),
  }),
});
export type BrandTokens = z.infer<typeof BrandTokensSchema>;

export const BrandCopySchema = z.object({
  brand_name: z.string(),
  tagline: z.string(),
  hero_line: z.string(),
  cta_keywords: z.array(z.string()).min(1),
  default_handle: z.string().optional(),
  default_hashtags: z.array(z.string()).default([]),
});
export type BrandCopy = z.infer<typeof BrandCopySchema>;
