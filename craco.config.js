// craco.config.js
// Minimal, VakilCard-only config — carries over the "@" -> src alias from
// Vakilpedia-website's frontend/craco.config.js. The visual-editor and
// webpack health-check plugins from that file are Vakilpedia-website's own
// dev tooling, not VakilCard-specific, and are intentionally not carried
// over here (extraction, not a redesign — but also not a re-import of
// unrelated tooling).
const path = require("path");
const fs = require("fs");
require("dotenv").config();

// Local-dev-only: proxy /api/vakilcard/* and bare-username public-profile
// paths to scripts/dev-api-server.cjs (run separately: `npm run dev:api`),
// mirroring vercel.json's rewrite table so `npm start` gets the same
// request routing production gets from Vercel. Dev-server config only —
// does not affect the production build.
//
// Vercel's real routing checks the deployed filesystem BEFORE rewrites: a
// request that matches a real static file (e.g. /vakilcard_card.webp) is
// served as that file, never rewritten, even though it also matches the
// username pattern. This proxy must replicate that or it will shadow every
// static asset whose name happens to look like a username.
const API_DEV_PORT = process.env.API_PORT || 3210;
const RESERVED_TOP_LEVEL = new Set(["vakilcard", "api", "favicon.ico", "manifest.json", "ds"]);
const USERNAME_RE = /^\/([a-zA-Z0-9][a-zA-Z0-9._-]{2,29})$/;
const PUBLIC_DIR = path.resolve(__dirname, "public");

module.exports = {
  eslint: {
    configure: {
      extends: ["plugin:react-hooks/recommended"],
      rules: {
        "react-hooks/rules-of-hooks": "error",
        "react-hooks/exhaustive-deps": "warn",
      },
    },
  },
  webpack: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
    configure: (webpackConfig) => {
      webpackConfig.watchOptions = {
        ...webpackConfig.watchOptions,
        ignored: [
          "**/node_modules/**",
          "**/.git/**",
          "**/build/**",
          "**/dist/**",
          "**/coverage/**",
          "**/public/**",
        ],
      };
      return webpackConfig;
    },
  },
  devServer: (devServerConfig) => {
    devServerConfig.proxy = [
      {
        context: ["/api"],
        target: `http://localhost:${API_DEV_PORT}`,
      },
      {
        context: (pathname) => {
          const m = pathname.match(USERNAME_RE);
          if (!m || RESERVED_TOP_LEVEL.has(m[1].toLowerCase())) return false;
          // Filesystem-first, matching Vercel: a real file under public/
          // wins over the username rewrite.
          const candidate = path.join(PUBLIC_DIR, pathname);
          if (!candidate.startsWith(PUBLIC_DIR)) return false; // guard path traversal
          return !fs.existsSync(candidate);
        },
        target: `http://localhost:${API_DEV_PORT}`,
        pathRewrite: (path) => `/api/vakilcard/profile?username=${path.slice(1)}`,
      },
    ];
    return devServerConfig;
  },
};
