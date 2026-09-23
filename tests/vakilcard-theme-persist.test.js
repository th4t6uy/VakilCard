// Visitor theme persistence on the public card (api/vakilcard/profile.js).
// Run: node tests/vakilcard-theme-persist.test.js
//
// No network, no database. The handler is invoked in ?demo=1 mode (the DS's
// own showcase profile, same template as live cards), its HTML is loaded in
// jsdom, and the REAL design-system bundle (public/ds/*: React 18 + the card +
// mount.js) runs against it, served from a throwaway local static server.
// jsdom is not a browser: it proves the logic and the DS interaction, not
// paint timing (no flash-of-wrong-theme check) or Safari/Chrome quirks.
// jsdom fetches its subresources with `request`, which obeys HTTP(S)_PROXY; keep
// the throwaway local static server off any proxy.
process.env.NO_PROXY = process.env.no_proxy = "127.0.0.1,localhost";
const fs = require("fs");
const http = require("http");
const path = require("path");
const assert = require("assert");
const { JSDOM, ResourceLoader, VirtualConsole, CookieJar } = require("jsdom");

const handler = require("../api/vakilcard/profile.js");
const PUBLIC = path.join(__dirname, "..", "public");

function render(query) {
  return new Promise((resolve, reject) => {
    const headers = {};
    handler(
      { method: "GET", query, headers: {}, url: "/api/vakilcard/profile" },
      {
        statusCode: 0,
        setHeader(k, v) { headers[k.toLowerCase()] = v; },
        end(body) { resolve({ body: String(body || ""), headers }); },
      }
    ).catch(reject);
  });
}

const types = { ".js": "application/javascript", ".css": "text/css", ".png": "image/png", ".svg": "image/svg+xml", ".woff2": "font/woff2" };
const server = http.createServer((req, res) => {
  const p = path.join(PUBLIC, decodeURIComponent(req.url.split("?")[0]));
  if (!p.startsWith(PUBLIC) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.statusCode = 404; return res.end(); }
  res.setHeader("Content-Type", types[path.extname(p)] || "application/octet-stream");
  res.end(fs.readFileSync(p));
});

class LocalLoader extends ResourceLoader {
  constructor(port) { super(); this.port = port; }
  fetch(url, options) {
    const u = new URL(url);
    return super.fetch(`http://127.0.0.1:${this.port}${u.pathname}${u.search}`, options);
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const errors = [];

/** Load the card the way a visitor's browser would. */
async function visit({ query = { demo: "1" }, url = "https://www.vakilpedia.com/demo", localStorage: ls = {}, cookies = [], port }) {
  const { body } = await render(query);
  const jar = new CookieJar();
  for (const c of cookies) jar.setCookieSync(c, url);
  const vc = new VirtualConsole();
  vc.on("jsdomError", (e) => errors.push(String(e.message || e).split("\n")[0]));
  const dom = new JSDOM(body, {
    url,
    runScripts: "dangerously",
    resources: new LocalLoader(port),
    pretendToBeVisual: true,
    cookieJar: jar,
    virtualConsole: vc,
    beforeParse(w) {
      for (const k of Object.keys(ls)) w.localStorage.setItem(k, ls[k]);
      // jsdom's CSS parser drops gradient values, so mount.js's "Add your chamber
      // logo" strip (which climbs to the element whose style.background contains
      // "gradient") climbs too far and removes the whole card ~100ms after mount.
      // In a real browser it stops at the tile. Ignore element.remove() inside
      // #root here; React never uses it (it calls parent.removeChild).
      const remove = w.Element.prototype.remove;
      w.Element.prototype.remove = function () { if (this.closest && this.closest("#root")) return; return remove.call(this); };
    },
  });
  const w = dom.window;
  for (let i = 0; i < 100; i++) {
    if (w.document.querySelector('#root button[aria-label="Toggle theme"]')) break;
    await sleep(50);
  }
  await sleep(150); // let passive effects + our observers settle
  const btn = () => w.document.querySelector('#root button[aria-label="Toggle theme"]');
  return {
    w, jar, url, btn,
    theme: () => w.document.documentElement.getAttribute("data-theme"),
    icon: () => btn().innerHTML,
    stored: () => ({ theme: w.localStorage.getItem("vp-theme"), explicit: w.localStorage.getItem("vp-theme-explicit") }),
    cookieHeader: () => jar.getCookieStringSync(url),
    async click() { btn().click(); await sleep(100); },
    close() { w.close(); },
  };
}

(async () => {
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const port = server.address().port;
  const V = (o) => visit({ port, ...o });

  // --- what the server ships: identical for every visitor, cacheable ---
  const plain = await render({ demo: "1" });
  assert(/public, s-maxage/.test(plain.headers["cache-control"]), "still publicly cacheable");
  assert(/<html lang="en" data-theme="dark">/.test(plain.body), "server default stays dark");
  assert(plain.body.indexOf("__VC_THEME") < plain.body.indexOf("<style>"), "theme init runs in <head> before styles");
  assert(plain.body.indexOf("__VC_THEME") < plain.body.indexOf("/ds/mount.js"), "theme init runs before mount.js");
  const light = await render({ demo: "1", theme: "light" });
  assert(/data-theme="light"/.test(light.body) && /var want = "light";/.test(light.body), "?theme=light reaches the client script");
  assert(/var want = null;/.test(plain.body), "no param => no forced theme");
  const junk = await render({ demo: "1", theme: ["light", "dark"] });
  assert(/var want = null;/.test(junk.body), "non-string param is ignored");

  // 1. Nothing saved: default dark, nothing written on load, toggle persists.
  const a = await V({});
  assert.strictEqual(a.theme(), "dark", "default is dark");
  assert.deepStrictEqual(a.stored(), { theme: null, explicit: null }, "load alone writes nothing");
  assert.strictEqual(a.cookieHeader(), "", "load alone sets no cookie");
  const darkIcon = a.icon();
  await a.click();
  assert.strictEqual(a.theme(), "light", "toggle flips to light");
  assert.deepStrictEqual(a.stored(), { theme: "light", explicit: "1" }, "toggle writes localStorage");
  const ck = a.cookieHeader();
  assert(/vp-theme=light/.test(ck) && /vp-theme-explicit=1/.test(ck), "toggle writes both cookies: " + ck);
  const stored = a.jar.getCookiesSync(a.url).map((c) => `${c.key} domain=${c.domain} path=${c.path} maxAge=${c.maxAge} sameSite=${c.sameSite}`);
  assert(stored.every((s) => /domain=vakilpedia\.com path=\/ maxAge=31536000 sameSite=lax/.test(s)), "cookie attributes: " + stored.join(" | "));
  const lightIcon = a.icon();
  assert.notStrictEqual(lightIcon, darkIcon, "icon changes with theme");
  await a.click();
  assert.strictEqual(a.theme(), "dark");
  assert.deepStrictEqual(a.stored(), { theme: "dark", explicit: "1" }, "toggle back persists dark");
  a.close();

  // 2. Saved light in localStorage (explicit) => light, card state in step, no spurious write, then toggle works in ONE tap.
  const b = await V({ localStorage: { "vp-theme": "light", "vp-theme-explicit": "1" } });
  assert.strictEqual(b.theme(), "light", "saved light applied after the card mounts (DS would otherwise force dark)");
  assert.strictEqual(b.icon(), lightIcon, "card's own toggle state matches (moon icon), not just <html>");
  assert.strictEqual(b.cookieHeader(), "", "applying a saved theme does not write cookies");
  assert.deepStrictEqual(b.stored(), { theme: "light", explicit: "1" });
  await b.click();
  assert.strictEqual(b.theme(), "dark", "first tap after load flips (no dead tap)");
  assert.deepStrictEqual(b.stored(), { theme: "dark", explicit: "1" }, "and persists");
  b.close();

  // 3. Cookie only (visitor came from another Vakilpedia app), cookie wins over stale localStorage.
  const c = await V({
    localStorage: { "vp-theme": "dark", "vp-theme-explicit": "1" },
    cookies: ["vp-theme=light; Domain=.vakilpedia.com; Path=/", "vp-theme-explicit=1; Domain=.vakilpedia.com; Path=/"],
  });
  assert.strictEqual(c.theme(), "light", "cookie is read first");
  assert.strictEqual(c.icon(), lightIcon);
  c.close();

  // 4. Saved value without the explicit flag must NOT apply (same rule as THEME_INIT).
  const d = await V({ localStorage: { "vp-theme": "light" } });
  assert.strictEqual(d.theme(), "dark", "no vp-theme-explicit => default dark");
  d.close();

  // 5. ?theme= wins over the saved choice, both directions, and a toggle still persists.
  const e = await V({ query: { demo: "1", theme: "dark" }, localStorage: { "vp-theme": "light", "vp-theme-explicit": "1" } });
  assert.strictEqual(e.theme(), "dark", "?theme=dark beats saved light");
  assert.strictEqual(e.icon(), darkIcon);
  assert.deepStrictEqual(e.stored(), { theme: "light", explicit: "1" }, "URL param visit does not overwrite the saved choice");
  e.close();
  const f = await V({ query: { demo: "1", theme: "light" }, localStorage: { "vp-theme": "dark", "vp-theme-explicit": "1" } });
  assert.strictEqual(f.theme(), "light", "?theme=light beats saved dark");
  assert.strictEqual(f.icon(), lightIcon);
  await f.click();
  assert.deepStrictEqual(f.stored(), { theme: "dark", explicit: "1" }, "toggling on a param visit still persists");
  f.close();

  // 6. Reload / another card: a second load with what the first toggle left behind.
  const g1 = await V({});
  await g1.click(); // -> light, persisted
  const jarCookies = g1.jar.getCookiesSync(g1.url).map((x) => x.cookieString());
  const ls = g1.stored();
  g1.close();
  const g2 = await V({ url: "https://www.vakilpedia.com/someone-else", localStorage: { "vp-theme": ls.theme, "vp-theme-explicit": ls.explicit }, cookies: jarCookies.map((s) => s + "; Domain=.vakilpedia.com") });
  assert.strictEqual(g2.theme(), "light", "the next card opens in the saved theme");
  g2.close();

  // 7. Non-vakilpedia host (localhost/preview): plain host cookie, no domain attribute.
  const h = await V({ url: "http://localhost:3000/demo" });
  await h.click();
  const hc = h.jar.getCookiesSync(h.url);
  assert(hc.length === 2 && hc.every((x) => x.domain === "localhost" && x.hostOnly), "host-only cookies off vakilpedia.com");
  h.close();

  // 8. Storage blocked (private mode): nothing throws, toggle still works, default stays dark.
  const iDom = await V({});
  iDom.w.Storage.prototype.setItem = function () { throw new Error("blocked"); };
  await iDom.click();
  assert.strictEqual(iDom.theme(), "light", "toggle works with storage blocked");
  iDom.close();

  server.close();
  const real = errors.filter((m) => !/Could not load|Not implemented|matchMedia|Cannot read properties of undefined/i.test(m));
  if (real.length) console.log("jsdom notes (unrelated to theme):", [...new Set(real)].slice(0, 5));
  console.log("vakilcard-theme-persist: all assertions passed");
})().catch((err) => { console.error(err); server.close(); process.exit(1); });
