// VakilCard operational admin dashboard — founder-only.
// Route: /vakilcard/admin. Server-gated (frontend/api/vakilcard/admin.js
// checks the caller's verified phone against VAKILCARD_ADMIN_PHONES) — this
// page renders optimistically and simply shows "Not authorized" on a 403,
// it never decides admin-ness itself.
import React, { useCallback, useEffect, useState } from "react";
import {
  ArrowUpCircle, Ban, CheckCircle2, Copy, Download, ExternalLink, Eye, Loader2,
  RefreshCw, Search, ShieldCheck, ShieldOff, Sparkles, Trash2, Users, X, XCircle,
} from "lucide-react";
import {
  adminSummary, adminList, adminUpgrade, adminGrantTrial, adminDowngrade,
  adminSuspend, adminUnsuspend, adminDeleteCard, adminRegistry, adminRegistryExport,
  isForbidden, ApiError,
} from "../../lib/vakilcardApi";
import BrandWordmark from "../../components/BrandWordmark";

const CARD_ORIGIN = "https://www.vakilpedia.com";

const card = "bg-white/70 backdrop-blur-xl border border-slate-200/70 shadow-sm rounded-2xl p-5";
const btn = "rounded-full border px-3 py-1.5 text-xs font-bold inline-flex items-center gap-1.5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed";
const btnNeutral = btn + " bg-white border-slate-200 hover:border-slate-300 text-slate-700";
const btnGood = btn + " bg-emerald-50 border-emerald-200 hover:bg-emerald-100 text-emerald-700";
const btnWarn = btn + " bg-amber-50 border-amber-200 hover:bg-amber-100 text-amber-700";
const btnDanger = btn + " bg-red-50 border-red-200 hover:bg-red-100 text-red-700";

function StatCard({ label, value, icon: Icon }) {
  return (
    <div className={card + " flex items-center gap-3"}>
      <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center flex-none">
        <Icon className="w-5 h-5" />
      </div>
      <div>
        <div className="text-2xl font-black text-slate-900 tabular-nums">{value ?? "—"}</div>
        <div className="text-xs font-bold text-slate-500 uppercase tracking-wide">{label}</div>
      </div>
    </div>
  );
}

function PlanBadge({ plan, status }) {
  const pro = plan === "PRO" && status === "ACTIVE";
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-black uppercase tracking-wide ${pro ? "bg-violet-100 text-violet-700" : "bg-slate-100 text-slate-600"}`}>
      {pro ? "Pro" : "Free"}
    </span>
  );
}

function TabBtn({ active, onClick, icon: Icon, children }) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 px-4 py-2 text-sm font-black border-b-2 -mb-px transition-colors ${active ? "border-indigo-600 text-indigo-700" : "border-transparent text-slate-500 hover:text-slate-700"}`}
    >
      <Icon className="w-4 h-4" /> {children}
    </button>
  );
}

const badge = "rounded-full px-2 py-0.5 text-[11px] font-black uppercase tracking-wide";
const fmtDate = (v) => (v ? new Date(v).toLocaleDateString() : "—");
const fmtDateTime = (v) => (v ? new Date(v).toLocaleString() : "—");
const CARD_STATUS_STYLES = {
  Published: "bg-emerald-100 text-emerald-700",
  Draft: "bg-amber-100 text-amber-700",
  "Not Created": "bg-slate-100 text-slate-500",
};

function YesNo({ value, yes = "Yes", no = "No" }) {
  return value ? (
    <span className="inline-flex items-center gap-1 text-emerald-700 font-bold">
      <CheckCircle2 className="w-3.5 h-3.5" />{yes}
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 text-slate-400 font-bold">
      <XCircle className="w-3.5 h-3.5" />{no}
    </span>
  );
}

// Read-only detail view for one registered user. No editing/deletion.
function RegistryDetailModal({ row, onClose }) {
  if (!row) return null;
  const fields = [
    ["Full Name", row.full_name || "—"],
    ["Username", row.username ? "@" + row.username : "—"],
    ["Phone Number", row.phone || "—"],
    ["Country Code", row.country_code ? "+" + row.country_code : "—"],
    ["WhatsApp Verified", row.whatsapp_verified ? "Yes" : "No"],
    ["Password", row.password_set ? "Set" : "Not Set"],
    ["Card Status", row.card_status],
    ["Products", (row.products || []).join(", ") || "—"],
    ["Plan", row.plan],
    ["Registration Source", row.registration_source],
    ["Registration Date", fmtDateTime(row.registration_date)],
    ["Last Login", fmtDateTime(row.last_login)],
    ["Last Activity", fmtDateTime(row.last_active)],
    ["Public Card URL", row.public_url || "—"],
  ];
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onClick={onClose}>
      <div className={card + " max-w-lg w-full max-h-[85vh] overflow-y-auto"} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <div className="font-black text-slate-900">{row.full_name || (row.username ? "@" + row.username : "User")}</div>
          <button onClick={onClose} className={btnNeutral}><X className="w-3.5 h-3.5" /> Close</button>
        </div>
        <dl className="divide-y divide-slate-100">
          {fields.map(([k, v]) => (
            <div key={k} className="flex gap-4 py-2 text-sm">
              <dt className="w-40 flex-none text-slate-500 font-bold">{k}</dt>
              <dd className="text-slate-900 break-all">{v}</dd>
            </div>
          ))}
        </dl>
        {row.public_url && (
          <a href={row.public_url} target="_blank" rel="noopener noreferrer" className={btnNeutral + " mt-4"}>
            <ExternalLink className="w-3.5 h-3.5" /> Open public card
          </a>
        )}
      </div>
    </div>
  );
}

// READ-ONLY VakilCard Users registry. Every VakilCard registration appears
// here (driven from verified-phone accounts server-side) — even incomplete
// onboarding. No edit/delete/billing actions live in this tab by design.
function UsersRegistry({ onError }) {
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [q, setQ] = useState("");
  const [verification, setVerification] = useState("ALL");
  const [plan, setPlan] = useState("ALL");
  const [cardStatus, setCardStatus] = useState("ALL");
  const [password, setPassword] = useState("ALL");
  const [sort, setSort] = useState("NEWEST");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [copied, setCopied] = useState(null);
  const [detail, setDetail] = useState(null);
  const pageSize = 25;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await adminRegistry({ q, verification, plan, card: cardStatus, password, sort, page, pageSize });
      setRows(data.rows || []);
      setTotal(data.total || 0);
    } catch (e) {
      onError(e instanceof ApiError ? e.code : "Couldn't load the user registry.");
    } finally {
      setLoading(false);
    }
  }, [q, verification, plan, cardStatus, password, sort, page, onError]);

  useEffect(() => { load(); }, [load]);

  const copyUrl = (row) => {
    if (!row.public_url) return;
    if (navigator.clipboard) navigator.clipboard.writeText(row.public_url);
    setCopied(row.account_id);
    setTimeout(() => setCopied(null), 1400);
  };

  const exportCsv = async () => {
    setExporting(true);
    try {
      const blob = await adminRegistryExport({ q, verification, plan, card: cardStatus, password, sort });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "vakilcard-users.csv";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      onError(e instanceof ApiError ? e.code : "CSV export failed.");
    } finally {
      setExporting(false);
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const resetPage = (setter) => (e) => { setPage(1); setter(e.target.value); };
  const selectCls = "rounded-full border border-slate-200 text-sm font-bold text-slate-700 px-3 py-2";

  return (
    <>
      <div className={card + " mb-4 flex flex-wrap items-center gap-3"}>
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={q}
            onChange={(e) => { setPage(1); setQ(e.target.value); }}
            placeholder="Search name, username, phone…"
            className="w-full pl-9 pr-3 py-2 rounded-full border border-slate-200 text-sm focus:outline-none focus:border-indigo-300"
          />
        </div>
        <select value={verification} onChange={resetPage(setVerification)} className={selectCls}>
          <option value="ALL">All verification</option>
          <option value="VERIFIED">Verified</option>
          <option value="UNVERIFIED">Unverified</option>
        </select>
        <select value={plan} onChange={resetPage(setPlan)} className={selectCls}>
          <option value="ALL">All plans</option>
          <option value="FREE">Free</option>
          <option value="PAID">Paid</option>
        </select>
        <select value={cardStatus} onChange={resetPage(setCardStatus)} className={selectCls}>
          <option value="ALL">All cards</option>
          <option value="PUBLISHED">Published</option>
          <option value="DRAFT">Draft</option>
          <option value="NONE">Not created</option>
        </select>
        <select value={password} onChange={resetPage(setPassword)} className={selectCls}>
          <option value="ALL">Any password</option>
          <option value="SET">Password set</option>
          <option value="UNSET">No password</option>
        </select>
        <select value={sort} onChange={resetPage(setSort)} className={selectCls}>
          <option value="NEWEST">Newest</option>
          <option value="ACTIVE">Last active</option>
          <option value="USERNAME">Username</option>
        </select>
        <button onClick={exportCsv} disabled={exporting} className={btnNeutral}>
          {exporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />} Export CSV
        </button>
      </div>

      <div className="mb-3 text-xs font-bold text-slate-500">{total} registered user{total === 1 ? "" : "s"}</div>

      <div className={card + " p-0 overflow-hidden"}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm whitespace-nowrap">
            <thead>
              <tr className="text-left text-[11px] font-black uppercase tracking-wide text-slate-500 border-b border-slate-200">
                <th className="px-4 py-3">Name / Username</th>
                <th className="px-4 py-3">Phone</th>
                <th className="px-4 py-3">WhatsApp</th>
                <th className="px-4 py-3">Password</th>
                <th className="px-4 py-3">Card</th>
                <th className="px-4 py-3">Products</th>
                <th className="px-4 py-3">Plan</th>
                <th className="px-4 py-3">Registered</th>
                <th className="px-4 py-3">Last Active</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && rows.length === 0 && (
                <tr><td colSpan={10} className="px-4 py-10 text-center text-slate-400"><Loader2 className="w-5 h-5 animate-spin mx-auto" /></td></tr>
              )}
              {!loading && rows.length === 0 && (
                <tr><td colSpan={10} className="px-4 py-10 text-center text-slate-400">No registered users match this filter.</td></tr>
              )}
              {rows.map((r) => (
                <tr key={r.account_id} className="border-b border-slate-100 last:border-0 align-top">
                  <td className="px-4 py-3">
                    <div className="font-bold text-slate-900">{r.full_name || "—"}</div>
                    <div className="text-slate-500">{r.username ? "@" + r.username : "—"}</div>
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {r.phone || "—"}
                    {r.country_code && <span className="text-slate-400"> (+{r.country_code})</span>}
                  </td>
                  <td className="px-4 py-3"><YesNo value={r.whatsapp_verified} yes="Verified" no="Unverified" /></td>
                  <td className="px-4 py-3 font-bold">{r.password_set ? <span className="text-emerald-700">Set</span> : <span className="text-slate-400">Not set</span>}</td>
                  <td className="px-4 py-3"><span className={badge + " " + (CARD_STATUS_STYLES[r.card_status] || "bg-slate-100 text-slate-500")}>{r.card_status}</span></td>
                  <td className="px-4 py-3 text-slate-600">{(r.products || []).join(", ") || "—"}</td>
                  <td className="px-4 py-3"><span className={badge + " " + (r.plan === "Paid" ? "bg-violet-100 text-violet-700" : "bg-slate-100 text-slate-600")}>{r.plan}</span></td>
                  <td className="px-4 py-3 text-slate-500">{fmtDate(r.registration_date)}</td>
                  <td className="px-4 py-3 text-slate-500">{fmtDate(r.last_active)}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap justify-end gap-1.5">
                      <button onClick={() => setDetail(r)} className={btnNeutral}><Eye className="w-3.5 h-3.5" /> View</button>
                      {r.public_url ? (
                        <a href={r.public_url} target="_blank" rel="noopener noreferrer" className={btnNeutral}><ExternalLink className="w-3.5 h-3.5" /> Card</a>
                      ) : (
                        <button disabled className={btnNeutral}><ExternalLink className="w-3.5 h-3.5" /> Card</button>
                      )}
                      <button onClick={() => copyUrl(r)} disabled={!r.public_url} className={btnNeutral}>
                        <Copy className="w-3.5 h-3.5" /> {copied === r.account_id ? "Copied" : "Copy URL"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex items-center justify-between mt-4 text-sm text-slate-500">
        <span>Page {page} of {totalPages}</span>
        <div className="flex gap-2">
          <button disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))} className={btnNeutral}>Previous</button>
          <button disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)} className={btnNeutral}>Next</button>
        </div>
      </div>

      <RegistryDetailModal row={detail} onClose={() => setDetail(null)} />
    </>
  );
}

export default function AdminPage() {
  const [tab, setTab] = useState("subscriptions");
  const [summary, setSummary] = useState(null);
  const [rows, setRows] = useState([]);
  const [q, setQ] = useState("");
  const [plan, setPlan] = useState("ALL");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState(null);
  const [copiedId, setCopiedId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [s, l] = await Promise.all([
        adminSummary(),
        adminList({ q, plan, page, pageSize: 25 }),
      ]);
      setSummary(s);
      setRows(l.rows || []);
    } catch (e) {
      if (isForbidden(e)) setForbidden(true);
      else setError(e instanceof ApiError ? e.code : "Couldn't load the admin dashboard.");
    } finally {
      setLoading(false);
    }
  }, [q, plan, page]);

  useEffect(() => { load(); }, [load]);

  const act = async (id, fn, ...args) => {
    setBusyId(id);
    try {
      await fn(id, ...args);
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.code : "Action failed.");
    } finally {
      setBusyId(null);
    }
  };

  const copyLink = (username) => {
    const url = `${CARD_ORIGIN}/${username}`;
    if (navigator.clipboard) navigator.clipboard.writeText(url);
    setCopiedId(username);
    setTimeout(() => setCopiedId(null), 1400);
  };

  if (forbidden) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 px-6">
        <div className={card + " max-w-sm text-center"}>
          <ShieldOff className="w-8 h-8 mx-auto mb-3 text-slate-400" />
          <div className="font-black text-slate-900 mb-1">Not authorized</div>
          <div className="text-sm text-slate-500">This account isn't on the VakilCard admin allowlist.</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
        <div className="flex items-center gap-2.5 mb-6">
          <img src="/logo.png" alt="Vakilpedia" className="h-7 w-auto object-contain" />
          <BrandWordmark className="font-black text-slate-900 tracking-tighter text-lg" />
          <span className="rounded-full bg-slate-900 text-white text-[10px] font-black uppercase tracking-widest px-2.5 py-1 ml-1">VakilCard Admin</span>
          <button onClick={load} className={btnNeutral + " ml-auto"} disabled={loading}>
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
          </button>
        </div>

        <div className="flex items-center gap-2 mb-6 border-b border-slate-200">
          <TabBtn active={tab === "subscriptions"} onClick={() => setTab("subscriptions")} icon={Sparkles}>Subscriptions</TabBtn>
          <TabBtn active={tab === "users"} onClick={() => setTab("users")} icon={Users}>Users</TabBtn>
        </div>

        {error && <div className="mb-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm font-bold px-4 py-3">{error}</div>}

        {tab === "users" && <UsersRegistry onError={setError} />}

        {tab === "subscriptions" && (<>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-6">
          <StatCard label="Total cards" value={summary?.total} icon={Users} />
          <StatCard label="Free" value={summary?.free} icon={Users} />
          <StatCard label="Pro" value={summary?.pro} icon={Sparkles} />
          <StatCard label="Pending verification" value={summary?.pending} icon={ShieldCheck} />
          <StatCard label="Suspended" value={summary?.suspended} icon={Ban} />
        </div>

        <div className={card + " mb-4 flex flex-wrap items-center gap-3"}>
          <div className="relative flex-1 min-w-[200px]">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              value={q}
              onChange={(e) => { setPage(1); setQ(e.target.value); }}
              placeholder="Search username, name, phone, email…"
              className="w-full pl-9 pr-3 py-2 rounded-full border border-slate-200 text-sm focus:outline-none focus:border-indigo-300"
            />
          </div>
          <select
            value={plan}
            onChange={(e) => { setPage(1); setPlan(e.target.value); }}
            className="rounded-full border border-slate-200 text-sm font-bold text-slate-700 px-3 py-2"
          >
            <option value="ALL">All plans</option>
            <option value="FREE">Free</option>
            <option value="PRO">Pro</option>
            <option value="PENDING">Pending verification</option>
            <option value="SUSPENDED">Suspended</option>
          </select>
        </div>

        <div className={card + " p-0 overflow-hidden"}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] font-black uppercase tracking-wide text-slate-500 border-b border-slate-200">
                  <th className="px-4 py-3">Card</th>
                  <th className="px-4 py-3">Contact</th>
                  <th className="px-4 py-3">Plan</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Created</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading && rows.length === 0 && (
                  <tr><td colSpan={6} className="px-4 py-10 text-center text-slate-400"><Loader2 className="w-5 h-5 animate-spin mx-auto" /></td></tr>
                )}
                {!loading && rows.length === 0 && (
                  <tr><td colSpan={6} className="px-4 py-10 text-center text-slate-400">No VakilCards match this filter.</td></tr>
                )}
                {rows.map((r) => {
                  const busy = busyId === r.id;
                  return (
                    <tr key={r.id} className="border-b border-slate-100 last:border-0 align-top">
                      <td className="px-4 py-3">
                        <div className="font-bold text-slate-900">{r.full_name || "—"}</div>
                        <div className="text-slate-500">@{r.username}</div>
                        {!r.is_published && <span className="inline-block mt-1 rounded-full bg-amber-50 text-amber-700 text-[10px] font-black uppercase px-2 py-0.5">Draft / pending</span>}
                        {r.is_suspended && <span className="inline-block mt-1 ml-1 rounded-full bg-red-50 text-red-700 text-[10px] font-black uppercase px-2 py-0.5">Suspended</span>}
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        <div>{r.phone || "—"}</div>
                        <div className="text-slate-400">{r.email || ""}</div>
                      </td>
                      <td className="px-4 py-3"><PlanBadge plan={r.subscription_plan} status={r.subscription_status} /></td>
                      <td className="px-4 py-3 text-slate-500">
                        {r.subscription_status}
                        {r.subscription_expires_at && <div className="text-[11px] text-slate-400">till {new Date(r.subscription_expires_at).toLocaleDateString()}</div>}
                      </td>
                      <td className="px-4 py-3 text-slate-500">{new Date(r.created_at).toLocaleDateString()}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap justify-end gap-1.5">
                          <a href={`${CARD_ORIGIN}/${r.username}`} target="_blank" rel="noopener noreferrer" className={btnNeutral}>
                            <ExternalLink className="w-3.5 h-3.5" /> View
                          </a>
                          <button onClick={() => copyLink(r.username)} className={btnNeutral}>
                            <Copy className="w-3.5 h-3.5" /> {copiedId === r.username ? "Copied" : "Copy link"}
                          </button>
                          {r.subscription_plan !== "PRO" && (
                            <button disabled={busy} onClick={() => act(r.id, adminUpgrade)} className={btnGood}>
                              <ArrowUpCircle className="w-3.5 h-3.5" /> Upgrade
                            </button>
                          )}
                          {r.subscription_plan !== "PRO" && (
                            <button disabled={busy} onClick={() => act(r.id, adminGrantTrial, 14)} className={btnNeutral}>
                              Trial 14d
                            </button>
                          )}
                          {r.subscription_plan === "PRO" && (
                            <button disabled={busy} onClick={() => act(r.id, adminDowngrade)} className={btnWarn}>
                              Downgrade
                            </button>
                          )}
                          {!r.is_suspended ? (
                            <button disabled={busy} onClick={() => act(r.id, adminSuspend)} className={btnWarn}>
                              <Ban className="w-3.5 h-3.5" /> Suspend
                            </button>
                          ) : (
                            <button disabled={busy} onClick={() => act(r.id, adminUnsuspend)} className={btnGood}>
                              <ShieldCheck className="w-3.5 h-3.5" /> Unsuspend
                            </button>
                          )}
                          <button
                            disabled={busy}
                            onClick={() => {
                              if (window.confirm(`Permanently delete @${r.username}'s VakilCard? This cannot be undone.`)) {
                                act(r.id, adminDeleteCard);
                              }
                            }}
                            className={btnDanger}
                          >
                            <Trash2 className="w-3.5 h-3.5" /> Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div className="flex items-center justify-between mt-4 text-sm text-slate-500">
          <span>Page {page}</span>
          <div className="flex gap-2">
            <button disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))} className={btnNeutral}>Previous</button>
            <button disabled={rows.length < 25} onClick={() => setPage((p) => p + 1)} className={btnNeutral}>Next</button>
          </div>
        </div>
        </>)}
      </div>
    </div>
  );
}
