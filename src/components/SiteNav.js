import React, { useEffect, useRef, useState } from "react";
import { Menu, X, ChevronDown, ArrowRight, Sun, Moon } from "lucide-react";
import BrandWordmark from "./BrandWordmark";
import { useTheme } from "../lib/useTheme";
import { LAUNCHER_ITEMS, WWW, wwwHref } from "../config/ecosystem";

/**
 * The marketing site's navigation bar, on VakilCard.
 *
 * BORROWED, not redesigned: this is `Apps/Vakilpedia-code/frontend-next/
 * components/SiteNav.js` class-for-class — the same glass pill that compacts
 * on scroll, the same "Apps" launcher, the same About / Blog / Contact links,
 * the same black Sign In pill and the same hamburger panel below `lg`. A
 * lawyer moving from www.vakilpedia.com to this subdomain should not be able
 * to tell they changed apps. If the www nav changes, change this with it.
 *
 * What differs, and why:
 *
 *   - Every link is ABSOLUTE to www. On this subdomain "/about" is a VakilCard
 *     route that does not exist. `wwwHref()` does the rewriting.
 *   - No framer-motion. www animates its dropdowns with it; VakilCard does not
 *     ship it, and a 40 kB dependency for two open/close transitions is not
 *     worth it. The same open/close happens with CSS transitions instead.
 *   - The Sign In button does not open www's AuthTile. VakilCard signs owners
 *     in with its own phone/password/WhatsApp flow, so the page passes `cta`:
 *     `{ label, onClick }` (open VakilCard's sign-in) or `{ label, href }`, or
 *     `null` for no button at all (the owner dashboard, which has its own
 *     Sign out).
 */

const navLinks = [
  { href: "/about", label: "About" },
  { href: "/blog", label: "Blog" },
  { href: "/contact", label: "Contact" },
];

function LauncherTile({ item, onNavigate, compact }) {
  const href = wwwHref(item.href);
  // The launcher opens other apps in the same tab on www; so does this one.
  // VakilCard's own tile is this page — keep it, www shows it too.
  return (
    <a
      href={href}
      onClick={() => onNavigate && onNavigate()}
      className={`group flex items-center gap-3 rounded-2xl border border-white/70 bg-white/70 hover:bg-white hover:border-[#635BFF]/30 hover:shadow-md hover:shadow-slate-200/60 transition-all no-underline ${
        compact ? "p-2.5" : "p-3"
      }`}
    >
      <img
        src={item.icon}
        alt=""
        width={compact ? 36 : 40}
        height={compact ? 36 : 40}
        loading="lazy"
        className={`flex-shrink-0 rounded-[22.37%] object-cover ${compact ? "w-9 h-9" : "w-10 h-10"}`}
      />
      <span className="min-w-0">
        <span className="flex items-center gap-1.5">
          <span className="block text-[13px] font-black text-slate-900 leading-tight truncate group-hover:text-[#635BFF] transition-colors">
            {item.name}
          </span>
          {item.soon && (
            <span className="flex-shrink-0 text-[9px] font-black uppercase tracking-wide text-slate-400 border border-slate-200 rounded-full px-1.5 py-px">
              Soon
            </span>
          )}
          {item.flag && !item.soon && (
            <span className="flex-shrink-0 text-[9px] font-black uppercase tracking-wide text-[#635BFF] border border-[#635BFF]/30 rounded-full px-1.5 py-px">
              {item.flag}
            </span>
          )}
        </span>
        <span className="block text-[11px] text-slate-500 leading-snug truncate">{item.tagline}</span>
      </span>
    </a>
  );
}

function CtaButton({ cta, className, onAfter }) {
  if (!cta) return null;
  if (cta.href) {
    return (
      <a href={cta.href} onClick={onAfter} className={className}>
        {cta.label}
      </a>
    );
  }
  return (
    <button
      type="button"
      onClick={() => {
        if (onAfter) onAfter();
        if (cta.onClick) cta.onClick();
      }}
      className={className}
    >
      {cta.label}
    </button>
  );
}

// Light/dark switch -- same estate-wide pattern as every other Vakilpedia
// app's nav (CaseLinx/CourtQue/SignLinx/Affidavit Maker/Account). Desktop
// only, same as everywhere else -- none of them put it in the mobile menu.
function ThemeToggle({ compact }) {
  const { theme, toggle } = useTheme();
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
      title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
      className={`flex items-center justify-center rounded-full border border-slate-200 dark:border-white/10 bg-white/80 dark:bg-white/5 hover:bg-white dark:hover:bg-white/10 transition-all ${
        compact ? "h-8 w-8" : "h-9 w-9"
      }`}
    >
      {theme === "dark" ? (
        <Sun className="h-3.5 w-3.5 text-amber-400" aria-hidden="true" />
      ) : (
        <Moon className="h-3.5 w-3.5 text-indigo-600" aria-hidden="true" />
      )}
    </button>
  );
}

export default function SiteNav({ cta = null }) {
  const [scrolled, setScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [appsOpen, setAppsOpen] = useState(false);
  const appsRef = useRef(null);

  useEffect(() => {
    const onScroll = () => setScrolled((window.scrollY || 0) > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Launcher dismissal: click outside, or Escape (same rule as www).
  useEffect(() => {
    if (!appsOpen) return undefined;
    const onDown = (e) => {
      if (appsRef.current && !appsRef.current.contains(e.target)) setAppsOpen(false);
    };
    const onKey = (e) => {
      if (e.key === "Escape") setAppsOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [appsOpen]);

  const pill = scrolled ? "px-4 py-2 text-xs" : "px-5 py-2.5 text-sm";

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 px-4 py-4 sm:px-6 sm:py-5" data-testid="main-navigation">
      <div className="max-w-7xl mx-auto">
        <div
          className={`flex items-center justify-between rounded-full border backdrop-blur-2xl transition-all duration-500 ${
            scrolled
              ? "bg-white/92 dark:bg-[#0f172a]/75 border-slate-200/80 dark:border-white/10 shadow-lg shadow-slate-200/50 dark:shadow-none px-3 py-2.5 sm:px-4"
              : "bg-white/72 dark:bg-[#0f172a]/55 border-white/70 dark:border-white/10 shadow-xl shadow-slate-200/40 dark:shadow-none px-4 py-3 sm:px-5 sm:py-4"
          }`}
        >
          <a href={WWW} className="flex items-center gap-3 rounded-full no-underline transition-all duration-500 min-w-0" data-testid="vakilpedia-logo">
            <img
              src="/logo-128.webp"
              alt="Vakilpedia"
              width={40}
              height={48}
              decoding="async"
              className={`w-auto object-contain transition-all duration-500 ${scrolled ? "h-9 sm:h-10" : "h-10 sm:h-12"}`}
            />
            <div className="min-w-0">
              <BrandWordmark className={`font-black text-slate-900 dark:text-white tracking-tighter transition-all duration-500 ${scrolled ? "text-lg sm:text-xl" : "text-xl sm:text-2xl"}`} />
              <div className={`hidden sm:block overflow-hidden text-slate-500 dark:text-slate-400 font-semibold transition-all duration-500 ${scrolled ? "max-h-0 opacity-0 text-[10px]" : "max-h-5 opacity-100 text-[11px]"}`}>
                Legal tech ecosystem.
              </div>
            </div>
          </a>

          <div className="hidden lg:flex items-center gap-1 xl:gap-2">
            {/* ── Apps launcher ─────────────────────────────────────────── */}
            <div className="relative" ref={appsRef}>
              <button
                type="button"
                onClick={() => setAppsOpen((v) => !v)}
                aria-expanded={appsOpen}
                aria-haspopup="true"
                data-testid="apps-launcher-trigger"
                className={`flex items-center gap-1.5 rounded-full font-bold transition-all ${
                  appsOpen ? "text-slate-900 dark:text-white bg-white/90 dark:bg-white/10" : "text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-white/90 dark:hover:bg-white/10"
                } ${scrolled ? "px-4 py-2 text-xs xl:px-5" : "px-5 py-2.5 text-sm xl:px-6"}`}
              >
                Apps
                <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-300 ${appsOpen ? "rotate-180" : ""}`} />
              </button>

              {appsOpen && (
                <div
                  className="absolute left-1/2 -translate-x-1/2 top-full mt-3 w-[34rem] xl:w-[38rem] rounded-[1.75rem] border border-white/70 dark:border-white/10 bg-white/95 dark:bg-[#1c1c1e]/95 backdrop-blur-2xl shadow-2xl shadow-slate-300/40 dark:shadow-none p-4"
                  data-testid="apps-launcher-panel"
                >
                  <div className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 px-1 pb-2.5">The Vakilpedia ecosystem</div>
                  <div className="grid grid-cols-2 gap-1.5">
                    {LAUNCHER_ITEMS.map((item) => (
                      <LauncherTile key={item.id} item={item} onNavigate={() => setAppsOpen(false)} />
                    ))}
                  </div>
                  <a
                    href={wwwHref("/apps")}
                    onClick={() => setAppsOpen(false)}
                    className="mt-3 flex items-center justify-center gap-1.5 rounded-2xl border border-slate-200 dark:border-white/10 bg-slate-50/80 dark:bg-white/5 hover:bg-white dark:hover:bg-white/10 py-2.5 text-[12px] font-black text-slate-700 dark:text-slate-300 hover:text-[#635BFF] no-underline transition-colors"
                  >
                    See all apps <ArrowRight className="w-3.5 h-3.5" />
                  </a>
                </div>
              )}
            </div>

            {navLinks.map((link) => (
              <a
                key={link.label}
                href={wwwHref(link.href)}
                className={`rounded-full text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-white/90 dark:hover:bg-white/10 transition-all font-bold no-underline ${
                  scrolled ? "px-4 py-2 text-xs xl:px-5" : "px-5 py-2.5 text-sm xl:px-6"
                }`}
              >
                {link.label}
              </a>
            ))}
            <div className="relative flex items-center gap-2 ml-1 pl-2 border-l border-slate-200/70 dark:border-white/10">
              <ThemeToggle compact={scrolled} />
              {cta && (
                <CtaButton
                  cta={cta}
                  className={`rounded-full font-bold no-underline transition-all duration-200 whitespace-nowrap bg-slate-900 text-white hover:bg-[#635BFF] ${pill}`}
                />
              )}
            </div>
          </div>

          {/* Same breakpoint as the desktop links (lg), so the halves meet. */}
          <button
            type="button"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className={`lg:hidden rounded-full border text-slate-900 dark:text-white transition-all duration-500 ${
              scrolled ? "p-2.5 bg-white/95 dark:bg-[#0f172a]/75 border-slate-200/80 dark:border-white/10 shadow-sm dark:shadow-none" : "p-3 bg-white/85 dark:bg-[#0f172a]/55 border-white/70 dark:border-white/10 shadow-md dark:shadow-none"
            }`}
            aria-label="Toggle menu"
            aria-expanded={mobileMenuOpen}
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>

        <div
          className={`lg:hidden overflow-hidden transition-all duration-300 ease-in-out ${
            mobileMenuOpen ? "max-h-[60rem] opacity-100 mt-3" : "max-h-0 opacity-0 mt-0 pointer-events-none"
          }`}
        >
          <div className="rounded-[2rem] border border-slate-200/70 dark:border-white/10 bg-white/95 dark:bg-[#0f172a]/95 backdrop-blur-2xl shadow-2xl px-5 py-5 max-h-[80vh] overflow-y-auto">
            {cta && (
              <div className="flex flex-col gap-3 mb-3 pb-3 border-b border-slate-100 dark:border-white/10">
                <CtaButton
                  cta={cta}
                  onAfter={() => setMobileMenuOpen(false)}
                  className="w-full py-4 text-center rounded-2xl font-bold no-underline transition-colors bg-slate-900 text-white hover:bg-[#635BFF]"
                />
              </div>
            )}

            {/* Same launcher, as a grid rather than a dropdown. */}
            <div className="mb-3 pb-3 border-b border-slate-100 dark:border-white/10">
              <div className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 px-1 pb-2">The Vakilpedia ecosystem</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                {LAUNCHER_ITEMS.map((item) => (
                  <LauncherTile key={item.id} item={item} compact onNavigate={() => setMobileMenuOpen(false)} />
                ))}
              </div>
              <a
                href={wwwHref("/apps")}
                onClick={() => setMobileMenuOpen(false)}
                className="mt-2 flex items-center justify-center gap-1.5 rounded-2xl border border-slate-200 dark:border-white/10 bg-slate-50/80 dark:bg-white/5 py-3 text-[12px] font-black text-slate-700 dark:text-slate-300 no-underline"
              >
                See all apps <ArrowRight className="w-3.5 h-3.5" />
              </a>
            </div>

            <div className="flex flex-col items-center gap-3">
              {navLinks.map((link) => (
                <a
                  key={link.label}
                  href={wwwHref(link.href)}
                  onClick={() => setMobileMenuOpen(false)}
                  className="w-full py-4 text-center rounded-2xl bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-white/10 text-slate-700 dark:text-slate-300 font-bold hover:bg-white dark:hover:bg-white/10 transition-all no-underline"
                >
                  {link.label}
                </a>
              ))}
            </div>
          </div>
        </div>
      </div>
    </nav>
  );
}
