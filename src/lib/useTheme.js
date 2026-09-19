import { useEffect, useState, useCallback } from "react";

/* Ported from the estate-wide pattern (CaseLinx -> CourtQue/SignLinx/Account,
 * 2026-09-16) so VakilCard's owner dashboard gets the same light/dark switch
 * every other Vakilpedia app already has. Storage keys use the shared "vp-"
 * prefix -- each product subdomain has its own localStorage anyway (different
 * origin), so there's no collision risk, but the naming stays consistent. */

const STORAGE_KEY = "vp-theme";
const EXPLICIT_KEY = "vp-theme-explicit";

// Shared across every *.vakilpedia.com subdomain (2026-09-19): see the
// identical comment in the estate's other useTheme.ts files. Falls back to
// a plain same-host cookie on localhost/preview domains, where a
// ".vakilpedia.com" cookie can't be set.
function cookieDomainAttr() {
  return typeof window !== "undefined" && window.location.hostname.endsWith("vakilpedia.com")
    ? "; domain=.vakilpedia.com"
    : "";
}

function writeThemeCookie(name, value) {
  const oneYear = 60 * 60 * 24 * 365;
  document.cookie = `${name}=${encodeURIComponent(value)}${cookieDomainAttr()}; path=/; max-age=${oneYear}; SameSite=Lax`;
}

export function useTheme() {
  // On first render there's a brief window before this effect runs; the
  // blocking script in public/index.html already set the *real* data-theme
  // attribute on <html> before React even mounts, so this just catches up.
  const [theme, setThemeState] = useState("light");

  useEffect(() => {
    const attr = document.documentElement.getAttribute("data-theme");
    if (attr === "dark") setThemeState("dark");
  }, []);

  // Sync when another tab changes the theme via localStorage.
  useEffect(() => {
    const handler = (e) => {
      if (e.key === STORAGE_KEY && (e.newValue === "light" || e.newValue === "dark")) {
        document.documentElement.setAttribute("data-theme", e.newValue);
        setThemeState(e.newValue);
      }
    };
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, []);

  const setTheme = useCallback((next) => {
    document.documentElement.setAttribute("data-theme", next);
    try { localStorage.setItem(STORAGE_KEY, next); } catch {}
    try { writeThemeCookie(STORAGE_KEY, next); } catch {}
    setThemeState(next);
  }, []);

  const toggle = useCallback(() => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    // Record the explicit choice. Once this flag is set, the THEME_INIT
    // script's day/night default must never override it again.
    try { localStorage.setItem(EXPLICIT_KEY, "1"); } catch {}
    try { writeThemeCookie(EXPLICIT_KEY, "1"); } catch {}
  }, [theme, setTheme]);

  return { theme, setTheme, toggle };
}
