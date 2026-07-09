// Node implementation of the /api/proxy CORS proxy, shared by the Vite dev &
// preview servers (vite.config.ts) and the production Node server (server.mjs)
// so local behaviour matches the Cloudflare Pages Function at functions/api/proxy.ts.
//
// See functions/api/proxy.ts for the security rationale. Only https:// is
// allowed, private/loopback hosts are rejected, the body is size-capped, and
// the response Content-Type is forced to application/octet-stream + nosniff.

const MAX_BYTES = 50 * 1024 * 1024 // 50 MB

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "*",
};

function isBlockedHost(host) {
  const h = host.toLowerCase().replace(/^\[|\]$/g, "");
  if (h === "localhost" || h.endsWith(".internal") || h.endsWith(".local")) return true;
  if (h === "0.0.0.0" || h === "::1") return true;
  if (/^127\./.test(h)) return true;
  if (/^10\./.test(h)) return true;
  if (/^192\.168\./.test(h)) return true;
  if (/^169\.254\./.test(h)) return true;
  const m = h.match(/^172\.(\d+)\./);
  if (m) { const o = Number(m[1]); if (o >= 16 && o <= 31) return true; }
  if (/^(fc|fd)[0-9a-f]{2}:/.test(h) || /^fe80:/.test(h)) return true;
  return false;
}

function sendError(res, message, status) {
  res.writeHead(status, { ...CORS_HEADERS, "Content-Type": "text/plain; charset=utf-8" });
  res.end(message);
}

/**
 * Handle a request if it targets /api/proxy. Returns true when handled (so the
 * caller should stop), false otherwise.
 */
export async function handleCorsProxy(req, res) {
  const reqUrl = new URL(req.url ?? "/", "http://localhost");
  if (reqUrl.pathname !== "/api/proxy") return false;

  if (req.method === "OPTIONS") {
    res.writeHead(204, CORS_HEADERS);
    res.end();
    return true;
  }
  if (req.method !== "GET") { sendError(res, "Method not allowed", 405); return true; }

  const target = reqUrl.searchParams.get("url");
  if (!target) { sendError(res, "Missing url parameter", 400); return true; }

  let upstream;
  try { upstream = new URL(target); } catch { sendError(res, "Invalid url", 400); return true; }
  if (upstream.protocol !== "https:") { sendError(res, "Only https:// URLs are allowed", 400); return true; }
  if (isBlockedHost(upstream.hostname)) { sendError(res, "Blocked host", 403); return true; }

  let upstreamResp;
  try {
    upstreamResp = await fetch(upstream.toString(), {
      method: "GET",
      headers: { "User-Agent": "pythoncoder-proxy", Accept: "*/*" },
      redirect: "follow",
    });
  } catch (e) {
    sendError(res, `Upstream fetch failed: ${e instanceof Error ? e.message : String(e)}`, 502);
    return true;
  }
  if (!upstreamResp.ok) { sendError(res, `Upstream returned HTTP ${upstreamResp.status}`, upstreamResp.status); return true; }

  const declared = upstreamResp.headers.get("content-length");
  if (declared && Number(declared) > MAX_BYTES) { sendError(res, "Resource too large", 413); return true; }

  const buf = Buffer.from(await upstreamResp.arrayBuffer());
  if (buf.byteLength > MAX_BYTES) { sendError(res, "Resource too large", 413); return true; }

  res.writeHead(200, {
    ...CORS_HEADERS,
    "Content-Type": "application/octet-stream",
    "X-Content-Type-Options": "nosniff",
    "Content-Disposition": "attachment",
    "Cache-Control": "public, max-age=300",
  });
  res.end(buf);
  return true;
}
