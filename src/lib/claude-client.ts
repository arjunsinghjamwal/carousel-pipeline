import Anthropic from "@anthropic-ai/sdk";

/**
 * Thin wrapper around the Anthropic SDK.
 *
 * Centralizes model config. Retry logic (parse-error follow-up) is owned by
 * the caller — don't retry inside this class.
 *
 * Model is read from ANTHROPIC_MODEL env var (default: claude-opus-4-7).
 * Don't downgrade to Haiku for content generation — see CLAUDE.md §Integration notes.
 */
export class ClaudeClient {
  private client: Anthropic;
  private model: string;

  constructor() {
    this.client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    this.model = process.env.ANTHROPIC_MODEL ?? "claude-opus-4-7";
  }

  /**
   * Send a single completion request.
   *
   * @param system  The system prompt (pass separately for prompt caching compatibility).
   * @param messages The conversation turn(s).
   * @param max_tokens Maximum tokens to generate (default: 4096).
   * @returns The text content of the first response block.
   */
  async complete(params: {
    system: string;
    messages: Anthropic.MessageParam[];
    max_tokens?: number;
  }): Promise<string> {
    const response = await this.client.messages.create({
      model: this.model,
      system: params.system,
      messages: params.messages,
      max_tokens: params.max_tokens ?? 4096,
    });

    const block = response.content[0];
    if (!block || block.type !== "text") {
      throw new Error(
        `Unexpected Claude response: ${JSON.stringify(response.content)}`
      );
    }
    return block.text;
  }
}
