import React from 'react';
import { ArrowRight } from 'lucide-react';
import BrandWordmark from './BrandWordmark';

/**
 * "More from Vakilpedia" — the ONE cross-sell rail.
 *
 * This is not a new design. It is the rail the founder designed for the
 * VakilCard dashboard (`Apps/VakilCard/src/pages/VakilCardPage.js`,
 * `EcosystemRail`), reproduced class-for-class so that every cross-sell
 * surface across the estate reads as the same object rather than as five
 * teams' interpretations of a link list. Founder, 26 Aug 2026: "this sidebar
 * was designed in VakilCard — find it and make all cross sell sidebars same."
 *
 * The shape carries the argument, and the shape is deliberate:
 *
 *   - CaseLinx is FEATURED, on its own gradient card, because it is the paid
 *     product every free surface exists to sell. Everything else is a row.
 *   - Real product art, not text links, so the rail reads as "a Vakilpedia
 *     product" rather than a bolted-on directory.
 *   - Glass container, matching the nav pill — the estate's one surface
 *     recipe.
 *
 * 🔴 `origin` is load-bearing, not cosmetic. VakilCard is deployed on its own
 * subdomain (vakilcard.vakilpedia.com), where a root-relative "/caselinx"
 * resolves to a route THAT APP DOES NOT HAVE — a 404 instead of the marketing
 * page. Every cross-sell href there must be absolute. On www the same paths
 * are local, so origin is "". Get this wrong and the rail silently 404s for
 * every VakilCard user.
 *
 * 🔴 THIS IS THE VAKILCARD COPY. Keep in sync with
 * `Apps/Vakilpedia-code/frontend-next/components/EcosystemRail.js` until both
 * consume it from
 * `@th4t6uy/*` (SupraCore packages, Phase 2 — not started). Two copies is the
 * current cost of two build systems; two DIFFERENT copies is the thing this
 * component exists to stop.
 */

const FEATURED = {
  name: 'CaseLinx',
  tag: 'the Litigation OS.',
  badge: 'Beta Open',
  desc: 'Case diary, cause lists, hearings, billing and e-signing — everything you run in the background while the free tools handle the rest.',
  path: '/caselinx',
  icon: '/app-icons/caselinx.webp',
  cta: 'Explore CaseLinx',
};

/** [name, description, path, badge, icon] — same tuple order as VakilCard's. */
const ECOSYSTEM = [
  ['SignLinx', 'Send a PDF for signature over WhatsApp.', '/signlinx', 'Beta', '/app-icons/signlinx.webp'],
  ['CourtQue', 'Display-board alerts on WhatsApp.', '/courtque', 'New', '/app-icons/courtque.webp'],
  ['BareLEX', 'Every bare act, searchable in seconds.', '/barelex', 'Beta', '/app-icons/barelex.webp'],
  ['EvidenceHash', 'SHA-256 hashing for digital evidence.', '/evidence-hash-sha256', null, '/app-icons/evidencehash.webp'],
  ['IPC / BNS Converter', 'Old-to-new criminal law sections, instantly.', '/ipc-to-bns-converter', null, '/app-icons/ipcbns.webp'],
  ['VakilCard', 'Your digital chamber, live in three minutes.', 'https://vakilcard.vakilpedia.com', null, '/app-icons/vakilcard.webp'],
  ['Vakilnama', 'The Vakilpedia publication for lawyers.', '/vakilnama', null, '/app-icons/vakilnama.webp'],
];

const isAbsolute = (p) => /^https?:\/\//i.test(p);
const link = (origin, path) => (isAbsolute(path) ? path : `${origin}${path}`);

export default function EcosystemRail({
  origin = '',
  compactGrid = false,
  /** Ids to leave out — a rail should never sell the page it is sitting on. */
  exclude = [],
  onNavigate,
}) {
  const rows = ECOSYSTEM.filter(([name]) => !exclude.includes(name));
  const showFeatured = !exclude.includes(FEATURED.name);

  return (
    <div className="bg-white/70 backdrop-blur-xl border border-slate-200/70 shadow-sm rounded-[2rem] p-5">
      <div className="flex items-center gap-2 mb-4">
        {/* logo-128.webp, not logo.png: the original is an 876KB 843x1024
            render painted here at 20px high. */}
        <img src="/logo-128.webp" alt="" width={17} height={20} className="h-5 w-auto object-contain flex-none" />
        <p className="text-xs font-black uppercase tracking-widest text-[#635BFF] m-0">
          More from <BrandWordmark />
        </p>
      </div>

      {/* Featured: CaseLinx — the sale this whole rail exists to make */}
      {showFeatured && (
        <a
          href={link(origin, FEATURED.path)}
          onClick={() => onNavigate && onNavigate(FEATURED.name, link(origin, FEATURED.path))}
          className="group relative block rounded-[1.75rem] p-5 mb-3 overflow-hidden bg-gradient-to-br from-indigo-50/90 via-white to-blue-50/70 border-2 border-indigo-200 hover:border-[#635BFF] hover:shadow-lg hover:shadow-indigo-100 transition-all no-underline"
        >
          <span className="absolute top-4 right-4 bg-[#635BFF] text-white text-[9px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full">
            {FEATURED.badge}
          </span>
          <div className="w-12 h-12 rounded-2xl overflow-hidden bg-white shadow-sm grid place-items-center mb-3">
            <img src={FEATURED.icon} alt="CaseLinx" width={48} height={48} className="w-full h-full object-cover" />
          </div>
          <p className="text-lg font-black text-slate-900 tracking-tight leading-none m-0">{FEATURED.name}</p>
          <p className="text-[#635BFF] font-bold text-xs mt-1 m-0">{FEATURED.tag}</p>
          <p className="text-xs text-slate-600 mt-2 text-left hyphens-none leading-snug m-0">{FEATURED.desc}</p>
          <span className="inline-flex items-center gap-1 text-xs font-black text-slate-900 group-hover:text-[#635BFF] group-hover:gap-2 transition-all mt-3">
            {FEATURED.cta}
            <ArrowRight className="h-3.5 w-3.5" />
          </span>
        </a>
      )}

      <div className={compactGrid ? 'grid sm:grid-cols-2 xl:grid-cols-4 gap-3' : 'space-y-3'}>
        {rows.map(([name, desc, path, badge, icon]) => {
          const href = link(origin, path);
          const external = isAbsolute(path);
          return (
            <a
              key={name}
              href={href}
              {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
              onClick={() => onNavigate && onNavigate(name, href)}
              className="flex items-center gap-3 rounded-2xl bg-white border border-slate-200 hover:border-[#635BFF]/50 hover:shadow-sm transition-all p-3 no-underline"
            >
              <div className="w-10 h-10 rounded-xl overflow-hidden bg-slate-50 shadow-sm grid place-items-center flex-none">
                <img src={icon} alt="" width={40} height={40} loading="lazy" className="w-full h-full object-cover" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <p className="text-sm font-black text-slate-900 truncate m-0">{name}</p>
                  {badge && (
                    <span className="rounded-full bg-[#635BFF]/10 text-[#635BFF] text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 flex-none">
                      {badge}
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-slate-500 mt-0.5 text-left hyphens-none leading-snug line-clamp-2 m-0">{desc}</p>
              </div>
            </a>
          );
        })}
      </div>
      <p className="text-[11px] font-bold text-slate-400 text-center pt-3 m-0">More products coming soon</p>
    </div>
  );
}
