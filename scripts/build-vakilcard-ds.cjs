/* Build step for the VakilCard Design System bundle.
   Source of truth: design_system/vakilcard/ (the VERBATIM Claude Design
   export — never edit those files). This script only:
     1. transpiles ui_kits/vakilcard/VakilCardApp.jsx (JSX -> plain JS) with
        the repo's own Babel — replacing the export's runtime
        babel-standalone, exactly as the handoff README prescribes
     2. copies the untouched stylesheet/tokens/bundle/assets + the wiring
        files (page.css, mount.js) + vendored React 18.3.1 UMD into
        public/ds/ for the SSR card pages to load
   Runs via prebuild/prestart. Output layout mirrors the export so the
   component's relative asset paths resolve under <base href="/ds/ui_kits/vakilcard/">. */
const fs = require("fs");
const path = require("path");
const babel = require("@babel/core");

const root = path.resolve(__dirname, "..");
const src = path.join(root, "design_system", "vakilcard");
const vendor = path.join(root, "design_system", "vendor");
const out = path.join(root, "public", "ds");

function copy(from, to) {
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
}

fs.mkdirSync(out, { recursive: true });

// 1. Transpile the component (verbatim source, classic JSX runtime — the
//    page provides the React global, matching the export's UMD setup).
const jsxPath = path.join(src, "ui_kits", "vakilcard", "VakilCardApp.jsx");
const { code } = babel.transformSync(fs.readFileSync(jsxPath, "utf8"), {
  filename: jsxPath,
  babelrc: false,
  configFile: false,
  presets: [[require.resolve("@babel/preset-react"), { runtime: "classic" }]],
});
fs.mkdirSync(path.join(out, "ui_kits", "vakilcard"), { recursive: true });
fs.writeFileSync(
  path.join(out, "ui_kits", "vakilcard", "VakilCardApp.js"),
  "/* GENERATED from design_system/vakilcard/ui_kits/vakilcard/VakilCardApp.jsx — do not edit */\n" + code
);

// 2. Verbatim copies.
copy(path.join(src, "styles.css"), path.join(out, "styles.css"));
copy(path.join(src, "_ds_bundle.js"), path.join(out, "_ds_bundle.js"));
copy(path.join(src, "page.css"), path.join(out, "page.css"));
copy(path.join(src, "mount.js"), path.join(out, "mount.js"));
// The whole assets tree (logos + action/upi/brand icon PNGs). Everything the
// card references at runtime must live under /ds/* — the www proxy
// (Vakilpedia-code middleware) only forwards /ds/* and /api/vakilcard/*, so
// an asset outside /ds/ would 404 on www.vakilpedia.com/<username>.
(function copyDir(from, to) {
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    if (entry.isDirectory()) copyDir(path.join(from, entry.name), path.join(to, entry.name));
    else copy(path.join(from, entry.name), path.join(to, entry.name));
  }
})(path.join(src, "assets"), path.join(out, "assets"));
for (const f of fs.readdirSync(path.join(src, "tokens"))) {
  copy(path.join(src, "tokens", f), path.join(out, "tokens", f));
}
copy(path.join(vendor, "react.production.min.js"), path.join(out, "react.production.min.js"));
copy(path.join(vendor, "react-dom.production.min.js"), path.join(out, "react-dom.production.min.js"));
copy(path.join(vendor, "html-to-image.js"), path.join(out, "html-to-image.js"));
copy(path.join(vendor, "qrcode.js"), path.join(out, "qrcode.js")); // desktop UPI QR (mount.js, lazy)

console.log("VakilCard DS bundle built -> public/ds/");
