import React from "react";
import { Sun, Moon } from "lucide-react";
import { useTheme } from "../lib/useTheme";

/**
 * Standalone light/dark switch for routes that render NO SiteNav (/setup and
 * /admin -- SiteNav carries its own switch, so it must not also be mounted on
 * those pages or there would be two).
 *
 * Fixed to the top-LEFT corner (SetupWizard's mobile-preview close button
 * already owns the top-right), glass + border like SiteNav's ThemeToggle and
 * readable in both themes. It is 32px (h-8) rather than 36px and sits flush to
 * the top edge on purpose: both pages start their first row of content 32px
 * from the top (py-8), so a taller / lower button would cover the wizard's
 * "% complete" figure and the admin "Refresh" button on phones.
 */
export default function ThemeCornerToggle() {
  const { theme, toggle } = useTheme();
  const label = theme === "dark" ? "Switch to light mode" : "Switch to dark mode";
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={label}
      title={label}
      data-testid="theme-corner-toggle"
      className="fixed top-0.5 left-2 z-[60] print:hidden flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 dark:border-white/10 bg-white/80 dark:bg-slate-900/70 backdrop-blur shadow-sm dark:shadow-none hover:bg-white dark:hover:bg-white/10 transition-all"
    >
      {theme === "dark" ? (
        <Sun className="h-4 w-4 text-amber-400" aria-hidden="true" />
      ) : (
        <Moon className="h-4 w-4 text-indigo-600 dark:text-indigo-400" aria-hidden="true" />
      )}
    </button>
  );
}
