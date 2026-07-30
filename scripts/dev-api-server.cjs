#!/usr/bin/env node
/**
 * Local dev API server for Apps/VakilCard.
 *
 * Why this exists: the production `/api/vakilcard/*.js` files are Vercel Node
 * serverless functions (`module.exports = async function handler(req, res)`).
 * The faithful way to run these locally is Vercel's own `vercel dev` — but
 * `vercel dev` always calls home to api.vercel.com to resolve project/account
 * state, even with `--local` and a dummy token. In this workspace that host
 * is unreachable (network policy), so `vercel dev` cannot start here at all.
 *
 * This script is the fallback: it loads each api/vakilcard/*.js file
 * UNMODIFIED and serves it with the exact same (req, res) contract Vercel
 * uses (plain Node http.IncomingMessage / http.ServerResponse — Vercel's
 * Node runtime is that contract, nothing more). Zero business logic is
 * duplicated or reimplemented; this is routing/plumbing only.
 *
 * Routing mirrors Apps/VakilCard/vercel.json:
 *   /api/vakilcard/<name>            -> api/vakilcard/<name>.js
 *   /<username> (3-30 chars, no /)   -> api/vakilcard/profile.js?username=<username>
 *
 * Usage:
 *   node scripts/dev-api-server.cjs            (reads .env.local / .env)
 *   API_PORT=3210 node scripts/dev-api-server.cjs
 *
 * Pair with `npm start` (the CRA/craco dev server) which proxies /api/* and
 * bare-username requests here — see craco.config.js's devServer.proxy.
 */
const http = require("http");
const path = require("path");
const fs = require("fs");
const { URL } = require("url");

// Same precedence CRA itself uses for local dev: .env then .env.local
// overrides, both optional. dotenv is already a devDependency here.
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
require("dotenv").config({ path: path.join(__dirname, "..", ".env.local"), override: true });

const PORT = Number(process.env.API_PORT || 3210);
const API_DIR = path.join(__dirname, "..", "api", "vakilcard");

const USERNAME_RE = /^\/([a-zA-Z0-9][a-zA-Z0-9._-]{2,29})$/;
// Paths that are the app's own client routes, not lawyer usernames — must be
// excluded from the username rewrite (same ordering as vercel.json).
const RESERVED_TOP_LEVEL = new Set(["vakilcard", "api", "favicon.ico", "manifest.json"]);

function loadHandler(name) {
  const file = path.join(API_DIR, `${name}.js`);
  if (!fs.existsSync(file)) return null;
  delete require.cache[require.resolve(file)]; // hot-reload on each request in dev
  return require(file);
}

function endJson(res, status, obj) {
  if (res.headersSent) return;
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(obj));
}

const server = http.createServer(async (req, res) => {
  const parsed = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const pathname = parsed.pathname;
  req.query = Object.fromEntries(parsed.searchParams.entries());

  let handlerName = null;
  let usernameFromPath = null;

  const apiMatch = pathname.match(/^\/api\/vakilcard\/([a-zA-Z0-9_-]+)\/?$/);
  if (apiMatch) {
    handlerName = apiMatch[1];
  } else {
    const unameMatch = pathname.match(USERNAME_RE);
    if (unameMatch && !RESERVED_TOP_LEVEL.has(unameMatch[1].toLowerCase())) {
      handlerName = "profile";
      usernameFromPath = unameMatch[1];
    }
  }

  if (!handlerName) {
    return endJson(res, 404, { error: "not_found", path: pathname });
  }

  let handler;
  try {
    handler = loadHandler(handlerName);
  } catch (e) {
    console.error(`[dev-api] failed to load handler "${handlerName}":`, e);
    return endJson(res, 500, { error: "handler_load_failed", handler: handlerName, message: e.message });
  }
  if (typeof handler !== "function") {
    return endJson(res, 404, { error: "unknown_endpoint", handler: handlerName });
  }

  if (usernameFromPath) req.query.username = usernameFromPath;

  try {
    await handler(req, res);
  } catch (e) {
    console.error(`[dev-api] handler "${handlerName}" threw:`, e);
    endJson(res, 500, { error: "handler_threw", handler: handlerName, message: e.message });
  }
});

server.listen(PORT, () => {
  const missing = [];
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) missing.push("SUPABASE_SERVICE_ROLE_KEY");
  if (!process.env.VAKILPEDIA_AUTH_SECRET) missing.push("VAKILPEDIA_AUTH_SECRET");
  console.log(`[dev-api] listening on http://localhost:${PORT}`);
  console.log(`[dev-api] serving ${API_DIR}`);
  if (missing.length) {
    console.log(`[dev-api] WARNING: missing env vars, DB/auth-dependent endpoints will fail: ${missing.join(", ")}`);
  }
});
