// Card front (one function for the live card and the downloaded picture),
// the server-drawn picture, and the "pay for this link" hold (5 Oct 2026).
const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");

process.env.SUPABASE_URL = process.env.SUPABASE_URL || "https://example.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "test";

function loadEsm(rel) {
  const babel = require(path.join(__dirname, "..", "node_modules", "@babel", "core"));
  const presetEnv = require(path.join(__dirname, "..", "node_modules", "@babel", "preset-env"));
  const file = path.join(__dirname, "..", "src", rel);
  const { code } = babel.transformSync(fs.readFileSync(file, "utf8"), {
    filename: file,
    presets: [[presetEnv, { targets: { node: "current" } }]],
    configFile: false,
    babelrc: false,
  });
  const m = new Module(file);
  m._compile(code, file);
  return m.exports;
}

const { cardFace, firmNameOf } = require("../api/vakilcard/_cardFace");
const N = loadEsm("lib/vakilcardNormalize.js");

test("firm name: the cut-off second box is merged without losing text", () => {
  const raya = { chamber_name: "Raya & Co. — Solicitors & Advocates", chamber_type: "Raya & Co. — Solicitors & Advo" };
  assert.equal(firmNameOf(raya), "Raya & Co. — Solicitors & Advocates");
  assert.equal(firmNameOf({ chamber_name: "Gujral", chamber_type: "Law Chambers" }), "Gujral Law Chambers");
  assert.equal(firmNameOf({ chamber_name: "Gujral Law Chambers", chamber_type: "Law Chambers" }), "Gujral Law Chambers");
  assert.equal(firmNameOf({ chamber_name: "", chamber_type: "Sharma Associates" }), "Sharma Associates");
  assert.equal(firmNameOf({}), "");
  // client mirror agrees
  for (const o of [raya, { chamber_name: "Gujral", chamber_type: "Law Chambers" }, {}])
    assert.equal(N.firmNameOf(o), firmNameOf(o));
});

test("card front: full address, full firm caption, server and live preview agree", () => {
  const row = {
    full_name: "Rinky Yadav",
    phone: "9826047827",
    email: "ranjeeta.yadav0526@gmail.com",
    enrollment_number: "MP/1/2020",
    offices: [{ chamber_name: "Raya & Co. — Solicitors & Advocates", chamber_type: "Raya & Co. — Solicitors & Advo", address: "21 Delite Palladium, Civil Lines, Jabalpur MP 482001" }],
  };
  const f = cardFace(row);
  assert.equal(f.firmShort, "Raya");
  assert.equal(f.firmSub, "& CO. — SOLICITORS & ADVOCATES");
  assert.deepEqual(f.contacts.find((c) => c[0] === "pin"), ["pin", "21 Delite Palladium, Civil Lines, Jabalpur MP 482001"]);
  const form = { ...row, office: row.offices[0] };
  const ds = N.formToDsProfile(form);
  assert.equal(ds.firmShort, f.firmShort);
  assert.equal(ds.firmSub, f.firmSub);
  assert.deepEqual(ds.contacts, f.contacts);
});

test("card picture: every line fits inside the card, long email breaks after the @", async () => {
  const R = require("../api/vakilcard/_cardRender");
  const longMail = "venkataraghavan.subramaniam.associates@lawfirmchambers.co.in";
  const lines = R.wrap(longMail, "serif", 9.5, 206);
  assert.ok(lines.length >= 2);
  assert.ok(lines[0].endsWith("@"), lines[0]);
  for (const l of lines) assert.ok(R.measure(l, "serif", 9.5) <= 206);
  const png = await R.renderCardPng(
    cardFace({ full_name: "Rinky Yadav", phone: "9826047827", email: longMail, offices: [{ chamber_name: "Raya & Co. — Solicitors & Advocates" }] })
  );
  assert.equal(png.slice(1, 4).toString(), "PNG");
  assert.ok(png.length > 20000);
});

// ---- link hold, against an in-memory table ----
function fakeDb(rows) {
  const lib = require("../api/vakilcard/_lib");
  const calls = [];
  lib.isReservedUsername = async (u) => u === "admin";
  lib.db = async (p, opts = {}) => {
    calls.push([opts.method || "GET", p]);
    const [table, qs] = p.split("?");
    const q = new URLSearchParams(qs || "");
    const match = (r) => {
      for (const [k, v] of q) {
        if (["select", "on_conflict"].includes(k)) continue;
        const [op, val] = v.split(/\.(.*)/s);
        const cur = r[k];
        if (op === "eq" && String(cur) !== val) return false;
        if (op === "neq" && String(cur) === val) return false;
        if (op === "lt" && !(cur && Date.parse(cur) < Date.parse(val))) return false;
      }
      return true;
    };
    const t = rows[table] || (rows[table] = []);
    if (!opts.method || opts.method === "GET") return t.filter(match);
    if (opts.method === "PATCH") {
      if (table === "vakilcard_profiles" && opts.body.pending_username) {
        const clash = t.find((r) => r.pending_username === opts.body.pending_username && !match(r));
        if (clash) throw new Error("duplicate key");
      }
      t.filter(match).forEach((r) => Object.assign(r, opts.body));
      return [];
    }
    if (opts.method === "POST") {
      const b = opts.body;
      if (table === "vakilcard_aliases") {
        const i = t.findIndex((r) => r.alias === b.alias);
        if (i >= 0) t[i] = { ...t[i], ...b };
        else t.push({ ...b });
      } else t.push({ ...b });
      return [];
    }
    return [];
  };
  const verify = require("../api/vakilcard/_verify");
  verify.audit = async () => {};
  delete require.cache[require.resolve("../api/vakilcard/_usernameSwitch")];
  return { S: require("../api/vakilcard/_usernameSwitch"), calls };
}

test("link hold: a held link is unavailable to others, free again after expiry, applied on payment", async () => {
  const rows = {
    vakilcard_profiles: [
      { id: "a", username: "ry00000" },
      { id: "b", username: "sg12345" },
    ],
    vakilcard_aliases: [],
    vakilcard_username_history: [],
  };
  const { S } = fakeDb(rows);
  const a = rows.vakilcard_profiles[0];
  const b = rows.vakilcard_profiles[1];

  const h = await S.holdUsername(a, "raya");
  assert.equal(h.ok, true);
  assert.equal(a.pending_username, "raya");
  // someone else cannot take or hold it while it is held
  assert.deepEqual(await S.usernameTakenBy("raya", "b"), { reason: "held", profileId: "a" });
  assert.equal((await S.holdUsername(b, "raya")).error, "username_held");
  // the holder is not blocked by their own hold
  assert.equal(await S.usernameTakenBy("raya", "a"), null);
  // reserved / taken names are refused
  assert.equal((await S.holdUsername(a, "admin")).ok, false);
  assert.equal((await S.holdUsername(a, "sg12345")).error, "username_taken");

  // expiry frees it for others
  a.pending_username_until = new Date(Date.now() - 1000).toISOString();
  assert.equal(await S.usernameTakenBy("raya", "b"), null);
  const hb = await S.holdUsername(b, "raya");
  assert.equal(hb.ok, true);
  assert.equal(a.pending_username, null, "expired hold was cleared");

  // payment: b's link is applied, old link stays as a redirect alias
  const applied = await S.applyPendingUsername("acct-b", { ...b });
  assert.equal(applied, "raya");
  assert.equal(b.username, "raya");
  assert.equal(b.pending_username, null);
  assert.ok(rows.vakilcard_aliases.find((r) => r.alias === "raya" && r.is_primary === true));
  assert.equal(rows.vakilcard_username_history.length, 1);
});
