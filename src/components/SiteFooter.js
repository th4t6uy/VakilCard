import React, { useEffect, useRef } from "react";
import BrandWordmark from "./BrandWordmark";

/**
 * The SHORT Vakilpedia footer (founder, 2-3 Oct 2026; made identical on every site 9 Oct 2026:
 * "ensure that the footer is consistent in all marketing and app pages").
 *
 * PORT of Apps/Vakilpedia-code/frontend-next/components/SiteFooter.js - same markup, same black
 * and amber. The only differences: legal links and badge images are absolute to www (this is
 * vakilcard.vakilpedia.com, a different origin), and the brand records are copied below instead of imported. If
 * the www footer changes, change this with it.
 */
const WWW_ORIGIN = "https://www.vakilpedia.com";

// Mirrors config/brand.js in Apps/Vakilpedia-code/frontend-next (one record there feeds www's
// footer badges and its Organization schema). Change both together.
const LEGAL_ENTITY = "DatarOne Private Limited";
const DPIIT_RECOGNITION = {
  recognised: true,
  certificateNumber: "DIPP286486",
  showStartupIndiaLogo: true,
  authority: "Department for Promotion of Industry and Internal Trade (DPIIT), Government of India",
  authorityUrl: "https://www.startupindia.gov.in",
};
const NVIDIA_INCEPTION = {
  member: true,
  programUrl: "https://www.nvidia.com/en-in/startups/",
  showBadgeLogo: false,
  badgeFile: "/nvidia-inception-badge.png",
};

function useBlackCanvasUnder(ref) {
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') return undefined;
    const root = document.documentElement;
    const io = new IntersectionObserver(([e]) => {
      root.style.backgroundColor = e.isIntersecting ? '#000' : '';
    });
    io.observe(el);
    return () => { io.disconnect(); root.style.backgroundColor = ''; };
  }, [ref]);
}

const LEGAL = [
  ['/privacy', 'Privacy'],
  ['/platform-agreement', 'Terms'],
  ['/refunds', 'Refunds'],
  ['/shipping', 'Shipping'],
  ['/vakilnama/terms', 'Vakilnama Book Terms'],
  ['/about', 'About'],
  ['/contact', 'Contact'],
];

const SOCIAL = [
  ['https://www.linkedin.com/company/vakilpedia/', 'LinkedIn', 'M20.45 20.45h-3.55v-5.57c0-1.33-.03-3.04-1.85-3.04-1.86 0-2.14 1.45-2.14 2.94v5.67H9.36V9h3.41v1.56h.05c.47-.9 1.63-1.85 3.36-1.85 3.6 0 4.27 2.37 4.27 5.46v6.28ZM5.34 7.43a2.06 2.06 0 1 1 0-4.12 2.06 2.06 0 0 1 0 4.12ZM7.12 20.45H3.56V9h3.56v11.45Z'],
  ['https://www.youtube.com/@thevakilpedia', 'YouTube', 'M23.5 6.19a3.02 3.02 0 0 0-2.12-2.14C19.5 3.55 12 3.55 12 3.55s-7.5 0-9.38.5A3.02 3.02 0 0 0 .5 6.19 31.6 31.6 0 0 0 0 12a31.6 31.6 0 0 0 .5 5.81 3.02 3.02 0 0 0 2.12 2.14c1.88.5 9.38.5 9.38.5s7.5 0 9.38-.5a3.02 3.02 0 0 0 2.12-2.14A31.6 31.6 0 0 0 24 12a31.6 31.6 0 0 0-.5-5.81ZM9.55 15.57V8.43L15.82 12l-6.27 3.57Z'],
  ['https://www.facebook.com/vakilpedia', 'Facebook', 'M24 12.07C24 5.4 18.63 0 12 0S0 5.4 0 12.07C0 18.1 4.39 23.09 10.13 24v-8.44H7.08v-3.49h3.05V9.41c0-3.02 1.79-4.7 4.53-4.7 1.31 0 2.68.24 2.68.24v2.97h-1.51c-1.49 0-1.95.93-1.95 1.89v2.26h3.32l-.53 3.49h-2.79V24C19.61 23.09 24 18.1 24 12.07Z'],
];

const link = 'text-amber-500/70 hover:text-amber-400 transition-colors no-underline';

/**
 * "Recognised by DPIIT" — a quiet amber-outlined pill in the footer's own
 * palette. A tick until the logo switch is on; then the amber #startupindia
 * mark sits straight on the black, like the rest of the footer.
 */
function DpiitBadge() {
  const r = DPIIT_RECOGNITION;
  if (!r?.recognised) return null;
  const label = `${LEGAL_ENTITY} is recognised as a Startup by ${r.authority}`
    + (r.certificateNumber ? ` (Certificate No. ${r.certificateNumber})` : '');
  return (
    <a
      href={r.authorityUrl}
      target="_blank"
      rel="noopener noreferrer"
      title={label}
      aria-label={label}
      className="group inline-flex items-center gap-2 rounded-full border border-amber-500/25 hover:border-amber-500/50 bg-amber-500/[0.06] pl-1.5 pr-3 py-1 no-underline transition-colors"
    >
      {r.showStartupIndiaLogo ? (
        <img src={`${WWW_ORIGIN}/startup-india-logo.webp`} alt="#startupindia" width={82} height={18} loading="lazy" decoding="async" className="h-[18px] w-auto ml-1.5 mr-0.5" />
      ) : (
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-500/15 text-amber-500" aria-hidden="true">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
        </span>
      )}
      <span className="flex flex-col leading-none">
        <span className="text-[11px] font-bold text-amber-500 group-hover:text-amber-400 transition-colors">DPIIT Recognised Startup</span>
        <span className="mt-[3px] text-[10px] font-medium text-amber-500/85">
          Govt. of India{r.certificateNumber ? ` · ${r.certificateNumber}` : ''}
        </span>
      </span>
    </a>
  );
}

/**
 * "NVIDIA Inception Program member" (8 Oct 2026) — sits beside the DPIIT badge,
 * same quiet amber-outlined pill. Text only until NVIDIA_INCEPTION.showBadgeLogo
 * is true; then the official badge is shown as supplied (never recoloured —
 * NVIDIA's logo rules) and the words come from the badge itself.
 */
function NvidiaInceptionBadge() {
  const n = NVIDIA_INCEPTION;
  if (!n?.member) return null;
  const label = `${LEGAL_ENTITY} is a member of the NVIDIA Inception Program for AI startups`;
  const pill = 'group inline-flex items-center gap-2 rounded-full border border-amber-500/25 hover:border-amber-500/50 bg-amber-500/[0.06] py-1 no-underline transition-colors';
  return (
    <a href={n.programUrl} target="_blank" rel="noopener noreferrer" title={label} aria-label={label}
      className={n.showBadgeLogo ? `${pill} px-3` : `${pill} pl-1.5 pr-3`}>
      {n.showBadgeLogo ? (
        <img src={`${WWW_ORIGIN}${n.badgeFile}`} alt="NVIDIA Inception Program member" height={22} loading="lazy" decoding="async" className="h-[22px] w-auto" />
      ) : (
        <>
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-500/15 text-amber-500" aria-hidden="true">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
          </span>
          <span className="flex flex-col leading-none">
            <span className="text-[11px] font-bold text-amber-500 group-hover:text-amber-400 transition-colors">NVIDIA Inception Program</span>
            <span className="mt-[3px] text-[10px] font-medium text-amber-500/85">Member · AI startup programme</span>
          </span>
        </>
      )}
    </a>
  );
}

export default function SiteFooter() {
  const footerRef = useRef(null);
  useBlackCanvasUnder(footerRef);
  return (
    <footer
      ref={footerRef}
      className="bg-black text-amber-500 px-5 sm:px-6 pt-6 sm:pt-8 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:pb-6"
      data-testid="footer"
    >
      <div className="max-w-6xl mx-auto">
        {/* brand + socials */}
        <div className="flex items-center justify-between gap-3">
          <a href="https://www.vakilpedia.com" className="flex items-center gap-2.5 no-underline min-w-0" aria-label="Vakilpedia home">
            <img src="/logo-128.webp" alt="Vakilpedia" width={28} height={34} className="h-8 w-auto object-contain flex-shrink-0" />
            <span className="min-w-0">
              <BrandWordmark className="block whitespace-nowrap text-xl font-bold tracking-tighter text-amber-500 leading-none" />
              <span className="block text-[11px] font-bold text-amber-500/85 mt-1 leading-none">Legal Tech Ecosystem · Made in Jabalpur</span>
            </span>
          </a>
          <div className="flex items-center gap-2 flex-shrink-0">
            {SOCIAL.map(([href, label, d]) => (
              <a key={label} href={href} target="_blank" rel="noopener noreferrer" aria-label={`Vakilpedia on ${label}`} className="h-8 w-8 rounded-full bg-amber-500/10 hover:bg-amber-500/25 flex items-center justify-center transition-colors">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d={d} /></svg>
              </a>
            ))}
          </div>
        </div>

        {/* legal links: one wrapped row, not columns */}
        <nav aria-label="Footer" className="mt-4 flex flex-wrap gap-x-4 gap-y-1.5 text-sm">
          {LEGAL.map(([href, label]) => <a key={href} href={`${WWW_ORIGIN}${href}`} className={link}>{label}</a>)}
        </nav>
        {/* contact + recognition: one row, wraps under on narrow phones */}
        <div className="mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2.5">
          <a href="mailto:info@vakilpedia.com" className="text-sm text-amber-500 font-medium no-underline hover:text-amber-400 transition-colors">info@vakilpedia.com</a>
          <div className="flex flex-wrap items-center gap-2">
            <DpiitBadge />
            <NvidiaInceptionBadge />
          </div>
        </div>

        <div className="border-t border-amber-900/30 mt-4 pt-3 text-amber-500/80 text-[11px] font-medium leading-snug">
          © {new Date().getFullYear()} {LEGAL_ENTITY} (CIN U62099MP2026PTC086878). <BrandWordmark /> is a business name and trade mark used by {LEGAL_ENTITY} under licence. All rights reserved.
        </div>
      </div>
    </footer>
  );
}
