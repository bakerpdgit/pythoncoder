import { createServer } from "node:http";
import { createReadStream, existsSync, statSync } from "node:fs";
import { extname, join, normalize, resolve } from "node:path";

const root = resolve("dist");
const port = Number(process.env.PORT || 3000);

const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".gif": "image/gif",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".mjs": "text/javascript; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".wasm": "application/wasm",
  ".webp": "image/webp",
};

function setIsolationHeaders(res) {
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  res.setHeader("Cross-Origin-Embedder-Policy", "credentialless");
  res.setHeader("Origin-Agent-Cluster", "?1");
}

function sendJson(res, statusCode, body) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
  });
  res.end(JSON.stringify(body, null, 2));
}

function fileExists(path) {
  return existsSync(path) && statSync(path).isFile();
}

function getSafePath(urlPath) {
  const trimmed = urlPath.split("?")[0];
  const decoded = decodeURIComponent(trimmed);
  const relativePath = decoded === "/" ? "/index.html" : decoded;
  const normalizedPath = normalize(relativePath);
  const candidates = [resolve(root, `.${normalizedPath}`)];

  // Support extensionless HTML routes such as /prelim26.
  if (!extname(normalizedPath)) {
    candidates.push(resolve(root, `.${normalizedPath}.html`));
  }

  for (const candidate of candidates) {
    if (!candidate.toLowerCase().startsWith(root.toLowerCase())) {
      continue;
    }

    if (!existsSync(candidate)) {
      continue;
    }

    if (statSync(candidate).isDirectory()) {
      const indexPath = join(candidate, "index.html");
      if (fileExists(indexPath)) {
        return indexPath;
      }
      continue;
    }

    if (fileExists(candidate)) {
      return candidate;
    }
  }

  return null;
}

const server = createServer((req, res) => {
  setIsolationHeaders(res);

  if (req.url === "/__isolation__") {
    return sendJson(res, 200, {
      coop: "same-origin",
      coep: "credentialless",
      originAgentCluster: "?1",
      root,
    });
  }

  const filePath = getSafePath(req.url || "/");
  if (!filePath) {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not found");
    return;
  }

  const contentType =
    mimeTypes[extname(filePath).toLowerCase()] || "application/octet-stream";

  res.writeHead(200, { "Content-Type": contentType });
  createReadStream(filePath).pipe(res);
});

server.listen(port, () => {
  console.log(`Serving ${root} at http://localhost:${port}/`);
});
