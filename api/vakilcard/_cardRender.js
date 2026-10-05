// Draws the VakilCard front as a PNG on OUR server (founder, 5 Oct 2026).
//
// WHY ON THE SERVER. The double-tap save used to photograph the card inside
// the visitor's phone (html-to-image). Two faults could not be fixed there:
//  * it re-read /ds/styles.css and resolved its @import against the PAGE
//    (/jasween -> /tokens/fonts.css), got the website's HTML back, and so
//    drew the card in the phone's fallback fonts. Those are wider, so the
//    email ran off the edge and the address wrapped onto the Enrol. No.;
//  * iPhone Safari drops <img> content on the first capture, so the DP was
//    missing on some saves and present on others.
// Here the fonts ship with the function, the photo is fetched by the
// server, and every line is measured with the real font before drawing, so
// the same card comes out on every phone.
//
// Layout is written in card points (CW x CH, the on-screen card size) and
// multiplied by S for a sharp picture.

const fs = require("fs");
const path = require("path");
const opentype = require("opentype.js");

const CW = 400; // card points (credit-card ratio 1.586)
const CH = 252;
const S = 4; // output = 1600 x 1008 px

const A = (f) => path.join(__dirname, "_cardAssets", f);
let ASSETS = null;
function assets() {
  if (ASSETS) return ASSETS;
  const buf = (f) => fs.readFileSync(A(f));
  const ab = (b) => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
  const files = {
    sans500: buf("inter-tight-latin-500-normal.woff"),
    sans700: buf("inter-tight-latin-700-normal.woff"),
    sans800: buf("inter-tight-latin-800-normal.woff"),
    serif: buf("eb-garamond-latin-400-normal.woff"),
    serifItalic: buf("eb-garamond-latin-400-italic.woff"),
    deva400: buf("noto-sans-devanagari-devanagari-400-normal.woff"),
    deva700: buf("noto-sans-devanagari-devanagari-700-normal.woff"),
  };
  const ot = {};
  for (const k of Object.keys(files)) ot[k] = opentype.parse(ab(files[k]));
  ASSETS = {
    files,
    ot,
    logo: "data:image/png;base64," + buf("vakilpedia-logo.png").toString("base64"),
  };
  return ASSETS;
}

const DEVA = /[ऀ-ॿ]/;

/** Width of `text` in points, measured with the real font (Devanagari runs
 *  with Noto, which is what the renderer falls back to for them). */
function measure(text, fontKey, size, letterSpacingEm = 0) {
  const { ot } = assets();
  let w = 0;
  let run = "";
  let runDeva = null;
  const flush = () => {
    if (!run) return;
    const f = runDeva ? (fontKey.startsWith("sans7") || fontKey === "sans800" ? ot.deva700 : ot.deva400) : ot[fontKey];
    w += f.getAdvanceWidth(run, size);
    run = "";
  };
  for (const ch of String(text)) {
    const d = DEVA.test(ch);
    if (runDeva !== null && d !== runDeva) flush();
    runDeva = d;
    run += ch;
  }
  flush();
  const n = [...String(text)].length;
  return w + Math.max(0, n - 1) * letterSpacingEm * size;
}

/** Greedy word wrap with real measurement. Words longer than the line are
 *  split at '@', '.', '-' or, failing that, by character. */
function wrap(text, fontKey, size, maxW, ls = 0) {
  const words = String(text).split(" ").filter(Boolean);
  const lines = [];
  let cur = "";
  const pushLong = (word) => {
    // split an over-long token (emails) at natural break points
    let piece = "";
    for (const ch of word) {
      if (measure(piece + ch, fontKey, size, ls) > maxW && piece) {
        lines.push(piece);
        piece = ch;
      } else piece += ch;
    }
    return piece;
  };
  for (const w of words) {
    const trial = cur ? cur + " " + w : w;
    if (measure(trial, fontKey, size, ls) <= maxW) {
      cur = trial;
      continue;
    }
    if (cur) lines.push(cur);
    if (measure(w, fontKey, size, ls) > maxW && w.includes("@")) {
      // emails break after the @ first, so neither half looks like a typo
      const at = w.indexOf("@") + 1;
      const a = w.slice(0, at), b = w.slice(at);
      if (measure(a, fontKey, size, ls) <= maxW && measure(b, fontKey, size, ls) <= maxW) {
        lines.push(a);
        cur = b;
        continue;
      }
    }
    cur = measure(w, fontKey, size, ls) > maxW ? pushLong(w) : w;
  }
  if (cur) lines.push(cur);
  return lines;
}

/** Largest size in [min,max] at which `text` wraps into <= maxLines lines. */
function fit(text, fontKey, { max, min, step = 0.25, maxW, maxLines = 1, ls = 0 }) {
  for (let s = max; s >= min; s -= step) {
    const lines = wrap(text, fontKey, s, maxW, ls);
    if (lines.length <= maxLines) return { size: s, lines };
  }
  return { size: min, lines: wrap(text, fontKey, min, maxW, ls) };
}

// ---- tiny element helper (no JSX in api/) ----
function h(type, style, ...children) {
  const kids = children.flat().filter((c) => c !== null && c !== undefined && c !== false);
  const st = { display: "flex", ...style }; // the renderer needs an explicit flex box everywhere
  return { type, props: { style: st, children: kids.length === 1 ? kids[0] : kids } };
}
function img(src, style) {
  return { type: "img", props: { src, style, width: style.width, height: style.height } };
}

const ICONS = {
  phone: ["M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3 19.5 19.5 0 0 1-6-6 19.8 19.8 0 0 1-3-8.6A2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.5c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2Z"],
  mail: ["M5 4h14a3 3 0 0 1 3 3v10a3 3 0 0 1-3 3H5a3 3 0 0 1-3-3V7a3 3 0 0 1 3-3Z", "m2 7 10 6 10-6"],
  pin: ["M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z", "M12 7a3 3 0 1 1 0 6a3 3 0 1 1 0-6Z"],
  scale: ["M12 3v18M7 21h10M6 7h12M6 7l-3 6a3 3 0 0 0 6 0L6 7ZM18 7l-3 6a3 3 0 0 0 6 0l-3-6ZM12 3l-6 4M12 3l6 4"],
};
function icon(kind, size) {
  return {
    type: "svg",
    props: {
      width: size,
      height: size,
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "#2a2732",
      strokeWidth: 1.8,
      strokeLinecap: "round",
      strokeLinejoin: "round",
      style: { flexShrink: 0, marginTop: 2 * S },
      children: (ICONS[kind] || []).map((d) => ({ type: "path", props: { d } })),
    },
  };
}

const VERIFIED = {
  type: "svg",
  props: {
    width: 14 * S,
    height: 14 * S,
    viewBox: "0 0 24 24",
    fill: "none",
    style: { marginLeft: 5 * S },
    children: [
      { type: "path", props: { d: "M12 2l2.4 1.8 3-.2.8 2.9 2.4 1.8-1 2.9 1 2.9-2.4 1.8-.8 2.9-3-.2L12 22l-2.4-1.8-3 .2-.8-2.9L3.4 15.9l1-2.9-1-2.9 2.4-1.8.8-2.9 3 .2Z", fill: "#635BFF" } },
      { type: "path", props: { d: "M8.6 12.2l2.2 2.2 4.6-4.6", stroke: "#fff", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" } },
    ],
  },
};

const SILHOUETTE = {
  type: "svg",
  props: {
    width: 70 * S,
    height: 70 * S,
    viewBox: "0 0 64 64",
    fill: "none",
    children: [
      { type: "circle", props: { cx: 32, cy: 24, r: 13, fill: "#8a8ea0" } },
      { type: "path", props: { d: "M10 62c1-13 10-20 22-20s21 7 22 20Z", fill: "#8a8ea0" } },
    ],
  },
};

/** Lines -> text block. Each line is its own row so wrapping is exactly what
 *  we measured, never the renderer's own guess. */
function lines(ls, style) {
  return h("div", { display: "flex", flexDirection: "column", ...style }, ls.map((t) => h("div", { display: "flex", whiteSpace: "pre" }, t)));
}

/** face: output of _cardFace.cardFace(). photo: data: URL or null. */
function cardElement(face, photo) {
  const { logo } = assets();
  const PAD_X = 22, PAD_Y = 20, GAP = 14;
  const innerW = CW - PAD_X * 2;
  const leftW = Math.round(innerW * 0.3);
  const leftTextW = leftW - 12 - 4; // paddingRight + breathing room
  const rightW = innerW - leftW - GAP;

  // --- left column
  const lead = fit(face.firmShort, "sans700", { max: 24, min: 13, maxW: leftTextW, maxLines: 1 });
  // Wide letter-spacing breaks Devanagari conjuncts apart -- Latin only.
  const subLs = DEVA.test(face.firmSub || "") ? 0 : 0.3;
  const sub = face.firmSub
    ? { ls: subLs, ...fit(face.firmSub, "sans700", { max: subLs ? 8.5 : 10, min: 6, maxW: leftTextW, maxLines: 3, ls: subLs }) }
    : null;
  const tag = fit(face.tagline, "serifItalic", { max: 10.5, min: 8, maxW: leftTextW, maxLines: 2 });

  // --- right column
  const name = fit(face.name, "sans700", { max: 22, min: 12, maxW: rightW, maxLines: 1 });
  const textW = rightW - 14 - 10; // icon + gap
  const rows = face.contacts.map(([k, t]) => {
    if (k === "pin") return { k, ...fit(t, "serif", { max: 13, min: 9.5, maxW: textW, maxLines: 2 }) };
    // One line while it stays readable (>= 11pt); a longer email then goes
    // to two lines, broken after the @, instead of shrinking to a speck.
    const one = fit(t, "serif", { max: 13, min: 11, maxW: textW, maxLines: 1 });
    if (one.lines.length === 1) return { k, ...one };
    return { k, ...fit(t, "serif", { max: 13, min: 9.5, maxW: textW, maxLines: 2 }) };
  });

  const T = (n) => n * S;
  return h(
    "div",
    {
      width: T(CW),
      height: T(CH),
      display: "flex",
      position: "relative",
      borderRadius: T(24),
      padding: `${T(PAD_Y)}px ${T(PAD_X)}px`,
      backgroundColor: "#f7f7fb",
      backgroundImage:
        "linear-gradient(135deg, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0.08) 34%, rgba(255,255,255,0) 56%), linear-gradient(125deg, rgba(251,231,212,0.55), rgba(230,221,246,0.55) 48%, rgba(219,233,247,0.6))",
      border: `${T(1)}px solid rgba(255,255,255,0.7)`,
      overflow: "hidden",
      fontFamily: "Inter Tight",
      color: "#1c1c26",
    },
    // Powered by
    h(
      "div",
      { position: "absolute", top: T(10), right: T(14), display: "flex", alignItems: "center" },
      img(logo, { width: T(10), height: T(12), opacity: 0.9, marginRight: T(4) }),
      h("div", { display: "flex", fontSize: T(7.5), color: "rgba(28,28,38,0.5)", fontWeight: 500 }, "Powered by ", h("span", { color: "rgba(28,28,38,0.72)", fontWeight: 700 }, "Vakilpedia"))
    ),
    h(
      "div",
      { display: "flex", width: "100%", height: "100%" },
      // left
      h(
        "div",
        {
          width: T(leftW),
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          borderRight: `${T(1)}px solid rgba(40,36,52,0.18)`,
          paddingRight: T(12),
          marginRight: T(GAP),
          textAlign: "center",
        },
        h(
          "div",
          {
            width: T(96),
            height: T(96),
            borderRadius: T(48),
            padding: T(3),
            display: "flex",
            backgroundImage: "linear-gradient(135deg, #c9a24a, #efe0bb 45%, #9a7a35)",
          },
          h(
            "div",
            {
              width: "100%",
              height: "100%",
              borderRadius: T(45),
              overflow: "hidden",
              display: "flex",
              alignItems: photo ? "center" : "flex-end",
              justifyContent: "center",
              backgroundImage: "linear-gradient(160deg, #2b2d3a, #14151d)",
            },
            photo ? img(photo, { width: T(90), height: T(90), objectFit: "cover" }) : SILHOUETTE
          )
        ),
        lines(lead.lines, { fontSize: T(lead.size), fontWeight: 700, letterSpacing: T(-0.02 * lead.size), marginTop: T(12), lineHeight: 1, alignItems: "center" }),
        sub && lines(sub.lines, { fontSize: T(sub.size), fontWeight: 700, letterSpacing: T(sub.ls * sub.size), color: "#060606", marginTop: T(4), lineHeight: 1.35, alignItems: "center" }),
        lines(tag.lines, { fontFamily: "EB Garamond Italic", fontSize: T(tag.size), color: "#5b5766", marginTop: T(10), lineHeight: 1.25, alignItems: "center" })
      ),
      // right
      h(
        "div",
        { width: T(rightW), display: "flex", flexDirection: "column", justifyContent: "center" },
        h(
          "div",
          { display: "flex", alignItems: "center", marginBottom: T(5) },
          h("div", { display: "flex", fontSize: T(10.5), fontWeight: 800, letterSpacing: T(0.16 * 10.5), color: "#635BFF" }, face.title),
          VERIFIED
        ),
        lines(name.lines, { fontSize: T(name.size), fontWeight: 700, letterSpacing: T(-0.02 * name.size), lineHeight: 1.05 }),
        h("div", { width: "100%", height: T(2), borderRadius: T(2), backgroundImage: "linear-gradient(90deg, #c9a24a, #efe0bb)", margin: `${T(10)}px 0 ${T(12)}px` }),
        h(
          "div",
          { display: "flex", flexDirection: "column" },
          rows.map((r, i) =>
            h(
              "div",
              { display: "flex", alignItems: "flex-start", marginTop: i ? T(7) : 0 },
              icon(r.k, T(14)),
              lines(r.lines, { fontFamily: "EB Garamond", fontSize: T(r.size), lineHeight: 1.28, color: "#33313e", marginLeft: T(10) })
            )
          )
        )
      )
    )
  );
}

function fontsFor() {
  const { files } = assets();
  return [
    { name: "Inter Tight", data: files.sans500, weight: 500, style: "normal" },
    { name: "Inter Tight", data: files.sans700, weight: 700, style: "normal" },
    { name: "Inter Tight", data: files.sans800, weight: 800, style: "normal" },
    { name: "EB Garamond", data: files.serif, weight: 400, style: "normal" },
    { name: "EB Garamond Italic", data: files.serifItalic, weight: 400, style: "normal" },
    { name: "Noto Sans Devanagari", data: files.deva400, weight: 400, style: "normal" },
    { name: "Noto Sans Devanagari", data: files.deva700, weight: 700, style: "normal" },
  ];
}

/** Fetch the DP on the server and hand it to the renderer as a data: URL.
 *  Any failure -> null -> the silhouette (never a broken picture). */
async function photoDataUrl(url, timeoutMs = 4000) {
  if (!url || !/^https:\/\//.test(url)) return null;
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), timeoutMs);
    const r = await fetch(url, { signal: ctl.signal });
    clearTimeout(t);
    if (!r.ok) return null;
    const type = (r.headers.get("content-type") || "").split(";")[0].trim();
    const b = Buffer.from(await r.arrayBuffer());
    if (!b.length || b.length > 2 * 1024 * 1024) return null;
    // The drawing engine reads only PNG/JPEG; most DPs are stored as WebP.
    // Re-encode everything to one 360px JPEG (also keeps the picture small).
    const sharp = require("sharp");
    const jpg = await sharp(b).rotate().resize(360, 360, { fit: "cover" }).jpeg({ quality: 90 }).toBuffer();
    return { type: "image/jpeg", dataUrl: `data:image/jpeg;base64,${jpg.toString("base64")}` };
  } catch {
    return null;
  }
}

/** Returns a PNG Buffer. */
async function renderCardPng(face) {
  const satori = require("satori").default || require("satori");
  const { Resvg } = require("@resvg/resvg-js");
  const photo = await photoDataUrl(face.photoUrl);
  const draw = (src) =>
    satori(cardElement(face, src), { width: CW * S, height: CH * S, fonts: fontsFor() });
  let svg;
  try {
    svg = await draw(photo && photo.dataUrl);
  } catch (e) {
    // An image format the renderer cannot read must never cost the whole
    // card: draw it again with the silhouette.
    if (!photo) throw e;
    svg = await draw(null);
  }
  return new Resvg(svg, { fitTo: { mode: "original" } }).render().asPng();
}

module.exports = { renderCardPng, cardElement, measure, wrap, fit, CW, CH, S };
