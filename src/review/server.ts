import "dotenv/config";
import Fastify from "fastify";
import { readFile, writeFile, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { z } from "zod";

import { SlideDraftSchema } from "../types/index.js";
import { log } from "../lib/log.js";
import agentRoutes from "../agent/router.js";

const PORT = Number(process.env.REVIEW_PORT ?? 3000);
const DRAFTS_DIR = "drafts";

/**
 * Fastify review UI server.
 *
 * Endpoints:
 *   GET  /queue                           — list all pending drafts
 *   GET  /queue/:item_id                  — draft detail (slides + metadata)
 *   GET  /queue/:item_id/slides/:filename — serve a composed slide PNG
 *   PATCH /queue/:item_id/slide/:index    — edit a single slide's copy
 *   POST /queue/:item_id/approve          — move draft to queue/approved/
 *   POST /queue/:item_id/reject           — move draft to queue/rejected/ with reason
 *
 * Docs: docs/SPEC.md §4 (review stage)
 */
const fastify = Fastify({ logger: false });

// ---- serve review UI ----
fastify.get("/", async (_req, reply) => {
  const html = await readFile(new URL("./ui.html", import.meta.url), "utf8");
  return reply.type("text/html").send(html);
});

// ---- serve OpenAPI spec ----
fastify.get("/openapi.yaml", async (_req, reply) => {
  const yaml = await readFile(new URL("../../docs/openapi.yaml", import.meta.url), "utf8");
  return reply.type("application/yaml").send(yaml);
});

// ---- list pending drafts ----
fastify.get("/queue", async (_req, reply) => {
  const entries = await readdir(DRAFTS_DIR, { withFileTypes: true }).catch(() => []);
  const pending = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const metaPath = path.join(DRAFTS_DIR, entry.name, "metadata.json");
    if (!existsSync(metaPath)) continue;

    const meta = JSON.parse(await readFile(metaPath, "utf8")) as {
      item_id: string;
      created_at: string;
      tripwire_checks: { passed: boolean };
    };
    pending.push({
      item_id: meta.item_id,
      created_at: meta.created_at,
      tripwire_passed: meta.tripwire_checks.passed,
    });
  }

  return reply.send(pending);
});

// ---- draft detail ----
fastify.get<{ Params: { item_id: string } }>(
  "/queue/:item_id",
  async (req, reply) => {
    const { item_id } = req.params;
    const draftDir = path.join(DRAFTS_DIR, item_id);

    if (!existsSync(draftDir)) {
      return reply.status(404).send({ error: `Draft not found: ${item_id}` });
    }

    const [slidesRaw, metaRaw] = await Promise.all([
      readFile(path.join(draftDir, "slides.json"), "utf8"),
      readFile(path.join(draftDir, "metadata.json"), "utf8"),
    ]);

    return reply.send({
      slides: JSON.parse(slidesRaw),
      metadata: JSON.parse(metaRaw),
    });
  }
);

// ---- serve composed slide PNG ----
fastify.get<{ Params: { item_id: string; filename: string } }>(
  "/queue/:item_id/slides/:filename",
  async (req, reply) => {
    const { item_id, filename } = req.params;
    // Prevent path traversal
    if (filename.includes("..") || filename.includes("/")) {
      return reply.status(400).send({ error: "Invalid filename" });
    }
    const filePath = path.join(DRAFTS_DIR, item_id, "slides", filename);
    if (!existsSync(filePath)) {
      return reply.status(404).send({ error: "Slide not found" });
    }
    const data = await readFile(filePath);
    return reply.type("image/png").send(data);
  }
);

// ---- edit a slide ----
const EditSlideBodySchema = z.object({
  headline: z.string().optional(),
  body: z.string().optional(),
  highlight_word: z.string().optional(),
});

fastify.patch<{
  Params: { item_id: string; index: string };
  Body: z.infer<typeof EditSlideBodySchema>;
}>(
  "/queue/:item_id/slide/:index",
  {
    schema: {
      body: {
        type: "object",
        properties: {
          headline: { type: "string" },
          body: { type: "string" },
          highlight_word: { type: "string" },
        },
      },
    },
  },
  async (req, reply) => {
    const { item_id, index } = req.params;
    const slideIndex = Number(index);
    const updates = EditSlideBodySchema.parse(req.body);

    const slidesPath = path.join(DRAFTS_DIR, item_id, "slides.json");
    if (!existsSync(slidesPath)) {
      return reply.status(404).send({ error: `Draft not found: ${item_id}` });
    }

    const draft = SlideDraftSchema.parse(JSON.parse(await readFile(slidesPath, "utf8")));
    const slideIdx = draft.slides.findIndex((s) => s.index === slideIndex);
    if (slideIdx === -1) {
      return reply.status(404).send({ error: `Slide ${slideIndex} not found` });
    }

    draft.slides[slideIdx] = { ...draft.slides[slideIdx], ...updates };
    await writeFile(slidesPath, JSON.stringify(draft, null, 2), "utf8");

    log.info({ item_id, slide_index: slideIndex }, "slide edited via review UI");
    return reply.send({ ok: true });
  }
);

// ---- approve ----
fastify.post<{ Params: { item_id: string } }>(
  "/queue/:item_id/approve",
  async (req, reply) => {
    const { item_id } = req.params;
    const draftDir = path.join(DRAFTS_DIR, item_id);

    if (!existsSync(draftDir)) {
      return reply.status(404).send({ error: `Draft not found: ${item_id}` });
    }

    // Write approval marker
    await writeFile(
      path.join(draftDir, "approved.json"),
      JSON.stringify({ approved_at: new Date().toISOString() }),
      "utf8"
    );

    log.info({ item_id }, "draft approved");
    return reply.send({ ok: true, item_id });
  }
);

// ---- reject ----
const RejectBodySchema = z.object({
  reason: z.string().min(1),
});

fastify.post<{
  Params: { item_id: string };
  Body: z.infer<typeof RejectBodySchema>;
}>(
  "/queue/:item_id/reject",
  {
    schema: {
      body: {
        type: "object",
        required: ["reason"],
        properties: { reason: { type: "string" } },
      },
    },
  },
  async (req, reply) => {
    const { item_id } = req.params;
    const { reason } = RejectBodySchema.parse(req.body);
    const draftDir = path.join(DRAFTS_DIR, item_id);

    if (!existsSync(draftDir)) {
      return reply.status(404).send({ error: `Draft not found: ${item_id}` });
    }

    await writeFile(
      path.join(draftDir, "rejected.json"),
      JSON.stringify({ rejected_at: new Date().toISOString(), reason }),
      "utf8"
    );

    log.info({ item_id, reason }, "draft rejected");
    return reply.send({ ok: true, item_id });
  }
);

// ---- start server ----
async function main() {
  await fastify.register(agentRoutes, { prefix: "/agent" });
  const address = await fastify.listen({ port: PORT, host: "127.0.0.1" });
  log.info({ address }, "review server listening");
}

main().catch((err) => {
  log.error({ err }, "review server failed to start");
  process.exit(1);
});
