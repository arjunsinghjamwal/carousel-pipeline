import "dotenv/config";
import { getDb, closeDb } from "../lib/db.js";
import { log } from "../lib/log.js";

const GRAPH_BASE = `https://graph.facebook.com/${process.env.META_GRAPH_VERSION ?? "v19.0"}`;
const INSIGHTS_FIELDS =
  "reach,impressions,likes,comments,shares,saves,profile_visits,follows";

// Insights have ~6-hour delay for new posts. Don't poll before then.
const MIN_AGE_MS = 6 * 60 * 60 * 1000;

/**
 * Stage 6: poll Meta Graph API for insights on all posts < 30 days old.
 *
 * Reads post records from the SQLite DB, skips posts too new to have insights,
 * fetches /media/{id}/insights, and upserts into the metrics table.
 *
 * Rate limit: 200 calls/hour per user token. This function makes one call per
 * eligible post — keep that in mind when scheduling the daily job.
 *
 * Docs: docs/SPEC.md §3.6
 */
export async function pollInsights(): Promise<void> {
  const db = getDb();
  const token = process.env.META_GRAPH_TOKEN;

  if (!token) {
    throw new Error("META_GRAPH_TOKEN env var is required for metrics polling");
  }

  const posts = db
    .prepare(
      `SELECT id, ig_media_id, published_at
       FROM posts
       WHERE ig_media_id IS NOT NULL
         AND published_at IS NOT NULL
         AND published_at > datetime('now', '-30 days')`
    )
    .all() as Array<{ id: string; ig_media_id: string; published_at: string }>;

  log.info({ post_count: posts.length }, "starting insights poll");
  const now = Date.now();

  for (const post of posts) {
    const ageMs = now - new Date(post.published_at).getTime();

    if (ageMs < MIN_AGE_MS) {
      log.debug({ post_id: post.id, age_hours: Math.floor(ageMs / 3_600_000) }, "skipping: too recent");
      continue;
    }

    try {
      const url = `${GRAPH_BASE}/${post.ig_media_id}/insights?fields=${INSIGHTS_FIELDS}&access_token=${token}`;
      const res = await fetch(url);

      if (!res.ok) {
        log.warn({ post_id: post.id, status: res.status }, "insights fetch failed");
        continue;
      }

      const json = (await res.json()) as {
        data: Array<{ name: string; values: Array<{ value: number }> }>;
      };

      const m: Record<string, number> = {};
      for (const metric of json.data) {
        m[metric.name] = metric.values[0]?.value ?? 0;
      }

      db.prepare(
        `INSERT OR REPLACE INTO metrics
           (post_id, polled_at, reach, impressions, likes, comments, shares, saves, profile_visits, follows)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        post.id,
        new Date().toISOString(),
        m.reach ?? 0,
        m.impressions ?? 0,
        m.likes ?? 0,
        m.comments ?? 0,
        m.shares ?? 0,
        m.saves ?? 0,
        m.profile_visits ?? 0,
        m.follows ?? 0
      );

      log.info({ post_id: post.id, reach: m.reach, impressions: m.impressions }, "insights updated");
    } catch (err) {
      log.error({ post_id: post.id, err }, "insights poll error");
    }
  }
}

// Entrypoint when run directly: npm run metrics:refresh
pollInsights()
  .catch((err) => {
    log.error({ err }, "metrics:refresh failed");
    process.exit(1);
  })
  .finally(() => closeDb());
