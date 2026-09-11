/**
 * The Vakilpedia product list as the marketing site's nav and footer show it.
 *
 * SNAPSHOT, not a second source of truth. The canonical list is the registry
 * in `@th4t6uy/supracore-platform/products/presentation`, which
 * `Apps/Vakilpedia-code/frontend-next` reads through `config/products.js`
 * (nav launcher) and `config/surfaces.js` (footer). VakilCard cannot install
 * that package yet — it lives on the private GitHub registry and this CRA
 * build has no token — so the two lists below are the registry's output for
 * v0.3.1, generated 2026-09-11 with exactly the dedupe/ordering rules of
 * `buildLauncherItems()` in frontend-next/components/SiteNav.js.
 *
 * When VakilCard can consume the package, delete this file and derive both
 * lists from it. Until then: a product added to the registry must be added
 * here too, or the VakilCard nav falls behind www's.
 *
 * Paths are as the registry states them. Root-relative ones belong to
 * www.vakilpedia.com, so every consumer must run them through `wwwHref()` —
 * on this subdomain "/courtque" would otherwise be a VakilCard 404.
 */

export const WWW = "https://www.vakilpedia.com";

const isAbsolute = (href) => /^https?:\/\//i.test(href || "");

/** Root-relative marketing paths → absolute www URLs. Absolute URLs pass through. */
export const wwwHref = (href) => (isAbsolute(href) ? href : `${WWW}${href || "/"}`);

/** The nav's "Apps" launcher, in www's order. `soon` rows render a Soon chip. */
export const LAUNCHER_ITEMS = [
  { id: "caselinx", name: "CaseLinx", tagline: "The Litigation OS", icon: "/app-icons/caselinx.webp", href: "https://caselinx.vakilpedia.com", flag: "BETA" },
  { id: "signlinx", name: "SignLinx", tagline: "Signatures, on a link", icon: "/app-icons/signlinx.webp", href: "https://signlinx.vakilpedia.com", flag: "BETA" },
  { id: "vakilcard", name: "VakilCard", tagline: "Your digital chamber", icon: "/app-icons/vakilcard.webp", href: "https://vakilcard.vakilpedia.com" },
  { id: "courtque", name: "CourtQue", tagline: "Court alerts on WhatsApp", icon: "/app-icons/courtque.webp", href: "/courtque" },
  { id: "barelex", name: "BareLEX", tagline: "Bare acts, searchable", icon: "/app-icons/barelex.webp", href: "https://barelex.vakilpedia.com", flag: "BETA" },
  { id: "evidencehash", name: "EvidenceHash", tagline: "Prove a file is unchanged", icon: "/app-icons/evidencehash.webp", href: "/evidence-hash-sha256" },
  { id: "affidavitmaker", name: "Affidavit Maker", tagline: "Court-ready affidavits, free", icon: "/app-icons/affidavitmaker.webp", href: "https://affidavit.vakilpedia.com" },
  { id: "ipcbns", name: "IPC → BNS converter", tagline: "Type any IPC or BNS section and get the equivalent under the new criminal laws. Covers CrPC ⇄ BNSS and IEA ⇄ BSA too.", icon: "/app-icons/ipcbns.webp", href: "/ipc-to-bns-converter" },
  { id: "vakilnama", name: "Vakilnama", tagline: "A practical handbook for civil law practice", icon: "/app-icons/vakilnama.webp", href: "/vakilnama" },
  { id: "lexdraft", name: "LexDraft", tagline: "AI drafting", icon: "/app-icons/lexdraft.webp", href: "/lexdraft", soon: true },
];

/** The footer's Products column (registry surface `siteFooter`). */
export const FOOTER_PRODUCTS = [
  { id: "caselinx", label: "CaseLinx", href: "/caselinx" },
  { id: "courtque", label: "CourtQue", href: "/courtque" },
  { id: "evidencehash", label: "EvidenceHash", href: "/evidence-hash-sha256" },
  { id: "ipcbns", label: "IPC → BNS Converter", href: "/ipc-to-bns-converter" },
  { id: "barelex", label: "BareLex", href: "/barelex" },
  { id: "vakilnama", label: "Vakilnama", href: "/vakilnama" },
];
