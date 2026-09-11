import React from "react";
import BrandWordmark from "./BrandWordmark";
import { FOOTER_PRODUCTS, WWW, wwwHref } from "../config/ecosystem";

/**
 * The marketing site's footer, on VakilCard.
 *
 * BORROWED verbatim from `Apps/Vakilpedia-code/frontend-next/components/
 * SiteFooter.js` (black field, amber links, social row, Products /
 * Compliance / Contact columns). The only change: every link is absolute to
 * www, because on this subdomain "/privacy" is not a VakilCard route.
 * Products come from the same registry snapshot the nav uses
 * (config/ecosystem.js). If the www footer changes, change this with it.
 */
const COMPLIANCE = [
  ["/privacy", "Privacy Policy"],
  ["/platform-agreement", "Terms of Service"],
  ["/refunds", "Refund Policy"],
  ["/shipping", "Shipping Details"],
  ["/vakilnama/terms", "Vakilnama Book Terms"],
  ["/about", "About"],
  ["/contact", "Contact"],
];

const SECTION_LISTS = [
  ["/ipc-to-bns-section-list", "IPC → BNS section list"],
  ["/crpc-to-bnss-section-list", "CrPC → BNSS section list"],
  ["/iea-to-bsa-section-list", "IEA → BSA section list"],
];

const link = "text-amber-500/70 hover:text-amber-400 transition-colors";

export default function SiteFooter() {
  return (
    <footer className="bg-black text-amber-500 py-16 px-6" data-testid="footer">
      <div className="max-w-6xl mx-auto">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-12">
          <div className="flex flex-col items-center md:items-start text-center md:text-left sm:col-span-2 md:col-span-1">
            <a href={WWW} className="flex items-center space-x-4 mb-6 no-underline" aria-label="Vakilpedia home">
              <img src="/logo-128.webp" alt="Vakilpedia" loading="lazy" className="h-16 w-auto object-contain brightness-100" />
              <BrandWordmark className="text-4xl font-bold tracking-tighter text-amber-500" />
            </a>
            <p className="text-amber-500/60 text-lg font-bold font-inter-tight">Legal Tech Ecosystem</p>
            <p className="text-amber-500/60 text-lg font-bold font-inter-tight mt-2">Proudly Made in Jabalpur</p>
            <div className="flex items-center gap-4 mt-6">
              <a href="https://www.linkedin.com/company/vakilpedia/" target="_blank" rel="noopener noreferrer" aria-label="Vakilpedia on LinkedIn" className="h-10 w-10 rounded-full bg-amber-500/10 hover:bg-amber-500/25 flex items-center justify-center transition-colors">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M20.45 20.45h-3.55v-5.57c0-1.33-.03-3.04-1.85-3.04-1.86 0-2.14 1.45-2.14 2.94v5.67H9.36V9h3.41v1.56h.05c.47-.9 1.63-1.85 3.36-1.85 3.6 0 4.27 2.37 4.27 5.46v6.28ZM5.34 7.43a2.06 2.06 0 1 1 0-4.12 2.06 2.06 0 0 1 0 4.12ZM7.12 20.45H3.56V9h3.56v11.45Z"/></svg>
              </a>
              <a href="https://www.youtube.com/@thevakilpedia" target="_blank" rel="noopener noreferrer" aria-label="Vakilpedia on YouTube" className="h-10 w-10 rounded-full bg-amber-500/10 hover:bg-amber-500/25 flex items-center justify-center transition-colors">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M23.5 6.19a3.02 3.02 0 0 0-2.12-2.14C19.5 3.55 12 3.55 12 3.55s-7.5 0-9.38.5A3.02 3.02 0 0 0 .5 6.19 31.6 31.6 0 0 0 0 12a31.6 31.6 0 0 0 .5 5.81 3.02 3.02 0 0 0 2.12 2.14c1.88.5 9.38.5 9.38.5s7.5 0 9.38-.5a3.02 3.02 0 0 0 2.12-2.14A31.6 31.6 0 0 0 24 12a31.6 31.6 0 0 0-.5-5.81ZM9.55 15.57V8.43L15.82 12l-6.27 3.57Z"/></svg>
              </a>
              <a href="https://www.facebook.com/vakilpedia" target="_blank" rel="noopener noreferrer" aria-label="Vakilpedia on Facebook" className="h-10 w-10 rounded-full bg-amber-500/10 hover:bg-amber-500/25 flex items-center justify-center transition-colors">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M24 12.07C24 5.4 18.63 0 12 0S0 5.4 0 12.07C0 18.1 4.39 23.09 10.13 24v-8.44H7.08v-3.49h3.05V9.41c0-3.02 1.79-4.7 4.53-4.7 1.31 0 2.68.24 2.68.24v2.97h-1.51c-1.49 0-1.95.93-1.95 1.89v2.26h3.32l-.53 3.49h-2.79V24C19.61 23.09 24 18.1 24 12.07Z"/></svg>
              </a>
            </div>
          </div>
          <div className="text-center md:text-left">
            <h4 className="text-xl font-bold mb-8 text-amber-500 uppercase">Products</h4>
            <div className="flex flex-col space-y-3">
              {FOOTER_PRODUCTS.map((p, i) => (
                <a key={p.id} href={wwwHref(p.href)} className={i === 0 ? "text-amber-500 font-bold hover:text-amber-400 transition-colors" : link}>
                  {p.label}
                </a>
              ))}
              {SECTION_LISTS.map(([href, label]) => (
                <a key={href} href={wwwHref(href)} className={link}>{label}</a>
              ))}
            </div>
          </div>
          <div className="text-center md:text-left">
            <h4 className="text-xl font-bold mb-8 text-amber-500 uppercase">Compliance</h4>
            <div className="flex flex-col space-y-3">
              {COMPLIANCE.map(([href, label]) => (
                <a key={href} href={wwwHref(href)} className={link}>{label}</a>
              ))}
            </div>
          </div>
          <div className="text-center md:text-left">
            <h4 className="text-xl font-bold mb-8 text-amber-500 uppercase">Contact Us</h4>
            <p className="text-amber-500/70 text-sm leading-loose">
              Vakilpedia<br />
              21, Delite Palladium<br />
              South Civil Lines<br />
              Jabalpur, MP 482001, INDIA<br />
              <span className="text-amber-500 font-medium mt-2 block">info@vakilpedia.com</span>
            </p>
          </div>
        </div>
        <div className="border-t border-amber-900/30 mt-16 pt-8 text-center text-amber-500/50 text-xs font-medium">
          © {new Date().getFullYear()} DatarOne Private Limited (CIN U62099MP2026PTC086878). <BrandWordmark /> is a business name and trade mark used by DatarOne Private Limited under licence. All rights reserved.
        </div>
      </div>
    </footer>
  );
}
