import { useEffect } from "react";

/* Ported from the estate-wide pattern (CaseLinx, 2026-09-16). Keeps this
 * tab's data-theme in step with a value another tab may have already
 * written to localStorage before this one finished loading. */
export default function ThemeSync() {
  useEffect(() => {
    const theme = localStorage.getItem("vp-theme");
    if (theme === "light" || theme === "dark") {
      document.documentElement.setAttribute("data-theme", theme);
    }
  }, []);

  return null;
}
