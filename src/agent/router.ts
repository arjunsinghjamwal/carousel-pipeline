import type { FastifyPluginAsync } from "fastify";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import path from "node:path";
import { z } from "zod";

import { getDb } from "../lib/db.js";
import { log } from "../lib/log.js";
import {
  BrandCopySchema,
  BrandTokensSchema,
  SourceItemSchema,
  ItemBankSchema,
} from "../types/index.js";

/**
 * Agent HTTP API — Fastify plugin.
 *
 * Registered under the "/agent" prefix by src/review/server.ts.
 *
 * Human-in-the-loop boundary (by design): the agent stops at draft_ready: true.
 * Approve/reject endpoints live in the review server and are NOT accessible here.
 *
 * Docs: docs/SPEC.md §5 (agent API)
 */

// Tracks in-flight pipeline subprocesses to prevent duplicate runs.
const activeRuns = new Map<string, boolean>();

const ITEMS_PATH = path.join("config", "items.json");
const CONFIG_BRAND_DIR = path.join("config", "brand");

async function loadItemBank(): Promise<z.infer<typeof ItemBankSchema>> {
  if (!existsSync(ITEMS_PATH)) {
    return { version: "1.0", items: [] };
  }
  return ItemBankSchema.parse(JSON.parse(await readFile(ITEMS_PATH, "utf8")));
}

async function saveItemBank(bank: z.infer<typeof ItemBankSchema>): Promise<void> {
  await mkdir(path.dirname(ITEMS_PATH), { recursive: true });
  await writeFile(ITEMS_PATH, JSON.stringify(bank, null, 2), "utf8");
}

// ---- Zod schemas for request bodies ----

const ConfigureBodySchema = z.object({
  brand_copy: BrandCopySchema.optional(),
  brand_tokens: BrandTokensSchema.optional(),
});

const NewItemBodySchema = SourceItemSchema.omit({
  id: true,
  status: true,
  date_added: true,
});

const GenerateBodySchema = z
  .object({
    item_id: z.string().regex(/^item-\d{3,}$/).optional(),
    batch: z.boolean().optional(),
  })
  .refine((b) => b.item_id !== undefined || b.batch === true, {
    message: "Provide either item_id or batch: true",
  });

// ---- Plugin ----

const agentRoutes: FastifyPluginAsync = async (fastify) => {
  // ---- POST /configure ----
  fastify.post("/configure", async (req, reply) => {
    const parsed = ConfigureBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten() });
    }
    const { brand_copy, brand_tokens } = parsed.data;

    await mkdir(CONFIG_BRAND_DIR, { recursive: true });

    if (brand_copy) {
      await writeFile(
        path.join(CONFIG_BRAND_DIR, "copy.json"),
        JSON.stringify(brand_copy, null, 2),
        "utf8"
      );
      log.info("agent: wrote config/brand/copy.json");
    }

    if (brand_tokens) {
      await writeFile(
        path.join(CONFIG_BRAND_DIR, "tokens.json"),
        JSON.stringify(brand_tokens, null, 2),
        "utf8"
      );
      log.info("agent: wrote config/brand/tokens.json");
    }

    // Initialize DB schema (idempotent — all CREATE TABLE IF NOT EXISTS).
    const result = spawnSync("npx", ["tsx", "scripts/init-db.ts"], {
      stdio: "inherit",
      shell: true,
    });
    if (result.status !== 0) {
      log.error({ status: result.status }, "agent: db init failed");
      return reply.status(500).send({ error: "DB initialization failed" });
    }

    log.info("agent: configure complete");
    return reply.send({ ok: true });
  });

  // ---- POST /items ----
  fastify.post("/items", async (req, reply) => {
    const parsed = NewItemBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten() });
    }

    const bank = await loadItemBank();
    const nextNum = bank.items.length + 1;
    const item_id = `item-${String(nextNum).padStart(3, "0")}`;

    const newItem = SourceItemSchema.parse({
      ...parsed.data,
      id: item_id,
      status: "unused",
      date_added: new Date().toISOString().slice(0, 10),
    });

    bank.items.push(newItem);
    await saveItemBank(bank);

    log.info({ item_id }, "agent: item added");
    return reply.status(201).send({ ok: true, item_id });
  });

  // ---- GET /items ----
  fastify.get("/items", async (_req, reply) => {
    const bank = await loadItemBank();
    return reply.send({ items: bank.items });
  });

  // ---- GET /items/:item_id ----
  fastify.get<{ Params: { item_id: string } }>(
    "/items/:item_id",
    async (req, reply) => {
      const { item_id } = req.params;
      const bank = await loadItemBank();
      const item = bank.items.find((i) => i.id === item_id);
      if (!item) {
        return reply.status(404).send({ error: `Item not found: ${item_id}` });
      }
      return reply.send(item);
    }
  );

  // ---- POST /generate ----
  fastify.post("/generate", async (req, reply) => {
    const parsed = GenerateBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten() });
    }

    const { item_id, batch } = parsed.data;
    const runKey = item_id ?? "__batch__";

    if (activeRuns.get(runKey)) {
      return reply.status(409).send({ error: "Pipeline already running for this target" });
    }

    const args = batch
      ? ["tsx", "scripts/run-pipeline.ts", "--batch"]
      : ["tsx", "scripts/run-pipeline.ts", "--item", item_id!];

    const child = spawn("npx", args, { stdio: "ignore", shell: true });
    activeRuns.set(runKey, true);
    child.on("close", (code) => {
      activeRuns.delete(runKey);
      log.info({ runKey, code }, "agent: pipeline subprocess exited");
    });

    log.info({ runKey }, "agent: pipeline subprocess spawned");
    return reply.status(202).send({ accepted: true, item_id: item_id ?? null });
  });

  // ---- GET /status/:item_id ----
  fastify.get<{ Params: { item_id: string } }>(
    "/status/:item_id",
    async (req, reply) => {
      const { item_id } = req.params;
      const db = getDb();

      const rows = db
        .prepare(
          `SELECT stage, status, started_at, completed_at, error_message
           FROM generation_runs
           WHERE item_id = ?
           ORDER BY id DESC
           LIMIT 10`
        )
        .all(item_id) as Array<{
        stage: string;
        status: string;
        started_at: string;
        completed_at: string | null;
        error_message: string | null;
      }>;

      const draft_ready = rows.some(
        (r) => r.stage === "compose" && r.status === "completed"
      );

      return reply.send({ item_id, draft_ready, runs: rows });
    }
  );
};

export default agentRoutes;
