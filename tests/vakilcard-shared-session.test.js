// VakilCard sign-in hands out the shared Vakilpedia (Supabase) session, with a safe fallback.
// Nothing touches the network: every Supabase call is a fake.
const { test } = require("node:test");
const assert = require("node:assert");

process.env.SUPABASE_URL = "https://abcdefghij.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "service-key";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
process.env.VAKILPEDIA_AUTH_SECRET = "test-secret";

const S = require("../api/vakilcard/_session");

const ID = "3f1515ea-9002-4b91-b6c6-bdc19c8ded0d";
const reply = (status, data) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => data,
  text: async () => (data == null ? "" : JSON.stringify(data)),
});

function fakeSupabase(over = {}) {
  const calls = [];
  const f = async (url, opts = {}) => {
    const u = String(url);
    calls.push({ url: u, method: opts.method || "GET", headers: opts.headers || {}, body: opts.body ? JSON.parse(opts.body) : undefined });
    if (over[u.replace("https://abcdefghij.supabase.co", "").split("?")[0]]) return over[u.replace("https://abcdefghij.supabase.co", "").split("?")[0]](opts);
    if (u.includes(`/auth/v1/admin/users/${ID}`)) return reply(200, { id: ID, email: "a@example.com" });
    if (u.endsWith("/auth/v1/admin/generate_link")) return reply(200, { hashed_token: "HASH", action_link: "x" });
    if (u.endsWith("/auth/v1/verify")) return reply(200, { access_token: "A.B.C", refresh_token: "R1", expires_in: 3600, user: { id: ID } });
    if (u.includes("/auth/v1/token?grant_type=refresh_token")) return reply(200, { access_token: "A2.B.C", refresh_token: "R2", expires_in: 3600, user: { id: ID } });
    if (u.includes("/auth/v1/logout")) return reply(204, null);
    if (u.endsWith("/auth/v1/user")) return reply(200, { id: ID, email: "a@example.com" });
    return reply(500, null);
  };
  f.calls = calls;
  return f;
}

test("mint: three real calls, a genuine session comes back, anon key used only for the exchange", async () => {
  const f = fakeSupabase();
  const r = await S.mintSession(ID, { fetchImpl: f });
  assert.equal(r.ok, true);
  assert.equal(r.access_token, "A.B.C");
  assert.equal(r.refresh_token, "R1");
  assert.equal(r.user_id, ID);
  assert.deepEqual(f.calls.map((c) => c.url.replace("https://abcdefghij.supabase.co", "")), [
    `/auth/v1/admin/users/${ID}`, "/auth/v1/admin/generate_link", "/auth/v1/verify",
  ]);
  assert.equal(f.calls[1].body.type, "magiclink");
  assert.equal(f.calls[1].body.email, "a@example.com");
  assert.equal(f.calls[2].body.token_hash, "HASH");
  assert.equal(f.calls[2].headers.apikey, "anon-key");
  assert.equal(f.calls[0].headers.apikey, "service-key");
});

test("mint: every way it can fail returns a reason, never throws, never a session", async () => {
  const cases = [
    ["no auth.users row", { [`/auth/v1/admin/users/${ID}`]: async () => reply(404, {}) }, "no_auth_user"],
    ["no email on the account", { [`/auth/v1/admin/users/${ID}`]: async () => reply(200, { id: ID, email: null }) }, "no_email_on_auth_user"],
    ["banned", { [`/auth/v1/admin/users/${ID}`]: async () => reply(200, { id: ID, email: "a@b.c", banned_until: "2999-01-01T00:00:00Z" }) }, "banned"],
    ["generate_link refused", { "/auth/v1/admin/generate_link": async () => reply(422, {}) }, "generate_link_422"],
    ["verify refused", { "/auth/v1/verify": async () => reply(429, {}) }, "verify_429"],
    ["verify returns no session", { "/auth/v1/verify": async () => reply(200, {}) }, "verify_200"],
  ];
  for (const [name, over, reason] of cases) {
    const r = await S.mintSession(ID, { fetchImpl: fakeSupabase(over) });
    assert.equal(r.ok, false, name);
    assert.equal(r.reason, reason, name);
  }
  const boom = async () => { throw new Error("network down"); };
  const r = await S.mintSession(ID, { fetchImpl: boom });
  assert.equal(r.ok, false);
  assert.match(r.reason, /^exception_/);
  assert.equal((await S.mintSession("not-a-uuid", { fetchImpl: fakeSupabase() })).reason, "bad_account_id");
});

test("mint: the off switch makes nobody get a shared session", async () => {
  process.env.VAKILCARD_SHARED_SESSION = "off";
  try {
    const f = fakeSupabase();
    const r = await S.mintSession(ID, { fetchImpl: f });
    assert.deepEqual(r, { ok: false, reason: "switched_off" });
    assert.equal(f.calls.length, 0);
  } finally {
    delete process.env.VAKILCARD_SHARED_SESSION;
  }
});

test("refresh: shared refresh token is exchanged at Supabase and the new pair returned", async () => {
  const f = fakeSupabase();
  const r = await S.refreshSession("R1", { fetchImpl: f });
  assert.equal(r.ok, true);
  assert.equal(r.refresh_token, "R2");
  assert.equal(f.calls[0].body.refresh_token, "R1");
  assert.equal(f.calls[0].headers.apikey, "anon-key");
});

test("refresh: rejected token is a 4xx (sign out); an outage is a 5xx (stay signed in)", async () => {
  const rej = await S.refreshSession("bad", { fetchImpl: fakeSupabase({ "/auth/v1/token": async () => reply(400, { error: "invalid_grant" }) }) });
  assert.equal(rej.ok, false);
  assert.ok(rej.status >= 400 && rej.status < 500);
  const out = await S.refreshSession("R1", { fetchImpl: fakeSupabase({ "/auth/v1/token": async () => reply(503, null) }) });
  assert.ok(out.status >= 500);
  const down = await S.refreshSession("R1", { fetchImpl: async () => { throw new Error("x"); } });
  assert.ok(down.status >= 500);
});

test("logout: ends only this device's session, never throws", async () => {
  const f = fakeSupabase();
  assert.equal(await S.revokeSession("A.B.C", { fetchImpl: f }), true);
  assert.match(f.calls[0].url, /logout\?scope=local$/);
  assert.equal(f.calls[0].headers.Authorization, "Bearer A.B.C");
  assert.equal(await S.revokeSession("", { fetchImpl: f }), false);
  assert.equal(await S.revokeSession("x", { fetchImpl: async () => { throw new Error("x"); } }), false);
});

test("verifyAccessToken: resolves the holder, caches briefly, rejects bad tokens", async () => {
  S._clearCacheForTests();
  const f = fakeSupabase();
  assert.deepEqual(await S.verifyAccessToken("A.B.C", { fetchImpl: f }), { id: ID, email: "a@example.com" });
  await S.verifyAccessToken("A.B.C", { fetchImpl: f });
  assert.equal(f.calls.length, 1, "second look-up served from the 30-second cache");
  S._clearCacheForTests();
  assert.equal(await S.verifyAccessToken("bad.token.x", { fetchImpl: fakeSupabase({ "/auth/v1/user": async () => reply(401, {}) }) }), null);
  assert.equal(await S.verifyAccessToken("", { fetchImpl: f }), null);
});

test("resolveAccount: a shared session works only for people who have a VakilCard account", async () => {
  S._clearCacheForTests();
  const lib = require("../api/vakilcard/_lib");
  const realFetch = global.fetch;
  const req = (t) => ({ headers: { authorization: `Bearer ${t}` } });
  try {
    global.fetch = async (url, opts) => {
      const u = String(url);
      if (u.endsWith("/auth/v1/user")) return reply(200, { id: ID, email: "a@example.com" });
      if (u.includes("/rest/v1/vakilpedia_accounts")) return reply(200, [{ id: ID }]);
      return reply(500, null);
    };
    assert.deepEqual(await lib.resolveAccount(req("aaa.bbb.ccc")), { accountId: ID, profileId: null, via: "supabase" });

    S._clearCacheForTests();
    global.fetch = async (url) => {
      const u = String(url);
      if (u.endsWith("/auth/v1/user")) return reply(200, { id: "11111111-1111-1111-1111-111111111111" });
      if (u.includes("/rest/v1/vakilpedia_accounts")) return reply(200, []);
      return reply(500, null);
    };
    assert.equal(await lib.resolveAccount(req("aaa.bbb.ccc")), null, "Vakilpedia user with no VakilCard account is not signed in here");

    assert.equal(await lib.resolveAccount(req("not-a-jwt")), null);
    assert.equal(await lib.resolveAccount({ headers: {} }), null);

    // an older VakilCard token still works during the move
    const { sign } = require("../api/vakilcard/_jwt");
    const old = sign({ sub: ID, pid: "p1", typ: "access" });
    assert.deepEqual(await lib.resolveAccount(req(old)), { accountId: ID, profileId: "p1", via: "jwt" });
  } finally {
    global.fetch = realFetch;
  }
});
