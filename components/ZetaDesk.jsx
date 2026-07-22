"use client";
import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  Shield, LayoutDashboard, Users, TrendingUp, FileText, Ship, RefreshCw,
  AlertCircle, Plus, Search, Filter, Upload, LogOut, Anchor, CheckCircle2,
  IndianRupee, Trash2, X, Building2, Activity, PhoneCall, MapPin, Calendar,
} from "lucide-react";
import { supabase, supabaseConfigured } from "@/lib/supabaseClient";
import { getSession, signIn, signOut, onAuthChange } from "@/lib/auth";
import { listAll, insertRow, updateRow, deleteRow, insertMany } from "@/lib/db";

// ---------- helpers ----------
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function formatDate(d) {
  if (!d) return "—";
  const dt = new Date(d);
  if (isNaN(dt)) return String(d);
  return `${String(dt.getDate()).padStart(2, "0")}/${MONTHS[dt.getMonth()]}/${dt.getFullYear()}`;
}
function daysUntil(d) {
  if (!d) return null;
  const dt = new Date(d);
  if (isNaN(dt)) return null;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  return Math.round((dt - today) / 86400000);
}
function formatINR(n) {
  const v = Number(n) || 0;
  return "₹" + v.toLocaleString("en-IN");
}
function nowLabel() {
  return new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
}

const STAGE_COLORS = { RFQ: "#B8722A", Negotiation: "#3D6B8C", Won: "#1F5C99", Lost: "#A8392F" };
const CLAIM_STATUS_COLORS = { Open: "#B8722A", "Under Review": "#3D6B8C", Settled: "#1F5C99", Repudiated: "#A8392F" };
const STATUS_COLORS = { Issued: "#1F5C99", Draft: "#B8722A", Cancelled: "#A8392F" };

const inputStyle = {
  width: "100%", padding: "9px 11px", fontSize: 13, border: "1px solid #D8CFB8",
  borderRadius: 7, backgroundColor: "#FFFEFA", color: "#152A47", boxSizing: "border-box",
  fontFamily: "inherit", outline: "none",
};

// ---------- Pill ----------
function Pill({ label, color = "#6b7280" }) {
  return (
    <span style={{ display: "inline-block", padding: "2px 9px", fontSize: 11, fontWeight: 600, borderRadius: 20, color, backgroundColor: color + "1A", whiteSpace: "nowrap" }}>{label}</span>
  );
}

// ============================================================
//  LOGIN SCREEN
// ============================================================
function LoginScreen({ onSignedIn }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    if (!email || !password) { setError("Enter your email and password."); return; }
    setBusy(true); setError("");
    const res = await signIn(email.trim(), password);
    setBusy(false);
    if (res.ok) onSignedIn(res.session);
    else setError(res.error || "Sign-in failed.");
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "linear-gradient(160deg,#152A47,#1E3A5F)", padding: 20 }}>
      <div style={{ width: "100%", maxWidth: 400, backgroundColor: "#FCFAF4", borderRadius: 14, padding: 34, boxShadow: "0 20px 60px rgba(0,0,0,0.35)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 11, marginBottom: 6 }}>
          <div style={{ width: 40, height: 40, borderRadius: 9, backgroundColor: "#2E5C8A", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Shield size={22} color="#FFFFFF" />
          </div>
          <div>
            <div style={{ fontSize: 21, fontWeight: 700, fontFamily: "'Source Serif 4', Georgia, serif", color: "#152A47", lineHeight: 1 }}>ZetaDesk</div>
            <div style={{ fontSize: 11.5, color: "#8a8273" }}>General Insurance Broking</div>
          </div>
        </div>
        <p style={{ fontSize: 13, color: "#6B6356", margin: "18px 0 18px" }}>Sign in to your team workspace.</p>

        {!supabaseConfigured && (
          <div style={{ backgroundColor: "#FBF1EF", border: "1px solid #E8C8C2", borderRadius: 8, padding: "10px 12px", fontSize: 12, color: "#A8392F", marginBottom: 14 }}>
            Database keys are not configured yet. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in Vercel.
          </div>
        )}

        <label style={{ fontSize: 12, fontWeight: 600, color: "#6B6356" }}>Email</label>
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} style={{ ...inputStyle, margin: "5px 0 14px" }} placeholder="you@zetainsurance.in" />

        <label style={{ fontSize: 12, fontWeight: 600, color: "#6B6356" }}>Password</label>
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} style={{ ...inputStyle, margin: "5px 0 14px" }} placeholder="••••••••" />

        {error && <div style={{ fontSize: 12.5, color: "#A8392F", marginBottom: 12, fontWeight: 500 }}>{error}</div>}

        <button onClick={submit} disabled={busy} style={{ width: "100%", padding: "11px", fontSize: 14, fontWeight: 600, backgroundColor: "#1F5C99", color: "#fff", border: "none", borderRadius: 8, cursor: busy ? "default" : "pointer" }}>
          {busy ? "Signing in…" : "Sign in"}
        </button>

        <p style={{ fontSize: 11.5, color: "#a89f8c", marginTop: 16, textAlign: "center" }}>
          Team accounts are created by your administrator in Supabase.
        </p>
      </div>
    </div>
  );
}

// ============================================================
//  DataTable — reusable filter/sort/search/export table
// ============================================================
function DataTable({ columns, rows, onRowClick, emptyMessage = "No records.", searchPlaceholder = "Search…", minWidth = 700, exportName }) {
  const [globalSearch, setGlobalSearch] = useState("");
  const [filters, setFilters] = useState({});
  const [openFilter, setOpenFilter] = useState(null);
  const [sort, setSort] = useState({ key: null, dir: null });

  const rawVal = (col, row) => {
    const v = col.get ? col.get(row) : row[col.key];
    return v == null ? "" : v;
  };
  const matchesColumn = (col, row) => {
    const f = filters[col.key];
    if (!f) return true;
    const v = rawVal(col, row);
    if (col.type === "number") {
      const n = Number(v) || 0;
      if (f.min !== "" && f.min != null && n < Number(f.min)) return false;
      if (f.max !== "" && f.max != null && n > Number(f.max)) return false;
      return true;
    }
    if (col.type === "date") {
      const d = String(v || "");
      if (!d) return f.mode ? false : true;
      if (f.mode === "after" && f.from) return d >= f.from;
      if (f.mode === "before" && f.to) return d <= f.to;
      if (f.mode === "between" && f.from && f.to) return d >= f.from && d <= f.to;
      return true;
    }
    if (!f.text) return true;
    return String(v).toLowerCase().includes(f.text.toLowerCase());
  };
  const filtered = useMemo(() => {
    let out = rows.filter((row) => {
      if (globalSearch.trim()) {
        const hay = columns.map((c) => String(rawVal(c, row))).join(" ").toLowerCase();
        if (!hay.includes(globalSearch.trim().toLowerCase())) return false;
      }
      return columns.every((c) => matchesColumn(c, row));
    });
    if (sort.key && sort.dir) {
      const col = columns.find((c) => c.key === sort.key);
      out = [...out].sort((a, b) => {
        let av = rawVal(col, a), bv = rawVal(col, b);
        if (col.type === "number") { av = Number(av) || 0; bv = Number(bv) || 0; }
        else { av = String(av).toLowerCase(); bv = String(bv).toLowerCase(); }
        if (av < bv) return sort.dir === "asc" ? -1 : 1;
        if (av > bv) return sort.dir === "asc" ? 1 : -1;
        return 0;
      });
    }
    return out;
  }, [rows, columns, globalSearch, filters, sort]);

  const activeFilterCount = Object.values(filters).filter(Boolean).length;
  const toggleSort = (key) => setSort((s) => s.key !== key ? { key, dir: "asc" } : s.dir === "asc" ? { key, dir: "desc" } : { key: null, dir: null });
  const setColFilter = (key, val) => setFilters((f) => ({ ...f, [key]: val }));
  const clearColFilter = (key) => setFilters((f) => { const n = { ...f }; delete n[key]; return n; });

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10, flexWrap: "wrap" }}>
        <div style={{ position: "relative", flex: 1, minWidth: 220, maxWidth: 380 }}>
          <Search size={14} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "#a89f8c" }} />
          <input value={globalSearch} onChange={(e) => setGlobalSearch(e.target.value)} placeholder={searchPlaceholder} style={{ ...inputStyle, paddingLeft: 30, fontSize: 12.5, margin: 0 }} />
        </div>
        <span style={{ fontSize: 12, color: "#8a8273" }}>{filtered.length} of {rows.length}</span>
        {(activeFilterCount > 0 || globalSearch || sort.key) && (
          <button type="button" onClick={() => { setFilters({}); setGlobalSearch(""); setSort({ key: null, dir: null }); }} style={{ fontSize: 11.5, fontWeight: 600, color: "#A8392F", background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}>Clear all</button>
        )}
        {exportName && rows.length > 0 && (
          <button type="button" onClick={() => {
            import("xlsx").then((XLSX) => {
              const header = columns.map((c) => c.label);
              const body = filtered.map((row) => columns.map((c) => { const v = rawVal(c, row); return typeof v === "number" ? v : String(v); }));
              const ws = XLSX.utils.aoa_to_sheet([header, ...body]);
              const wb = XLSX.utils.book_new();
              XLSX.utils.book_append_sheet(wb, ws, exportName.slice(0, 31));
              XLSX.writeFile(wb, `${exportName.replace(/[^a-zA-Z0-9-_]/g, "_")}_${new Date().toISOString().slice(0, 10)}.xlsx`);
            });
          }} style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11.5, fontWeight: 600, color: "#1F5C99", background: "none", border: "1px solid #C9DDD5", borderRadius: 6, padding: "4px 10px", cursor: "pointer" }}>
            <Upload size={12} style={{ transform: "rotate(180deg)" }} /> Export
          </button>
        )}
      </div>
      <div style={{ overflowX: "auto", backgroundColor: "#FFFEFA", border: "1px solid #EAE3D3", borderRadius: 10 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth }}>
          <thead>
            <tr style={{ backgroundColor: "#EDE7D8", textAlign: "left" }}>
              {columns.map((col) => {
                const isFiltered = !!filters[col.key];
                const isSorted = sort.key === col.key;
                return (
                  <th key={col.key} style={{ padding: "9px 12px", fontSize: 11, fontWeight: 700, color: "#6B6356", textTransform: "uppercase", letterSpacing: "0.03em", whiteSpace: "nowrap", position: "relative", width: col.width }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                      <span onClick={() => col.type !== "custom" && toggleSort(col.key)} style={{ cursor: col.type !== "custom" ? "pointer" : "default", userSelect: "none" }}>
                        {col.label}{isSorted && <span style={{ marginLeft: 3, color: "#3D6B8C" }}>{sort.dir === "asc" ? "▲" : "▼"}</span>}
                      </span>
                      {col.type && col.type !== "custom" && (
                        <button type="button" onClick={(e) => { e.stopPropagation(); setOpenFilter(openFilter === col.key ? null : col.key); }} style={{ background: "none", border: "none", cursor: "pointer", padding: 0, display: "flex", color: isFiltered ? "#3D6B8C" : "#b8b0a0" }}>
                          <Filter size={12} fill={isFiltered ? "#3D6B8C" : "none"} />
                        </button>
                      )}
                    </div>
                    {openFilter === col.key && (
                      <div style={{ position: "absolute", top: "100%", left: 0, zIndex: 40, marginTop: 4, backgroundColor: "#FFFEFA", border: "1px solid #D8CFB8", borderRadius: 8, boxShadow: "0 6px 20px rgba(0,0,0,0.12)", padding: 12, minWidth: 210, textTransform: "none", letterSpacing: 0 }}>
                        {col.type === "text" && (
                          <input autoFocus value={filters[col.key]?.text || ""} onChange={(e) => setColFilter(col.key, { text: e.target.value })} placeholder={`Filter ${col.label}…`} style={{ ...inputStyle, fontSize: 12, margin: 0 }} />
                        )}
                        {col.type === "number" && (
                          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                            <input type="number" placeholder="Min" value={filters[col.key]?.min ?? ""} onChange={(e) => setColFilter(col.key, { ...filters[col.key], min: e.target.value })} style={{ ...inputStyle, fontSize: 12, margin: 0 }} />
                            <input type="number" placeholder="Max" value={filters[col.key]?.max ?? ""} onChange={(e) => setColFilter(col.key, { ...filters[col.key], max: e.target.value })} style={{ ...inputStyle, fontSize: 12, margin: 0 }} />
                          </div>
                        )}
                        {col.type === "date" && (
                          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                            <select value={filters[col.key]?.mode || "after"} onChange={(e) => setColFilter(col.key, { ...filters[col.key], mode: e.target.value })} style={{ ...inputStyle, fontSize: 12, margin: 0 }}>
                              <option value="after">On / After</option>
                              <option value="before">On / Before</option>
                              <option value="between">Between</option>
                            </select>
                            {filters[col.key]?.mode !== "before" && (
                              <input type="date" value={filters[col.key]?.from || ""} onChange={(e) => setColFilter(col.key, { ...filters[col.key], from: e.target.value })} style={{ ...inputStyle, fontSize: 12, margin: 0 }} />
                            )}
                            {(filters[col.key]?.mode === "before" || filters[col.key]?.mode === "between") && (
                              <input type="date" value={filters[col.key]?.to || ""} onChange={(e) => setColFilter(col.key, { ...filters[col.key], to: e.target.value })} style={{ ...inputStyle, fontSize: 12, margin: 0 }} />
                            )}
                          </div>
                        )}
                        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8 }}>
                          <button type="button" onClick={() => { clearColFilter(col.key); setOpenFilter(null); }} style={{ fontSize: 11.5, color: "#A8392F", background: "none", border: "none", cursor: "pointer" }}>Clear</button>
                          <button type="button" onClick={() => setOpenFilter(null)} style={{ fontSize: 11.5, fontWeight: 600, color: "#3D6B8C", background: "none", border: "none", cursor: "pointer" }}>Done</button>
                        </div>
                      </div>
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {filtered.map((row, ri) => (
              <tr key={row.id || ri} className={onRowClick ? "row-hover" : ""} onClick={onRowClick ? () => onRowClick(row) : undefined} style={{ borderTop: "1px solid #EAE3D3", cursor: onRowClick ? "pointer" : "default" }}>
                {columns.map((col) => (
                  <td key={col.key} style={{ padding: "11px 12px", textAlign: col.align || "left", fontFamily: col.mono ? "'IBM Plex Mono', monospace" : "inherit", fontWeight: col.bold ? 600 : "normal", whiteSpace: col.wrap ? "normal" : "nowrap" }}>
                    {col.render ? col.render(row) : (rawVal(col, row) === "" ? "—" : rawVal(col, row))}
                  </td>
                ))}
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={columns.length} style={{ padding: 20, textAlign: "center", color: "#8a8273" }}>{rows.length === 0 ? emptyMessage : "No records match the current filters."}</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// (main app component continues in part 2)
export default function ZetaDeskRoot() {
  return <ZetaDeskApp />;
}

// ============================================================
//  MAIN APP
// ============================================================
const TABLES = ["clients", "insurers", "vendors", "products", "opportunities", "policies", "marine_declarations", "claims", "team_members", "calls", "visits"];

function ZetaDeskApp() {
  const [session, setSession] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [tab, setTab] = useState("dashboard");

  // per-record collections
  const [clients, setClients] = useState([]);
  const [insurers, setInsurers] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [products, setProducts] = useState([]);
  const [opportunities, setOpportunities] = useState([]);
  const [policies, setPolicies] = useState([]);
  const [marineDecls, setMarineDecls] = useState([]);
  const [claims, setClaims] = useState([]);
  const [teamMembers, setTeamMembers] = useState([]);
  const [calls, setCalls] = useState([]);
  const [visits, setVisits] = useState([]);

  const [loading, setLoading] = useState(false);
  const [dbError, setDbError] = useState("");
  const [lastSynced, setLastSynced] = useState("");
  const [toast, setToast] = useState("");

  const setters = {
    clients: setClients, insurers: setInsurers, vendors: setVendors, products: setProducts,
    opportunities: setOpportunities, policies: setPolicies, marine_declarations: setMarineDecls, claims: setClaims,
    team_members: setTeamMembers, calls: setCalls, visits: setVisits,
  };

  // ---- auth bootstrap ----
  useEffect(() => {
    (async () => {
      const s = await getSession();
      setSession(s);
      setAuthReady(true);
    })();
    const off = onAuthChange((s) => setSession(s));
    return off;
  }, []);

  // ---- load all tables once signed in ----
  async function loadEverything() {
    setLoading(true); setDbError("");
    try {
      const results = await Promise.all(TABLES.map((t) => listAll(t)));
      let failed = null;
      results.forEach((res, i) => {
        if (!res.ok) { failed = res.error; return; }
        setters[TABLES[i]](res.rows);
      });
      if (failed) setDbError("Could not load data: " + failed);
      else setLastSynced(nowLabel());
    } catch (e) {
      setDbError("Load failed: " + (e?.message || "network error"));
    }
    setLoading(false);
  }
  useEffect(() => { if (session) loadEverything(); }, [session]);

  const flash = (msg) => { setToast(msg); setTimeout(() => setToast(""), 3000); };

  // ---- generic per-record helpers ----
  async function createRecord(table, obj) {
    const res = await insertRow(table, obj);
    if (res.ok) { setters[table]((prev) => [...prev, res.row]); flash("Saved."); return res.row; }
    setDbError("Save failed: " + res.error); return null;
  }
  async function updateRecord(table, id, obj) {
    const res = await updateRow(table, id, obj);
    if (res.ok) { setters[table]((prev) => prev.map((r) => r.id === id ? res.row : r)); flash("Saved."); return res.row; }
    setDbError("Update failed: " + res.error); return null;
  }
  async function removeRecord(table, id) {
    const res = await deleteRow(table, id);
    if (res.ok) { setters[table]((prev) => prev.filter((r) => r.id !== id)); flash("Deleted."); return true; }
    setDbError("Delete failed: " + res.error); return false;
  }

  const clientName = (id) => clients.find((c) => c.id === id)?.name || "—";
  const marinePolicies = useMemo(() => policies.filter((p) => (p.policy_type || "").toLowerCase().includes("marine")), [policies]);

  // ---------- gates ----------
  if (!authReady) {
    return <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", color: "#8a8273" }}>Loading…</div>;
  }
  if (!session) {
    return <LoginScreen onSignedIn={(s) => setSession(s)} />;
  }

  const TABS = [
    { key: "dashboard", label: "Dashboard", icon: LayoutDashboard },
    { key: "clients", label: "Clients", icon: Users },
    { key: "opportunities", label: "Opportunities", icon: TrendingUp },
    { key: "policies", label: "Policies", icon: IndianRupee },
    { key: "marine", label: "Marine", icon: Ship },
    { key: "renewals", label: "Renewals", icon: RefreshCw },
    { key: "claims", label: "Claims", icon: AlertCircle },
    { key: "fieldactivity", label: "Field Activity", icon: Activity },
    { key: "calls", label: "Calls", icon: PhoneCall },
    { key: "visits", label: "Visits", icon: MapPin },
    { key: "masters", label: "Masters", icon: Building2 },
  ];

  return (
    <div style={{ minHeight: "100vh", backgroundColor: "#F3F0E7" }}>
      <style>{`
        .row-hover:hover { background-color: #F5F0E3 !important; }
        .tab-btn:hover { color: #1F5C99 !important; }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>

      {/* header */}
      <div style={{ backgroundColor: "#152A47", padding: "14px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
          <div style={{ width: 34, height: 34, borderRadius: 8, backgroundColor: "#2E5C8A", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Shield size={19} color="#FFFFFF" />
          </div>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700, fontFamily: "'Source Serif 4', Georgia, serif", color: "#F6F2E8", lineHeight: 1 }}>ZetaDesk</div>
            <div style={{ fontSize: 10.5, color: "#B5AD9B" }}>General Insurance Broking</div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button onClick={loadEverything} disabled={loading} style={hdrBtn}>
            <RefreshCw size={13} style={loading ? { animation: "spin 0.8s linear infinite" } : {}} /> {loading ? "Syncing…" : "Refresh"}
          </button>
          <button onClick={() => exportAll({ clients, opportunities, policies, marineDecls, claims, insurers, vendors, products, calls, visits, clientName })} style={hdrBtn}>
            <Upload size={13} style={{ transform: "rotate(180deg)" }} /> Export All
          </button>
          <span style={{ fontSize: 11.5, color: "#B5AD9B" }}>{session.user?.email}</span>
          <button onClick={async () => { await signOut(); setSession(null); }} style={{ ...hdrBtn, backgroundColor: "transparent" }}>
            <LogOut size={13} /> Sign out
          </button>
        </div>
      </div>
      {lastSynced && <div style={{ textAlign: "right", fontSize: 10.5, color: "#B5AD9B", padding: "4px 24px 0", backgroundColor: "#152A47" }}>Last synced {lastSynced}</div>}

      {/* nav */}
      <div style={{ backgroundColor: "#FCFAF4", borderBottom: "1px solid #E5DCC6", padding: "0 16px", display: "flex", gap: 2, overflowX: "auto" }}>
        {TABS.map((t) => {
          const active = tab === t.key;
          const Icon = t.icon;
          return (
            <button key={t.key} className="tab-btn" onClick={() => setTab(t.key)} style={{ display: "flex", alignItems: "center", gap: 6, padding: "12px 14px", fontSize: 13, fontWeight: 600, background: "none", border: "none", cursor: "pointer", whiteSpace: "nowrap", borderBottom: active ? "2px solid #1F5C99" : "2px solid transparent", color: active ? "#1F5C99" : "#8a8273" }}>
              <Icon size={15} /> {t.label}
            </button>
          );
        })}
      </div>

      {dbError && (
        <div style={{ backgroundColor: "#7A2318", color: "#FFF3F0", padding: "12px 24px", display: "flex", alignItems: "center", gap: 14, fontSize: 13 }}>
          <AlertCircle size={20} style={{ flexShrink: 0 }} />
          <div style={{ flex: 1 }}>{dbError}</div>
          <button onClick={loadEverything} style={{ padding: "8px 14px", fontSize: 12.5, fontWeight: 700, backgroundColor: "#FFF3F0", color: "#7A2318", border: "none", borderRadius: 6, cursor: "pointer" }}>Reload</button>
        </div>
      )}

      <div style={{ padding: 24, maxWidth: 1150, margin: "0 auto" }}>
        {tab === "dashboard" && <Dashboard clients={clients} opportunities={opportunities} policies={policies} claims={claims} marinePolicies={marinePolicies} insurers={insurers} vendors={vendors} products={products} setTab={setTab} />}
        {tab === "clients" && <ClientsTab rows={clients} onCreate={(o) => createRecord("clients", o)} onUpdate={(id, o) => updateRecord("clients", id, o)} onDelete={(id) => removeRecord("clients", id)} onImport={(list) => bulkImport("clients", list, setClients, setDbError, flash)} />}
        {tab === "opportunities" && <OpportunitiesTab rows={opportunities} clients={clients} onCreate={(o) => createRecord("opportunities", o)} onUpdate={(id, o) => updateRecord("opportunities", id, o)} onDelete={(id) => removeRecord("opportunities", id)} clientName={clientName} />}
        {tab === "policies" && <PoliciesTab rows={policies} onCreate={(o) => createRecord("policies", o)} onUpdate={(id, o) => updateRecord("policies", id, o)} onDelete={(id) => removeRecord("policies", id)} onImport={(list) => bulkImport("policies", list, setPolicies, setDbError, flash)} />}
        {tab === "marine" && <MarineTab marinePolicies={marinePolicies} decls={marineDecls} onCreateDecl={(o) => createRecord("marine_declarations", o)} onOpenPolicy={(p) => { setTab("policies"); }} />}
        {tab === "renewals" && <RenewalsTab policies={policies} />}
        {tab === "claims" && <ClaimsTab rows={claims} clients={clients} onCreate={(o) => createRecord("claims", o)} onUpdate={(id, o) => updateRecord("claims", id, o)} onDelete={(id) => removeRecord("claims", id)} clientName={clientName} />}
        {tab === "fieldactivity" && <FieldActivityDashboard calls={calls} visits={visits} teamMembers={teamMembers} setTab={setTab} />}
        {tab === "calls" && <CallVisitTab kind="call" rows={calls} teamMembers={teamMembers} onCreate={(o) => createRecord("calls", o)} onUpdate={(id, o) => updateRecord("calls", id, o)} onDelete={(id) => removeRecord("calls", id)} />}
        {tab === "visits" && <CallVisitTab kind="visit" rows={visits} teamMembers={teamMembers} onCreate={(o) => createRecord("visits", o)} onUpdate={(id, o) => updateRecord("visits", id, o)} onDelete={(id) => removeRecord("visits", id)} />}
        {tab === "masters" && <MastersTab insurers={insurers} vendors={vendors} products={products} teamMembers={teamMembers}
          onCreateInsurer={(o) => createRecord("insurers", o)} onUpdateInsurer={(id, o) => updateRecord("insurers", id, o)} onDeleteInsurer={(id) => removeRecord("insurers", id)}
          onCreateVendor={(o) => createRecord("vendors", o)} onUpdateVendor={(id, o) => updateRecord("vendors", id, o)} onDeleteVendor={(id) => removeRecord("vendors", id)}
          onCreateTeam={(o) => createRecord("team_members", o)} onDeleteTeam={(id) => removeRecord("team_members", id)} />}
      </div>

      {toast && (
        <div style={{ position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)", backgroundColor: "#152A47", color: "#F6F2E8", padding: "10px 18px", borderRadius: 8, fontSize: 13, display: "flex", alignItems: "center", gap: 8, boxShadow: "0 6px 20px rgba(0,0,0,0.25)", zIndex: 100 }}>
          <CheckCircle2 size={15} color="#8FC0D8" /> {toast}
        </div>
      )}
    </div>
  );
}

const hdrBtn = { display: "flex", alignItems: "center", gap: 6, padding: "8px 12px", fontSize: 12.5, fontWeight: 600, backgroundColor: "#1E3A5F", color: "#F6F2E8", border: "1px solid #2E4A70", borderRadius: 6, cursor: "pointer", whiteSpace: "nowrap" };

// bulk import helper (per-record inserts, one row each)
async function bulkImport(table, list, setter, setDbError, flash) {
  const res = await insertMany(table, list);
  if (res.ok) { setter((prev) => [...prev, ...res.rows]); flash(`Imported ${res.rows.length} record(s).`); }
  else setDbError("Import failed: " + res.error);
}

// full export — one sheet per table
function exportAll({ clients, opportunities, policies, marineDecls, claims, insurers, vendors, products, calls, visits, clientName }) {
  import("xlsx").then((XLSX) => {
    const wb = XLSX.utils.book_new();
    const add = (name, header, body) => { const ws = XLSX.utils.aoa_to_sheet([header, ...body]); XLSX.utils.book_append_sheet(wb, ws, name.slice(0, 31)); };
    add("Clients", ["Name", "Type", "Contact", "Phone", "Email"], clients.map((c) => [c.name, c.type, c.contact_person, c.phone, c.email]));
    add("Opportunities", ["Title", "Client", "Stage", "Products", "Sum Insured", "Due"], opportunities.map((o) => [o.title, "", o.stage, o.products, Number(o.sumInsured) || 0, o.dueDate]));
    add("Policies", ["Insured", "Policy No", "Type", "Status", "Period From", "Period To", "Premium", "Insurer"], policies.map((p) => [p.insured_name, p.policy_no, p.policy_type, p.status, p.period_from, p.period_to, Number(p.premium) || 0, p.insurerName]));
    add("Marine Declarations", ["Policy", "Seq", "Type", "Declared", "Covered", "Closing SI"], (marineDecls || []).map((d) => [d.policy_id, d.seq, d.transaction_type, Number(d.declaredValue) || 0, Number(d.coveredValue) || 0, Number(d.closingBalance) || 0]));
    add("Claims", ["Claim No", "Status", "Type", "Amount"], claims.map((c) => [c.claim_no, c.status, c.type, Number(c.amount) || 0]));
    add("Insurers", ["Insurer", "Branch"], insurers.map((i) => [i.insurer, i.branch]));
    add("Vendors", ["Vendor", "Commission %"], vendors.map((v) => [v.vendor_name, Number(v.commissionPct) || 0]));
    add("Calls", ["Date", "Company", "RM", "Contact", "Purpose", "Status", "Follow-up", "Notes"], (calls || []).map((c) => [c.call_date, c.company_name, c.rm_name, c.contactPerson, c.purpose, c.status, c.followUpDate, c.notes]));
    add("Visits", ["Date", "Company", "RM", "Contact", "Purpose", "Status", "Follow-up", "Notes"], (visits || []).map((v) => [v.visit_date, v.company_name, v.rm_name, v.contactPerson, v.purpose, v.status, v.followUpDate, v.notes]));
    XLSX.writeFile(wb, `ZetaDesk_Full-Export_${new Date().toISOString().slice(0, 10)}.xlsx`);
  });
}

// ============================================================
//  Shared small components
// ============================================================
function StatCard({ icon: Icon, label, value, sub, accent, onClick }) {
  return (
    <div onClick={onClick} style={{ backgroundColor: "#FFFEFA", border: "1px solid #EAE3D3", borderLeft: `4px solid ${accent}`, borderRadius: 10, padding: "16px 18px", flex: 1, minWidth: 150, cursor: onClick ? "pointer" : "default" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <Icon size={15} color={accent} />
        <span style={{ fontSize: 11, fontWeight: 600, color: "#8a8273", textTransform: "uppercase", letterSpacing: "0.04em" }}>{label}</span>
      </div>
      <div style={{ fontSize: 24, fontWeight: 700, color: "#152A47", fontFamily: "'Source Serif 4', Georgia, serif" }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: "#8a8273", marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function Modal({ title, onClose, onSave, saveLabel = "Save", onDelete, children }) {
  return (
    <div style={{ position: "fixed", inset: 0, backgroundColor: "rgba(43,38,32,0.5)", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "40px 16px", zIndex: 200, overflowY: "auto" }} onClick={onClose}>
      <div style={{ backgroundColor: "#FCFAF4", borderRadius: 12, width: "100%", maxWidth: 620, boxShadow: "0 20px 60px rgba(0,0,0,0.3)" }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "18px 22px", borderBottom: "1px solid #E5DCC6" }}>
          <h3 style={{ margin: 0, fontSize: 17, fontFamily: "'Source Serif 4', Georgia, serif", color: "#152A47" }}>{title}</h3>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "#8a8273" }}><X size={20} /></button>
        </div>
        <div style={{ padding: 22 }}>{children}</div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 22px", borderTop: "1px solid #E5DCC6" }}>
          <div>{onDelete && <button onClick={onDelete} style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", color: "#A8392F", cursor: "pointer", fontSize: 13, fontWeight: 600 }}><Trash2 size={14} /> Delete</button>}</div>
          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={onClose} style={{ padding: "9px 16px", fontSize: 13, fontWeight: 600, background: "none", border: "1px solid #D8CFB8", borderRadius: 7, color: "#6B6356", cursor: "pointer" }}>Cancel</button>
            <button onClick={onSave} style={{ padding: "9px 18px", fontSize: 13, fontWeight: 600, backgroundColor: "#1F5C99", color: "#fff", border: "none", borderRadius: 7, cursor: "pointer" }}>{saveLabel}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, type = "text", placeholder, options }) {
  return (
    <div style={{ marginBottom: 13 }}>
      <label style={{ fontSize: 12, fontWeight: 600, color: "#6B6356", display: "block", marginBottom: 4 }}>{label}</label>
      {options ? (
        <select value={value || ""} onChange={(e) => onChange(e.target.value)} style={inputStyle}>
          <option value="">— select —</option>
          {options.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      ) : (
        <input type={type} value={value ?? ""} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} style={inputStyle} />
      )}
    </div>
  );
}

function TabHeader({ title, subtitle, onAdd, addLabel, onImport }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16, gap: 12, flexWrap: "wrap" }}>
      <div>
        <h2 style={{ margin: 0, fontSize: 20, fontFamily: "'Source Serif 4', Georgia, serif", color: "#152A47" }}>{title}</h2>
        {subtitle && <p style={{ fontSize: 12.5, color: "#8a8273", margin: "6px 0 0", maxWidth: 640 }}>{subtitle}</p>}
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        {onImport && <button onClick={onImport} style={{ display: "flex", alignItems: "center", gap: 6, padding: "9px 14px", fontSize: 13, fontWeight: 600, background: "#FFFEFA", border: "1px solid #D8CFB8", borderRadius: 7, color: "#6B6356", cursor: "pointer" }}><Upload size={14} /> Import</button>}
        {onAdd && <button onClick={onAdd} style={{ display: "flex", alignItems: "center", gap: 6, padding: "9px 16px", fontSize: 13, fontWeight: 600, backgroundColor: "#1F5C99", color: "#fff", border: "none", borderRadius: 7, cursor: "pointer" }}><Plus size={15} /> {addLabel}</button>}
      </div>
    </div>
  );
}

// end-date cell with countdown pill
function EndDateCell({ date, status }) {
  const d = daysUntil(date);
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, whiteSpace: "nowrap" }}>
      <span>{formatDate(date)}</span>
      {status !== "Cancelled" && d !== null && d <= 60 && <Pill label={d < 0 ? "Expired" : `${d}d`} color={d < 0 ? "#A8392F" : d <= 14 ? "#A8392F" : "#B8722A"} />}
    </span>
  );
}

// ============================================================
//  DASHBOARD
// ============================================================
function Dashboard({ clients, opportunities, policies, claims, marinePolicies, insurers, vendors, products, setTab }) {
  const openOpps = opportunities.filter((o) => o.stage !== "Won" && o.stage !== "Lost").length;
  const draftPolicies = policies.filter((p) => (p.status || "Draft") === "Draft").length;
  const openClaims = claims.filter((c) => (c.status || "Open") !== "Settled" && c.status !== "Repudiated").length;
  const renewalsDue = policies.filter((p) => { const d = daysUntil(p.period_to); return p.status !== "Cancelled" && d !== null && d <= 60 && d >= -30; }).length;

  const upcoming = [...policies]
    .filter((p) => p.period_to && p.status !== "Cancelled")
    .map((p) => ({ ...p, d: daysUntil(p.period_to) }))
    .filter((p) => p.d !== null && p.d <= 90 && p.d >= -30)
    .sort((a, b) => a.d - b.d)
    .slice(0, 8);

  return (
    <div>
      <h2 style={{ margin: "0 0 16px", fontSize: 20, fontFamily: "'Source Serif 4', Georgia, serif", color: "#152A47" }}>Dashboard</h2>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
        <StatCard icon={Users} label="Clients" value={clients.length} sub="total" accent="#1F5C99" onClick={() => setTab("clients")} />
        <StatCard icon={TrendingUp} label="Opportunities" value={openOpps} sub="open pipeline" accent="#3D6B8C" onClick={() => setTab("opportunities")} />
        <StatCard icon={IndianRupee} label="Policies" value={policies.length} sub={`${draftPolicies} drafts`} accent="#6B5B95" onClick={() => setTab("policies")} />
        <StatCard icon={RefreshCw} label="Renewals" value={renewalsDue} sub="within 60 days" accent="#B8722A" onClick={() => setTab("renewals")} />
      </div>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 22 }}>
        <StatCard icon={AlertCircle} label="Claims" value={openClaims} sub="open" accent="#A8392F" onClick={() => setTab("claims")} />
        <StatCard icon={Ship} label="Marine" value={marinePolicies.length} sub="policies" accent="#3D6B8C" onClick={() => setTab("marine")} />
        <StatCard icon={Building2} label="Masters" value={insurers.length + vendors.length + products.length} sub="insurers · vendors · products" accent="#6B6356" onClick={() => setTab("masters")} />
      </div>

      <div style={{ backgroundColor: "#FFFEFA", border: "1px solid #EAE3D3", borderRadius: 10, padding: 18 }}>
        <h3 style={{ margin: "0 0 12px", fontSize: 15, fontFamily: "'Source Serif 4', Georgia, serif", color: "#152A47" }}>Upcoming & overdue renewals (next 90 days)</h3>
        {upcoming.length === 0 ? (
          <p style={{ fontSize: 13, color: "#8a8273", margin: 0 }}>Nothing due in the next 90 days.</p>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <tbody>
              {upcoming.map((p) => (
                <tr key={p.id} style={{ borderTop: "1px solid #EAE3D3" }}>
                  <td style={{ padding: "9px 6px", fontWeight: 600 }}>{p.insured_name || "—"}</td>
                  <td style={{ padding: "9px 6px", color: "#8a8273" }}>{p.policy_type || "—"}</td>
                  <td style={{ padding: "9px 6px", fontFamily: "'IBM Plex Mono', monospace", fontSize: 12 }}>{p.policy_no || "—"}</td>
                  <td style={{ padding: "9px 6px", textAlign: "right" }}><EndDateCell date={p.period_to} status={p.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ============================================================
//  CLIENTS
// ============================================================
const CLIENT_TYPES = ["Marine Cargo", "Motor Fleet", "Fire / Property", "Liability", "GMC / GPA / EC", "Miscellaneous"];
function ClientsTab({ rows, onCreate, onUpdate, onDelete, onImport }) {
  const [modal, setModal] = useState(null);
  const openAdd = () => setModal({ mode: "add", data: {} });
  const openEdit = (c) => setModal({ mode: "edit", data: { ...c } });
  const save = async () => {
    const d = modal.data;
    if (!d.name) return;
    if (modal.mode === "add") await onCreate(d); else await onUpdate(d.id, d);
    setModal(null);
  };
  return (
    <div>
      <TabHeader title="Clients" subtitle="Your book of clients across all lines. Each client is stored as its own record." onAdd={openAdd} addLabel="Add Client" onImport={() => document.getElementById("client-import").click()} />
      <ImportInput id="client-import" table="clients" onImport={onImport} />
      <DataTable rows={rows} onRowClick={openEdit} searchPlaceholder="Search clients…" exportName="Clients" minWidth={760}
        columns={[
          { key: "name", label: "Name", type: "text", bold: true, get: (c) => c.name || "" },
          { key: "type", label: "Segment", type: "text", get: (c) => c.type || "" },
          { key: "policyType", label: "Type of Policy", type: "text", get: (c) => c.policyType || "" },
          { key: "contact_person", label: "Contact", type: "text", get: (c) => c.contact_person || "" },
          { key: "phone", label: "Phone", type: "text", get: (c) => c.phone || "" },
          { key: "insurer", label: "Insurer", type: "text", get: (c) => c.insurer || "" },
          { key: "endDate", label: "Policy End Date", type: "date", get: (c) => c.endDate || "", render: (c) => <EndDateCell date={c.endDate} /> },
        ]} />
      {modal && (
        <Modal title={modal.mode === "add" ? "Add Client" : "Edit Client"} onClose={() => setModal(null)} onSave={save} onDelete={modal.mode === "edit" ? async () => { await onDelete(modal.data.id); setModal(null); } : null}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Field label="Client Name *" value={modal.data.name} onChange={(v) => setModal((m) => ({ ...m, data: { ...m.data, name: v } }))} />
            <Field label="Segment" value={modal.data.type} onChange={(v) => setModal((m) => ({ ...m, data: { ...m.data, type: v } }))} options={CLIENT_TYPES} />
            <Field label="Type of Policy" value={modal.data.policyType} onChange={(v) => setModal((m) => ({ ...m, data: { ...m.data, policyType: v } }))} />
            <Field label="Contact Person" value={modal.data.contact_person} onChange={(v) => setModal((m) => ({ ...m, data: { ...m.data, contact_person: v } }))} />
            <Field label="Phone" value={modal.data.phone} onChange={(v) => setModal((m) => ({ ...m, data: { ...m.data, phone: v } }))} />
            <Field label="Email" value={modal.data.email} onChange={(v) => setModal((m) => ({ ...m, data: { ...m.data, email: v } }))} />
            <Field label="Insurer" value={modal.data.insurer} onChange={(v) => setModal((m) => ({ ...m, data: { ...m.data, insurer: v } }))} />
            <Field label="Policy No." value={modal.data.policyNo} onChange={(v) => setModal((m) => ({ ...m, data: { ...m.data, policyNo: v } }))} />
            <Field label="Sum Insured (₹)" type="number" value={modal.data.sumInsured} onChange={(v) => setModal((m) => ({ ...m, data: { ...m.data, sumInsured: v } }))} />
            <Field label="Policy End / Renewal" type="date" value={modal.data.endDate} onChange={(v) => setModal((m) => ({ ...m, data: { ...m.data, endDate: v } }))} />
          </div>
        </Modal>
      )}
    </div>
  );
}

// Excel import input (shared)
function ImportInput({ id, table, onImport }) {
  const onFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    import("xlsx").then((XLSX) => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const wb = XLSX.read(ev.target.result, { type: "binary" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json(ws, { defval: "" });
        const mapped = json.map((r) => mapImportRow(table, r)).filter(Boolean);
        onImport(mapped);
      };
      reader.readAsBinaryString(file);
    });
    e.target.value = "";
  };
  return <input id={id} type="file" accept=".xlsx,.xls,.csv" onChange={onFile} style={{ display: "none" }} />;
}

// map common header names to record fields
function mapImportRow(table, r) {
  const g = (...keys) => { for (const k of keys) { const hit = Object.keys(r).find((x) => x.toLowerCase().trim() === k.toLowerCase()); if (hit && r[hit] !== "") return r[hit]; } return ""; };
  if (table === "clients") {
    const name = g("Client Name", "name", "insured name");
    if (!name) return null;
    return { name, type: g("Type", "segment"), contact_person: g("Contact Person", "contact"), phone: g("Phone"), email: g("Email"), insurer: g("Insurer"), policyNo: g("Policy No.", "policy no", "policy number"), policyType: g("Policy Type", "type of policy"), sumInsured: g("Sum Insured"), endDate: g("Policy End / Renewal", "policy end", "renewal", "end date") };
  }
  if (table === "policies") {
    const insured = g("Insured Name", "insured", "name");
    if (!insured) return null;
    return { insured_name: insured, policy_no: g("Policy Number", "policy no", "policy no."), policy_type: g("Type of Policy", "policy type", "type"), status: "Draft", period_from: g("Period From", "start"), period_to: g("Period To", "end", "expiry"), premium: g("Premium"), cover: g("Cover", "sum insured"), insurerName: g("Insurer Name", "insurer"), payoutPct: g("Payout %", "payout") };
  }
  return null;
}

// ============================================================
//  POLICIES
// ============================================================
const POLICY_TYPES = ["Marine Cargo - Open Policy", "Marine Cargo - Specific", "Motor - Comprehensive", "Fire (SFSP)", "Burglary", "GMC", "GPA", "Workmen Compensation", "Public Liability", "Miscellaneous"];
function PoliciesTab({ rows, onCreate, onUpdate, onDelete, onImport }) {
  const [modal, setModal] = useState(null);
  const openAdd = () => setModal({ mode: "add", data: { status: "Draft" } });
  const openEdit = (p) => setModal({ mode: "edit", data: { ...p } });
  const save = async () => {
    const d = modal.data;
    if (!d.insured_name) return;
    if (modal.mode === "add") await onCreate(d); else await onUpdate(d.id, d);
    setModal(null);
  };
  return (
    <div>
      <TabHeader title="Policy Database" subtitle="Issued and draft policies. Each policy is its own record — editing one never affects another." onAdd={openAdd} addLabel="Add Policy" onImport={() => document.getElementById("policy-import").click()} />
      <ImportInput id="policy-import" table="policies" onImport={onImport} />
      <DataTable rows={rows} onRowClick={openEdit} searchPlaceholder="Search policies…" exportName="Policies" minWidth={1080}
        columns={[
          { key: "status", label: "Status", type: "text", get: (p) => p.status || "Draft", render: (p) => <Pill label={p.status || "Draft"} color={STATUS_COLORS[p.status || "Draft"]} /> },
          { key: "insured_name", label: "Insured Name", type: "text", bold: true, get: (p) => p.insured_name || "" },
          { key: "policy_no", label: "Policy No.", type: "text", mono: true, get: (p) => p.policy_no || "" },
          { key: "policy_type", label: "Type of Policy", type: "text", get: (p) => p.policy_type || "" },
          { key: "insurerName", label: "Insurer", type: "text", get: (p) => p.insurerName || "" },
          { key: "period_from", label: "Period From", type: "date", get: (p) => p.period_from || "", render: (p) => <span style={{ color: "#8a8273" }}>{formatDate(p.period_from)}</span> },
          { key: "period_to", label: "Policy End Date", type: "date", get: (p) => p.period_to || "", render: (p) => <EndDateCell date={p.period_to} status={p.status} /> },
          { key: "premium", label: "Premium", type: "number", mono: true, get: (p) => Number(p.premium) || 0, render: (p) => p.premium ? formatINR(p.premium) : "—" },
        ]} />
      {modal && (
        <Modal title={modal.mode === "add" ? "Add Policy" : "Edit Policy"} onClose={() => setModal(null)} onSave={save} onDelete={modal.mode === "edit" ? async () => { await onDelete(modal.data.id); setModal(null); } : null}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Field label="Insured Name *" value={modal.data.insured_name} onChange={(v) => setModal((m) => ({ ...m, data: { ...m.data, insured_name: v } }))} />
            <Field label="Policy No." value={modal.data.policy_no} onChange={(v) => setModal((m) => ({ ...m, data: { ...m.data, policy_no: v } }))} />
            <Field label="Type of Policy" value={modal.data.policy_type} onChange={(v) => setModal((m) => ({ ...m, data: { ...m.data, policy_type: v } }))} options={POLICY_TYPES} />
            <Field label="Status" value={modal.data.status} onChange={(v) => setModal((m) => ({ ...m, data: { ...m.data, status: v } }))} options={["Draft", "Issued", "Cancelled"]} />
            <Field label="Period From" type="date" value={modal.data.period_from} onChange={(v) => setModal((m) => ({ ...m, data: { ...m.data, period_from: v } }))} />
            <Field label="Period To" type="date" value={modal.data.period_to} onChange={(v) => setModal((m) => ({ ...m, data: { ...m.data, period_to: v } }))} />
            <Field label="Premium (₹)" type="number" value={modal.data.premium} onChange={(v) => setModal((m) => ({ ...m, data: { ...m.data, premium: v } }))} />
            <Field label="Cover / Sum Insured" value={modal.data.cover} onChange={(v) => setModal((m) => ({ ...m, data: { ...m.data, cover: v } }))} />
            <Field label="Insurer" value={modal.data.insurerName} onChange={(v) => setModal((m) => ({ ...m, data: { ...m.data, insurerName: v } }))} />
            <Field label="Payout %" type="number" value={modal.data.payoutPct} onChange={(v) => setModal((m) => ({ ...m, data: { ...m.data, payoutPct: v } }))} />
          </div>
          {(modal.data.policy_type || "").toLowerCase().includes("marine") && (
            <div style={{ marginTop: 6, padding: 12, backgroundColor: "#F6FBFF", border: "1px solid #C7D4DD", borderRadius: 8 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#3D6B8C", textTransform: "uppercase", marginBottom: 8 }}>Marine settings</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
                <Field label="Marine SI (₹)" type="number" value={modal.data.marineSI} onChange={(v) => setModal((m) => ({ ...m, data: { ...m.data, marineSI: v } }))} />
                <Field label="BOV %" type="number" value={modal.data.bovPct} onChange={(v) => setModal((m) => ({ ...m, data: { ...m.data, bovPct: v } }))} />
                <Field label="Declaration Interval" value={modal.data.declarationMode} onChange={(v) => setModal((m) => ({ ...m, data: { ...m.data, declarationMode: v } }))} options={["Monthly", "Quarterly"]} />
              </div>
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}

// ============================================================
//  OPPORTUNITIES
// ============================================================
function OpportunitiesTab({ rows, clients, onCreate, onUpdate, onDelete, clientName }) {
  const [modal, setModal] = useState(null);
  const openAdd = () => setModal({ mode: "add", data: { stage: "RFQ" } });
  const openEdit = (o) => setModal({ mode: "edit", data: { ...o } });
  const save = async () => {
    const d = modal.data;
    if (!d.title) return;
    if (modal.mode === "add") await onCreate(d); else await onUpdate(d.id, d);
    setModal(null);
  };
  return (
    <div>
      <TabHeader title="Opportunities" subtitle="RFQ → Negotiation → Won / Lost. Won opportunities become policy drafts." onAdd={openAdd} addLabel="Add Opportunity" />
      <DataTable rows={rows} onRowClick={openEdit} searchPlaceholder="Search opportunities…" exportName="Opportunities" minWidth={900}
        columns={[
          { key: "title", label: "Opportunity", type: "text", bold: true, get: (o) => o.title || "" },
          { key: "client", label: "Client", type: "text", get: (o) => clientName(o.client_id) },
          { key: "products", label: "Type of Policy", type: "text", get: (o) => o.products || "" },
          { key: "insurer", label: "Insurer", type: "text", get: (o) => o.insurer || "" },
          { key: "sumInsured", label: "Sum Insured", type: "number", mono: true, get: (o) => Number(o.sumInsured) || 0, render: (o) => o.sumInsured ? formatINR(o.sumInsured) : "—" },
          { key: "stage", label: "Stage", type: "text", get: (o) => o.stage || "", render: (o) => <Pill label={o.stage} color={STAGE_COLORS[o.stage]} /> },
          { key: "dueDate", label: "Due", type: "date", get: (o) => o.dueDate || "", render: (o) => <span style={{ color: "#8a8273" }}>{formatDate(o.dueDate)}</span> },
        ]} />
      {modal && (
        <Modal title={modal.mode === "add" ? "Add Opportunity" : "Edit Opportunity"} onClose={() => setModal(null)} onSave={save} onDelete={modal.mode === "edit" ? async () => { await onDelete(modal.data.id); setModal(null); } : null}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Field label="Opportunity Title *" value={modal.data.title} onChange={(v) => setModal((m) => ({ ...m, data: { ...m.data, title: v } }))} />
            <div style={{ marginBottom: 13 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: "#6B6356", display: "block", marginBottom: 4 }}>Client</label>
              <select value={modal.data.client_id || ""} onChange={(e) => setModal((m) => ({ ...m, data: { ...m.data, client_id: e.target.value } }))} style={inputStyle}>
                <option value="">— select —</option>
                {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <Field label="Type of Policy" value={modal.data.products} onChange={(v) => setModal((m) => ({ ...m, data: { ...m.data, products: v } }))} />
            <Field label="Stage" value={modal.data.stage} onChange={(v) => setModal((m) => ({ ...m, data: { ...m.data, stage: v } }))} options={["RFQ", "Negotiation", "Won", "Lost"]} />
            <Field label="Insurer" value={modal.data.insurer} onChange={(v) => setModal((m) => ({ ...m, data: { ...m.data, insurer: v } }))} />
            <Field label="Sum Insured (₹)" type="number" value={modal.data.sumInsured} onChange={(v) => setModal((m) => ({ ...m, data: { ...m.data, sumInsured: v } }))} />
            <Field label="Due Date" type="date" value={modal.data.dueDate} onChange={(v) => setModal((m) => ({ ...m, data: { ...m.data, dueDate: v } }))} />
            <Field label="Next Action" value={modal.data.nextAction} onChange={(v) => setModal((m) => ({ ...m, data: { ...m.data, nextAction: v } }))} />
          </div>
        </Modal>
      )}
    </div>
  );
}

// ============================================================
//  MARINE
// ============================================================
function computeCovered(policy, declared) {
  const inv = Number(declared) || 0;
  const bov = Number(policy.bovPct) || 0;
  return inv * (1 + bov / 100);
}
function parseSI(policy) {
  const explicit = Number(policy.marineSI);
  if (!isNaN(explicit) && explicit > 0) return explicit;
  const digits = String(policy.cover || "").replace(/[^0-9.]/g, "");
  return parseFloat(digits) || 0;
}
function MarineTab({ marinePolicies, decls, onCreateDecl }) {
  const [selected, setSelected] = useState(null);
  const ledgerFor = (pid) => decls.filter((d) => d.policy_id === pid).sort((a, b) => (a.seq || 0) - (b.seq || 0));
  const balanceFor = (p) => { const l = ledgerFor(p.id); return l.length ? Number(l[l.length - 1].closingBalance) || 0 : parseSI(p); };

  if (selected) {
    const p = marinePolicies.find((x) => x.id === selected);
    if (!p) { setSelected(null); return null; }
    return <MarinePolicyDetail policy={p} ledger={ledgerFor(p.id)} balance={balanceFor(p)} onBack={() => setSelected(null)} onCreateDecl={onCreateDecl} />;
  }
  return (
    <div>
      <TabHeader title="Marine" subtitle="Every policy whose type contains 'Marine' appears here. Click one to manage its SI declaration ledger." />
      <DataTable rows={marinePolicies} onRowClick={(p) => setSelected(p.id)} searchPlaceholder="Search marine policies…" exportName="Marine" minWidth={1000}
        columns={[
          { key: "insured_name", label: "Insured Name", type: "text", bold: true, get: (p) => p.insured_name || "" },
          { key: "policy_no", label: "Policy No.", type: "text", mono: true, get: (p) => p.policy_no || "" },
          { key: "policy_type", label: "Type of Policy", type: "text", get: (p) => p.policy_type || "" },
          { key: "period_to", label: "Policy End Date", type: "date", get: (p) => p.period_to || "", render: (p) => <EndDateCell date={p.period_to} status={p.status} /> },
          { key: "decls", label: "Declarations", type: "number", get: (p) => ledgerFor(p.id).length },
          { key: "balance", label: "SI Balance", type: "number", mono: true, get: (p) => balanceFor(p), render: (p) => formatINR(balanceFor(p)) },
        ]} />
    </div>
  );
}

function MarinePolicyDetail({ policy, ledger, balance, onBack, onCreateDecl }) {
  const [val, setVal] = useState("");
  const [cert, setCert] = useState("No");
  const [source, setSource] = useState("Quick Declaration");
  const [err, setErr] = useState("");
  const covered = computeCovered(policy, val);
  const rate = Number(policy.payoutPct) || 0;

  const add = async () => {
    if (!val) { setErr("Enter a declaration value."); return; }
    if (covered > balance) { setErr("Rejected: covered value ₹" + Math.round(covered).toLocaleString("en-IN") + " exceeds available balance ₹" + Math.round(balance).toLocaleString("en-IN") + "."); return; }
    const seq = (ledger[ledger.length - 1]?.seq || 0) + 1;
    await onCreateDecl({
      policy_id: policy.id, seq, transaction_type: source, entrySource: source,
      declaredValue: Number(val), coveredValue: covered, certificateIssued: cert,
      openingBalance: balance, closingBalance: balance - covered,
      premiumDue: rate > 0 ? +(covered * rate / 100).toFixed(2) : 0,
      loggedDate: new Date().toISOString().slice(0, 10),
    });
    setVal(""); setCert("No"); setErr("");
  };

  return (
    <div>
      <button onClick={onBack} style={{ background: "none", border: "none", color: "#3D6B8C", cursor: "pointer", fontSize: 13, fontWeight: 600, marginBottom: 12 }}>← Back to marine policies</button>
      <h2 style={{ margin: "0 0 4px", fontSize: 20, fontFamily: "'Source Serif 4', Georgia, serif", color: "#152A47" }}>{policy.insured_name}</h2>
      <div style={{ fontSize: 12.5, color: "#8a8273", marginBottom: 16, fontFamily: "'IBM Plex Mono', monospace" }}>{policy.policy_no} · {policy.declarationMode || "Monthly"}</div>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 18 }}>
        <StatCard icon={Anchor} label="Opening SI" value={formatINR(parseSI(policy))} accent="#3D6B8C" />
        <StatCard icon={IndianRupee} label="Available balance" value={formatINR(balance)} accent="#1F5C99" />
        <StatCard icon={FileText} label="Declarations" value={ledger.filter((r) => r.transaction_type?.includes("Declaration")).length} accent="#6B5B95" />
      </div>

      <div style={{ backgroundColor: "#F6FBFF", border: "1px solid #C7D4DD", borderRadius: 10, padding: 16, marginBottom: 18 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "#3D6B8C", textTransform: "uppercase", marginBottom: 10 }}>Log a declaration</div>
        <div style={{ display: "grid", gridTemplateColumns: "1.3fr 1fr 1fr 1fr auto", gap: 10, alignItems: "end" }}>
          <div><label style={lbl}>Declaration Value (₹)</label><input type="number" value={val} onChange={(e) => { setVal(e.target.value); setErr(""); }} style={{ ...inputStyle, fontSize: 12 }} /><div style={{ fontSize: 10.5, color: "#8a8273", marginTop: 3 }}>Covered @ {policy.bovPct || 0}% BOV: {formatINR(covered)}</div></div>
          <div><label style={lbl}>Source</label><select value={source} onChange={(e) => setSource(e.target.value)} style={{ ...inputStyle, fontSize: 12 }}><option>Quick Declaration</option><option>Bulk Declaration</option></select></div>
          <div><label style={lbl}>Certificate?</label><select value={cert} onChange={(e) => setCert(e.target.value)} style={{ ...inputStyle, fontSize: 12 }}><option>No</option><option>Yes</option></select></div>
          <div />
          <button onClick={add} style={{ display: "flex", alignItems: "center", gap: 5, padding: "9px 14px", fontSize: 12.5, fontWeight: 600, backgroundColor: "#1F5C99", color: "#fff", border: "none", borderRadius: 7, cursor: "pointer" }}><Plus size={13} /> Log</button>
        </div>
        {err && <div style={{ marginTop: 8, fontSize: 12, color: "#A8392F", fontWeight: 600 }}>{err}</div>}
      </div>

      <div style={{ fontSize: 12, fontWeight: 700, color: "#3D6B8C", textTransform: "uppercase", marginBottom: 8 }}>Declaration Ledger</div>
      <div style={{ overflowX: "auto", border: "1px solid #C7D4DD", borderRadius: 8, backgroundColor: "#FFFEFA" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, minWidth: 720 }}>
          <thead><tr style={{ backgroundColor: "#E8F0F6", textAlign: "left" }}>{["Seq", "Source", "Cert.", "Declared", "Covered", "Opening SI", "Closing SI", "Premium"].map((h) => <th key={h} style={{ padding: "7px 10px", fontSize: 10, fontWeight: 700, color: "#3D6B8C", textTransform: "uppercase" }}>{h}</th>)}</tr></thead>
          <tbody>
            {ledger.map((r) => (
              <tr key={r.id} style={{ borderTop: "1px solid #DCE6EE" }}>
                <td style={{ padding: "7px 10px" }}>{r.seq}</td>
                <td style={{ padding: "7px 10px" }}><Pill label={r.entrySource || r.transaction_type} color="#3D6B8C" /></td>
                <td style={{ padding: "7px 10px", textAlign: "center" }}>{r.certificateIssued === "Yes" ? <span style={{ color: "#1F5C99", fontWeight: 700 }}>Yes</span> : "No"}</td>
                <td style={{ padding: "7px 10px", fontFamily: "'IBM Plex Mono', monospace" }}>{formatINR(r.declaredValue)}</td>
                <td style={{ padding: "7px 10px", fontFamily: "'IBM Plex Mono', monospace" }}>{formatINR(r.coveredValue)}</td>
                <td style={{ padding: "7px 10px", fontFamily: "'IBM Plex Mono', monospace" }}>{formatINR(r.openingBalance)}</td>
                <td style={{ padding: "7px 10px", fontFamily: "'IBM Plex Mono', monospace", fontWeight: 700 }}>{formatINR(r.closingBalance)}</td>
                <td style={{ padding: "7px 10px", fontFamily: "'IBM Plex Mono', monospace" }}>{r.premiumDue ? formatINR(r.premiumDue) : "—"}</td>
              </tr>
            ))}
            {ledger.length === 0 && <tr><td colSpan={8} style={{ padding: 14, textAlign: "center", color: "#8a8273" }}>No declarations yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
const lbl = { fontSize: 12, fontWeight: 600, color: "#6B6356", display: "block", marginBottom: 4 };

// ============================================================
//  RENEWALS
// ============================================================
function RenewalsTab({ policies }) {
  const due = useMemo(() => policies
    .filter((p) => p.status !== "Cancelled" && p.period_to)
    .map((p) => ({ ...p, d: daysUntil(p.period_to) }))
    .filter((p) => p.d !== null && p.d <= 60 && p.d >= -30)
    .sort((a, b) => a.d - b.d), [policies]);
  return (
    <div>
      <TabHeader title="Renewals" subtitle="Policies within 60 days of expiry (and up to 30 days overdue)." />
      <DataTable rows={due} searchPlaceholder="Search renewals…" exportName="Renewals" minWidth={900}
        columns={[
          { key: "insured_name", label: "Insured", type: "text", bold: true, get: (p) => p.insured_name || "" },
          { key: "policy_no", label: "Policy No.", type: "text", mono: true, get: (p) => p.policy_no || "" },
          { key: "policy_type", label: "Type of Policy", type: "text", get: (p) => p.policy_type || "" },
          { key: "insurerName", label: "Insurer", type: "text", get: (p) => p.insurerName || "" },
          { key: "period_to", label: "Policy End Date", type: "date", get: (p) => p.period_to || "", render: (p) => <EndDateCell date={p.period_to} status={p.status} /> },
          { key: "premium", label: "Premium", type: "number", mono: true, get: (p) => Number(p.premium) || 0, render: (p) => p.premium ? formatINR(p.premium) : "—" },
        ]} />
    </div>
  );
}

// ============================================================
//  CLAIMS
// ============================================================
function ClaimsTab({ rows, clients, onCreate, onUpdate, onDelete, clientName }) {
  const [modal, setModal] = useState(null);
  const openAdd = () => setModal({ mode: "add", data: { status: "Open" } });
  const openEdit = (c) => setModal({ mode: "edit", data: { ...c } });
  const save = async () => {
    const d = modal.data;
    if (!d.claim_no) return;
    if (modal.mode === "add") await onCreate(d); else await onUpdate(d.id, d);
    setModal(null);
  };
  return (
    <div>
      <TabHeader title="Claims & Service Requests" onAdd={openAdd} addLabel="Add Claim" />
      <DataTable rows={rows} onRowClick={openEdit} searchPlaceholder="Search claims…" exportName="Claims" minWidth={820}
        columns={[
          { key: "claim_no", label: "Claim No.", type: "text", bold: true, mono: true, get: (c) => c.claim_no || "" },
          { key: "client", label: "Client", type: "text", get: (c) => clientName(c.client_id) },
          { key: "type", label: "Type", type: "text", get: (c) => c.type || "" },
          { key: "amount", label: "Amount", type: "number", mono: true, get: (c) => Number(c.amount) || 0, render: (c) => c.amount ? formatINR(c.amount) : "—" },
          { key: "status", label: "Status", type: "text", get: (c) => c.status || "", render: (c) => <Pill label={c.status} color={CLAIM_STATUS_COLORS[c.status]} /> },
          { key: "dateOpened", label: "Opened", type: "date", get: (c) => c.dateOpened || "", render: (c) => <span style={{ color: "#8a8273" }}>{formatDate(c.dateOpened)}</span> },
        ]} />
      {modal && (
        <Modal title={modal.mode === "add" ? "Add Claim" : "Edit Claim"} onClose={() => setModal(null)} onSave={save} onDelete={modal.mode === "edit" ? async () => { await onDelete(modal.data.id); setModal(null); } : null}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Field label="Claim No. *" value={modal.data.claim_no} onChange={(v) => setModal((m) => ({ ...m, data: { ...m.data, claim_no: v } }))} />
            <div style={{ marginBottom: 13 }}>
              <label style={lbl}>Client</label>
              <select value={modal.data.client_id || ""} onChange={(e) => setModal((m) => ({ ...m, data: { ...m.data, client_id: e.target.value } }))} style={inputStyle}>
                <option value="">— select —</option>
                {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <Field label="Claim Type" value={modal.data.type} onChange={(v) => setModal((m) => ({ ...m, data: { ...m.data, type: v } }))} />
            <Field label="Status" value={modal.data.status} onChange={(v) => setModal((m) => ({ ...m, data: { ...m.data, status: v } }))} options={["Open", "Under Review", "Settled", "Repudiated"]} />
            <Field label="Amount Claimed (₹)" type="number" value={modal.data.amount} onChange={(v) => setModal((m) => ({ ...m, data: { ...m.data, amount: v } }))} />
            <Field label="Date Opened" type="date" value={modal.data.dateOpened} onChange={(v) => setModal((m) => ({ ...m, data: { ...m.data, dateOpened: v } }))} />
          </div>
          <Field label="Notes" value={modal.data.notes} onChange={(v) => setModal((m) => ({ ...m, data: { ...m.data, notes: v } }))} />
        </Modal>
      )}
    </div>
  );
}

// ============================================================
//  MASTERS (Insurers + Vendors)
// ============================================================
function MastersTab({ insurers, vendors, products, teamMembers, onCreateInsurer, onUpdateInsurer, onDeleteInsurer, onCreateVendor, onUpdateVendor, onDeleteVendor, onCreateTeam, onDeleteTeam }) {
  const [sub, setSub] = useState("insurers");
  const [modal, setModal] = useState(null);
  const [newRM, setNewRM] = useState("");
  const subs = [{ k: "insurers", label: "Insurers" }, { k: "vendors", label: "Vendors" }, { k: "products", label: "Products" }, { k: "team", label: "Team (RMs)" }];

  const saveInsurer = async () => { const d = modal.data; if (!d.insurer) return; if (modal.mode === "add") await onCreateInsurer(d); else await onUpdateInsurer(d.id, d); setModal(null); };
  const saveVendor = async () => { const d = modal.data; if (!d.vendor_name) return; if (modal.mode === "add") await onCreateVendor(d); else await onUpdateVendor(d.id, d); setModal(null); };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
        <div style={{ display: "flex", gap: 4, backgroundColor: "#EFE9DA", borderRadius: 8, padding: 3 }}>
          {subs.map((s) => (
            <button key={s.k} onClick={() => setSub(s.k)} style={{ padding: "7px 16px", fontSize: 13, fontWeight: 600, border: "none", borderRadius: 6, cursor: "pointer", backgroundColor: sub === s.k ? "#FFFEFA" : "transparent", color: sub === s.k ? "#1F5C99" : "#8a8273" }}>{s.label}</button>
          ))}
        </div>
        {sub === "insurers" && <button onClick={() => setModal({ kind: "insurer", mode: "add", data: {} })} style={addBtnSm}><Plus size={15} /> Add Insurer</button>}
        {sub === "vendors" && <button onClick={() => setModal({ kind: "vendor", mode: "add", data: {} })} style={addBtnSm}><Plus size={15} /> Add Vendor</button>}
      </div>

      {sub === "insurers" && (
        <DataTable rows={insurers} onRowClick={(i) => setModal({ kind: "insurer", mode: "edit", data: { ...i } })} searchPlaceholder="Search insurers…" exportName="Insurers" minWidth={760}
          columns={[
            { key: "insurer", label: "Insurer", type: "text", bold: true, get: (i) => i.insurer || "" },
            { key: "branch", label: "Branch", type: "text", get: (i) => i.branch || "" },
            { key: "rmName", label: "RM", type: "text", get: (i) => i.rmName || "" },
            { key: "rmPhone", label: "RM Phone", type: "text", get: (i) => i.rmPhone || "" },
            { key: "uwName", label: "Underwriter", type: "text", get: (i) => i.uwName || "" },
          ]} />
      )}
      {sub === "vendors" && (
        <DataTable rows={vendors} onRowClick={(v) => setModal({ kind: "vendor", mode: "edit", data: { ...v } })} searchPlaceholder="Search vendors…" exportName="Vendors" minWidth={720}
          columns={[
            { key: "vendor_name", label: "Vendor", type: "text", bold: true, get: (v) => v.vendor_name || "" },
            { key: "contactPerson", label: "Contact", type: "text", get: (v) => v.contactPerson || "" },
            { key: "phone", label: "Phone", type: "text", get: (v) => v.phone || "" },
            { key: "commissionPct", label: "Commission %", type: "number", get: (v) => Number(v.commissionPct) || 0, render: (v) => v.commissionPct ? `${v.commissionPct}%` : "—" },
          ]} />
      )}
      {sub === "products" && (
        <DataTable rows={products} searchPlaceholder="Search products…" exportName="Products" minWidth={640}
          columns={[
            { key: "name", label: "Product", type: "text", bold: true, get: (p) => p.name || "" },
            { key: "vertical", label: "Vertical", type: "text", get: (p) => p.vertical || "" },
            { key: "category", label: "Category", type: "text", get: (p) => p.category || "" },
          ]} />
      )}
      {sub === "team" && (
        <div style={{ maxWidth: 520 }}>
          <p style={{ fontSize: 12.5, color: "#8a8273", marginTop: 0, marginBottom: 14 }}>Team members (RMs) available in the Calls and Visits tabs. Add or remove names here.</p>
          <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
            <input value={newRM} onChange={(e) => setNewRM(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && newRM.trim()) { onCreateTeam({ name: newRM.trim() }); setNewRM(""); } }} placeholder="Team member name" style={{ ...inputStyle, margin: 0 }} />
            <button onClick={() => { if (newRM.trim()) { onCreateTeam({ name: newRM.trim() }); setNewRM(""); } }} style={addBtnSm}><Plus size={15} /> Add</button>
          </div>
          <div style={{ backgroundColor: "#FFFEFA", border: "1px solid #EAE3D3", borderRadius: 10, overflow: "hidden" }}>
            {teamMembers.length === 0 ? (
              <div style={{ padding: 18, textAlign: "center", color: "#8a8273", fontSize: 13 }}>No team members yet.</div>
            ) : teamMembers.map((t) => (
              <div key={t.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "11px 14px", borderTop: "1px solid #EAE3D3" }}>
                <span style={{ fontWeight: 600, fontSize: 14 }}>{t.name}</span>
                <button onClick={() => onDeleteTeam(t.id)} style={{ background: "none", border: "none", color: "#A8392F", cursor: "pointer", display: "flex", alignItems: "center", gap: 5, fontSize: 12.5 }}><Trash2 size={14} /> Remove</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {modal?.kind === "insurer" && (
        <Modal title={modal.mode === "add" ? "Add Insurer" : "Edit Insurer"} onClose={() => setModal(null)} onSave={saveInsurer} onDelete={modal.mode === "edit" ? async () => { await onDeleteInsurer(modal.data.id); setModal(null); } : null}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Field label="Insurer *" value={modal.data.insurer} onChange={(v) => setModal((m) => ({ ...m, data: { ...m.data, insurer: v } }))} />
            <Field label="Branch" value={modal.data.branch} onChange={(v) => setModal((m) => ({ ...m, data: { ...m.data, branch: v } }))} />
            <Field label="RM Name" value={modal.data.rmName} onChange={(v) => setModal((m) => ({ ...m, data: { ...m.data, rmName: v } }))} />
            <Field label="RM Phone" value={modal.data.rmPhone} onChange={(v) => setModal((m) => ({ ...m, data: { ...m.data, rmPhone: v } }))} />
            <Field label="RM Email" value={modal.data.rmEmail} onChange={(v) => setModal((m) => ({ ...m, data: { ...m.data, rmEmail: v } }))} />
            <Field label="Underwriter" value={modal.data.uwName} onChange={(v) => setModal((m) => ({ ...m, data: { ...m.data, uwName: v } }))} />
            <Field label="UW Phone" value={modal.data.uwPhone} onChange={(v) => setModal((m) => ({ ...m, data: { ...m.data, uwPhone: v } }))} />
          </div>
        </Modal>
      )}
      {modal?.kind === "vendor" && (
        <Modal title={modal.mode === "add" ? "Add Vendor" : "Edit Vendor"} onClose={() => setModal(null)} onSave={saveVendor} onDelete={modal.mode === "edit" ? async () => { await onDeleteVendor(modal.data.id); setModal(null); } : null}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Field label="Vendor Name *" value={modal.data.vendor_name} onChange={(v) => setModal((m) => ({ ...m, data: { ...m.data, vendor_name: v } }))} />
            <Field label="Contact Person" value={modal.data.contactPerson} onChange={(v) => setModal((m) => ({ ...m, data: { ...m.data, contactPerson: v } }))} />
            <Field label="Phone" value={modal.data.phone} onChange={(v) => setModal((m) => ({ ...m, data: { ...m.data, phone: v } }))} />
            <Field label="Email" value={modal.data.email} onChange={(v) => setModal((m) => ({ ...m, data: { ...m.data, email: v } }))} />
            <Field label="POSP Commission %" type="number" value={modal.data.commissionPct} onChange={(v) => setModal((m) => ({ ...m, data: { ...m.data, commissionPct: v } }))} />
            <Field label="Payment Status" value={modal.data.paymentStatus} onChange={(v) => setModal((m) => ({ ...m, data: { ...m.data, paymentStatus: v } }))} options={["Pending", "Paid", "Overdue"]} />
          </div>
        </Modal>
      )}
    </div>
  );
}
const addBtnSm = { display: "flex", alignItems: "center", gap: 6, padding: "9px 16px", fontSize: 13, fontWeight: 600, backgroundColor: "#1F5C99", color: "#fff", border: "none", borderRadius: 7, cursor: "pointer" };

// ============================================================
//  FIELD ACTIVITY — dedicated dashboard for calls + visits
//  Deliberately standalone: no link to clients, policies, or the
//  main dashboard. Its own summary of team field activity.
// ============================================================
function FieldActivityDashboard({ calls, visits, teamMembers, setTab }) {
  const today = new Date().toISOString().slice(0, 10);
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);

  const callsThisWeek = calls.filter((c) => (c.call_date || "") >= weekAgo).length;
  const visitsThisWeek = visits.filter((v) => (v.visit_date || "") >= weekAgo).length;

  // upcoming follow-ups from both streams
  const followUps = [
    ...calls.filter((c) => c.followUpDate).map((c) => ({ kind: "Call", rm: c.rm_name, company: c.company_name, date: c.followUpDate })),
    ...visits.filter((v) => v.followUpDate).map((v) => ({ kind: "Visit", rm: v.rm_name, company: v.company_name, date: v.followUpDate })),
  ].filter((f) => (f.date || "") >= today).sort((a, b) => (a.date || "").localeCompare(b.date || "")).slice(0, 10);

  // per-RM activity counts
  const byRM = {};
  teamMembers.forEach((t) => { byRM[t.name] = { calls: 0, visits: 0 }; });
  calls.forEach((c) => { if (c.rm_name) { byRM[c.rm_name] = byRM[c.rm_name] || { calls: 0, visits: 0 }; byRM[c.rm_name].calls++; } });
  visits.forEach((v) => { if (v.rm_name) { byRM[v.rm_name] = byRM[v.rm_name] || { calls: 0, visits: 0 }; byRM[v.rm_name].visits++; } });
  const rmRows = Object.entries(byRM).sort((a, b) => (b[1].calls + b[1].visits) - (a[1].calls + a[1].visits));

  return (
    <div>
      <h2 style={{ margin: "0 0 4px", fontSize: 20, fontFamily: "'Source Serif 4', Georgia, serif", color: "#152A47" }}>Field Activity</h2>
      <p style={{ fontSize: 12.5, color: "#8a8273", marginTop: 0, marginBottom: 18 }}>A standalone view of the team's daily calls and visits. Separate from the policy book.</p>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 22 }}>
        <StatCard icon={PhoneCall} label="Calls (7 days)" value={callsThisWeek} sub={`${calls.length} total`} accent="#1F5C99" onClick={() => setTab("calls")} />
        <StatCard icon={MapPin} label="Visits (7 days)" value={visitsThisWeek} sub={`${visits.length} total`} accent="#2E5C8A" onClick={() => setTab("visits")} />
        <StatCard icon={Calendar} label="Upcoming follow-ups" value={followUps.length} sub="scheduled" accent="#B8722A" />
        <StatCard icon={Users} label="Active RMs" value={teamMembers.length} sub="team members" accent="#6B5B95" onClick={() => setTab("masters")} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div style={{ backgroundColor: "#FFFEFA", border: "1px solid #EAE3D3", borderRadius: 10, padding: 16 }}>
          <h3 style={{ margin: "0 0 12px", fontSize: 15, fontFamily: "'Source Serif 4', Georgia, serif", color: "#152A47" }}>Activity by RM</h3>
          {rmRows.length === 0 ? <p style={{ fontSize: 13, color: "#8a8273", margin: 0 }}>No team members yet. Add them in Masters → Team.</p> : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead><tr style={{ textAlign: "left", color: "#6B6356" }}><th style={{ padding: "6px 4px", fontSize: 11, textTransform: "uppercase" }}>RM</th><th style={{ padding: "6px 4px", fontSize: 11, textTransform: "uppercase", textAlign: "right" }}>Calls</th><th style={{ padding: "6px 4px", fontSize: 11, textTransform: "uppercase", textAlign: "right" }}>Visits</th></tr></thead>
              <tbody>
                {rmRows.map(([name, v]) => (
                  <tr key={name} style={{ borderTop: "1px solid #EAE3D3" }}>
                    <td style={{ padding: "8px 4px", fontWeight: 600 }}>{name}</td>
                    <td style={{ padding: "8px 4px", textAlign: "right", fontFamily: "'IBM Plex Mono', monospace" }}>{v.calls}</td>
                    <td style={{ padding: "8px 4px", textAlign: "right", fontFamily: "'IBM Plex Mono', monospace" }}>{v.visits}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div style={{ backgroundColor: "#FFFEFA", border: "1px solid #EAE3D3", borderRadius: 10, padding: 16 }}>
          <h3 style={{ margin: "0 0 12px", fontSize: 15, fontFamily: "'Source Serif 4', Georgia, serif", color: "#152A47" }}>Upcoming follow-ups</h3>
          {followUps.length === 0 ? <p style={{ fontSize: 13, color: "#8a8273", margin: 0 }}>No follow-ups scheduled.</p> : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <tbody>
                {followUps.map((f, i) => (
                  <tr key={i} style={{ borderTop: "1px solid #EAE3D3" }}>
                    <td style={{ padding: "8px 4px" }}><Pill label={f.kind} color={f.kind === "Call" ? "#1F5C99" : "#2E5C8A"} /></td>
                    <td style={{ padding: "8px 4px", fontWeight: 600 }}>{f.company || "—"}</td>
                    <td style={{ padding: "8px 4px", color: "#8a8273" }}>{f.rm || "—"}</td>
                    <td style={{ padding: "8px 4px", textAlign: "right", color: "#B8722A", fontWeight: 600 }}>{formatDate(f.date)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================
//  CALLS / VISITS — shared standalone tab (kind = "call" | "visit")
// ============================================================
const CALL_STATUS = ["Planned", "Completed", "No Response", "Follow-up Needed"];
const VISIT_STATUS = ["Planned", "Completed", "Rescheduled", "Follow-up Needed"];
function CallVisitTab({ kind, rows, teamMembers, onCreate, onUpdate, onDelete }) {
  const isCall = kind === "call";
  const dateField = isCall ? "call_date" : "visit_date";
  const statusOptions = isCall ? CALL_STATUS : VISIT_STATUS;
  const title = isCall ? "Daily Call Log" : "Visit Schedule";
  const [modal, setModal] = useState(null);

  const today = new Date().toISOString().slice(0, 10);
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
  const thisWeek = rows.filter((r) => (r[dateField] || "") >= weekAgo).length;
  const pending = rows.filter((r) => r.status === "Planned" || r.status === "Follow-up Needed").length;
  const followUpsDue = rows.filter((r) => r.followUpDate && r.followUpDate >= today).length;

  const openAdd = () => setModal({ mode: "add", data: { status: "Planned", [dateField]: today } });
  const openEdit = (r) => setModal({ mode: "edit", data: { ...r } });
  const save = async () => {
    const d = modal.data;
    if (!d.company_name) return;
    if (modal.mode === "add") await onCreate(d); else await onUpdate(d.id, d);
    setModal(null);
  };

  return (
    <div>
      <TabHeader title={title} subtitle={isCall ? "Standalone daily call log. Free-standing entries — type any company name." : "Standalone visit schedule. Free-standing entries — type any company name."} onAdd={openAdd} addLabel={isCall ? "Log Call" : "Schedule Visit"} />

      {/* mini-summary strip */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
        <StatCard icon={isCall ? PhoneCall : MapPin} label="This week" value={thisWeek} sub={`${rows.length} total`} accent="#1F5C99" />
        <StatCard icon={Activity} label="Pending / planned" value={pending} accent="#B8722A" />
        <StatCard icon={Calendar} label="Follow-ups due" value={followUpsDue} accent="#2E5C8A" />
      </div>

      <DataTable rows={rows} onRowClick={openEdit} searchPlaceholder={isCall ? "Search calls…" : "Search visits…"} exportName={isCall ? "Calls" : "Visits"} minWidth={900}
        columns={[
          { key: dateField, label: "Date", type: "date", get: (r) => r[dateField] || "", render: (r) => formatDate(r[dateField]) },
          { key: "company_name", label: "Company", type: "text", bold: true, get: (r) => r.company_name || "" },
          { key: "rm_name", label: "RM Name", type: "text", get: (r) => r.rm_name || "" },
          { key: "contactPerson", label: "Contact", type: "text", get: (r) => r.contactPerson || "" },
          { key: "purpose", label: "Purpose", type: "text", get: (r) => r.purpose || "" },
          { key: "status", label: "Status", type: "text", get: (r) => r.status || "", render: (r) => <Pill label={r.status} color={{ Completed: "#1B6E5C", Planned: "#3D6B8C", "No Response": "#A8392F", Rescheduled: "#B8722A", "Follow-up Needed": "#B8722A" }[r.status] || "#6b7280"} /> },
          { key: "followUpDate", label: "Follow-up", type: "date", get: (r) => r.followUpDate || "", render: (r) => r.followUpDate ? <span style={{ color: "#B8722A", fontWeight: 600 }}>{formatDate(r.followUpDate)}</span> : "—" },
        ]} />

      {modal && (
        <Modal title={modal.mode === "add" ? (isCall ? "Log Call" : "Schedule Visit") : (isCall ? "Edit Call" : "Edit Visit")} onClose={() => setModal(null)} onSave={save} onDelete={modal.mode === "edit" ? async () => { await onDelete(modal.data.id); setModal(null); } : null}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Field label="Company Name *" value={modal.data.company_name} onChange={(v) => setModal((m) => ({ ...m, data: { ...m.data, company_name: v } }))} placeholder="Type any company" />
            <div style={{ marginBottom: 13 }}>
              <label style={lbl}>RM Name</label>
              <select value={modal.data.rm_name || ""} onChange={(e) => setModal((m) => ({ ...m, data: { ...m.data, rm_name: e.target.value } }))} style={inputStyle}>
                <option value="">— select RM —</option>
                {teamMembers.map((t) => <option key={t.id} value={t.name}>{t.name}</option>)}
              </select>
              {teamMembers.length === 0 && <div style={{ fontSize: 10.5, color: "#B8722A", marginTop: 3 }}>Add team members in Masters → Team.</div>}
            </div>
            <Field label={isCall ? "Call Date" : "Visit Date"} type="date" value={modal.data[dateField]} onChange={(v) => setModal((m) => ({ ...m, data: { ...m.data, [dateField]: v } }))} />
            <Field label="Status" value={modal.data.status} onChange={(v) => setModal((m) => ({ ...m, data: { ...m.data, status: v } }))} options={statusOptions} />
            <Field label="Contact Person" value={modal.data.contactPerson} onChange={(v) => setModal((m) => ({ ...m, data: { ...m.data, contactPerson: v } }))} />
            <Field label="Contact Phone" value={modal.data.contactPhone} onChange={(v) => setModal((m) => ({ ...m, data: { ...m.data, contactPhone: v } }))} />
            <Field label="Purpose" value={modal.data.purpose} onChange={(v) => setModal((m) => ({ ...m, data: { ...m.data, purpose: v } }))} placeholder={isCall ? "e.g. Renewal follow-up" : "e.g. Risk inspection"} />
            <Field label="Follow-up Date" type="date" value={modal.data.followUpDate} onChange={(v) => setModal((m) => ({ ...m, data: { ...m.data, followUpDate: v } }))} />
          </div>
          <div style={{ marginTop: 2 }}>
            <label style={lbl}>Outcome / Notes</label>
            <textarea value={modal.data.notes || ""} onChange={(e) => setModal((m) => ({ ...m, data: { ...m.data, notes: e.target.value } }))} rows={3} style={{ ...inputStyle, resize: "vertical" }} placeholder={isCall ? "What was discussed on the call…" : "What happened during the visit…"} />
          </div>
        </Modal>
      )}
    </div>
  );
}
