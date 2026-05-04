/**
 * Serve the drafts/ directory at a temporary public HTTPS URL.
 *
 *   npm run serve-drafts
 *   npm run serve-drafts -- --port 4040 --subdomain my-brand-review
 *
 * Uses localtunnel to create a temporary tunnel from a public HTTPS URL to a
 * local static file server serving drafts/.
 *
 * Common uses:
 *   - Share draft slides with a stakeholder for approval without deploying
 *   - Supply public media URLs when testing the Buffer publish flow
 *     (Buffer fetches media from public URLs at publish time)
 *
 * The tunnel URL is valid until this process exits. It is NOT suitable for
 * production publishing — use a stable CDN (S3, R2, GCS) for that.
 *
 * Requires localtunnel (install once):
 *   npm install --save-dev localtunnel
 *
 * Docs: README.md §Quick start, docs/SPEC.md §3.5 (getMediaUrls stub)
 */
import "dotenv/config";
import { createServer } from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import { readFile, stat, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

// Dynamic import so a missing localtunnel dep gives a clear error message
async function loadLocaltunnel(): Promise<typeof import("localtunnel").default> {
  try {
    const lt = await import("localtunnel");
    return lt.default;
  } catch {
    console.error(
      "\nError: localtunnel is not installed.\n" +
        "Run: npm install --save-dev localtunnel\n"
    );
    process.exit(1);
  }
}

const DRAFTS_DIR = path.resolve("drafts");

const MIME: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".json": "application/json",
  ".html": "text/html",
  ".txt": "text/plain",
};

function parseCli(): { port: number; subdomain?: string } {
  const args = process.argv.slice(2);
  let port = 4040;
  let subdomain: string | undefined;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--port" && args[i + 1]) port = parseInt(args[++i]!, 10);
    if (args[i] === "--subdomain" && args[i + 1]) subdomain = args[++i];
  }
  return { port, subdomain };
}

async function serveFile(filePath: string, res: ServerResponse): Promise<void> {
  const ext = path.extname(filePath).toLowerCase();
  const mimeType = MIME[ext] ?? "application/octet-stream";
  const data = await readFile(filePath);
  res.writeHead(200, { "Content-Type": mimeType });
  res.end(data);
}

function dirListingHtml(urlPath: string, entries: string[]): string {
  const normalized = urlPath.endsWith("/") ? urlPath : urlPath + "/";
  const links = entries
    .map((e) => `<li><a href="${normalized}${e}">${e}</a></li>`)
    .join("\n    ");
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>drafts${urlPath}</title></head><body><h2>drafts${urlPath}</h2><ul>\n    ${links}\n</ul></body></html>`;
}

function rootIndexHtml(itemDirs: string[]): string {
  const links = itemDirs
    .map((id) => `<li><a href="/${id}/">${id}</a></li>`)
    .join("\n    ");
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Carousel Drafts</title></head>
<body>
<h1>Carousel Drafts</h1>
<ul>
  ${links}
</ul>
<p><small>Served by serve-drafts.ts — tunnel is active until this process exits.</small></p>
</body>
</html>`;
}

async function handleRequest(
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  const urlPath = req.url ?? "/";
  const filePath = path.resolve(path.join(DRAFTS_DIR, urlPath));

  // Path traversal guard
  if (!filePath.startsWith(DRAFTS_DIR)) {
    res.writeHead(403, { "Content-Type": "text/plain" });
    res.end("Forbidden");
    return;
  }

  try {
    const s = await stat(filePath);
    if (s.isDirectory()) {
      const entries = await readdir(filePath);
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(dirListingHtml(urlPath, entries));
    } else {
      await serveFile(filePath, res);
    }
  } catch {
    if (urlPath === "/") {
      // Root: list item directories
      try {
        const entries = await readdir(DRAFTS_DIR, { withFileTypes: true });
        const itemDirs = entries.filter((e) => e.isDirectory()).map((e) => e.name);
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(rootIndexHtml(itemDirs));
      } catch {
        res.writeHead(500, { "Content-Type": "text/plain" });
        res.end("Error reading drafts directory");
      }
    } else {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("Not found");
    }
  }
}

async function main() {
  const { port, subdomain } = parseCli();

  if (!existsSync(DRAFTS_DIR)) {
    console.error(`Error: drafts/ directory not found at ${DRAFTS_DIR}`);
    console.error("Run the pipeline first to generate drafts.");
    process.exit(1);
  }

  const localtunnel = await loadLocaltunnel();

  const server = createServer((req, res) => {
    handleRequest(req, res).catch((err) => {
      console.error("Request error:", err);
      res.writeHead(500, { "Content-Type": "text/plain" });
      res.end("Internal server error");
    });
  });

  await new Promise<void>((resolve) => server.listen(port, resolve));
  console.log(`\nLocal static server: http://localhost:${port}`);
  console.log(`Serving:             ${DRAFTS_DIR}`);

  const tunnel = await localtunnel({
    port,
    ...(subdomain ? { subdomain } : {}),
  });

  console.log(`\nPublic tunnel URL:   ${tunnel.url}`);
  console.log(`\nExample slide URLs:`);
  console.log(`  ${tunnel.url}/{item_id}/slides/slide-01.png`);
  console.log(`  ${tunnel.url}/{item_id}/slides/slide-02.png`);
  console.log(`\nTunnel active. Press Ctrl+C to stop.\n`);

  tunnel.on("error", (err: Error) => {
    console.error("Tunnel error:", err.message);
  });

  tunnel.on("close", () => {
    console.log("\nTunnel closed.");
    server.close();
    process.exit(0);
  });

  process.on("SIGINT", () => {
    console.log("\nShutting down...");
    tunnel.close();
  });

  process.on("SIGTERM", () => {
    tunnel.close();
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
