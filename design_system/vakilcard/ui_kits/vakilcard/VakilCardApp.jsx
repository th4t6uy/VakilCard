/* VakilCard — the premium digital visiting card.
   LAYOUT v2 (founder-directed, 2026-07-18, diverges from the original
   Claude Design export): one natural scroll flow — visiting card first,
   Vakilpedia pill (Share + theme) beneath it scrolling with the page (no
   floating/sticky chrome), then Payment and Connect above the fold, the
   Premium upsell as the first tile revealed on scroll, then About,
   Practice Areas, Office. Card visuals and all section internals are
   unchanged from the export.
   Mobile-first. Composes Vakilpedia DS components. */
const { Button, Chip, ActionTile, VerifiedShield, GlassCard, Badge } = window.VakilpediaDesignSystem_d7e77c;

/* ---- Outline icon set (consistent 1.8 stroke, brand style) ---- */
const Svg = ({ d, s = 22 }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{d}</svg>
);
const Icons = {
  share: (p) => <Svg s={p} d={<g><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4"/></g>} />,
  menu: (p) => <Svg s={p} d={<g><path d="M3 6h18M3 12h18M3 18h18"/></g>} />,
  phone: (p) => <Svg s={p} d={<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3 19.5 19.5 0 0 1-6-6 19.8 19.8 0 0 1-3-8.6A2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.5c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2Z"/>} />,
  mail: (p) => <Svg s={p} d={<g><rect x="2" y="4" width="20" height="16" rx="3"/><path d="m2 7 10 6 10-6"/></g>} />,
  pin: (p) => <Svg s={p} d={<g><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></g>} />,
  scale: (p) => <Svg s={p} d={<g><path d="M12 3v18M7 21h10M6 7h12M6 7l-3 6a3 3 0 0 0 6 0L6 7ZM18 7l-3 6a3 3 0 0 0 6 0l-3-6ZM12 3l-6 4M12 3l6 4"/></g>} />,
  wa: (p) => <Svg s={p} d={<g><path d="M3 21l1.6-4.8A8 8 0 1 1 8 20.1L3 21Z"/><path d="M8.5 9.5c0 3 2 5 5 5.5M8.5 9.5c0-.8.7-1.5 1.3-1.2.4.8.9 1.6.9 1.6s-.6.7-.6.9c.3.9 1.1 1.7 2 2 .2 0 .9-.6.9-.6s.8.5 1.6.9c.3.6-.4 1.3-1.2 1.3" strokeWidth="1.4"/></g>} />,
  cal: (p) => <Svg s={p} d={<g><rect x="3" y="4" width="18" height="18" rx="3"/><path d="M16 2v4M8 2v4M3 10h18"/></g>} />,
  rupee: (p) => <Svg s={p} d={<path d="M6 3h12M6 8h12M6 13l8.5 8M9 8a5 5 0 0 1 0 10H6"/>} />,
  globe: (p) => <Svg s={p} d={<g><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/></g>} />,
  contact: (p) => <Svg s={p} d={<g><rect x="2" y="4" width="20" height="16" rx="3"/><circle cx="9" cy="11" r="2.2"/><path d="M5.5 17c.6-1.8 2-2.6 3.5-2.6s2.9.8 3.5 2.6M16 9h3M16 13h3"/></g>} />,
  download: (p) => <Svg s={p} d={<g><path d="M12 3v12M7 11l5 5 5-5M4 20h16"/></g>} />,
  qr: (p) => <Svg s={p} d={<g><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3M21 14v7M17 21h4"/></g>} />,
  copy: (p) => <Svg s={p} d={<g><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></g>} />,
  ext: (p) => <Svg s={p} d={<g><path d="M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/></g>} />,
  up: (p) => <Svg s={p} d={<path d="M12 19V5M5 12l7-7 7 7"/>} />,
  in: (p) => <Svg s={p} d={<g><rect x="2" y="2" width="20" height="20" rx="3"/><path d="M7 10v7M7 7v0M11 17v-4a2 2 0 0 1 4 0v4M11 17v-7" strokeWidth="1.6"/></g>} />,
  yt: (p) => <Svg s={p} d={<g><rect x="2" y="5" width="20" height="14" rx="4"/><path d="M10 9l5 3-5 3V9Z"/></g>} />,
  sun: (p) => <Svg s={p} d={<g><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4 12H2M22 12h-2M5 5l1.5 1.5M17.5 17.5 19 19M19 5l-1.5 1.5M6.5 17.5 5 19"/></g>} />,
  moon: (p) => <Svg s={p} d={<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z"/>} />,
  camera: (p) => <Svg s={p} d={<g><path d="M4 8h3l1.5-2h7L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1Z"/><circle cx="12" cy="13" r="3.2"/></g>} />,
  crown: (p) => <Svg s={p} d={<path d="M3 7l4 4 5-7 5 7 4-4-2 12H5L3 7Z"/>} />,
  fb: (p) => <Svg s={p} d={<path d="M14 21v-8h3l1-4h-4V7c0-1.2.5-2 2-2h2V1.5c-1-.2-2-.3-3-.3-3 0-5 1.8-5 5V9H7v4h3v8h4Z"/>} />,
  ig: (p) => <Svg s={p} d={<g><rect x="2.5" y="2.5" width="19" height="19" rx="5"/><circle cx="12" cy="12" r="4.2"/><circle cx="17.4" cy="6.6" r="0.6" fill="currentColor"/></g>} />,
  // Official X logo mark (filled), not a generic cross.
  x: (p) => <Svg s={p} d={<path fill="currentColor" stroke="none" d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24h-6.657l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231ZM17.083 19.77h1.833L7.084 4.126H5.117Z"/>} />,
  threads: (p) => <Svg s={p} d={<g><circle cx="12" cy="12" r="9"/><path d="M8.8 9.6c.6-1.2 1.8-2 3.2-2 2 0 3.3 1.2 3.5 3.2.9.4 1.7 1.2 1.7 2.5 0 1.9-1.6 3.2-4 3.2-2.7 0-4.4-1.5-4.4-3.4 0-1.7 1.4-2.9 3.5-2.9.6 0 1.2.1 1.7.3"/></g>} />,
  tg: (p) => <Svg s={p} d={<path d="M21 4 3 11l5.5 2L10 19l3-3.5L18 19l3-15ZM8.5 13 18 6.5"/>} />,
  star: (p) => <Svg s={p} d={<path d="M12 3.5l2.6 5.5 6 .8-4.4 4.2 1.1 6-5.3-2.9-5.3 2.9 1.1-6-4.4-4.2 6-.8Z"/>} />,
};

/* ---- Real vendored brand/action icons (background-removed PNGs) for the
   CONNECT grid tiles — swapped in per explicit founder direction so the
   card sells with real recognizable iconography, not generic outlines.
   Falls back to the outline glyph via onError so a missing/renamed asset
   never breaks a tile. Source of truth for these PNGs:
   Vakilpedia/"Logos Icons UX UI" (see project memory). ---- */
function IconImg({ src, size = 24, fallback, invert }) {
  const [broken, setBroken] = React.useState(false);
  if (broken) return fallback;
  return (
    <img
      src={src}
      alt=""
      style={{
        width: size,
        height: size,
        objectFit: 'contain',
        // These are flat black line-art PNGs — invisible against the dark
        // theme's dark tiles, so flip them to white in dark mode. Left
        // untouched in light mode where black-on-light already reads fine.
        filter: invert ? 'invert(1) brightness(1.6)' : 'none',
      }}
      onError={() => setBroken(true)}
    />
  );
}

/* ---- Social platforms: the stored key IS the platform, so the icon can
   never mismatch its destination. Only populated platforms render. ---- */
const SOCIAL_META = {
  linkedin: { icon: 'in', label: 'LinkedIn', color: 'var(--info)' },
  facebook: { icon: 'fb', label: 'Facebook', color: '#1877F2' },
  instagram: { icon: 'ig', label: 'Instagram', color: '#E1306C' },
  x: { icon: 'x', label: 'X (Twitter)', color: 'var(--text-hi)' },
  threads: { icon: 'threads', label: 'Threads', color: 'var(--text-hi)' },
  youtube: { icon: 'yt', label: 'YouTube', color: '#ff5a5a' },
  telegram: { icon: 'tg', label: 'Telegram', color: '#2AABEE' },
  whatsapp: { icon: 'wa', label: 'WhatsApp', color: 'var(--success)' },
  barcouncil: { icon: 'scale', label: 'Bar Association profile', color: 'var(--violet-400)' },
};

/* ---- Real inline "Scan & Pay" QR — drawn locally from the vendored
   /ds/qrcode.js (no network), encoding the exact upi:// URI. Never a
   decorative placeholder: with no valid UPI the whole block is absent. ---- */
function InlineUpiQr({ upi, name, qrUrl }) {
  // Prefer the lawyer's OWN uploaded QR (shown + downloaded exactly as
  // uploaded). Only when there's no uploaded image do we draw a valid QR
  // locally from the UPI ID — never a decorative placeholder.
  const [dataUrl, setDataUrl] = React.useState(qrUrl || null);
  React.useEffect(() => {
    if (qrUrl) { setDataUrl(qrUrl); return; }
    if (!upi) return;
    let alive = true;
    const draw = () => {
      try {
        const qr = window.qrcode(0, 'M');
        qr.addData('upi://pay?pa=' + upi + '&pn=' + encodeURIComponent(name || '') + '&cu=INR');
        qr.make();
        if (alive) setDataUrl(qr.createDataURL(6, 6));
      } catch (e) { /* qr lib unavailable — slot shows the qr glyph */ }
    };
    if (window.qrcode) draw();
    else {
      const sc = document.createElement('script');
      sc.src = '/ds/qrcode.js';
      sc.onload = draw;
      document.head.appendChild(sc);
    }
    return () => { alive = false; };
  }, [upi, name, qrUrl]);
  return (
    <div
      data-qr-zoom
      data-qr-name="upi-payment-qr"
      data-qr-caption={`Scan to pay ${upi}`}
      role="button"
      tabIndex={0}
      aria-label="Tap to enlarge the payment QR"
      title="Tap to enlarge"
      style={{ width: 92, height: 92, borderRadius: 12, background: '#fff', padding: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'zoom-in' }}
    >
      {dataUrl
        ? <img src={dataUrl} alt={`UPI QR for ${upi}`} style={{ width: '100%', height: '100%', borderRadius: 6 }} />
        : <span style={{ color: '#0b0b0b' }}>{Icons.qr(40)}</span>}
    </div>
  );
}

/* ---- Profiles — the card is data-driven; swap `profile` for a real or demo lawyer ---- */
const defaultProfile = {
  firmShort: 'Doe', firmSub: 'LAW CHAMBERS', tagline: 'Litigation · Advisory · Drafting',
  title: 'ADVOCATE', name: 'Sidharth Gautam',
  contacts: [['phone', '+91 98765 43210'], ['mail', 'sidharth@example.com'], ['pin', '123 Legal Street, Example City'], ['scale', 'Enrol. No. XX/0000/2020']],
  about: 'Advocate with a broad practice across civil, criminal, and commercial matters. Committed to practical, ethical, and result-oriented legal solutions.',
  practice: ['Civil Litigation', 'Criminal Law', 'Property Law', 'Corporate Law', 'Consumer Law', 'Arbitration', 'Family Law', 'Contract Drafting', 'Taxation'],
  upi: 'sidharthgautam@example', firm: 'Sidharth Gautam Law Chambers',
  social: [['linkedin', 'https://www.linkedin.com/in/example'], ['youtube', 'https://www.youtube.com/@example']],
  address: ['123 Legal Street', 'Example City – 110001'],
};
const demoProfile = {
  firmShort: 'Doe', firmSub: 'LAW CHAMBERS', tagline: 'Corporate · Disputes · Advisory',
  title: 'ADVOCATE', name: 'Sidharth Gautam',
  contacts: [['phone', '+91 98765 43210'], ['mail', 'sidharth@example.com'], ['pin', '123 Legal Street, Example City'], ['scale', 'Enrol. No. XX/2214/2016']],
  about: 'Corporate and commercial disputes counsel advising founders, boards, and investors across India. Clear, commercial, and responsive.',
  practice: ['Corporate Law', 'Mergers & Acquisitions', 'Commercial Disputes', 'Arbitration', 'Contracts', 'Compliance', 'Startup Advisory'],
  upi: 'sidharthgautam@example', firm: 'Sidharth Gautam Law Chambers',
  social: [['linkedin', 'https://www.linkedin.com/in/example'], ['instagram', 'https://www.instagram.com/example'], ['youtube', 'https://www.youtube.com/@example']],
  address: ['123 Legal Street', 'Example City – 110001'],
};
window.vakilDefaultProfile = defaultProfile;
window.vakilDemoProfile = demoProfile;

/* ---- Google Maps brand pin (vector recreation of the supplied asset:
   rainbow-gradient teardrop, white core) — used on the map tile so the
   "Open in Maps" affordance reads instantly as Google Maps. ---- */
function GMapsPin({ size = 32 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id="vcGmapsA" x1="6" y1="10" x2="42" y2="10" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#F4574D" />
          <stop offset="0.45" stopColor="#C061C9" />
          <stop offset="1" stopColor="#4285F4" />
        </linearGradient>
        <linearGradient id="vcGmapsB" x1="10" y1="14" x2="34" y2="46" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#FBBC04" />
          <stop offset="0.55" stopColor="#96C93D" />
          <stop offset="1" stopColor="#34A853" />
        </linearGradient>
      </defs>
      <path d="M24 2C14.6 2 7 9.6 7 19c0 5.3 2.6 9.4 6.1 13.3 3 3.3 6.7 6.6 9.2 11.2.6 1.1 2.8 1.1 3.4 0 2.5-4.6 6.2-7.9 9.2-11.2C38.4 28.4 41 24.3 41 19 41 9.6 33.4 2 24 2Z" fill="url(#vcGmapsB)" />
      <path d="M24 2C14.6 2 7 9.6 7 19c0 2.6.6 4.9 1.7 7.1L38.9 12.4C36.3 6.3 30.6 2 24 2Z" fill="url(#vcGmapsA)" opacity="0.9" />
      <circle cx="24" cy="19" r="8.5" fill="#fff" />
    </svg>
  );
}

/* ---- Stylised vector map backdrop (Office tile) — pure inline SVG, no map
   API / tiles / screenshots, so it's lightweight and free of Google copyright.
   Dark premium blue-grey palette with soft roads, water and parks; two layers
   drift gently at different speeds (see .vp-map-far/.vp-map-near in page.css)
   for a subtle parallax that keeps the tile from reading as an empty box. ---- */
function StyledMap({ radius = 14 }) {
  return (
    <div aria-hidden="true" style={{ position: 'absolute', inset: 0, borderRadius: radius, overflow: 'hidden', background: 'linear-gradient(160deg, #21324f 0%, #1a2740 55%, #131d31 100%)' }}>
      <svg className="vp-map-far" viewBox="0 0 240 240" preserveAspectRatio="xMidYMid slice" style={{ position: 'absolute', inset: '-14%', width: '128%', height: '128%' }}>
        <g fill="#294a3d" opacity="0.8"><rect x="14" y="150" width="64" height="58" rx="12" /><rect x="158" y="22" width="76" height="54" rx="12" /></g>
        <path d="M-10 66 C 60 44, 92 112, 152 96 S 250 122, 262 102 L 262 152 C 200 160, 150 138, 100 158 S 18 156, -10 138 Z" fill="#274a68" opacity="0.9" />
        <g fill="#28374f"><rect x="28" y="28" width="36" height="30" rx="6" /><rect x="82" y="22" width="42" height="26" rx="6" /><rect x="118" y="150" width="48" height="36" rx="7" /></g>
      </svg>
      <svg className="vp-map-near" viewBox="0 0 240 240" preserveAspectRatio="xMidYMid slice" style={{ position: 'absolute', inset: '-10%', width: '120%', height: '120%' }}>
        <g stroke="#93a9cc" strokeWidth="6" strokeLinecap="round" fill="none" opacity="0.9">
          <path d="M-10 92 H 262" /><path d="M72 -10 V 262" /><path d="M-10 28 C 80 72, 142 40, 262 82" />
        </g>
        <g stroke="#3f5378" strokeWidth="3" strokeLinecap="round" fill="none">
          <path d="M-10 152 H 262" /><path d="M152 -10 V 262" /><path d="M20 202 H 204" />
        </g>
      </svg>
      <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(120% 90% at 50% 8%, transparent 52%, rgba(8,12,22,0.34))' }} />
    </div>
  );
}

function ThemeToggle({ theme, onToggle }) {
  return (
    <button onClick={onToggle} aria-label="Toggle theme" style={{ width: 40, height: 40, borderRadius: 12, background: 'var(--glass-thick)', border: '1px solid var(--hairline)', color: 'var(--text-hi)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
      {theme === 'dark' ? Icons.sun(18) : Icons.moon(18)}
    </button>
  );
}

/* ---- Section wrapper ---- */
function Section({ eyebrow, action, children, style }) {
  return (
    <GlassCard tone="thin" radius="xl" pad={20} style={{ marginBottom: 16, ...style }}>
      {eyebrow && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--violet-400)' }}>{eyebrow}</span>
          {action}
        </div>
      )}
      {children}
    </GlassCard>
  );
}

/* ---- The floating visiting card (the hero) — credit-card 1.586:1 ---- */
function VisitingCard({ compact, onSave, profile }) {
  const [tilt, setTilt] = React.useState({ x: 0, y: 0 });
  const [flash, setFlash] = React.useState(false);
  const onMove = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width - 0.5;
    const py = (e.clientY - r.top) / r.height - 0.5;
    setTilt({ x: py * -4, y: px * 5 });
  };
  const reset = () => setTilt({ x: 0, y: 0 });
  const save = () => { setFlash(true); setTimeout(() => setFlash(false), 550); onSave && onSave(); };
  // Like a physical visiting card, the name is ALWAYS one line — long names
  // shrink to fit instead of wrapping. This also makes the PNG export match
  // the app exactly: a name that can't wrap can never collide with the gold
  // divider (the export bug with long names), regardless of font fallbacks.
  const nameRef = React.useRef(null);
  React.useLayoutEffect(() => {
    const el = nameRef.current;
    if (!el) return;
    const fit = () => {
      el.style.fontSize = '22px';
      let fs = 22;
      while (el.scrollWidth > el.clientWidth && fs > 13) {
        fs -= 0.5;
        el.style.fontSize = fs + 'px';
      }
    };
    fit();
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(fit).catch(() => {});
  }, [profile.name]);
  return (
    <div
      onMouseMove={onMove} onMouseLeave={reset} onDoubleClick={save}
      title="Double-tap to save as image"
      style={{
        position: 'relative',
        width: '100%',
        borderRadius: 24,
        padding: '20px 22px',
        background: 'linear-gradient(120deg, rgba(251,231,212,0.16), rgba(230,221,246,0.16) 50%, rgba(219,233,247,0.16)), rgba(255,255,255,0.58)',
        backdropFilter: 'blur(24px) saturate(1.5)',
        WebkitBackdropFilter: 'blur(24px) saturate(1.5)',
        border: '1px solid rgba(255,255,255,0.55)',
        boxShadow: '0 24px 56px rgba(0,0,0,0.42), inset 0 1px 0 rgba(255,255,255,0.75)',
        transform: `perspective(1000px) rotateX(${tilt.x}deg) rotateY(${tilt.y}deg) scale(${compact ? 0.965 : 1})`,
        transformOrigin: 'center top',
        transition: 'transform var(--dur-slow) var(--ease-glass)',
        overflow: 'hidden', cursor: 'pointer', userSelect: 'none',
      }}
    >
      {/* saved flash */}
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(255,255,255,0.7)', opacity: flash ? 1 : 0, transition: 'opacity var(--dur-slow) var(--ease-out)', pointerEvents: 'none' }} />

      <div style={{ position: 'relative', display: 'flex', gap: 14, alignItems: 'stretch' }}>
        {/* Left — photo DP + chamber lockup (custom logo is Premium) */}
        <div style={{ flex: '0 0 30%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', borderRight: '1px solid rgba(40,36,52,0.18)', paddingRight: 12 }}>
          <div style={{ width: 96, height: 96, borderRadius: '50%', padding: 3, background: 'linear-gradient(135deg, #c9a24a, #efe0bb 45%, #9a7a35)', boxShadow: '0 4px 14px rgba(0,0,0,0.18)' }}>
            <div style={{ width: '100%', height: '100%', borderRadius: '50%', overflow: 'hidden', background: 'linear-gradient(160deg, #2b2d3a, #14151d)', display: 'flex', alignItems: profile.photoUrl ? 'center' : 'flex-end', justifyContent: 'center' }}>
              {profile.photoUrl
                ? <img src={profile.photoUrl} alt={profile.name} crossOrigin="anonymous" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                : <svg width="70" height="70" viewBox="0 0 64 64" fill="none"><circle cx="32" cy="24" r="13" fill="#8a8ea0"/><path d="M10 62c1-13 10-20 22-20s21 7 22 20Z" fill="#8a8ea0"/></svg>}
            </div>
          </div>
          <div style={{ fontFamily: 'var(--font-sans)', fontSize: 24, color: '#1c1c26', fontWeight: 700, letterSpacing: '-0.02em', marginTop: 12, lineHeight: 1 }}>{profile.firmShort}</div>
          <div style={{ fontSize: 8.5, letterSpacing: '0.34em', color: '#060606', fontWeight: 700, marginTop: 4 }}>{profile.firmSub}</div>
          <div style={{ fontFamily: 'var(--font-accent)', fontStyle: 'italic', fontWeight: 400, fontSize: 10.5, color: '#5b5766', marginTop: 12 }}>{profile.tagline}</div>
        </div>

        {/* Right — identity, serif */}
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 5 }}><span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '0.16em', color: '#635BFF' }}>{profile.title}</span><svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}><path d="M12 2l2.4 1.8 3-.2.8 2.9 2.4 1.8-1 2.9 1 2.9-2.4 1.8-.8 2.9-3-.2L12 22l-2.4-1.8-3 .2-.8-2.9L3.4 15.9l1-2.9-1-2.9 2.4-1.8.8-2.9 3 .2Z" fill="#635BFF"/><path d="M8.6 12.2l2.2 2.2 4.6-4.6" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg></div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span ref={nameRef} data-card-name style={{ display: 'block', width: '100%', fontFamily: 'var(--font-sans)', fontSize: 22, fontWeight: 700, color: '#1c1c26', letterSpacing: '-0.02em', lineHeight: 1.05, whiteSpace: 'nowrap', overflow: 'hidden' }}>{profile.name}</span>
          </div>
          <div style={{ width: '100%', height: 2, borderRadius: 2, background: 'linear-gradient(90deg, #c9a24a, #efe0bb)', margin: '10px 0 12px' }} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            {profile.contacts.map(([k, t], i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                <span style={{ color: '#2a2732', flexShrink: 0, marginTop: 2 }}>{Icons[k](14)}</span>
                <span style={{ fontFamily: 'var(--font-accent)', fontStyle: 'normal', fontWeight: 400, fontSize: 13, lineHeight: 1.28, color: '#33313e', minWidth: 0 }}>{t}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div style={{ position: 'absolute', top: 10, right: 14, pointerEvents: 'auto' }}><a href="https://www.vakilpedia.com" target="_blank" rel="noopener" style={{ display: 'flex', alignItems: 'center', gap: 4, textDecoration: 'none', color: 'inherit' }}><img src="../../assets/logos/vakilpedia.png" alt="" style={{ height: 12, opacity: 0.9, filter: 'grayscale(1) contrast(1.05)' }} /><span style={{ fontSize: 7.5, color: 'rgba(28,28,38,0.5)' }}>Powered by <b style={{ color: 'rgba(28,28,38,0.72)' }}>Vakilpedia</b></span></a></div>
    </div>
  );
}

function VakilCardApp({ profile = defaultProfile }) {
  const [compact, setCompact] = React.useState(false);
  const [theme, setTheme] = React.useState('dark');
  React.useEffect(() => { document.documentElement.dataset.theme = theme; }, [theme]);
  const scroller = React.useRef(null);
  const [copied, setCopied] = React.useState(false);
  const [saved, setSaved] = React.useState(false);
  // Data-driven socials: [[platform, url], …] from the profile — never a
  // hardcoded showcase row.
  const social = Array.isArray(profile.social) ? profile.social.filter(([k]) => SOCIAL_META[k]) : [];
  const [scrolling, setScrolling] = React.useState(false);
  const scrollTimer = React.useRef(null);
  const onScroll = () => {
    setCompact((scroller.current?.scrollTop || 0) > 40);
    setScrolling(true);
    clearTimeout(scrollTimer.current);
    scrollTimer.current = setTimeout(() => setScrolling(false), 800);
  };

  const practice = profile.practice;
  const darkIcon = theme === 'dark';
  // Muted aerial-map backdrop for the Directions tile (CSS-only — no map
  // tile fetch/API key) — faint dual-grain grid lines over a slate-green
  // base evoke terrain/road without competing with the Google pin overlay.
  const mapTileBg =
    'repeating-linear-gradient(90deg, rgba(147,169,204,.14) 0 1.5px, transparent 1.5px 22px),' +
    'repeating-linear-gradient(0deg, rgba(147,169,204,.10) 0 1.5px, transparent 1.5px 26px),' +
    'linear-gradient(150deg, #33415c 0%, #263349 55%, #1b273c 100%)';
  // `k` is the availability key (see profile.actions from the SSR layer). A
  // tile whose action has no real target renders disabled/greyed. Tiles with
  // no `k` (Appointment, Save) are always available.
  // Vakilpedia tile removed by founder request (2026-08-04) — the CONNECT
  // grid is client-facing real estate, not a place for Vakilpedia's own
  // self-promotion. That upsell still lives in the "Premium upsell" banner
  // below and the footer's "Powered by Vakilpedia" link.
  const actions = profile.actions || null; // null (demo) => everything live
  const tiles = [
    { i: <IconImg src="/icons/actions/call.png" invert={darkIcon} fallback={Icons.phone(24)} />, l: 'Call', t: 'success', k: 'call' },
    { i: <IconImg src="/icons/actions/whatsapp.png" invert={darkIcon} fallback={Icons.wa(24)} />, l: 'WhatsApp', t: 'success', k: 'whatsapp' },
    { i: <IconImg src="/icons/actions/book.png" invert={darkIcon} fallback={Icons.cal(24)} />, l: 'Appointment', t: 'violet' },
    { i: <GMapsPin size={26} />, l: 'Directions', t: 'violet', bg: mapTileBg, k: 'directions' },
    { i: <IconImg src="/icons/actions/email.png" invert={darkIcon} fallback={Icons.mail(24)} />, l: 'Email', t: 'violet', k: 'email' },
    { i: <IconImg src="/icons/actions/website.png" invert={darkIcon} fallback={Icons.globe(24)} />, l: 'Website', t: 'info', k: 'website' },
    // Free: "View Reviews" opens the office's Google Maps listing (reuses
    // office.maps_url — no separate field needed). Pro: "Leave a Review"
    // deep-links straight to the owner's google_review_link. Which label +
    // destination applies is decided server-side (profile.js `actions`/
    // `links.review*`) — this tile is purely data-driven, never hides.
    { i: <IconImg src="/icons/actions/review.png" invert={darkIcon} fallback={Icons.star(24)} />, l: profile.reviewLabel || 'Reviews', t: 'gold', k: 'reviews' },
    { i: Icons.contact(24), l: 'Save', s: 'Contact', t: 'neutral' },
  ];

  return (
    <div style={{ position: 'relative', width: '100%', maxWidth: 412, height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--bg-void)', overflow: 'hidden' }}>
      {/* Liquid-glass environment — drifting colour glows behind the frosted UI */}
      <div className="vp-glow vp-g1" /><div className="vp-glow vp-g2" /><div className="vp-glow vp-g3" />
      {/* Floating card layer — the card stays fixed while the chamber scrolls beneath */}
      <div style={{ position: 'absolute', top: 14, left: 0, right: 0, padding: '0 16px', zIndex: 8, pointerEvents: 'none' }}>
        <div style={{ pointerEvents: 'auto' }}><VisitingCard compact={compact} profile={profile} onSave={() => { setSaved(true); setTimeout(() => setSaved(false), 1600); }} /></div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 10, fontSize: 11.5, color: saved ? 'var(--success)' : 'var(--text-low)', fontWeight: 500, opacity: compact ? 0 : 1, transform: compact ? 'translateY(-4px)' : 'none', pointerEvents: compact ? 'none' : 'auto', transition: 'color var(--dur-base), opacity var(--dur-base) var(--ease-out), transform var(--dur-base) var(--ease-out)' }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01" strokeLinecap="round"/></svg>
          {saved ? 'Saved to your device' : 'Double-tap anywhere on the card to save it to your device'}
        </div>
      </div>

      {/* Scrolling chamber — v2 order: pill, payment, connect, upsell, about, practice, office */}
      <div ref={scroller} onScroll={onScroll} className={scrolling ? 'vp-scroll is-scrolling' : 'vp-scroll'} style={{ position: 'relative', zIndex: 1, flex: 1, overflowY: 'auto', padding: '0 16px calc(48px + env(safe-area-inset-bottom, 0px))', WebkitOverflowScrolling: 'touch' }}>
        <div style={{ height: compact ? 246 : 288, transition: 'height var(--dur-slow) var(--ease-glass)' }} />

        {/* Vakilpedia pill — same Share + theme controls, scrolls with the page */}
<div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, height: 56, padding: '0 8px 0 14px', marginBottom: 16, borderRadius: 'var(--r-pill)', background: 'var(--glass-frost)', backdropFilter: 'blur(24px) saturate(1.4)', WebkitBackdropFilter: 'blur(24px) saturate(1.4)', border: '1px solid var(--hairline-strong)', boxShadow: '0 6px 18px rgba(0,0,0,0.30), 0 0 0 1px rgba(255,255,255,0.04), var(--inset-edge)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0 }}>
            <img src="../../assets/logos/vakilpedia.png" alt="" style={{ height: 26 }} />
            <span style={{ fontSize: 17, fontWeight: 900, letterSpacing: '-0.04em', color: 'var(--text-hi)' }}>Vakilpedia<sup style={{ fontSize: '0.42em', fontWeight: 500, opacity: 0.5 }}>TM</sup></span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <button aria-label="Share card" style={{ display: 'inline-flex', alignItems: 'center', gap: 7, height: 40, padding: '0 18px', borderRadius: 'var(--r-pill)', background: 'linear-gradient(180deg, #17c964, #12a150)', border: '1px solid rgba(255,255,255,0.18)', color: '#fff', fontSize: 13.5, fontWeight: 800, fontFamily: 'var(--font-sans)', cursor: 'pointer', boxShadow: '0 6px 18px rgba(18,161,80,0.5), inset 0 1px 0 rgba(255,255,255,0.35)' }}>{Icons.share(15)}Share</button>
            <ThemeToggle theme={theme} onToggle={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))} />
          </div>
        </div>

        {profile.upi ? (
          <Section eyebrow="Payment">
            <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 11, color: 'var(--text-low)', marginBottom: 4 }}>UPI ID</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                  <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-hi)', fontFamily: 'var(--font-mono)' }}>{profile.upi}</span>
                  <button onClick={() => { setCopied(true); setTimeout(() => setCopied(false), 1200); }} style={{ background: 'none', border: 'none', color: copied ? 'var(--success)' : 'var(--text-low)', cursor: 'pointer', display: 'flex' }}>{Icons.copy(15)}</button>
                </div>
                <Button variant="primary" icon={Icons.rupee(16)}>Pay Now</Button>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 14, fontSize: 11, color: 'var(--text-dim)' }}>
                  <VerifiedShield size="sm" label="" style={{ gap: 0 }} />
                  <span>Secured via UPI. No payment goes through Vakilpedia.</span>
                </div>
              </div>
              <div style={{ flexShrink: 0, textAlign: 'center' }}>
                <div style={{ fontSize: 10, color: 'var(--text-low)', marginBottom: 6 }}>Scan &amp; Pay</div>
                <InlineUpiQr upi={profile.upi} name={profile.name} qrUrl={profile.payQrUrl} />
                <div style={{ fontSize: 9.5, color: 'var(--text-dim)', marginTop: 6, lineHeight: 1.3 }}>Tap to enlarge<br/>&amp; scan</div>
              </div>
            </div>
          </Section>
        ) : null}

        <Section eyebrow="Connect">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 10 }}>
            {tiles.map((t) => {
              const disabled = !!(t.k && actions && actions[t.k] === false);
              return (
                <ActionTile
                  key={t.l}
                  icon={t.i}
                  label={t.l}
                  sublabel={t.s}
                  tone={t.t}
                  disabled={disabled}
                  title={disabled ? `${t.l} not available` : undefined}
                  style={{
                    aspectRatio: '1 / 1', height: 'auto', minHeight: 0,
                    ...(t.bg ? { background: t.bg } : {}),
                    // Disabled tile: greyed, non-interactive (native <button
                    // disabled> already kills click/hover/long-press), flat.
                    ...(disabled ? { opacity: 0.4, filter: 'grayscale(1)', cursor: 'default', boxShadow: 'none', backdropFilter: 'none', WebkitBackdropFilter: 'none' } : {}),
                  }}
                />
              );
            })}
          </div>
          {social.length > 0 && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '16px 0 10px' }}>
                <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-dim)' }}>Social handles</span>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                {social.map(([key, url]) => {
                  const meta = SOCIAL_META[key];
                  const icon = Icons[meta.icon] || Icons.globe;
                  return (
                    <a key={key} href={url} target="_blank" rel="noopener noreferrer" aria-label={meta.label} title={meta.label} data-ev={`social_${key}`} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 44, height: 44, borderRadius: '50%', background: 'var(--glass-thick)', border: '1px solid var(--hairline-strong)', color: meta.color, textDecoration: 'none', cursor: 'pointer' }}>{icon(18)}</a>
                  );
                })}
              </div>
            </>
          )}
        </Section>

        {/* Premium upsell — deliberately the first tile revealed on scroll */}
        <div style={{ position: 'relative', overflow: 'hidden', display: 'flex', alignItems: 'center', gap: 12, padding: 16, marginBottom: 16, borderRadius: 'var(--r-xl)', background: 'linear-gradient(120deg, var(--glass-tint-violet), var(--glass-tint-gold))', border: '1px solid var(--hairline)', backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)' }}>
          <div style={{ flexShrink: 0, width: 40, height: 40, borderRadius: 12, background: 'linear-gradient(135deg, var(--gold-300), var(--gold-500))', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#231a08' }}>{Icons.crown(20)}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-hi)' }}>Add your chamber logo &amp; branding</div>
            <div style={{ fontSize: 11.5, color: 'var(--text-low)', lineHeight: 1.4 }}>Free cards show your photo. Go Premium for a fully branded VakilCard.</div>
          </div>
          <Button variant="premium" size="sm">Upgrade</Button>
        </div>

        <Section eyebrow="About">
          <p style={{ margin: 0, fontSize: 14, lineHeight: 1.65, color: 'var(--text-mid)' }}>
            {profile.about}
          </p>
        </Section>

        <Section eyebrow="Practice Areas">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 18px', fontFamily: 'var(--font-accent)', fontStyle: 'italic', fontWeight: 400, fontSize: 15.5, lineHeight: 1.3, color: 'var(--text-mid)' }}>
            {practice.map((p) => <span key={p}>{p}</span>)}
          </div>
        </Section>

        <Section eyebrow="Office">
          <div style={{ display: 'flex', gap: 14 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-hi)', marginBottom: 6 }}>{profile.firm}</div>
              <div style={{ fontSize: 13, color: 'var(--text-low)', lineHeight: 1.55 }}>{profile.address[0]}<br/>{profile.address[1]}</div>
            </div>
            <div onClick={() => {}} style={{ flex: '0 0 130px', borderRadius: 14, cursor: 'pointer', border: '1px solid var(--hairline)', position: 'relative', minHeight: 128, overflow: 'hidden' }}>
              <StyledMap radius={14} />
              <span style={{ position: 'absolute', top: '38%', left: '50%', transform: 'translate(-50%,-50%)', filter: 'drop-shadow(0 2px 6px rgba(0,0,0,0.45))' }}><GMapsPin size={34} /></span>
              <div style={{ position: 'absolute', left: 8, right: 8, bottom: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, height: 30, borderRadius: 9, background: 'var(--glass-frost)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)', border: '1px solid var(--hairline)', color: 'var(--text-hi)', fontSize: 11, fontWeight: 700 }}>{Icons.ext(13)} Open in Maps</div>
            </div>
          </div>
        </Section>

        {profile.googleBusinessEmbed && (
          <Section eyebrow="Google Business Profile">
            <div style={{ width: '100%', borderRadius: 14, overflow: 'hidden', border: '1px solid var(--hairline)', height: 240, background: 'var(--bg-card)' }}>
              <iframe
                src={profile.googleBusinessEmbed}
                width="100%"
                height="100%"
                style={{ border: 0 }}
                allowFullScreen=""
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
              ></iframe>
            </div>
          </Section>
        )}

        {/* Footer — every element is a real link (brand → vakilpedia.com,
            icons → Vakilpedia's own LinkedIn / YouTube / Facebook). */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 4px 0' }}>
          <a href="https://www.vakilpedia.com" target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 9, textDecoration: 'none' }}>
            <img src="../../assets/logos/vakilpedia.png" alt="Vakilpedia" style={{ height: 22, opacity: 0.85 }} />
            <div><div style={{ fontSize: 11, color: 'var(--text-mid)' }}>Powered by <b style={{ color: 'var(--text-hi)' }}>Vakilpedia</b></div><div style={{ fontSize: 10, color: 'var(--text-dim)' }}>Your legal tech ecosystem.</div></div>
          </a>
          <div style={{ display: 'flex', gap: 8 }}>
            {[
              ['https://www.linkedin.com/company/vakilpedia/', 'Vakilpedia on LinkedIn', Icons.in(15)],
              ['https://www.youtube.com/@thevakilpedia', 'Vakilpedia on YouTube', Icons.yt(15)],
              ['https://www.facebook.com/vakilpedia', 'Vakilpedia on Facebook', Icons.fb(15)],
            ].map(([href, label, ic]) => (
              <a key={href} href={href} target="_blank" rel="noopener noreferrer" aria-label={label} title={label} style={{ width: 32, height: 32, borderRadius: 9, background: 'var(--glass-thick)', border: '1px solid var(--hairline)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-mid)', textDecoration: 'none' }}>{ic}</a>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

window.VakilCardApp = VakilCardApp;
