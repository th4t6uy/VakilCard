/* @ds-bundle: {"format":4,"namespace":"VakilpediaDesignSystem_d7e77c","components":[{"name":"Badge","sourcePath":"components/core/Badge.jsx"},{"name":"Button","sourcePath":"components/core/Button.jsx"},{"name":"Chip","sourcePath":"components/core/Chip.jsx"},{"name":"GlassCard","sourcePath":"components/core/GlassCard.jsx"},{"name":"ListRow","sourcePath":"components/data/ListRow.jsx"},{"name":"PricePlan","sourcePath":"components/data/PricePlan.jsx"},{"name":"StatCard","sourcePath":"components/data/StatCard.jsx"},{"name":"Input","sourcePath":"components/forms/Input.jsx"},{"name":"ActionTile","sourcePath":"components/vakilcard/ActionTile.jsx"},{"name":"VerifiedShield","sourcePath":"components/vakilcard/VerifiedShield.jsx"}],"sourceHashes":{"components/core/Badge.jsx":"f5064b432eac","components/core/Button.jsx":"b09d2a37e3d5","components/core/Chip.jsx":"60436a3acc6a","components/core/GlassCard.jsx":"7c35f8da4c80","components/data/ListRow.jsx":"cd9928d2c49e","components/data/PricePlan.jsx":"386a0fbe4b57","components/data/StatCard.jsx":"eb25de3f3f1f","components/forms/Input.jsx":"4313666c0084","components/vakilcard/ActionTile.jsx":"b1398d808243","components/vakilcard/VerifiedShield.jsx":"9853044a859c","ui_kits/caselinx/CaseLinxApp.jsx":"7331efc097d0","ui_kits/courtque/CourtQueApp.jsx":"e45d44c4d1fa","ui_kits/vakilcard/VakilCardApp.jsx":"5b9d92a1494c","ui_kits/vakilcard/tweaks-panel.jsx":"4f181eb354cd"},"inlinedExternals":[],"unexposedExports":[]} */

(() => {

const __ds_ns = (window.VakilpediaDesignSystem_d7e77c = window.VakilpediaDesignSystem_d7e77c || {});

const __ds_scope = {};

(__ds_ns.__errors = __ds_ns.__errors || []);

// components/core/Badge.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * Compact status pill. Semantic tones for case/billing/court states —
 * Live, Paid, Overdue, Verified, "Most Popular", etc. `dot` prepends a
 * status dot; `glow` adds a live pulse ring (use for CourtQue "Live" only).
 */
function Badge({
  children,
  tone = 'neutral',
  dot = false,
  glow = false,
  style = {},
  ...rest
}) {
  const tones = {
    neutral: {
      bg: 'var(--glass-thick)',
      fg: 'var(--text-mid)',
      bd: 'var(--hairline)'
    },
    violet: {
      bg: 'var(--glass-tint-violet)',
      fg: 'var(--violet-300)',
      bd: 'rgba(99,91,255,0.28)'
    },
    gold: {
      bg: 'var(--glass-tint-gold)',
      fg: 'var(--gold-300)',
      bd: 'rgba(224,188,116,0.30)'
    },
    success: {
      bg: 'var(--success-dim)',
      fg: 'var(--success)',
      bd: 'rgba(74,222,128,0.25)'
    },
    warning: {
      bg: 'var(--warning-dim)',
      fg: 'var(--warning)',
      bd: 'rgba(240,180,74,0.25)'
    },
    danger: {
      bg: 'var(--danger-dim)',
      fg: 'var(--danger)',
      bd: 'rgba(251,113,133,0.25)'
    },
    info: {
      bg: 'var(--info-dim)',
      fg: 'var(--info)',
      bd: 'rgba(103,184,240,0.25)'
    }
  };
  const t = tones[tone] || tones.neutral;
  return /*#__PURE__*/React.createElement("span", _extends({
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 6,
      fontFamily: 'var(--font-sans)',
      fontSize: 11,
      fontWeight: 700,
      letterSpacing: '0.04em',
      textTransform: 'uppercase',
      color: t.fg,
      background: t.bg,
      border: `1px solid ${t.bd}`,
      padding: '4px 10px',
      borderRadius: 'var(--r-pill)',
      boxShadow: glow ? 'var(--glow-live)' : 'none',
      ...style
    }
  }, rest), dot && /*#__PURE__*/React.createElement("span", {
    style: {
      width: 6,
      height: 6,
      borderRadius: '50%',
      background: t.fg
    }
  }), children);
}
Object.assign(__ds_scope, { Badge });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Badge.jsx", error: String((e && e.message) || e) }); }

// components/core/Button.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * Vakilpedia primary action button. Filled pill by default, with a
 * three-tier hierarchy (primary / secondary / tertiary) plus a `premium`
 * gold variant for VakilCard-level moments. Generous, touch-friendly.
 */
function Button({
  children,
  variant = 'primary',
  size = 'md',
  icon = null,
  iconRight = null,
  disabled = false,
  full = false,
  style = {},
  ...rest
}) {
  const sizes = {
    sm: {
      h: 40,
      px: 18,
      fs: 13
    },
    md: {
      h: 52,
      px: 24,
      fs: 15
    },
    lg: {
      h: 60,
      px: 32,
      fs: 16
    }
  };
  const s = sizes[size] || sizes.md;
  const base = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    minHeight: s.h,
    padding: `0 ${s.px}px`,
    width: full ? '100%' : 'auto',
    fontFamily: 'var(--font-sans)',
    fontSize: s.fs,
    fontWeight: 700,
    letterSpacing: '-0.01em',
    borderRadius: 'var(--r-pill)',
    border: '1px solid transparent',
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.45 : 1,
    transition: 'transform var(--dur-fast) var(--ease-out), background var(--dur-base) var(--ease-out), border-color var(--dur-base) var(--ease-out)',
    WebkitTapHighlightColor: 'transparent',
    whiteSpace: 'nowrap'
  };
  const variants = {
    primary: {
      background: 'var(--violet-500)',
      color: 'var(--on-accent)',
      boxShadow: '0 8px 24px rgba(99,91,255,0.32), inset 0 1px 0 rgba(255,255,255,0.22)'
    },
    secondary: {
      background: 'var(--glass-thick)',
      color: 'var(--text-hi)',
      borderColor: 'var(--hairline-strong)',
      backdropFilter: 'blur(12px)',
      WebkitBackdropFilter: 'blur(12px)'
    },
    tertiary: {
      background: 'transparent',
      color: 'var(--violet-400)',
      padding: `0 6px`,
      minHeight: s.h
    },
    premium: {
      background: 'linear-gradient(135deg, var(--gold-300), var(--gold-500))',
      color: '#231a08',
      boxShadow: '0 8px 24px rgba(224,188,116,0.30), inset 0 1px 0 rgba(255,255,255,0.4)'
    }
  };
  const onDown = e => {
    if (!disabled) e.currentTarget.style.transform = 'scale(var(--press-scale))';
  };
  const onUp = e => {
    e.currentTarget.style.transform = 'scale(1)';
  };
  return /*#__PURE__*/React.createElement("button", _extends({
    style: {
      ...base,
      ...variants[variant],
      ...style
    },
    disabled: disabled,
    onMouseDown: onDown,
    onMouseUp: onUp,
    onMouseLeave: onUp
  }, rest), icon, children, iconRight);
}
Object.assign(__ds_scope, { Button });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Button.jsx", error: String((e && e.message) || e) }); }

// components/core/Chip.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * Practice-area / filter chip. Premium over pills: generous touch size,
 * glass fill, wraps naturally. `active` promotes it to the violet state.
 */
function Chip({
  children,
  active = false,
  onClick,
  style = {},
  ...rest
}) {
  return /*#__PURE__*/React.createElement("button", _extends({
    onClick: onClick,
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 8,
      minHeight: 40,
      padding: '0 16px',
      fontFamily: 'var(--font-sans)',
      fontSize: 13,
      fontWeight: 600,
      color: active ? 'var(--violet-300)' : 'var(--text-mid)',
      background: active ? 'var(--glass-tint-violet)' : 'var(--glass)',
      border: `1px solid ${active ? 'rgba(99,91,255,0.35)' : 'var(--hairline)'}`,
      borderRadius: 'var(--r-pill)',
      backdropFilter: 'blur(10px)',
      WebkitBackdropFilter: 'blur(10px)',
      cursor: onClick ? 'pointer' : 'default',
      transition: 'background var(--dur-base) var(--ease-out), border-color var(--dur-base) var(--ease-out)',
      WebkitTapHighlightColor: 'transparent',
      ...style
    }
  }, rest), children);
}
Object.assign(__ds_scope, { Chip });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Chip.jsx", error: String((e && e.message) || e) }); }

// components/core/GlassCard.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * The defining Vakilpedia surface. A floating Liquid Glass panel:
 * translucent fill, backdrop blur, a lit top edge and a deep soft shadow.
 * `tone` shifts the fill; `float` adds hover lift for genuinely clickable cards.
 */
function GlassCard({
  children,
  tone = 'glass',
  radius = 'xl',
  pad = 24,
  float = false,
  style = {},
  ...rest
}) {
  const fills = {
    glass: 'var(--glass)',
    thick: 'var(--glass-thick)',
    thin: 'var(--glass-thin)',
    violet: 'var(--glass-tint-violet)',
    gold: 'var(--glass-tint-gold)',
    solid: 'var(--surface-3)'
  };
  const base = {
    background: fills[tone] || fills.glass,
    backdropFilter: 'blur(20px)',
    WebkitBackdropFilter: 'blur(20px)',
    border: '1px solid var(--border-card)',
    borderRadius: `var(--r-${radius})`,
    boxShadow: 'var(--shadow-card), var(--inset-edge-soft)',
    padding: typeof pad === 'number' ? pad : pad,
    transition: 'transform var(--dur-base) var(--ease-out), box-shadow var(--dur-base) var(--ease-out)'
  };
  const hover = float ? {
    onMouseEnter: e => {
      e.currentTarget.style.transform = 'translateY(var(--hover-lift))';
      e.currentTarget.style.boxShadow = 'var(--shadow-lg), var(--inset-edge-soft)';
    },
    onMouseLeave: e => {
      e.currentTarget.style.transform = 'translateY(0)';
      e.currentTarget.style.boxShadow = 'var(--shadow-card), var(--inset-edge-soft)';
    }
  } : {};
  return /*#__PURE__*/React.createElement("div", _extends({
    style: {
      ...base,
      ...style
    }
  }, hover, rest), children);
}
Object.assign(__ds_scope, { GlassCard });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/GlassCard.jsx", error: String((e && e.message) || e) }); }

// components/data/ListRow.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * A single case / invoice / cause-list row. Bold title, muted mono meta,
 * optional trailing node (date badge, amount + status). Glass hover optional.
 */
function ListRow({
  title,
  meta,
  trailing,
  mono = true,
  onClick,
  style = {},
  ...rest
}) {
  return /*#__PURE__*/React.createElement("div", _extends({
    onClick: onClick,
    style: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 14,
      padding: '12px 16px',
      background: 'var(--glass-thin)',
      border: '1px solid var(--hairline)',
      borderRadius: 'var(--r-md)',
      fontFamily: 'var(--font-sans)',
      cursor: onClick ? 'pointer' : 'default',
      transition: 'background var(--dur-base) var(--ease-out)',
      ...style
    },
    onMouseEnter: onClick ? e => e.currentTarget.style.background = 'var(--glass-thick)' : undefined,
    onMouseLeave: onClick ? e => e.currentTarget.style.background = 'var(--glass-thin)' : undefined
  }, rest), /*#__PURE__*/React.createElement("div", {
    style: {
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 14,
      fontWeight: 700,
      color: 'var(--text-hi)',
      letterSpacing: '-0.01em',
      whiteSpace: 'nowrap',
      overflow: 'hidden',
      textOverflow: 'ellipsis'
    }
  }, title), meta && /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      color: 'var(--text-low)',
      marginTop: 3,
      fontFamily: mono ? 'var(--font-mono)' : 'var(--font-sans)',
      whiteSpace: 'nowrap',
      overflow: 'hidden',
      textOverflow: 'ellipsis'
    }
  }, meta)), trailing && /*#__PURE__*/React.createElement("div", {
    style: {
      flexShrink: 0,
      display: 'flex',
      alignItems: 'center',
      gap: 10
    }
  }, trailing));
}
Object.assign(__ds_scope, { ListRow });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/data/ListRow.jsx", error: String((e && e.message) || e) }); }

// components/data/PricePlan.jsx
try { (() => {
/**
 * Pricing tier card (CourtQue / CaseLinx). Highlighted tier inverts to a
 * near-black glass slab with gold price. Feature list with check marks.
 */
function PricePlan({
  name,
  price,
  period,
  features = [],
  badge,
  highlight = false,
  cta = 'Get Started',
  onCta,
  style = {}
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative',
      display: 'flex',
      flexDirection: 'column',
      background: highlight ? 'linear-gradient(160deg, var(--surface-3), var(--surface))' : 'var(--glass)',
      border: `1px solid ${highlight ? 'rgba(224,188,116,0.28)' : 'var(--hairline)'}`,
      borderRadius: 'var(--r-xl)',
      padding: 24,
      boxShadow: highlight ? 'var(--shadow-lg), var(--inset-edge)' : 'var(--inset-edge-soft)',
      fontFamily: 'var(--font-sans)',
      ...style
    }
  }, badge && /*#__PURE__*/React.createElement("span", {
    style: {
      position: 'absolute',
      top: -11,
      left: 20
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.Badge, {
    tone: highlight ? 'gold' : 'violet'
  }, badge)), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 16,
      fontWeight: 800,
      letterSpacing: '-0.02em',
      color: 'var(--text-hi)',
      marginBottom: 6
    }
  }, name), /*#__PURE__*/React.createElement("div", {
    style: {
      marginBottom: 18
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 30,
      fontWeight: 900,
      letterSpacing: '-0.03em',
      color: highlight ? 'var(--gold-400)' : 'var(--violet-400)'
    }
  }, price), period && /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 13,
      color: 'var(--text-low)'
    }
  }, " ", period)), /*#__PURE__*/React.createElement("ul", {
    style: {
      listStyle: 'none',
      margin: 0,
      padding: '16px 0 0',
      borderTop: '1px solid var(--divider)',
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      gap: 11
    }
  }, features.map(f => /*#__PURE__*/React.createElement("li", {
    key: f,
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 9,
      fontSize: 13,
      color: 'var(--text-mid)'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      color: highlight ? 'var(--gold-400)' : 'var(--violet-400)',
      flexShrink: 0,
      fontWeight: 700
    }
  }, "\u2713"), f))), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 20
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.Button, {
    variant: highlight ? 'premium' : 'secondary',
    full: true,
    onClick: onCta
  }, cta)));
}
Object.assign(__ds_scope, { PricePlan });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/data/PricePlan.jsx", error: String((e && e.message) || e) }); }

// components/data/StatCard.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * Dashboard metric tile. Overline label + large value, tinted per tone.
 * Used across CaseLinx / CourtQue dashboards ("Today · 3", "Outstanding · ₹84,500").
 */
function StatCard({
  label,
  value,
  tone = 'violet',
  sub,
  style = {},
  ...rest
}) {
  const tones = {
    violet: 'var(--violet-400)',
    gold: 'var(--gold-400)',
    success: 'var(--success)',
    danger: 'var(--danger)',
    info: 'var(--info)',
    neutral: 'var(--text-hi)'
  };
  return /*#__PURE__*/React.createElement("div", _extends({
    style: {
      background: 'var(--glass)',
      border: '1px solid var(--hairline)',
      borderRadius: 'var(--r-lg)',
      padding: '16px 18px',
      boxShadow: 'var(--inset-edge-soft)',
      fontFamily: 'var(--font-sans)',
      ...style
    }
  }, rest), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 10,
      fontWeight: 800,
      letterSpacing: '0.14em',
      textTransform: 'uppercase',
      color: 'var(--text-low)',
      marginBottom: 8
    }
  }, label), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 28,
      fontWeight: 900,
      letterSpacing: '-0.03em',
      color: tones[tone] || tones.violet,
      lineHeight: 1
    }
  }, value), sub && /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      color: 'var(--text-dim)',
      marginTop: 6
    }
  }, sub));
}
Object.assign(__ds_scope, { StatCard });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/data/StatCard.jsx", error: String((e && e.message) || e) }); }

// components/forms/Input.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const {
  useState
} = React;
/**
 * Text input on dark glass. Rounded, generous height, soft violet focus ring.
 * Supports an optional leading icon and label. Mobile-first touch height.
 */
function Input({
  label,
  icon = null,
  type = 'text',
  hint,
  style = {},
  ...rest
}) {
  const [focus, setFocus] = useState(false);
  return /*#__PURE__*/React.createElement("label", {
    style: {
      display: 'block',
      fontFamily: 'var(--font-sans)'
    }
  }, label && /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'block',
      fontSize: 11,
      fontWeight: 700,
      letterSpacing: '0.02em',
      color: 'var(--text-low)',
      marginBottom: 8,
      textTransform: 'uppercase'
    }
  }, label), /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      minHeight: 52,
      padding: '0 16px',
      background: 'var(--glass)',
      border: `1px solid ${focus ? 'var(--violet-400)' : 'var(--hairline)'}`,
      borderRadius: 'var(--r-md)',
      boxShadow: focus ? 'var(--ring)' : 'none',
      transition: 'border-color var(--dur-base) var(--ease-out), box-shadow var(--dur-base) var(--ease-out)'
    }
  }, icon && /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--text-low)',
      display: 'flex'
    }
  }, icon), /*#__PURE__*/React.createElement("input", _extends({
    type: type,
    onFocus: () => setFocus(true),
    onBlur: () => setFocus(false),
    style: {
      flex: 1,
      minWidth: 0,
      background: 'transparent',
      border: 'none',
      outline: 'none',
      color: 'var(--text-hi)',
      fontFamily: 'var(--font-sans)',
      fontSize: 15,
      fontWeight: 500,
      ...style
    }
  }, rest))), hint && /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'block',
      fontSize: 12,
      color: 'var(--text-dim)',
      marginTop: 6
    }
  }, hint));
}
Object.assign(__ds_scope, { Input });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Input.jsx", error: String((e && e.message) || e) }); }

// components/vakilcard/ActionTile.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * The VakilCard hero pattern: a large glass action tile. Big outline icon,
 * primary label, optional sublabel. Generous 88px+ touch target, soft press.
 * Icon inherits `tone` colour. This is the signature "premium tile over icon
 * button" from the VakilCard brief.
 */
function ActionTile({
  icon,
  label,
  sublabel,
  tone = 'violet',
  onClick,
  style = {},
  ...rest
}) {
  const tones = {
    violet: 'var(--violet-400)',
    gold: 'var(--gold-400)',
    success: 'var(--success)',
    info: 'var(--info)',
    neutral: 'var(--text-hi)'
  };
  const press = (e, v) => {
    e.currentTarget.style.transform = v;
  };
  return /*#__PURE__*/React.createElement("button", _extends({
    onClick: onClick,
    onMouseDown: e => press(e, 'scale(var(--press-scale))'),
    onMouseUp: e => press(e, 'scale(1)'),
    onMouseLeave: e => press(e, 'scale(1)'),
    style: {
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      minHeight: 92,
      padding: '11px 7px',
      width: '100%',
      background: 'var(--glass)',
      border: '1px solid var(--hairline)',
      borderRadius: 'var(--r-lg)',
      boxShadow: 'var(--inset-edge-soft)',
      backdropFilter: 'blur(14px)',
      WebkitBackdropFilter: 'blur(14px)',
      cursor: 'pointer',
      fontFamily: 'var(--font-sans)',
      color: 'var(--text-hi)',
      transition: 'transform var(--dur-fast) var(--ease-out), background var(--dur-base) var(--ease-out)',
      WebkitTapHighlightColor: 'transparent',
      ...style
    },
    onMouseEnter: e => e.currentTarget.style.background = 'var(--glass-thick)'
  }, rest), /*#__PURE__*/React.createElement("span", {
    style: {
      color: tones[tone] || tones.violet,
      display: 'flex'
    }
  }, icon), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 14,
      fontWeight: 700,
      letterSpacing: '-0.01em',
      textAlign: 'center',
      lineHeight: 1.15
    }
  }, label), sublabel && /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 11.5,
      color: 'var(--text-low)',
      fontWeight: 500
    }
  }, sublabel));
}
Object.assign(__ds_scope, { ActionTile });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/vakilcard/ActionTile.jsx", error: String((e && e.message) || e) }); }

// components/vakilcard/VerifiedShield.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * "Verified by Vakilpedia" trust marker — a violet shield tick with label.
 * Appears on VakilCard and any surface asserting verified lawyer identity.
 */
function VerifiedShield({
  label = 'Verified by Vakilpedia',
  size = 'md',
  style = {},
  ...rest
}) {
  const fs = size === 'sm' ? 11 : 13;
  const ic = size === 'sm' ? 14 : 17;
  return /*#__PURE__*/React.createElement("span", _extends({
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 7,
      fontFamily: 'var(--font-sans)',
      fontSize: fs,
      fontWeight: 600,
      color: 'var(--text-mid)',
      ...style
    }
  }, rest), /*#__PURE__*/React.createElement("svg", {
    width: ic,
    height: ic,
    viewBox: "0 0 24 24",
    fill: "none",
    style: {
      flexShrink: 0
    }
  }, /*#__PURE__*/React.createElement("path", {
    d: "M12 2l7 3v6c0 4.5-3 8-7 11-4-3-7-6.5-7-11V5l7-3z",
    fill: "var(--violet-500)",
    stroke: "var(--violet-400)",
    strokeWidth: "1"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M8.5 12.2l2.3 2.3 4.5-4.6",
    stroke: "#fff",
    strokeWidth: "2",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  })), label);
}
Object.assign(__ds_scope, { VerifiedShield });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/vakilcard/VerifiedShield.jsx", error: String((e && e.message) || e) }); }

// ui_kits/caselinx/CaseLinxApp.jsx
try { (() => {
/* CaseLinx — the Litigation Operating System. Desktop practice dashboard.
   Composes Vakilpedia DS components over the graphite glass environment. */
const {
  Button,
  Badge,
  GlassCard,
  StatCard,
  ListRow,
  Chip
} = window.VakilpediaDesignSystem_d7e77c;
const Svg = ({
  d,
  s = 20
}) => /*#__PURE__*/React.createElement("svg", {
  width: s,
  height: s,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: "1.7",
  strokeLinecap: "round",
  strokeLinejoin: "round"
}, d);
const I = {
  grid: p => /*#__PURE__*/React.createElement(Svg, {
    s: p,
    d: /*#__PURE__*/React.createElement("g", null, /*#__PURE__*/React.createElement("rect", {
      x: "3",
      y: "3",
      width: "7",
      height: "7",
      rx: "1.5"
    }), /*#__PURE__*/React.createElement("rect", {
      x: "14",
      y: "3",
      width: "7",
      height: "7",
      rx: "1.5"
    }), /*#__PURE__*/React.createElement("rect", {
      x: "3",
      y: "14",
      width: "7",
      height: "7",
      rx: "1.5"
    }), /*#__PURE__*/React.createElement("rect", {
      x: "14",
      y: "14",
      width: "7",
      height: "7",
      rx: "1.5"
    }))
  }),
  cal: p => /*#__PURE__*/React.createElement(Svg, {
    s: p,
    d: /*#__PURE__*/React.createElement("g", null, /*#__PURE__*/React.createElement("rect", {
      x: "3",
      y: "4",
      width: "18",
      height: "18",
      rx: "3"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M16 2v4M8 2v4M3 10h18"
    }))
  }),
  list: p => /*#__PURE__*/React.createElement(Svg, {
    s: p,
    d: /*#__PURE__*/React.createElement("g", null, /*#__PURE__*/React.createElement("path", {
      d: "M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"
    }))
  }),
  receipt: p => /*#__PURE__*/React.createElement(Svg, {
    s: p,
    d: /*#__PURE__*/React.createElement("g", null, /*#__PURE__*/React.createElement("path", {
      d: "M4 3v18l2-1 2 1 2-1 2 1 2-1 2 1 2-1V3l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M8 9h8M8 13h6"
    }))
  }),
  folder: p => /*#__PURE__*/React.createElement(Svg, {
    s: p,
    d: /*#__PURE__*/React.createElement("path", {
      d: "M4 5h5l2 2h9v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z"
    })
  }),
  users: p => /*#__PURE__*/React.createElement(Svg, {
    s: p,
    d: /*#__PURE__*/React.createElement("g", null, /*#__PURE__*/React.createElement("circle", {
      cx: "9",
      cy: "8",
      r: "3"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M3 20c0-3 3-5 6-5s6 2 6 5M16 6a3 3 0 0 1 0 6M18 20c0-2-1-3.5-2.5-4.3"
    }))
  }),
  sign: p => /*#__PURE__*/React.createElement(Svg, {
    s: p,
    d: /*#__PURE__*/React.createElement("g", null, /*#__PURE__*/React.createElement("path", {
      d: "M3 17c3 0 3-4 6-4s3 4 6 4M15 6l3 3-8 8H7v-3l8-8Z"
    }))
  }),
  bell: p => /*#__PURE__*/React.createElement(Svg, {
    s: p,
    d: /*#__PURE__*/React.createElement("g", null, /*#__PURE__*/React.createElement("path", {
      d: "M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0"
    }))
  }),
  search: p => /*#__PURE__*/React.createElement(Svg, {
    s: p,
    d: /*#__PURE__*/React.createElement("g", null, /*#__PURE__*/React.createElement("circle", {
      cx: "11",
      cy: "11",
      r: "7"
    }), /*#__PURE__*/React.createElement("path", {
      d: "m20 20-3.5-3.5"
    }))
  }),
  plus: p => /*#__PURE__*/React.createElement(Svg, {
    s: p,
    d: /*#__PURE__*/React.createElement("path", {
      d: "M12 5v14M5 12h14"
    })
  }),
  print: p => /*#__PURE__*/React.createElement(Svg, {
    s: p,
    d: /*#__PURE__*/React.createElement("g", null, /*#__PURE__*/React.createElement("path", {
      d: "M6 9V3h12v6M6 18H4a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2M6 14h12v7H6z"
    }))
  }),
  chev: p => /*#__PURE__*/React.createElement(Svg, {
    s: p,
    d: /*#__PURE__*/React.createElement("path", {
      d: "M9 6l6 6-6 6"
    })
  }),
  sun: p => /*#__PURE__*/React.createElement(Svg, {
    s: p,
    d: /*#__PURE__*/React.createElement("g", null, /*#__PURE__*/React.createElement("circle", {
      cx: "12",
      cy: "12",
      r: "4"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M12 2v2M12 20v2M4 12H2M22 12h-2M5 5l1.5 1.5M17.5 17.5 19 19M19 5l-1.5 1.5M6.5 17.5 5 19"
    }))
  }),
  moon: p => /*#__PURE__*/React.createElement(Svg, {
    s: p,
    d: /*#__PURE__*/React.createElement("path", {
      d: "M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z"
    })
  })
};
const NAV = [['Dashboard', I.grid, true], ['Cause List', I.list], ['Calendar', I.cal], ['Invoices', I.receipt], ['Vakalatnama', I.sign], ['Documents', I.folder], ['Team', I.users]];
function Sidebar() {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      width: 236,
      flexShrink: 0,
      background: 'var(--glass-frost)',
      backdropFilter: 'blur(24px)',
      WebkitBackdropFilter: 'blur(24px)',
      borderRight: '1px solid var(--hairline)',
      padding: '22px 16px',
      display: 'flex',
      flexDirection: 'column'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      padding: '0 6px 22px'
    }
  }, /*#__PURE__*/React.createElement("img", {
    src: "../../assets/products/caselinx.png",
    alt: "",
    style: {
      width: 34,
      height: 34,
      borderRadius: 9
    }
  }), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 17,
      fontWeight: 800,
      letterSpacing: '-0.03em',
      color: 'var(--text-hi)'
    }
  }, "CaseLinx"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 9,
      fontWeight: 700,
      letterSpacing: '0.14em',
      color: 'var(--violet-400)',
      textTransform: 'uppercase'
    }
  }, "Litigation OS"))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 3,
      flex: 1
    }
  }, NAV.map(([label, icon, active]) => /*#__PURE__*/React.createElement("div", {
    key: label,
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      padding: '11px 12px',
      borderRadius: 12,
      fontSize: 14,
      fontWeight: active ? 700 : 500,
      color: active ? 'var(--text-hi)' : 'var(--text-low)',
      background: active ? 'var(--glass-tint-violet)' : 'transparent',
      border: `1px solid ${active ? 'rgba(99,91,255,0.22)' : 'transparent'}`,
      cursor: 'pointer'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      color: active ? 'var(--violet-400)' : 'var(--text-dim)'
    }
  }, icon(19)), label))), /*#__PURE__*/React.createElement(GlassCard, {
    tone: "thin",
    radius: "lg",
    pad: 14,
    style: {
      marginTop: 12
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      fontWeight: 700,
      color: 'var(--text-hi)'
    }
  }, "Sidharth Gautam Law Chambers"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      color: 'var(--text-low)',
      marginTop: 2
    }
  }, "New Delhi \xB7 3 seats")));
}
function CaseLinxApp() {
  const [theme, setTheme] = React.useState('dark');
  React.useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);
  const cases = [['Yadav v. State of MP', 'WP 4521/2025 · Jabalpur · Court 8', /*#__PURE__*/React.createElement(Badge, {
    tone: "success"
  }, "Today")], ['Sharma Builders v. Verma', 'FA 1102/2024 · Indore · Court 3', /*#__PURE__*/React.createElement(Badge, {
    tone: "neutral"
  }, "Tomorrow")], ['Patel v. Union of India', 'WP 990/2025 · Gwalior · Court 6', /*#__PURE__*/React.createElement(Badge, {
    tone: "neutral"
  }, "22 Jun")], ['Mishra v. Mishra', 'CS 214/2023 · Jabalpur · Court 8', /*#__PURE__*/React.createElement(Badge, {
    tone: "neutral"
  }, "24 Jun")]];
  const invoices = [['INV-0042 · Yadav v. State of MP', 'Rs. 12,000', /*#__PURE__*/React.createElement(Badge, {
    tone: "info"
  }, "Sent")], ['INV-0041 · Sharma Builders', 'Rs. 8,500', /*#__PURE__*/React.createElement(Badge, {
    tone: "success"
  }, "Paid")], ['INV-0039 · Patel Family Trust', 'Rs. 15,000', /*#__PURE__*/React.createElement(Badge, {
    tone: "danger"
  }, "Overdue")]];
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      width: '100%',
      height: '100%',
      background: 'radial-gradient(circle at 85% 6%, rgba(224,188,116,0.08), transparent 40%), radial-gradient(circle at 8% 90%, rgba(99,91,255,0.12), transparent 42%), var(--bg-app)',
      fontFamily: 'var(--font-sans)',
      overflow: 'hidden'
    }
  }, /*#__PURE__*/React.createElement(Sidebar, null), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      flexShrink: 0,
      display: 'flex',
      alignItems: 'center',
      gap: 16,
      padding: '16px 28px',
      borderBottom: '1px solid var(--hairline)',
      background: 'var(--glass-thin)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 20,
      fontWeight: 800,
      letterSpacing: '-0.02em',
      color: 'var(--text-hi)'
    }
  }, "Good morning, Adv. Doe"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13,
      color: 'var(--text-low)',
      fontFamily: 'var(--font-serif)',
      fontStyle: 'italic'
    }
  }, "Where the machine follows the lawyer.")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      minWidth: 240,
      padding: '0 14px',
      height: 44,
      background: 'var(--glass)',
      border: '1px solid var(--hairline)',
      borderRadius: 'var(--r-pill)',
      color: 'var(--text-dim)'
    }
  }, I.search(17), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 13
    }
  }, "Search cases, parties, WP no.\u2026")), /*#__PURE__*/React.createElement("button", {
    style: {
      width: 44,
      height: 44,
      borderRadius: '50%',
      background: 'var(--glass)',
      border: '1px solid var(--hairline)',
      color: 'var(--text-mid)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      cursor: 'pointer'
    },
    onClick: () => setTheme(t => t === 'dark' ? 'light' : 'dark'),
    "aria-label": "Toggle theme"
  }, theme === 'dark' ? I.sun(18) : I.moon(18)), /*#__PURE__*/React.createElement("button", {
    style: {
      width: 44,
      height: 44,
      borderRadius: '50%',
      background: 'var(--glass)',
      border: '1px solid var(--hairline)',
      color: 'var(--text-mid)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      cursor: 'pointer',
      position: 'relative'
    }
  }, I.bell(18), /*#__PURE__*/React.createElement("span", {
    style: {
      position: 'absolute',
      top: 9,
      right: 10,
      width: 7,
      height: 7,
      borderRadius: '50%',
      background: 'var(--danger)'
    }
  })), /*#__PURE__*/React.createElement(Button, {
    variant: "primary",
    icon: I.plus(16)
  }, "New Case")), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      overflowY: 'auto',
      padding: '24px 28px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: 'repeat(4,1fr)',
      gap: 14,
      marginBottom: 22
    }
  }, /*#__PURE__*/React.createElement(StatCard, {
    label: "Listed Today",
    value: "3",
    tone: "violet",
    sub: "across 2 courts"
  }), /*#__PURE__*/React.createElement(StatCard, {
    label: "This Week",
    value: "11",
    tone: "info",
    sub: "hearings"
  }), /*#__PURE__*/React.createElement(StatCard, {
    label: "Needs Attention",
    value: "2",
    tone: "danger",
    sub: "filing due"
  }), /*#__PURE__*/React.createElement(StatCard, {
    label: "Active Matters",
    value: "47",
    tone: "gold",
    sub: "live cases"
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '1.4fr 1fr',
      gap: 18
    }
  }, /*#__PURE__*/React.createElement(GlassCard, {
    tone: "glass",
    radius: "xl",
    pad: 20
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 16
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 16,
      fontWeight: 800,
      color: 'var(--text-hi)',
      letterSpacing: '-0.01em'
    }
  }, "Cause List"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      color: 'var(--text-low)'
    }
  }, "Tuesday, 17 June 2026")), /*#__PURE__*/React.createElement(Button, {
    variant: "secondary",
    size: "sm",
    icon: I.print(15)
  }, "Print")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 9
    }
  }, cases.map(([t, m, tr]) => /*#__PURE__*/React.createElement(ListRow, {
    key: t,
    title: t,
    meta: m,
    trailing: tr,
    onClick: () => {}
  })))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 18
    }
  }, /*#__PURE__*/React.createElement(GlassCard, {
    tone: "glass",
    radius: "xl",
    pad: 20
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 16,
      fontWeight: 800,
      color: 'var(--text-hi)',
      marginBottom: 14,
      letterSpacing: '-0.01em'
    }
  }, "Billing"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: 12,
      marginBottom: 16
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      padding: 14,
      borderRadius: 14,
      background: 'var(--danger-dim)',
      border: '1px solid rgba(251,113,133,0.2)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 10,
      fontWeight: 800,
      letterSpacing: '0.1em',
      textTransform: 'uppercase',
      color: 'var(--danger)'
    }
  }, "Outstanding"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 20,
      fontWeight: 900,
      color: 'var(--text-hi)',
      marginTop: 4
    }
  }, "Rs. 84,500")), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: 14,
      borderRadius: 14,
      background: 'var(--success-dim)',
      border: '1px solid rgba(74,222,128,0.2)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 10,
      fontWeight: 800,
      letterSpacing: '0.1em',
      textTransform: 'uppercase',
      color: 'var(--success)'
    }
  }, "Paid / mo"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 20,
      fontWeight: 900,
      color: 'var(--text-hi)',
      marginTop: 4
    }
  }, "Rs. 1,42,000"))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 8
    }
  }, invoices.map(([t, amt, st]) => /*#__PURE__*/React.createElement(ListRow, {
    key: t,
    title: t,
    mono: false,
    trailing: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 13,
        fontWeight: 700,
        color: 'var(--text-mid)'
      }
    }, amt), st)
  })))), /*#__PURE__*/React.createElement(GlassCard, {
    tone: "violet",
    radius: "xl",
    pad: 20,
    float: true
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 12
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--violet-400)'
    }
  }, I.sign(24)), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 14,
      fontWeight: 700,
      color: 'var(--text-hi)'
    }
  }, "Send a Vakalatnama"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      color: 'var(--text-low)'
    }
  }, "Client e-signs remotely \u2014 no printout.")), /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--text-dim)'
    }
  }, I.chev(18)))))))));
}
window.CaseLinxApp = CaseLinxApp;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/caselinx/CaseLinxApp.jsx", error: String((e && e.message) || e) }); }

// ui_kits/courtque/CourtQueApp.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/* CourtQue — live cause-list tracking with WhatsApp alerts. Mobile.
   Reads the live court display board; alerts when your matter is near. */
const {
  Button,
  Badge,
  GlassCard,
  StatCard,
  Input,
  PricePlan
} = window.VakilpediaDesignSystem_d7e77c;
const Svg = ({
  d,
  s = 20
}) => /*#__PURE__*/React.createElement("svg", {
  width: s,
  height: s,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: "1.8",
  strokeLinecap: "round",
  strokeLinejoin: "round"
}, d);
const I = {
  bell: p => /*#__PURE__*/React.createElement(Svg, {
    s: p,
    d: /*#__PURE__*/React.createElement("g", null, /*#__PURE__*/React.createElement("path", {
      d: "M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0"
    }))
  }),
  wa: p => /*#__PURE__*/React.createElement(Svg, {
    s: p,
    d: /*#__PURE__*/React.createElement("path", {
      d: "M3 21l1.6-4.8A8 8 0 1 1 8 20.1L3 21Z"
    })
  }),
  sun: p => /*#__PURE__*/React.createElement(Svg, {
    s: p,
    d: /*#__PURE__*/React.createElement("g", null, /*#__PURE__*/React.createElement("circle", {
      cx: "12",
      cy: "12",
      r: "4"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M12 2v2M12 20v2M4 12H2M22 12h-2M5 5l1.5 1.5M17.5 17.5 19 19M19 5l-1.5 1.5M6.5 17.5 5 19"
    }))
  }),
  moon: p => /*#__PURE__*/React.createElement(Svg, {
    s: p,
    d: /*#__PURE__*/React.createElement("path", {
      d: "M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z"
    })
  }),
  check: p => /*#__PURE__*/React.createElement(Svg, {
    s: p,
    d: /*#__PURE__*/React.createElement("path", {
      d: "M20 6 9 17l-5-5"
    })
  })
};
const COURTS = [{
  court: 'Court 8 · Jabalpur',
  judge: 'Hon. Justice A. Shrivastava',
  sr: 84,
  msg: null
}, {
  court: 'Court 3 · Indore',
  judge: 'Hon. Justice R. Kumar',
  sr: 172,
  msg: null
}, {
  court: 'Court 6 · Gwalior',
  judge: 'Hon. Justice S. Pathak',
  sr: 41,
  msg: 'Bench rises at 1:30 PM'
}, {
  court: 'Court 1 · Principal',
  judge: 'Hon. Chief Justice',
  sr: 209,
  msg: null
}];
function CourtCard({
  c
}) {
  return /*#__PURE__*/React.createElement(GlassCard, {
    tone: "glass",
    radius: "lg",
    pad: 16
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'flex-start',
      justifyContent: 'space-between'
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      fontWeight: 700,
      letterSpacing: '0.06em',
      textTransform: 'uppercase',
      color: 'var(--text-low)'
    }
  }, c.court), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 30,
      fontWeight: 900,
      letterSpacing: '-0.03em',
      color: 'var(--text-hi)',
      marginTop: 2
    }
  }, "Sr. ", c.sr)), /*#__PURE__*/React.createElement(Badge, {
    tone: "success",
    dot: true,
    glow: true
  }, "Live")), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      color: 'var(--text-mid)',
      marginTop: 8
    }
  }, c.judge), c.msg && /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      color: 'var(--warning)',
      background: 'var(--warning-dim)',
      border: '1px solid rgba(224,152,44,0.2)',
      borderRadius: 10,
      padding: '6px 10px',
      marginTop: 8
    }
  }, c.msg));
}
function CourtQueApp() {
  const [theme, setTheme] = React.useState('dark');
  React.useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);
  const [courts, setCourts] = React.useState(COURTS);
  const [done, setDone] = React.useState(false);
  React.useEffect(() => {
    const t = setInterval(() => setCourts(cs => cs.map(c => Math.random() > 0.5 ? {
      ...c,
      sr: c.sr + 1
    } : c)), 2600);
    return () => clearInterval(t);
  }, []);
  const plans = [{
    name: 'Standard',
    price: '₹299',
    period: '/mo',
    badge: 'Most Popular',
    highlight: true,
    features: ['Unlimited alerts', 'All MP courts', 'Single user']
  }, {
    name: 'Clerk Plan',
    price: '₹499',
    period: '/mo',
    features: ['Lawyer + Munshi access', 'Shared case list', 'Alert management']
  }, {
    name: 'Day Pack',
    price: '₹20',
    period: '/day',
    features: ['3 alerts / day', 'Any court', 'WhatsApp alert']
  }];
  return /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative',
      width: '100%',
      maxWidth: 412,
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      background: 'var(--atmo-violet), var(--atmo-gold), var(--bg-void)',
      overflow: 'hidden',
      fontFamily: 'var(--font-sans)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      flexShrink: 0,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '14px 18px',
      background: 'var(--glass-frost)',
      backdropFilter: 'blur(20px)',
      WebkitBackdropFilter: 'blur(20px)',
      borderBottom: '1px solid var(--hairline)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 9
    }
  }, /*#__PURE__*/React.createElement("img", {
    src: "../../assets/products/courtque.png",
    alt: "",
    style: {
      width: 30,
      height: 30,
      borderRadius: 8
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 18,
      fontWeight: 800,
      letterSpacing: '-0.03em',
      color: 'var(--text-hi)'
    }
  }, "CourtQue")), /*#__PURE__*/React.createElement("button", {
    onClick: () => setTheme(t => t === 'dark' ? 'light' : 'dark'),
    "aria-label": "Toggle theme",
    style: {
      width: 40,
      height: 40,
      borderRadius: 12,
      background: 'var(--glass-thick)',
      border: '1px solid var(--hairline)',
      color: 'var(--text-hi)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      cursor: 'pointer'
    }
  }, theme === 'dark' ? I.sun(18) : I.moon(18))), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      overflowY: 'auto',
      padding: '18px 16px 28px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      marginBottom: 8
    }
  }, /*#__PURE__*/React.createElement(Badge, {
    tone: "success",
    dot: true,
    glow: true
  }, "Live Testing"), /*#__PURE__*/React.createElement(Badge, {
    tone: "neutral"
  }, "WhatsApp alerts active")), /*#__PURE__*/React.createElement("h1", {
    style: {
      margin: '4px 0 6px',
      fontSize: 26,
      fontWeight: 900,
      letterSpacing: '-0.03em',
      color: 'var(--text-hi)',
      lineHeight: 1.1
    }
  }, "Know the moment your matter is near."), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: '0 0 18px',
      fontSize: 14,
      color: 'var(--text-mid)',
      lineHeight: 1.6
    }
  }, "CourtQue reads the live MPHC display board and alerts you on WhatsApp when your case is 5 away \u2014 and again when it's called."), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      margin: '4px 2px 12px'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 11,
      fontWeight: 800,
      letterSpacing: '0.16em',
      textTransform: 'uppercase',
      color: 'var(--violet-400)'
    }
  }, "Live Court Board"), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 11,
      color: 'var(--text-dim)'
    }
  }, "auto-refresh \xB7 20s")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: 10,
      marginBottom: 20
    }
  }, courts.map(c => /*#__PURE__*/React.createElement(CourtCard, {
    key: c.court,
    c: c
  }))), /*#__PURE__*/React.createElement(GlassCard, {
    tone: "glass",
    radius: "xl",
    pad: 20,
    style: {
      marginBottom: 20
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      marginBottom: 14
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--violet-400)'
    }
  }, I.bell(20)), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 16,
      fontWeight: 800,
      color: 'var(--text-hi)'
    }
  }, "Activate a Test Alert")), done ? /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      padding: 14,
      borderRadius: 14,
      background: 'var(--success-dim)',
      border: '1px solid rgba(53,195,119,0.25)'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--success)'
    }
  }, I.check(22)), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 14,
      fontWeight: 700,
      color: 'var(--text-hi)'
    }
  }, "Tracking is active."), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      color: 'var(--text-low)'
    }
  }, "You'll get a WhatsApp confirmation shortly."))) : /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 10
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: 10
    }
  }, /*#__PURE__*/React.createElement(Input, {
    label: "Court no.",
    placeholder: "e.g. 8"
  }), /*#__PURE__*/React.createElement(Input, {
    label: "Item no.",
    placeholder: "e.g. 91"
  })), /*#__PURE__*/React.createElement(Input, {
    label: "WhatsApp number",
    placeholder: "10-digit mobile",
    icon: I.wa(16)
  }), /*#__PURE__*/React.createElement(Button, {
    variant: "primary",
    full: true,
    onClick: () => setDone(true)
  }, "Activate Test Tracking"))), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      fontWeight: 800,
      letterSpacing: '0.16em',
      textTransform: 'uppercase',
      color: 'var(--violet-400)',
      margin: '4px 2px 12px'
    }
  }, "Plans"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 12
    }
  }, plans.map(p => /*#__PURE__*/React.createElement(PricePlan, _extends({
    key: p.name
  }, p, {
    cta: "Choose plan"
  }))))));
}
window.CourtQueApp = CourtQueApp;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/courtque/CourtQueApp.jsx", error: String((e && e.message) || e) }); }

// ui_kits/vakilcard/VakilCardApp.jsx
try { (() => {
/* VakilCard — the premium digital visiting card.
   A floating Liquid Glass card fixed above a scrolling glass "chamber".
   Mobile-first. Composes Vakilpedia DS components. */
const {
  Button,
  Chip,
  ActionTile,
  VerifiedShield,
  GlassCard,
  Badge
} = window.VakilpediaDesignSystem_d7e77c;

/* ---- Outline icon set (consistent 1.8 stroke, brand style) ---- */
const Svg = ({
  d,
  s = 22
}) => /*#__PURE__*/React.createElement("svg", {
  width: s,
  height: s,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: "1.8",
  strokeLinecap: "round",
  strokeLinejoin: "round"
}, d);
const Icons = {
  share: p => /*#__PURE__*/React.createElement(Svg, {
    s: p,
    d: /*#__PURE__*/React.createElement("g", null, /*#__PURE__*/React.createElement("circle", {
      cx: "18",
      cy: "5",
      r: "3"
    }), /*#__PURE__*/React.createElement("circle", {
      cx: "6",
      cy: "12",
      r: "3"
    }), /*#__PURE__*/React.createElement("circle", {
      cx: "18",
      cy: "19",
      r: "3"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M8.6 13.5l6.8 4M15.4 6.5l-6.8 4"
    }))
  }),
  menu: p => /*#__PURE__*/React.createElement(Svg, {
    s: p,
    d: /*#__PURE__*/React.createElement("g", null, /*#__PURE__*/React.createElement("path", {
      d: "M3 6h18M3 12h18M3 18h18"
    }))
  }),
  phone: p => /*#__PURE__*/React.createElement(Svg, {
    s: p,
    d: /*#__PURE__*/React.createElement("path", {
      d: "M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3 19.5 19.5 0 0 1-6-6 19.8 19.8 0 0 1-3-8.6A2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.5c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2Z"
    })
  }),
  mail: p => /*#__PURE__*/React.createElement(Svg, {
    s: p,
    d: /*#__PURE__*/React.createElement("g", null, /*#__PURE__*/React.createElement("rect", {
      x: "2",
      y: "4",
      width: "20",
      height: "16",
      rx: "3"
    }), /*#__PURE__*/React.createElement("path", {
      d: "m2 7 10 6 10-6"
    }))
  }),
  pin: p => /*#__PURE__*/React.createElement(Svg, {
    s: p,
    d: /*#__PURE__*/React.createElement("g", null, /*#__PURE__*/React.createElement("path", {
      d: "M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"
    }), /*#__PURE__*/React.createElement("circle", {
      cx: "12",
      cy: "10",
      r: "3"
    }))
  }),
  scale: p => /*#__PURE__*/React.createElement(Svg, {
    s: p,
    d: /*#__PURE__*/React.createElement("g", null, /*#__PURE__*/React.createElement("path", {
      d: "M12 3v18M7 21h10M6 7h12M6 7l-3 6a3 3 0 0 0 6 0L6 7ZM18 7l-3 6a3 3 0 0 0 6 0l-3-6ZM12 3l-6 4M12 3l6 4"
    }))
  }),
  wa: p => /*#__PURE__*/React.createElement(Svg, {
    s: p,
    d: /*#__PURE__*/React.createElement("g", null, /*#__PURE__*/React.createElement("path", {
      d: "M3 21l1.6-4.8A8 8 0 1 1 8 20.1L3 21Z"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M8.5 9.5c0 3 2 5 5 5.5M8.5 9.5c0-.8.7-1.5 1.3-1.2.4.8.9 1.6.9 1.6s-.6.7-.6.9c.3.9 1.1 1.7 2 2 .2 0 .9-.6.9-.6s.8.5 1.6.9c.3.6-.4 1.3-1.2 1.3",
      strokeWidth: "1.4"
    }))
  }),
  cal: p => /*#__PURE__*/React.createElement(Svg, {
    s: p,
    d: /*#__PURE__*/React.createElement("g", null, /*#__PURE__*/React.createElement("rect", {
      x: "3",
      y: "4",
      width: "18",
      height: "18",
      rx: "3"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M16 2v4M8 2v4M3 10h18"
    }))
  }),
  rupee: p => /*#__PURE__*/React.createElement(Svg, {
    s: p,
    d: /*#__PURE__*/React.createElement("path", {
      d: "M6 3h12M6 8h12M6 13l8.5 8M9 8a5 5 0 0 1 0 10H6"
    })
  }),
  globe: p => /*#__PURE__*/React.createElement(Svg, {
    s: p,
    d: /*#__PURE__*/React.createElement("g", null, /*#__PURE__*/React.createElement("circle", {
      cx: "12",
      cy: "12",
      r: "9"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"
    }))
  }),
  contact: p => /*#__PURE__*/React.createElement(Svg, {
    s: p,
    d: /*#__PURE__*/React.createElement("g", null, /*#__PURE__*/React.createElement("rect", {
      x: "2",
      y: "4",
      width: "20",
      height: "16",
      rx: "3"
    }), /*#__PURE__*/React.createElement("circle", {
      cx: "9",
      cy: "11",
      r: "2.2"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M5.5 17c.6-1.8 2-2.6 3.5-2.6s2.9.8 3.5 2.6M16 9h3M16 13h3"
    }))
  }),
  download: p => /*#__PURE__*/React.createElement(Svg, {
    s: p,
    d: /*#__PURE__*/React.createElement("g", null, /*#__PURE__*/React.createElement("path", {
      d: "M12 3v12M7 11l5 5 5-5M4 20h16"
    }))
  }),
  qr: p => /*#__PURE__*/React.createElement(Svg, {
    s: p,
    d: /*#__PURE__*/React.createElement("g", null, /*#__PURE__*/React.createElement("rect", {
      x: "3",
      y: "3",
      width: "7",
      height: "7",
      rx: "1"
    }), /*#__PURE__*/React.createElement("rect", {
      x: "14",
      y: "3",
      width: "7",
      height: "7",
      rx: "1"
    }), /*#__PURE__*/React.createElement("rect", {
      x: "3",
      y: "14",
      width: "7",
      height: "7",
      rx: "1"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M14 14h3v3M21 14v7M17 21h4"
    }))
  }),
  copy: p => /*#__PURE__*/React.createElement(Svg, {
    s: p,
    d: /*#__PURE__*/React.createElement("g", null, /*#__PURE__*/React.createElement("rect", {
      x: "9",
      y: "9",
      width: "12",
      height: "12",
      rx: "2"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"
    }))
  }),
  ext: p => /*#__PURE__*/React.createElement(Svg, {
    s: p,
    d: /*#__PURE__*/React.createElement("g", null, /*#__PURE__*/React.createElement("path", {
      d: "M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"
    }))
  }),
  up: p => /*#__PURE__*/React.createElement(Svg, {
    s: p,
    d: /*#__PURE__*/React.createElement("path", {
      d: "M12 19V5M5 12l7-7 7 7"
    })
  }),
  in: p => /*#__PURE__*/React.createElement(Svg, {
    s: p,
    d: /*#__PURE__*/React.createElement("g", null, /*#__PURE__*/React.createElement("rect", {
      x: "2",
      y: "2",
      width: "20",
      height: "20",
      rx: "3"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M7 10v7M7 7v0M11 17v-4a2 2 0 0 1 4 0v4M11 17v-7",
      strokeWidth: "1.6"
    }))
  }),
  yt: p => /*#__PURE__*/React.createElement(Svg, {
    s: p,
    d: /*#__PURE__*/React.createElement("g", null, /*#__PURE__*/React.createElement("rect", {
      x: "2",
      y: "5",
      width: "20",
      height: "14",
      rx: "4"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M10 9l5 3-5 3V9Z"
    }))
  }),
  sun: p => /*#__PURE__*/React.createElement(Svg, {
    s: p,
    d: /*#__PURE__*/React.createElement("g", null, /*#__PURE__*/React.createElement("circle", {
      cx: "12",
      cy: "12",
      r: "4"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M12 2v2M12 20v2M4 12H2M22 12h-2M5 5l1.5 1.5M17.5 17.5 19 19M19 5l-1.5 1.5M6.5 17.5 5 19"
    }))
  }),
  moon: p => /*#__PURE__*/React.createElement(Svg, {
    s: p,
    d: /*#__PURE__*/React.createElement("path", {
      d: "M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z"
    })
  }),
  camera: p => /*#__PURE__*/React.createElement(Svg, {
    s: p,
    d: /*#__PURE__*/React.createElement("g", null, /*#__PURE__*/React.createElement("path", {
      d: "M4 8h3l1.5-2h7L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1Z"
    }), /*#__PURE__*/React.createElement("circle", {
      cx: "12",
      cy: "13",
      r: "3.2"
    }))
  }),
  crown: p => /*#__PURE__*/React.createElement(Svg, {
    s: p,
    d: /*#__PURE__*/React.createElement("path", {
      d: "M3 7l4 4 5-7 5 7 4-4-2 12H5L3 7Z"
    })
  })
};

/* ---- Profiles — the card is data-driven; swap `profile` for a real or demo lawyer ---- */
const defaultProfile = {
  firmShort: 'Doe',
  firmSub: 'LAW CHAMBERS',
  tagline: 'Litigation · Advisory · Drafting',
  title: 'ADVOCATE',
  name: 'Sidharth Gautam',
  contacts: [['phone', '+91 98765 43210'], ['mail', 'sidharth@example.com'], ['pin', '123 Legal Street, Example City'], ['scale', 'Enrol. No. XX/0000/2020']],
  about: 'Advocate with a broad practice across civil, criminal, and commercial matters. Committed to practical, ethical, and result-oriented legal solutions.',
  practice: ['Civil Litigation', 'Criminal Law', 'Property Law', 'Corporate Law', 'Consumer Law', 'Arbitration', 'Family Law', 'Contract Drafting', 'Taxation'],
  upi: 'sidharthgautam@example',
  firm: 'Sidharth Gautam Law Chambers',
  address: ['123 Legal Street', 'Example City – 110001']
};
const demoProfile = {
  firmShort: 'Doe',
  firmSub: 'LAW CHAMBERS',
  tagline: 'Corporate · Disputes · Advisory',
  title: 'ADVOCATE',
  name: 'Sidharth Gautam',
  contacts: [['phone', '+91 98765 43210'], ['mail', 'sidharth@example.com'], ['pin', 'Example City'], ['scale', 'Enrol. No. XX/2214/2016']],
  about: 'Corporate and commercial disputes counsel advising founders, boards, and investors across India. Clear, commercial, and responsive.',
  practice: ['Corporate Law', 'Mergers & Acquisitions', 'Commercial Disputes', 'Arbitration', 'Contracts', 'Compliance', 'Startup Advisory'],
  upi: 'sidharthgautam@example',
  firm: 'Sidharth Gautam Law Chambers',
  address: ['123 Legal Street', 'Example City – 110001']
};
window.vakilDefaultProfile = defaultProfile;
window.vakilDemoProfile = demoProfile;
function ThemeToggle({
  theme,
  onToggle
}) {
  return /*#__PURE__*/React.createElement("button", {
    onClick: onToggle,
    "aria-label": "Toggle theme",
    style: {
      width: 40,
      height: 40,
      borderRadius: 12,
      background: 'var(--glass-thick)',
      border: '1px solid var(--hairline)',
      color: 'var(--text-hi)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      cursor: 'pointer'
    }
  }, theme === 'dark' ? Icons.sun(18) : Icons.moon(18));
}

/* ---- Section wrapper ---- */
function Section({
  eyebrow,
  action,
  children,
  style
}) {
  return /*#__PURE__*/React.createElement(GlassCard, {
    tone: "thin",
    radius: "xl",
    pad: 20,
    style: {
      marginBottom: 16,
      ...style
    }
  }, eyebrow && /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 14
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 11,
      fontWeight: 800,
      letterSpacing: '0.16em',
      textTransform: 'uppercase',
      color: 'var(--violet-400)'
    }
  }, eyebrow), action), children);
}

/* ---- The floating visiting card (the hero) — credit-card 1.586:1 ---- */
function VisitingCard({
  compact,
  onSave,
  profile
}) {
  const [tilt, setTilt] = React.useState({
    x: 0,
    y: 0
  });
  const [flash, setFlash] = React.useState(false);
  const onMove = e => {
    const r = e.currentTarget.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width - 0.5;
    const py = (e.clientY - r.top) / r.height - 0.5;
    setTilt({
      x: py * -4,
      y: px * 5
    });
  };
  const reset = () => setTilt({
    x: 0,
    y: 0
  });
  const save = () => {
    setFlash(true);
    setTimeout(() => setFlash(false), 550);
    onSave && onSave();
  };
  return /*#__PURE__*/React.createElement("div", {
    onMouseMove: onMove,
    onMouseLeave: reset,
    onDoubleClick: save,
    title: "Double-tap to save as image",
    style: {
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
      overflow: 'hidden',
      cursor: 'pointer',
      userSelect: 'none'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      inset: 0,
      background: 'rgba(255,255,255,0.7)',
      opacity: flash ? 1 : 0,
      transition: 'opacity var(--dur-slow) var(--ease-out)',
      pointerEvents: 'none'
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative',
      display: 'flex',
      gap: 18,
      alignItems: 'stretch'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      flex: '0 0 36%',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      textAlign: 'center',
      borderRight: '1px solid rgba(40,36,52,0.18)',
      paddingRight: 16
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 96,
      height: 96,
      borderRadius: '50%',
      padding: 3,
      background: 'linear-gradient(135deg, #c9a24a, #efe0bb 45%, #9a7a35)',
      boxShadow: '0 6px 16px rgba(0,0,0,0.28)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: '100%',
      height: '100%',
      borderRadius: '50%',
      overflow: 'hidden',
      background: 'linear-gradient(160deg, #2b2d3a, #14151d)',
      display: 'flex',
      alignItems: 'flex-end',
      justifyContent: 'center'
    }
  }, /*#__PURE__*/React.createElement("svg", {
    width: "70",
    height: "70",
    viewBox: "0 0 64 64",
    fill: "none"
  }, /*#__PURE__*/React.createElement("circle", {
    cx: "32",
    cy: "24",
    r: "13",
    fill: "#8a8ea0"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M10 62c1-13 10-20 22-20s21 7 22 20Z",
    fill: "#8a8ea0"
  })))), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-sans)',
      fontSize: 24,
      color: '#1c1c26',
      fontWeight: 700,
      letterSpacing: '-0.02em',
      marginTop: 12,
      lineHeight: 1
    }
  }, profile.firmShort), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 8.5,
      letterSpacing: '0.34em',
      color: '#060606',
      fontWeight: 700,
      marginTop: 4
    }
  }, profile.firmSub), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-accent)',
      fontStyle: 'italic',
      fontWeight: 400,
      fontSize: 10.5,
      color: '#5b5766',
      marginTop: 12
    }
  }, profile.tagline)), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minWidth: 0,
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 5,
      marginBottom: 5
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 10.5,
      fontWeight: 800,
      letterSpacing: '0.16em',
      color: '#635BFF'
    }
  }, profile.title), /*#__PURE__*/React.createElement("svg", {
    width: "14",
    height: "14",
    viewBox: "0 0 24 24",
    fill: "none",
    style: {
      flexShrink: 0
    }
  }, /*#__PURE__*/React.createElement("path", {
    d: "M12 2l2.4 1.8 3-.2.8 2.9 2.4 1.8-1 2.9 1 2.9-2.4 1.8-.8 2.9-3-.2L12 22l-2.4-1.8-3 .2-.8-2.9L3.4 15.9l1-2.9-1-2.9 2.4-1.8.8-2.9 3 .2Z",
    fill: "#635BFF"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M8.6 12.2l2.2 2.2 4.6-4.6",
    stroke: "#fff",
    strokeWidth: "2",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 8
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-sans)',
      fontSize: 22,
      fontWeight: 700,
      color: '#1c1c26',
      letterSpacing: '-0.02em',
      lineHeight: 1.05
    }
  }, profile.name)), /*#__PURE__*/React.createElement("div", {
    style: {
      width: '100%',
      height: 2,
      borderRadius: 2,
      background: 'linear-gradient(90deg, #c9a24a, #efe0bb)',
      margin: '10px 0 12px'
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 7
    }
  }, profile.contacts.map(([k, t], i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      whiteSpace: 'nowrap'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      color: '#2a2732',
      flexShrink: 0
    }
  }, Icons[k](14)), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-accent)',
      fontStyle: 'normal',
      fontWeight: 400,
      fontSize: 15,
      color: '#33313e'
    }
  }, t)))))), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      top: 10,
      right: 14,
      pointerEvents: 'auto'
    }
  }, /*#__PURE__*/React.createElement("a", {
    href: "https://www.vakilpedia.com",
    target: "_blank",
    rel: "noopener",
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 4,
      textDecoration: 'none',
      color: 'inherit'
    }
  }, /*#__PURE__*/React.createElement("img", {
    src: "../../assets/logos/vakilpedia.png",
    alt: "",
    style: {
      height: 12,
      opacity: 0.9,
      filter: 'grayscale(1) contrast(1.05)'
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 7.5,
      color: 'rgba(28,28,38,0.5)'
    }
  }, "Powered by ", /*#__PURE__*/React.createElement("b", {
    style: {
      color: 'rgba(28,28,38,0.72)'
    }
  }, "Vakilpedia")))));
}
function VakilCardApp({
  profile = defaultProfile
}) {
  const [compact, setCompact] = React.useState(false);
  const [theme, setTheme] = React.useState('dark');
  React.useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);
  const scroller = React.useRef(null);
  const [copied, setCopied] = React.useState(false);
  const [saved, setSaved] = React.useState(false);
  const [social, setSocial] = React.useState([true, true, false]);
  const [scrolling, setScrolling] = React.useState(false);
  const scrollTimer = React.useRef(null);
  const onScroll = () => {
    setCompact((scroller.current?.scrollTop || 0) > 40);
    setScrolling(true);
    clearTimeout(scrollTimer.current);
    scrollTimer.current = setTimeout(() => setScrolling(false), 800);
  };
  const practice = profile.practice;
  const tiles = [{
    i: Icons.phone(24),
    l: 'Call',
    t: 'success'
  }, {
    i: Icons.wa(24),
    l: 'WhatsApp',
    t: 'success'
  }, {
    i: Icons.cal(24),
    l: 'Book',
    s: 'Appointment',
    t: 'violet'
  }, {
    i: Icons.rupee(24),
    l: 'Pay',
    s: 'UPI',
    t: 'gold'
  }, {
    i: Icons.pin(24),
    l: 'Directions',
    t: 'violet'
  }, {
    i: Icons.mail(24),
    l: 'Email',
    t: 'violet'
  }, {
    i: Icons.globe(24),
    l: 'Website',
    t: 'info'
  }, {
    i: Icons.contact(24),
    l: 'Save',
    s: 'Contact',
    t: 'neutral'
  }];
  return /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative',
      width: '100%',
      maxWidth: 412,
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      background: 'var(--bg-void)',
      overflow: 'hidden'
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "vp-glow vp-g1"
  }), /*#__PURE__*/React.createElement("div", {
    className: "vp-glow vp-g2"
  }), /*#__PURE__*/React.createElement("div", {
    className: "vp-glow vp-g3"
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      flexShrink: 0,
      position: 'relative',
      zIndex: 12,
      padding: '14px 14px 6px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 10,
      height: 56,
      padding: '0 8px 0 14px',
      borderRadius: 'var(--r-pill)',
      background: 'var(--glass-frost)',
      backdropFilter: 'blur(24px) saturate(1.4)',
      WebkitBackdropFilter: 'blur(24px) saturate(1.4)',
      border: '1px solid var(--hairline-strong)',
      boxShadow: '0 6px 18px rgba(0,0,0,0.30), 0 0 0 1px rgba(255,255,255,0.04), var(--inset-edge)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 9,
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("img", {
    src: "../../assets/logos/vakilpedia.png",
    alt: "",
    style: {
      height: 26
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 17,
      fontWeight: 900,
      letterSpacing: '-0.04em',
      color: 'var(--text-hi)'
    }
  }, "Vakilpedia", /*#__PURE__*/React.createElement("sup", {
    style: {
      fontSize: '0.42em',
      fontWeight: 500,
      opacity: 0.5
    }
  }, "TM"))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 6
    }
  }, /*#__PURE__*/React.createElement("button", {
    "aria-label": "Share card",
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 7,
      height: 40,
      padding: '0 16px',
      borderRadius: 'var(--r-pill)',
      background: 'var(--glass-thick)',
      border: '1px solid var(--hairline)',
      color: 'var(--text-hi)',
      fontSize: 13,
      fontWeight: 700,
      fontFamily: 'var(--font-sans)',
      cursor: 'pointer'
    }
  }, Icons.share(15), "Share"), /*#__PURE__*/React.createElement(ThemeToggle, {
    theme: theme,
    onToggle: () => setTheme(t => t === 'dark' ? 'light' : 'dark')
  })))), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      top: 112,
      left: 0,
      right: 0,
      padding: '0 16px',
      zIndex: 8,
      pointerEvents: 'none'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      pointerEvents: 'auto'
    }
  }, /*#__PURE__*/React.createElement(VisitingCard, {
    compact: compact,
    profile: profile,
    onSave: () => {
      setSaved(true);
      setTimeout(() => setSaved(false), 1600);
    }
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      marginTop: 10,
      fontSize: 11.5,
      color: saved ? 'var(--success)' : 'var(--text-low)',
      fontWeight: 500,
      opacity: compact ? 0 : 1,
      transform: compact ? 'translateY(-4px)' : 'none',
      pointerEvents: compact ? 'none' : 'auto',
      transition: 'color var(--dur-base), opacity var(--dur-base) var(--ease-out), transform var(--dur-base) var(--ease-out)'
    }
  }, /*#__PURE__*/React.createElement("svg", {
    width: "14",
    height: "14",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "1.8"
  }, /*#__PURE__*/React.createElement("circle", {
    cx: "12",
    cy: "12",
    r: "9"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M12 11v5M12 8h.01",
    strokeLinecap: "round"
  })), saved ? 'Saved to your device' : 'Double-tap anywhere on the card to save it to your device')), /*#__PURE__*/React.createElement("div", {
    ref: scroller,
    onScroll: onScroll,
    className: scrolling ? 'vp-scroll is-scrolling' : 'vp-scroll',
    style: {
      position: 'relative',
      zIndex: 1,
      flex: 1,
      overflowY: 'auto',
      padding: '0 16px 24px',
      WebkitOverflowScrolling: 'touch'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      height: compact ? 272 : 318,
      transition: 'height var(--dur-slow) var(--ease-glass)'
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative',
      overflow: 'hidden',
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      padding: 16,
      marginBottom: 16,
      borderRadius: 'var(--r-xl)',
      background: 'linear-gradient(120deg, var(--glass-tint-violet), var(--glass-tint-gold))',
      border: '1px solid var(--hairline)',
      backdropFilter: 'blur(14px)',
      WebkitBackdropFilter: 'blur(14px)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      flexShrink: 0,
      width: 40,
      height: 40,
      borderRadius: 12,
      background: 'linear-gradient(135deg, var(--gold-300), var(--gold-500))',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: '#231a08'
    }
  }, Icons.crown(20)), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13,
      fontWeight: 700,
      color: 'var(--text-hi)'
    }
  }, "Add your chamber logo & branding"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11.5,
      color: 'var(--text-low)',
      lineHeight: 1.4
    }
  }, "Free cards show your photo. Go Premium for a fully branded VakilCard.")), /*#__PURE__*/React.createElement(Button, {
    variant: "premium",
    size: "sm"
  }, "Upgrade")), /*#__PURE__*/React.createElement(Section, {
    eyebrow: "Payment"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 16,
      alignItems: 'flex-start'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      color: 'var(--text-low)',
      marginBottom: 4
    }
  }, "UPI ID"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      marginBottom: 14
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 15,
      fontWeight: 700,
      color: 'var(--text-hi)',
      fontFamily: 'var(--font-mono)'
    }
  }, profile.upi), /*#__PURE__*/React.createElement("button", {
    onClick: () => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    },
    style: {
      background: 'none',
      border: 'none',
      color: copied ? 'var(--success)' : 'var(--text-low)',
      cursor: 'pointer',
      display: 'flex'
    }
  }, Icons.copy(15))), /*#__PURE__*/React.createElement(Button, {
    variant: "primary",
    icon: Icons.rupee(16)
  }, "Pay Now"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 7,
      marginTop: 14,
      fontSize: 11,
      color: 'var(--text-dim)'
    }
  }, /*#__PURE__*/React.createElement(VerifiedShield, {
    size: "sm",
    label: "",
    style: {
      gap: 0
    }
  }), /*#__PURE__*/React.createElement("span", null, "Secured via UPI. No payment goes through Vakilpedia."))), /*#__PURE__*/React.createElement("div", {
    style: {
      flexShrink: 0,
      textAlign: 'center'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 10,
      color: 'var(--text-low)',
      marginBottom: 6
    }
  }, "Scan & Pay"), /*#__PURE__*/React.createElement("div", {
    style: {
      width: 92,
      height: 92,
      borderRadius: 12,
      background: '#fff',
      padding: 8,
      display: 'grid',
      gridTemplateColumns: 'repeat(8,1fr)',
      gridTemplateRows: 'repeat(8,1fr)',
      gap: 1
    }
  }, Array.from({
    length: 64
  }).map((_, i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    style: {
      background: (i * 7 + (i / 8 | 0) * 3) % 5 < 2 ? '#0b0b0b' : 'transparent'
    }
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 9.5,
      color: 'var(--text-dim)',
      marginTop: 6,
      lineHeight: 1.3
    }
  }, "Double-tap to", /*#__PURE__*/React.createElement("br", null), "download image")))), /*#__PURE__*/React.createElement(Section, {
    eyebrow: "Connect"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
      gap: 10
    }
  }, tiles.map(t => /*#__PURE__*/React.createElement(ActionTile, {
    key: t.l,
    icon: t.i,
    label: t.l,
    sublabel: t.s,
    tone: t.t,
    style: {
      aspectRatio: '1 / 1',
      height: 'auto',
      minHeight: 0
    }
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      margin: '16px 0 10px'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 11,
      fontWeight: 700,
      letterSpacing: '0.12em',
      textTransform: 'uppercase',
      color: 'var(--text-dim)'
    }
  }, "Social handles"), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 11,
      color: 'var(--text-dim)'
    }
  }, "Tap to showcase")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexWrap: 'wrap',
      gap: 10
    }
  }, [[Icons.in(18), 'LinkedIn', 'var(--info)'], [Icons.yt(18), 'YouTube', '#ff5a5a'], [Icons.globe(18), 'Website', 'var(--violet-400)']].map(([ic, t, c], i) => {
    const on = social[i];
    return /*#__PURE__*/React.createElement("button", {
      key: t,
      "aria-label": t,
      title: t,
      onClick: () => setSocial(s => s.map((v, j) => j === i ? !v : v)),
      style: {
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 44,
        height: 44,
        borderRadius: '50%',
        background: on ? 'var(--glass-thick)' : 'transparent',
        border: `1px solid ${on ? 'var(--hairline-strong)' : 'var(--hairline)'}`,
        color: on ? c : 'var(--text-dim)',
        cursor: 'pointer',
        opacity: on ? 1 : 0.55,
        transition: 'opacity var(--dur-base), color var(--dur-base), background var(--dur-base)'
      }
    }, ic);
  }), /*#__PURE__*/React.createElement("button", {
    "aria-label": "Add handle",
    title: "Add handle",
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: 44,
      height: 44,
      borderRadius: '50%',
      background: 'transparent',
      border: '1px dashed var(--hairline-strong)',
      color: 'var(--text-low)',
      fontSize: 20,
      fontWeight: 400,
      cursor: 'pointer',
      lineHeight: 1
    }
  }, "+"))), /*#__PURE__*/React.createElement(Section, {
    eyebrow: "About"
  }, /*#__PURE__*/React.createElement("p", {
    style: {
      margin: 0,
      fontSize: 14,
      lineHeight: 1.65,
      color: 'var(--text-mid)'
    }
  }, profile.about)), /*#__PURE__*/React.createElement(Section, {
    eyebrow: "Practice Areas"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexWrap: 'wrap',
      gap: '8px 18px',
      fontFamily: 'var(--font-accent)',
      fontStyle: 'italic',
      fontWeight: 400,
      fontSize: 15.5,
      lineHeight: 1.3,
      color: 'var(--text-mid)'
    }
  }, practice.map(p => /*#__PURE__*/React.createElement("span", {
    key: p
  }, p)))), /*#__PURE__*/React.createElement(Section, {
    eyebrow: "Office"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 14
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 15,
      fontWeight: 700,
      color: 'var(--text-hi)',
      marginBottom: 6
    }
  }, profile.firm), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13,
      color: 'var(--text-low)',
      lineHeight: 1.55
    }
  }, profile.address[0], /*#__PURE__*/React.createElement("br", null), profile.address[1])), /*#__PURE__*/React.createElement("div", {
    onClick: () => {},
    style: {
      flex: '0 0 130px',
      borderRadius: 14,
      cursor: 'pointer',
      background: 'linear-gradient(135deg, var(--navy-700), var(--surface-3))',
      border: '1px solid var(--hairline)',
      position: 'relative',
      minHeight: 128,
      overflow: 'hidden'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      inset: 0,
      opacity: 0.5,
      background: 'repeating-linear-gradient(0deg, transparent 0 22px, rgba(255,255,255,0.05) 22px 23px), repeating-linear-gradient(90deg, transparent 0 22px, rgba(255,255,255,0.05) 22px 23px)'
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      position: 'absolute',
      top: '38%',
      left: '50%',
      transform: 'translate(-50%,-50%)',
      color: 'var(--violet-400)',
      filter: 'drop-shadow(0 0 8px var(--violet-glow))'
    }
  }, Icons.pin(30)), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      left: 8,
      right: 8,
      bottom: 8,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      height: 30,
      borderRadius: 9,
      background: 'var(--glass-frost)',
      backdropFilter: 'blur(8px)',
      WebkitBackdropFilter: 'blur(8px)',
      border: '1px solid var(--hairline)',
      color: 'var(--text-hi)',
      fontSize: 11,
      fontWeight: 700
    }
  }, Icons.ext(13), " Open in Maps")))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '8px 4px 0'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 9
    }
  }, /*#__PURE__*/React.createElement("img", {
    src: "../../assets/logos/vakilpedia.png",
    alt: "",
    style: {
      height: 22,
      opacity: 0.85
    }
  }), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      color: 'var(--text-mid)'
    }
  }, "Powered by ", /*#__PURE__*/React.createElement("b", {
    style: {
      color: 'var(--text-hi)'
    }
  }, "Vakilpedia")), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 10,
      color: 'var(--text-dim)'
    }
  }, "Your legal tech ecosystem."))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 8
    }
  }, [Icons.in(15), Icons.yt(15), Icons.globe(15)].map((ic, i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    style: {
      width: 32,
      height: 32,
      borderRadius: 9,
      background: 'var(--glass-thick)',
      border: '1px solid var(--hairline)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: 'var(--text-mid)'
    }
  }, ic))))));
}
window.VakilCardApp = VakilCardApp;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/vakilcard/VakilCardApp.jsx", error: String((e && e.message) || e) }); }

// ui_kits/vakilcard/tweaks-panel.jsx
try { (() => {
// @ds-adherence-ignore -- omelette starter scaffold (raw elements/hex/px by design)
// Copied omelette starter. Re-running copy_starter_component with this kind overwrites this file with the latest version (page content is unaffected).

/* BEGIN USAGE */
// tweaks-panel.jsx
// Reusable Tweaks shell + form-control helpers.
// Exports (to window): useTweaks, TweaksPanel, TweakSection, TweakRow, TweakSlider,
//   TweakToggle, TweakRadio, TweakSelect, TweakText, TweakNumber, TweakColor, TweakButton.
//
// Owns the host protocol (listens for __activate_edit_mode / __deactivate_edit_mode,
// posts __edit_mode_available / __edit_mode_set_keys / __edit_mode_dismissed) so
// individual prototypes don't re-roll it. Ships a consistent set of controls so you
// don't hand-draw <input type="range">, segmented radios, steppers, etc.
//
// Usage (in an HTML file that loads React + Babel):
//
//   const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
//     "primaryColor": "#D97757",
//     "palette": ["#D97757", "#29261b", "#f6f4ef"],
//     "fontSize": 16,
//     "density": "regular",
//     "dark": false
//   }/*EDITMODE-END*/;
//
//   function App() {
//     const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
//     return (
//       <div style={{ fontSize: t.fontSize, color: t.primaryColor }}>
//         Hello
//         <TweaksPanel>
//           <TweakSection label="Typography" />
//           <TweakSlider label="Font size" value={t.fontSize} min={10} max={32} unit="px"
//                        onChange={(v) => setTweak('fontSize', v)} />
//           <TweakRadio  label="Density" value={t.density}
//                        options={['compact', 'regular', 'comfy']}
//                        onChange={(v) => setTweak('density', v)} />
//           <TweakSection label="Theme" />
//           <TweakColor  label="Primary" value={t.primaryColor}
//                        options={['#D97757', '#2A6FDB', '#1F8A5B', '#7A5AE0']}
//                        onChange={(v) => setTweak('primaryColor', v)} />
//           <TweakColor  label="Palette" value={t.palette}
//                        options={[['#D97757', '#29261b', '#f6f4ef'],
//                                  ['#475569', '#0f172a', '#f1f5f9']]}
//                        onChange={(v) => setTweak('palette', v)} />
//           <TweakToggle label="Dark mode" value={t.dark}
//                        onChange={(v) => setTweak('dark', v)} />
//         </TweaksPanel>
//       </div>
//     );
//   }
//
// TweakRadio is the segmented control for 2–3 short options (auto-falls-back to
// TweakSelect past ~16/~10 chars per label); reach for TweakSelect directly when
// options are many or long. For color tweaks always curate 3-4 options rather than
// a free picker; an option can also be a whole 2–5 color palette (the stored value
// is the array). The Tweak* controls are a floor, not a ceiling — build custom
// controls inside the panel if a tweak calls for UI they don't cover.
/* END USAGE */
// ─────────────────────────────────────────────────────────────────────────────

const __TWEAKS_STYLE = `
  .twk-panel{position:fixed;right:16px;bottom:16px;z-index:2147483646;width:280px;
    max-height:calc(100vh - 32px);display:flex;flex-direction:column;
    transform:scale(var(--dc-inv-zoom,1));transform-origin:bottom right;
    background:rgba(250,249,247,.78);color:#29261b;
    -webkit-backdrop-filter:blur(24px) saturate(160%);backdrop-filter:blur(24px) saturate(160%);
    border:.5px solid rgba(255,255,255,.6);border-radius:14px;
    box-shadow:0 1px 0 rgba(255,255,255,.5) inset,0 12px 40px rgba(0,0,0,.18);
    font:11.5px/1.4 ui-sans-serif,system-ui,-apple-system,sans-serif;overflow:hidden}
  .twk-hd{display:flex;align-items:center;justify-content:space-between;
    padding:10px 8px 10px 14px;cursor:move;user-select:none}
  .twk-hd b{font-size:12px;font-weight:600;letter-spacing:.01em}
  .twk-x{appearance:none;border:0;background:transparent;color:rgba(41,38,27,.55);
    width:22px;height:22px;border-radius:6px;cursor:default;font-size:13px;line-height:1}
  .twk-x:hover{background:rgba(0,0,0,.06);color:#29261b}
  .twk-body{padding:2px 14px 14px;display:flex;flex-direction:column;gap:10px;
    overflow-y:auto;overflow-x:hidden;min-height:0;
    scrollbar-width:thin;scrollbar-color:rgba(0,0,0,.15) transparent}
  .twk-body::-webkit-scrollbar{width:8px}
  .twk-body::-webkit-scrollbar-track{background:transparent;margin:2px}
  .twk-body::-webkit-scrollbar-thumb{background:rgba(0,0,0,.15);border-radius:4px;
    border:2px solid transparent;background-clip:content-box}
  .twk-body::-webkit-scrollbar-thumb:hover{background:rgba(0,0,0,.25);
    border:2px solid transparent;background-clip:content-box}
  .twk-row{display:flex;flex-direction:column;gap:5px}
  .twk-row-h{flex-direction:row;align-items:center;justify-content:space-between;gap:10px}
  .twk-lbl{display:flex;justify-content:space-between;align-items:baseline;
    color:rgba(41,38,27,.72)}
  .twk-lbl>span:first-child{font-weight:500}
  .twk-val{color:rgba(41,38,27,.5);font-variant-numeric:tabular-nums}

  .twk-sect{font-size:10px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;
    color:rgba(41,38,27,.45);padding:10px 0 0}
  .twk-sect:first-child{padding-top:0}

  .twk-field{appearance:none;box-sizing:border-box;width:100%;min-width:0;height:26px;padding:0 8px;
    border:.5px solid rgba(0,0,0,.1);border-radius:7px;
    background:rgba(255,255,255,.6);color:inherit;font:inherit;outline:none}
  .twk-field:focus{border-color:rgba(0,0,0,.25);background:rgba(255,255,255,.85)}
  select.twk-field{padding-right:22px;
    background-image:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'><path fill='rgba(0,0,0,.5)' d='M0 0h10L5 6z'/></svg>");
    background-repeat:no-repeat;background-position:right 8px center}

  .twk-slider{appearance:none;-webkit-appearance:none;width:100%;height:4px;margin:6px 0;
    border-radius:999px;background:rgba(0,0,0,.12);outline:none}
  .twk-slider::-webkit-slider-thumb{-webkit-appearance:none;appearance:none;
    width:14px;height:14px;border-radius:50%;background:#fff;
    border:.5px solid rgba(0,0,0,.12);box-shadow:0 1px 3px rgba(0,0,0,.2);cursor:default}
  .twk-slider::-moz-range-thumb{width:14px;height:14px;border-radius:50%;
    background:#fff;border:.5px solid rgba(0,0,0,.12);box-shadow:0 1px 3px rgba(0,0,0,.2);cursor:default}

  .twk-seg{position:relative;display:flex;padding:2px;border-radius:8px;
    background:rgba(0,0,0,.06);user-select:none}
  .twk-seg-thumb{position:absolute;top:2px;bottom:2px;border-radius:6px;
    background:rgba(255,255,255,.9);box-shadow:0 1px 2px rgba(0,0,0,.12);
    transition:left .15s cubic-bezier(.3,.7,.4,1),width .15s}
  .twk-seg.dragging .twk-seg-thumb{transition:none}
  .twk-seg button{appearance:none;position:relative;z-index:1;flex:1;border:0;
    background:transparent;color:inherit;font:inherit;font-weight:500;min-height:22px;
    border-radius:6px;cursor:default;padding:4px 6px;line-height:1.2;
    overflow-wrap:anywhere}

  .twk-toggle{position:relative;width:32px;height:18px;border:0;border-radius:999px;
    background:rgba(0,0,0,.15);transition:background .15s;cursor:default;padding:0}
  .twk-toggle[data-on="1"]{background:#34c759}
  .twk-toggle i{position:absolute;top:2px;left:2px;width:14px;height:14px;border-radius:50%;
    background:#fff;box-shadow:0 1px 2px rgba(0,0,0,.25);transition:transform .15s}
  .twk-toggle[data-on="1"] i{transform:translateX(14px)}

  .twk-num{display:flex;align-items:center;box-sizing:border-box;min-width:0;height:26px;padding:0 0 0 8px;
    border:.5px solid rgba(0,0,0,.1);border-radius:7px;background:rgba(255,255,255,.6)}
  .twk-num-lbl{font-weight:500;color:rgba(41,38,27,.6);cursor:ew-resize;
    user-select:none;padding-right:8px}
  .twk-num input{flex:1;min-width:0;height:100%;border:0;background:transparent;
    font:inherit;font-variant-numeric:tabular-nums;text-align:right;padding:0 8px 0 0;
    outline:none;color:inherit;-moz-appearance:textfield}
  .twk-num input::-webkit-inner-spin-button,.twk-num input::-webkit-outer-spin-button{
    -webkit-appearance:none;margin:0}
  .twk-num-unit{padding-right:8px;color:rgba(41,38,27,.45)}

  .twk-btn{appearance:none;height:26px;padding:0 12px;border:0;border-radius:7px;
    background:rgba(0,0,0,.78);color:#fff;font:inherit;font-weight:500;cursor:default}
  .twk-btn:hover{background:rgba(0,0,0,.88)}
  .twk-btn.secondary{background:rgba(0,0,0,.06);color:inherit}
  .twk-btn.secondary:hover{background:rgba(0,0,0,.1)}

  .twk-swatch{appearance:none;-webkit-appearance:none;width:56px;height:22px;
    border:.5px solid rgba(0,0,0,.1);border-radius:6px;padding:0;cursor:default;
    background:transparent;flex-shrink:0}
  .twk-swatch::-webkit-color-swatch-wrapper{padding:0}
  .twk-swatch::-webkit-color-swatch{border:0;border-radius:5.5px}
  .twk-swatch::-moz-color-swatch{border:0;border-radius:5.5px}

  .twk-chips{display:flex;gap:6px}
  .twk-chip{position:relative;appearance:none;flex:1;min-width:0;height:46px;
    padding:0;border:0;border-radius:6px;overflow:hidden;cursor:default;
    box-shadow:0 0 0 .5px rgba(0,0,0,.12),0 1px 2px rgba(0,0,0,.06);
    transition:transform .12s cubic-bezier(.3,.7,.4,1),box-shadow .12s}
  .twk-chip:hover{transform:translateY(-1px);
    box-shadow:0 0 0 .5px rgba(0,0,0,.18),0 4px 10px rgba(0,0,0,.12)}
  .twk-chip[data-on="1"]{box-shadow:0 0 0 1.5px rgba(0,0,0,.85),
    0 2px 6px rgba(0,0,0,.15)}
  .twk-chip>span{position:absolute;top:0;bottom:0;right:0;width:34%;
    display:flex;flex-direction:column;box-shadow:-1px 0 0 rgba(0,0,0,.1)}
  .twk-chip>span>i{flex:1;box-shadow:0 -1px 0 rgba(0,0,0,.1)}
  .twk-chip>span>i:first-child{box-shadow:none}
  .twk-chip svg{position:absolute;top:6px;left:6px;width:13px;height:13px;
    filter:drop-shadow(0 1px 1px rgba(0,0,0,.3))}
`;

// ── useTweaks ───────────────────────────────────────────────────────────────
// Single source of truth for tweak values. setTweak persists via the host
// (__edit_mode_set_keys → host rewrites the EDITMODE block on disk).
function useTweaks(defaults) {
  const [values, setValues] = React.useState(defaults);
  // Accepts either setTweak('key', value) or setTweak({ key: value, ... }) so a
  // useState-style call doesn't write a "[object Object]" key into the persisted
  // JSON block.
  const setTweak = React.useCallback((keyOrEdits, val) => {
    const edits = typeof keyOrEdits === 'object' && keyOrEdits !== null ? keyOrEdits : {
      [keyOrEdits]: val
    };
    setValues(prev => ({
      ...prev,
      ...edits
    }));
    window.parent.postMessage({
      type: '__edit_mode_set_keys',
      edits
    }, '*');
    // Same-window signal so in-page listeners (deck-stage rail thumbnails)
    // can react — the parent message only reaches the host, not peers.
    window.dispatchEvent(new CustomEvent('tweakchange', {
      detail: edits
    }));
  }, []);
  return [values, setTweak];
}

// ── TweaksPanel ─────────────────────────────────────────────────────────────
// Floating shell. Registers the protocol listener BEFORE announcing
// availability — if the announce ran first, the host's activate could land
// before our handler exists and the toolbar toggle would silently no-op.
// The close button posts __edit_mode_dismissed so the host's toolbar toggle
// flips off in lockstep; the host echoes __deactivate_edit_mode back which
// is what actually hides the panel.
function TweaksPanel({
  title = 'Tweaks',
  children
}) {
  const [open, setOpen] = React.useState(false);
  const dragRef = React.useRef(null);
  const offsetRef = React.useRef({
    x: 16,
    y: 16
  });
  const PAD = 16;
  const clampToViewport = React.useCallback(() => {
    const panel = dragRef.current;
    if (!panel) return;
    const w = panel.offsetWidth,
      h = panel.offsetHeight;
    const maxRight = Math.max(PAD, window.innerWidth - w - PAD);
    const maxBottom = Math.max(PAD, window.innerHeight - h - PAD);
    offsetRef.current = {
      x: Math.min(maxRight, Math.max(PAD, offsetRef.current.x)),
      y: Math.min(maxBottom, Math.max(PAD, offsetRef.current.y))
    };
    panel.style.right = offsetRef.current.x + 'px';
    panel.style.bottom = offsetRef.current.y + 'px';
  }, []);
  React.useEffect(() => {
    if (!open) return;
    clampToViewport();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', clampToViewport);
      return () => window.removeEventListener('resize', clampToViewport);
    }
    const ro = new ResizeObserver(clampToViewport);
    ro.observe(document.documentElement);
    return () => ro.disconnect();
  }, [open, clampToViewport]);
  React.useEffect(() => {
    const onMsg = e => {
      const t = e?.data?.type;
      if (t === '__activate_edit_mode') setOpen(true);else if (t === '__deactivate_edit_mode') setOpen(false);
    };
    window.addEventListener('message', onMsg);
    window.parent.postMessage({
      type: '__edit_mode_available'
    }, '*');
    return () => window.removeEventListener('message', onMsg);
  }, []);
  const dismiss = () => {
    setOpen(false);
    window.parent.postMessage({
      type: '__edit_mode_dismissed'
    }, '*');
  };
  const onDragStart = e => {
    const panel = dragRef.current;
    if (!panel) return;
    const r = panel.getBoundingClientRect();
    const sx = e.clientX,
      sy = e.clientY;
    const startRight = window.innerWidth - r.right;
    const startBottom = window.innerHeight - r.bottom;
    const move = ev => {
      offsetRef.current = {
        x: startRight - (ev.clientX - sx),
        y: startBottom - (ev.clientY - sy)
      };
      clampToViewport();
    };
    const up = () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  };
  if (!open) return null;
  return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("style", null, __TWEAKS_STYLE), /*#__PURE__*/React.createElement("div", {
    ref: dragRef,
    className: "twk-panel",
    "data-omelette-chrome": "",
    style: {
      right: offsetRef.current.x,
      bottom: offsetRef.current.y
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "twk-hd",
    onMouseDown: onDragStart
  }, /*#__PURE__*/React.createElement("b", null, title), /*#__PURE__*/React.createElement("button", {
    className: "twk-x",
    "aria-label": "Close tweaks",
    onMouseDown: e => e.stopPropagation(),
    onClick: dismiss
  }, "\u2715")), /*#__PURE__*/React.createElement("div", {
    className: "twk-body"
  }, children)));
}

// ── Layout helpers ──────────────────────────────────────────────────────────

function TweakSection({
  label,
  children
}) {
  return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
    className: "twk-sect"
  }, label), children);
}
function TweakRow({
  label,
  value,
  children,
  inline = false
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: inline ? 'twk-row twk-row-h' : 'twk-row'
  }, /*#__PURE__*/React.createElement("div", {
    className: "twk-lbl"
  }, /*#__PURE__*/React.createElement("span", null, label), value != null && /*#__PURE__*/React.createElement("span", {
    className: "twk-val"
  }, value)), children);
}

// ── Controls ────────────────────────────────────────────────────────────────

function TweakSlider({
  label,
  value,
  min = 0,
  max = 100,
  step = 1,
  unit = '',
  onChange
}) {
  return /*#__PURE__*/React.createElement(TweakRow, {
    label: label,
    value: `${value}${unit}`
  }, /*#__PURE__*/React.createElement("input", {
    type: "range",
    className: "twk-slider",
    min: min,
    max: max,
    step: step,
    value: value,
    onChange: e => onChange(Number(e.target.value))
  }));
}
function TweakToggle({
  label,
  value,
  onChange
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: "twk-row twk-row-h"
  }, /*#__PURE__*/React.createElement("div", {
    className: "twk-lbl"
  }, /*#__PURE__*/React.createElement("span", null, label)), /*#__PURE__*/React.createElement("button", {
    type: "button",
    className: "twk-toggle",
    "data-on": value ? '1' : '0',
    role: "switch",
    "aria-checked": !!value,
    onClick: () => onChange(!value)
  }, /*#__PURE__*/React.createElement("i", null)));
}
function TweakRadio({
  label,
  value,
  options,
  onChange
}) {
  const trackRef = React.useRef(null);
  const [dragging, setDragging] = React.useState(false);
  // The active value is read by pointer-move handlers attached for the lifetime
  // of a drag — ref it so a stale closure doesn't fire onChange for every move.
  const valueRef = React.useRef(value);
  valueRef.current = value;

  // Segments wrap mid-word once per-segment width runs out. The track is
  // ~248px (280 panel − 28 body pad − 4 seg pad), each button loses 12px
  // to its own padding, and 11.5px system-ui averages ~6.3px/char — so 2
  // options fit ~16 chars each, 3 fit ~10. Past that (or >3 options), fall
  // back to a dropdown rather than wrap.
  const labelLen = o => String(typeof o === 'object' ? o.label : o).length;
  const maxLen = options.reduce((m, o) => Math.max(m, labelLen(o)), 0);
  const fitsAsSegments = maxLen <= ({
    2: 16,
    3: 10
  }[options.length] ?? 0);
  if (!fitsAsSegments) {
    // <select> emits strings — map back to the original option value so the
    // fallback stays type-preserving (numbers, booleans) like the segment path.
    const resolve = s => {
      const m = options.find(o => String(typeof o === 'object' ? o.value : o) === s);
      return m === undefined ? s : typeof m === 'object' ? m.value : m;
    };
    return /*#__PURE__*/React.createElement(TweakSelect, {
      label: label,
      value: value,
      options: options,
      onChange: s => onChange(resolve(s))
    });
  }
  const opts = options.map(o => typeof o === 'object' ? o : {
    value: o,
    label: o
  });
  const idx = Math.max(0, opts.findIndex(o => o.value === value));
  const n = opts.length;
  const segAt = clientX => {
    const r = trackRef.current.getBoundingClientRect();
    const inner = r.width - 4;
    const i = Math.floor((clientX - r.left - 2) / inner * n);
    return opts[Math.max(0, Math.min(n - 1, i))].value;
  };
  const onPointerDown = e => {
    setDragging(true);
    const v0 = segAt(e.clientX);
    if (v0 !== valueRef.current) onChange(v0);
    const move = ev => {
      if (!trackRef.current) return;
      const v = segAt(ev.clientX);
      if (v !== valueRef.current) onChange(v);
    };
    const up = () => {
      setDragging(false);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  return /*#__PURE__*/React.createElement(TweakRow, {
    label: label
  }, /*#__PURE__*/React.createElement("div", {
    ref: trackRef,
    role: "radiogroup",
    onPointerDown: onPointerDown,
    className: dragging ? 'twk-seg dragging' : 'twk-seg'
  }, /*#__PURE__*/React.createElement("div", {
    className: "twk-seg-thumb",
    style: {
      left: `calc(2px + ${idx} * (100% - 4px) / ${n})`,
      width: `calc((100% - 4px) / ${n})`
    }
  }), opts.map(o => /*#__PURE__*/React.createElement("button", {
    key: o.value,
    type: "button",
    role: "radio",
    "aria-checked": o.value === value
  }, o.label))));
}
function TweakSelect({
  label,
  value,
  options,
  onChange
}) {
  return /*#__PURE__*/React.createElement(TweakRow, {
    label: label
  }, /*#__PURE__*/React.createElement("select", {
    className: "twk-field",
    value: value,
    onChange: e => onChange(e.target.value)
  }, options.map(o => {
    const v = typeof o === 'object' ? o.value : o;
    const l = typeof o === 'object' ? o.label : o;
    return /*#__PURE__*/React.createElement("option", {
      key: v,
      value: v
    }, l);
  })));
}
function TweakText({
  label,
  value,
  placeholder,
  onChange
}) {
  return /*#__PURE__*/React.createElement(TweakRow, {
    label: label
  }, /*#__PURE__*/React.createElement("input", {
    className: "twk-field",
    type: "text",
    value: value,
    placeholder: placeholder,
    onChange: e => onChange(e.target.value)
  }));
}
function TweakNumber({
  label,
  value,
  min,
  max,
  step = 1,
  unit = '',
  onChange
}) {
  const clamp = n => {
    if (min != null && n < min) return min;
    if (max != null && n > max) return max;
    return n;
  };
  const startRef = React.useRef({
    x: 0,
    val: 0
  });
  const onScrubStart = e => {
    e.preventDefault();
    startRef.current = {
      x: e.clientX,
      val: value
    };
    const decimals = (String(step).split('.')[1] || '').length;
    const move = ev => {
      const dx = ev.clientX - startRef.current.x;
      const raw = startRef.current.val + dx * step;
      const snapped = Math.round(raw / step) * step;
      onChange(clamp(Number(snapped.toFixed(decimals))));
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  return /*#__PURE__*/React.createElement("div", {
    className: "twk-num"
  }, /*#__PURE__*/React.createElement("span", {
    className: "twk-num-lbl",
    onPointerDown: onScrubStart
  }, label), /*#__PURE__*/React.createElement("input", {
    type: "number",
    value: value,
    min: min,
    max: max,
    step: step,
    onChange: e => onChange(clamp(Number(e.target.value)))
  }), unit && /*#__PURE__*/React.createElement("span", {
    className: "twk-num-unit"
  }, unit));
}

// Relative-luminance contrast pick — checkmarks drawn over a swatch need to
// read on both #111 and #fafafa without per-option configuration. Hex input
// only (#rgb / #rrggbb); named or rgb()/hsl() colors fall through to "light".
function __twkIsLight(hex) {
  const h = String(hex).replace('#', '');
  const x = h.length === 3 ? h.replace(/./g, c => c + c) : h.padEnd(6, '0');
  const n = parseInt(x.slice(0, 6), 16);
  if (Number.isNaN(n)) return true;
  const r = n >> 16 & 255,
    g = n >> 8 & 255,
    b = n & 255;
  return r * 299 + g * 587 + b * 114 > 148000;
}
const __TwkCheck = ({
  light
}) => /*#__PURE__*/React.createElement("svg", {
  viewBox: "0 0 14 14",
  "aria-hidden": "true"
}, /*#__PURE__*/React.createElement("path", {
  d: "M3 7.2 5.8 10 11 4.2",
  fill: "none",
  strokeWidth: "2.2",
  strokeLinecap: "round",
  strokeLinejoin: "round",
  stroke: light ? 'rgba(0,0,0,.78)' : '#fff'
}));

// TweakColor — curated color/palette picker. Each option is either a single
// hex string or an array of 1-5 hex strings; the card adapts — a lone color
// renders solid, a palette renders colors[0] as the hero (left ~2/3) with the
// rest stacked in a sharp column on the right. onChange emits the
// option in the shape it was passed (string stays string, array stays array).
// Without options it falls back to the native color input for back-compat.
function TweakColor({
  label,
  value,
  options,
  onChange
}) {
  if (!options || !options.length) {
    return /*#__PURE__*/React.createElement("div", {
      className: "twk-row twk-row-h"
    }, /*#__PURE__*/React.createElement("div", {
      className: "twk-lbl"
    }, /*#__PURE__*/React.createElement("span", null, label)), /*#__PURE__*/React.createElement("input", {
      type: "color",
      className: "twk-swatch",
      value: value,
      onChange: e => onChange(e.target.value)
    }));
  }
  // Native <input type=color> emits lowercase hex per the HTML spec, so
  // compare case-insensitively. String() guards JSON.stringify(undefined),
  // which returns the primitive undefined (no .toLowerCase).
  const key = o => String(JSON.stringify(o)).toLowerCase();
  const cur = key(value);
  return /*#__PURE__*/React.createElement(TweakRow, {
    label: label
  }, /*#__PURE__*/React.createElement("div", {
    className: "twk-chips",
    role: "radiogroup"
  }, options.map((o, i) => {
    const colors = Array.isArray(o) ? o : [o];
    const [hero, ...rest] = colors;
    const sup = rest.slice(0, 4);
    const on = key(o) === cur;
    return /*#__PURE__*/React.createElement("button", {
      key: i,
      type: "button",
      className: "twk-chip",
      role: "radio",
      "aria-checked": on,
      "data-on": on ? '1' : '0',
      "aria-label": colors.join(', '),
      title: colors.join(' · '),
      style: {
        background: hero
      },
      onClick: () => onChange(o)
    }, sup.length > 0 && /*#__PURE__*/React.createElement("span", null, sup.map((c, j) => /*#__PURE__*/React.createElement("i", {
      key: j,
      style: {
        background: c
      }
    }))), on && /*#__PURE__*/React.createElement(__TwkCheck, {
      light: __twkIsLight(hero)
    }));
  })));
}
function TweakButton({
  label,
  onClick,
  secondary = false
}) {
  return /*#__PURE__*/React.createElement("button", {
    type: "button",
    className: secondary ? 'twk-btn secondary' : 'twk-btn',
    onClick: onClick
  }, label);
}
Object.assign(window, {
  useTweaks,
  TweaksPanel,
  TweakSection,
  TweakRow,
  TweakSlider,
  TweakToggle,
  TweakRadio,
  TweakSelect,
  TweakText,
  TweakNumber,
  TweakColor,
  TweakButton
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/vakilcard/tweaks-panel.jsx", error: String((e && e.message) || e) }); }

__ds_ns.Badge = __ds_scope.Badge;

__ds_ns.Button = __ds_scope.Button;

__ds_ns.Chip = __ds_scope.Chip;

__ds_ns.GlassCard = __ds_scope.GlassCard;

__ds_ns.ListRow = __ds_scope.ListRow;

__ds_ns.PricePlan = __ds_scope.PricePlan;

__ds_ns.StatCard = __ds_scope.StatCard;

__ds_ns.Input = __ds_scope.Input;

__ds_ns.ActionTile = __ds_scope.ActionTile;

__ds_ns.VerifiedShield = __ds_scope.VerifiedShield;

})();
