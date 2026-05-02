import { GoogleGenAI } from "@google/genai";
import { writeFile } from "node:fs/promises";

/**
 * Gemini image generation client.
 *
 * Output: 1024×1024 PNG written to disk. The composition step (compose-slides)
 * crops/letterboxes to the slide dimensions defined in config/brand/tokens.json.
 *
 * NEVER ask for text in images. If the prompt doesn't already include a "NO
 * TEXT" directive, one is prepended automatically.
 *
 * Docs: docs/SPEC.md §3.2 (image generation step)
 */
export class GeminiClient {
  private ai: GoogleGenAI;

  constructor() {
    if (!process.env.GOOGLE_API_KEY) {
      throw new Error("GOOGLE_API_KEY env var is required for image generation");
    }
    this.ai = new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY });
  }

  async generateImage(prompt: string, outputPath: string): Promise<void> {
    const safePrompt = ensureNoTextDirective(prompt);

    const response = await this.ai.models.generateImages({
      model: "imagen-3.0-generate-002",
      prompt: safePrompt,
      config: {
        numberOfImages: 1,
        outputMimeType: "image/png",
        aspectRatio: "1:1",
      },
    });

    const imageBytes = response.generatedImages?.[0]?.image?.imageBytes;
    if (!imageBytes) {
      throw new Error(
        `Gemini returned no image data for prompt: ${safePrompt.slice(0, 80)}...`
      );
    }

    const buffer = Buffer.from(imageBytes, "base64");
    await writeFile(outputPath, buffer);
  }
}

function ensureNoTextDirective(prompt: string): string {
  if (/NO\s+TEXT/i.test(prompt)) return prompt;
  return `${prompt.trimEnd()} NO TEXT, NO LOGOS, NO WORDS in the image.`;
}
