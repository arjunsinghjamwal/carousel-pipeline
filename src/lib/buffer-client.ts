/**
 * Buffer API client.
 *
 * Endpoint: https://api.bufferapp.com/1/
 * Auth: single access token per IG account (BUFFER_ACCESS_TOKEN env var).
 *
 * The update_id returned from /updates/create.json is the link between a local
 * post record and Buffer's queue. It is stored in posts.buffer_update_id.
 *
 * Do NOT trust Buffer's reported publish time. Confirm against Meta Graph API
 * before considering a post "published".
 *
 * Docs: docs/SPEC.md §3.5 (publish step)
 */
export class BufferClient {
  private readonly baseUrl = "https://api.bufferapp.com/1";
  private readonly token: string;
  private readonly profileId: string;

  constructor() {
    if (!process.env.BUFFER_ACCESS_TOKEN) {
      throw new Error("BUFFER_ACCESS_TOKEN env var is required");
    }
    if (!process.env.BUFFER_PROFILE_ID) {
      throw new Error("BUFFER_PROFILE_ID env var is required");
    }
    this.token = process.env.BUFFER_ACCESS_TOKEN;
    this.profileId = process.env.BUFFER_PROFILE_ID;
  }

  /**
   * Schedule a carousel post in Buffer.
   *
   * @param media_urls Public URLs of the composed slide PNGs (in slide order).
   * @param text Caption text (including hashtags — max 2200 chars total).
   * @param scheduled_at UTC datetime to publish.
   * @returns Buffer update_id.
   */
  async schedulePost(params: {
    media_urls: string[];
    text: string;
    scheduled_at: Date;
  }): Promise<string> {
    // Buffer expects scheduled_at as a Unix timestamp (UTC)
    const scheduledAt = Math.floor(params.scheduled_at.getTime() / 1000);

    const body = new URLSearchParams();
    body.set("access_token", this.token);
    body.set("profile_ids[]", this.profileId);
    body.set("text", params.text);
    body.set("scheduled_at", String(scheduledAt));

    params.media_urls.forEach((url, i) => {
      body.set(`media[${i}][photo]`, url);
    });

    const res = await fetch(`${this.baseUrl}/updates/create.json`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(
        `Buffer API error ${res.status}: ${text.slice(0, 200)}`
      );
    }

    const json = (await res.json()) as { updates?: Array<{ id: string }> };
    const updateId = json.updates?.[0]?.id;
    if (!updateId) {
      throw new Error(
        `Buffer returned no update ID: ${JSON.stringify(json).slice(0, 200)}`
      );
    }
    return updateId;
  }

  /** Fetch the current status of an update from Buffer. */
  async getUpdate(updateId: string): Promise<{ status: string; sent_at?: number }> {
    const url = new URL(`${this.baseUrl}/updates/${updateId}.json`);
    url.searchParams.set("access_token", this.token);

    const res = await fetch(url.toString());
    if (!res.ok) {
      throw new Error(`Buffer API error ${res.status} for update ${updateId}`);
    }
    return res.json() as Promise<{ status: string; sent_at?: number }>;
  }
}
