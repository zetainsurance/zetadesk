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
import {
  VOYAGE_TYPES, DECLARATION_MODES, generatePeriods, poolBalance, effectiveValue,
  declarationPremium, periodStatuses, allPeriodsFiled, todayISO,
  SEVERITY_COLORS, SEVERITY_LABELS,
} from "@/components/marineEngine";

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
const TABLES = ["clients", "insurers", "vendors", "products", "opportunities", "policies", "marine_declarations", "claims", "team_members", "calls", "visits", "marine_pools", "marine_endorsements", "members", "benefit_endorsements", "cd_ledger", "property_locations", "project_instalments", "project_extensions"];

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
  const [marinePools, setMarinePools] = useState([]);
  const [marineEndos, setMarineEndos] = useState([]);
  const [selectedMarine, setSelectedMarine] = useState(null);
  const [members, setMembers] = useState([]);
  const [benefitEndos, setBenefitEndos] = useState([]);
  const [cdEntries, setCdEntries] = useState([]);
  const [locations, setLocations] = useState([]);
  const [instalments, setInstalments] = useState([]);
  const [extensions, setExtensions] = useState([]);

  const [loading, setLoading] = useState(false);
  const [dbError, setDbError] = useState("");
  const [lastSynced, setLastSynced] = useState("");
  const [toast, setToast] = useState("");

  const setters = {
    clients: setClients, insurers: setInsurers, vendors: setVendors, products: setProducts,
    opportunities: setOpportunities, policies: setPolicies, marine_declarations: setMarineDecls, claims: setClaims,
    team_members: setTeamMembers, calls: setCalls, visits: setVisits,
    marine_pools: setMarinePools, marine_endorsements: setMarineEndos,
    members: setMembers, benefit_endorsements: setBenefitEndos, cd_ledger: setCdEntries,
    property_locations: setLocations, project_instalments: setInstalments, project_extensions: setExtensions,
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
    { key: "opportunities", label: "RFQ Tracker", icon: TrendingUp },
    { key: "policies", label: "Policies", icon: IndianRupee },
    { key: "otherfunctions", label: "Other Functions", icon: Building2 },
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
        {tab === "opportunities" && <OpportunitiesTab rows={opportunities} clients={clients} onCreate={(o) => createRecord("opportunities", o)} onUpdate={(id, o) => updateRecord("opportunities", id, o)} onDelete={(id) => removeRecord("opportunities", id)} clientName={clientName} onImport={(list) => bulkImport("opportunities", list, setOpportunities, setDbError, flash)} />}
        {tab === "policies" && <PoliciesTab rows={policies} onCreate={(o) => createRecord("policies", o)} onUpdate={(id, o) => updateRecord("policies", id, o)} onDelete={(id) => removeRecord("policies", id)} onImport={(list) => bulkImport("policies", list, setPolicies, setDbError, flash)} />}
        {tab === "marine" && <MarineTab
          marinePolicies={marinePolicies} decls={marineDecls} pools={marinePools} endorsements={marineEndos}
          selected={selectedMarine} setSelected={setSelectedMarine}
          onCreatePool={(o) => createRecord("marine_pools", o)}
          onUpdatePool={(id, o) => updateRecord("marine_pools", id, o)}
          onDeletePool={(id) => removeRecord("marine_pools", id)}
          onCreateDecl={(o) => createRecord("marine_declarations", o)}
          onUpdateDecl={(id, o) => updateRecord("marine_declarations", id, o)}
          onCreateEndo={(o) => createRecord("marine_endorsements", o)}
          onUpdatePolicy={(id, o) => updateRecord("policies", id, o)} />}
        {tab === "renewals" && <RenewalsTab policies={policies} />}
        {tab === "claims" && <ClaimsTab rows={claims} clients={clients} onCreate={(o) => createRecord("claims", o)} onUpdate={(id, o) => updateRecord("claims", id, o)} onDelete={(id) => removeRecord("claims", id)} clientName={clientName} />}
        {tab === "fieldactivity" && <FieldActivityDashboard calls={calls} visits={visits} teamMembers={teamMembers} setTab={setTab} />}
        {tab === "calls" && <CallVisitTab kind="call" rows={calls} teamMembers={teamMembers} onCreate={(o) => createRecord("calls", o)} onUpdate={(id, o) => updateRecord("calls", id, o)} onDelete={(id) => removeRecord("calls", id)} />}
        {tab === "visits" && <CallVisitTab kind="visit" rows={visits} teamMembers={teamMembers} onCreate={(o) => createRecord("visits", o)} onUpdate={(id, o) => updateRecord("visits", id, o)} onDelete={(id) => removeRecord("visits", id)} />}
        {tab === "otherfunctions" && <OtherFunctionsTab
          policies={policies} clients={clients}
          members={members} benefitEndos={benefitEndos} cdEntries={cdEntries}
          locations={locations} instalments={instalments} extensions={extensions}
          onCreateMember={(o) => createRecord("members", o)}
          onUpdateMember={(id, o) => updateRecord("members", id, o)}
          onDeleteMember={(id) => removeRecord("members", id)}
          onCreateEndo={(o) => createRecord("benefit_endorsements", o)}
          onUpdateEndo={(id, o) => updateRecord("benefit_endorsements", id, o)}
          onCreateCd={(o) => createRecord("cd_ledger", o)}
          onCreateLocation={(o) => createRecord("property_locations", o)}
          onUpdateLocation={(id, o) => updateRecord("property_locations", id, o)}
          onDeleteLocation={(id) => removeRecord("property_locations", id)}
          onCreateInstalment={(o) => createRecord("project_instalments", o)}
          onUpdateInstalment={(id, o) => updateRecord("project_instalments", id, o)}
          onDeleteInstalment={(id) => removeRecord("project_instalments", id)}
          onCreateExtension={(o) => createRecord("project_extensions", o)} />}
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
    add("RFQ Tracker", ["Proposal", "Stage", "Client", "GSTIN", "Type of Policy", "Policy No", "Insurer", "Insurer Address", "Hypothecation", "Intermediary", "RM", "Measure", "SI/Lives/Limit", "Total Premium", "Net Premium", "Start", "End", "Contact Name", "Contact Number", "Contact Email", "Designation", "Remarks"],
      opportunities.map((o) => { const c = (o.contacts && o.contacts[0]) || {}; return [o.title, o.stage, o.clientName || "", o.gstin || "", o.policy_type || "", o.policy_no || "", o.insurer_name || "", o.insurerAddress || "", o.hypothecation || "", o.intermediary || "", o.rmName || "", o.measureType || "", Number(o.measureValue) || 0, Number(o.totalPremium) || 0, Number(o.netPremium) || 0, o.period_from || "", o.period_to || "", c.name || "", c.number || "", c.email || "", c.designation || "", o.remarks || ""]; }));
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
  const openOpps = opportunities.filter((o) => o.stage !== "Won" && o.stage !== "QBL").length;
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
        <StatCard icon={TrendingUp} label="RFQ Tracker" value={openOpps} sub="open proposals" accent="#3D6B8C" onClick={() => setTab("opportunities")} />
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
  if (table === "opportunities") {
    const title = g("Proposal", "proposal title", "title", "client name", "client", "insured name");
    if (!title) return null;
    return {
      title,
      stage: g("Stage") || "Ongoing",
      clientName: g("Client Name", "client", "insured name"),
      clientAddress: g("Client Address", "address"),
      gstin: g("GSTIN", "gst"),
      policy_type: g("Type of Policy", "policy name", "policy type", "product"),
      policy_no: g("Policy No.", "policy no", "policy number"),
      insurer_name: g("Insurer Name", "insurer"),
      insurerAddress: g("Insurer Office Address", "insurer address"),
      hypothecation: g("Hypothecation", "bank", "financier"),
      intermediary: g("Intermediary", "agent", "broker"),
      rmName: g("RM", "rm name", "relationship manager"),
      measureType: g("Measure", "measure type") || "Sum Insured",
      measureValue: g("Sum Insured / Lives / Limit", "sum insured", "lives", "no of lives", "limit of liability", "limit"),
      totalPremium: g("Total Premium", "premium"),
      netPremium: g("Net Premium"),
      period_from: g("Policy Start Date", "start date", "period from", "start"),
      period_to: g("Policy End Date", "end date", "period to", "expiry", "end"),
      remarks: g("Remarks", "remark", "note"),
      contacts: (() => {
        const nm = g("Contact Name", "contact person", "contact");
        if (!nm) return [{ name: "", number: "", email: "", designation: "" }];
        return [{ name: nm, number: g("Contact Number", "contact phone", "phone", "mobile"), email: g("Contact Email", "email"), designation: g("Designation", "contact designation") }];
      })(),
    };
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
              <div style={{ fontSize: 11, fontWeight: 700, color: "#1F5C99", textTransform: "uppercase", marginBottom: 8 }}>Marine settings</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <Field label="Declaration Type" value={modal.data.declarationMode} onChange={(v) => setModal((m) => ({ ...m, data: { ...m.data, declarationMode: v } }))} options={DECLARATION_MODES} />
                <Field label="Grace days for declarations" type="number" value={modal.data.graceDays} onChange={(v) => setModal((m) => ({ ...m, data: { ...m.data, graceDays: v } }))} placeholder="default 7" />
              </div>
              <div style={{ fontSize: 11.5, color: "#6B6356" }}>Sum insured is set up as voyage pools on the Marine tab — open this policy there to add pools, file declarations and record endorsements.</div>
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
function OpportunitiesTab({ rows, clients, onCreate, onUpdate, onDelete, clientName, onImport }) {
  const [modal, setModal] = useState(null);
  const blank = () => ({ stage: "Ongoing", measureType: "Sum Insured", contacts: [{ name: "", number: "", email: "", designation: "" }] });
  const openAdd = () => setModal({ mode: "add", data: blank(), cloneFrom: "" });
  const openEdit = (o) => setModal({ mode: "edit", data: { contacts: [{ name: "", number: "", email: "", designation: "" }], ...o }, cloneFrom: "" });
  const save = async () => {
    const d = modal.data;
    if (!d.title) return;
    if (modal.mode === "add") await onCreate(d); else await onUpdate(d.id, d);
    setModal(null);
  };

  // Clone party + contact details from an existing client, or from an existing proposal.
  const cloneSource = (val) => {
    if (!val) return;
    const [kind, id] = val.split(":");
    if (kind === "client") {
      const c = clients.find((x) => x.id === id);
      if (!c) return;
      setModal((m) => ({ ...m, cloneFrom: val, data: { ...m.data,
        client_id: c.id, clientName: c.name, clientAddress: c.address || "", gstin: c.gstin || "",
        contacts: (c.contact_person || c.phone || c.email)
          ? [{ name: c.contact_person || "", number: c.phone || "", email: c.email || "", designation: c.designation || "" }]
          : m.data.contacts,
      } }));
    } else {
      const o = rows.find((x) => x.id === id);
      if (!o) return;
      const { id: _i, title: _t, stage: _s, ...rest } = o;
      setModal((m) => ({ ...m, cloneFrom: val, data: { ...m.data, ...rest } }));
    }
  };

  const setContact = (i, field, v) => setModal((m) => {
    const contacts = [...(m.data.contacts || [])];
    contacts[i] = { ...contacts[i], [field]: v };
    return { ...m, data: { ...m.data, contacts } };
  });
  const addContact = () => setModal((m) => {
    const contacts = [...(m.data.contacts || [])];
    if (contacts.length >= 4) return m;
    return { ...m, data: { ...m.data, contacts: [...contacts, { name: "", number: "", email: "", designation: "" }] } };
  });
  const removeContact = (i) => setModal((m) => {
    const contacts = (m.data.contacts || []).filter((_, x) => x !== i);
    return { ...m, data: { ...m.data, contacts: contacts.length ? contacts : [{ name: "", number: "", email: "", designation: "" }] } };
  });

  const setD = (field) => (v) => setModal((m) => ({ ...m, data: { ...m.data, [field]: v } }));

  return (
    <div>
      <TabHeader title="RFQ Tracker" subtitle="Ongoing, quoted, lost and upcoming proposals — renewals, market rollovers and fresh RFQs, with party details, contacts and premium." onAdd={openAdd} addLabel="Add Proposal" onImport={() => document.getElementById("rfq-import").click()} />
      <ImportInput id="rfq-import" table="opportunities" onImport={onImport} />
      <DataTable rows={rows} onRowClick={openEdit} searchPlaceholder="Search proposals…" exportName="RFQ-Tracker" minWidth={1180}
        columns={[
          { key: "stage", label: "Stage", type: "text", get: (o) => o.stage || "", render: (o) => <Pill label={o.stage} color={STAGE_COLORS[o.stage]} /> },
          { key: "title", label: "Proposal", type: "text", bold: true, get: (o) => o.title || "" },
          { key: "clientName", label: "Client", type: "text", get: (o) => o.clientName || clientName(o.client_id) || "" },
          { key: "policy_type", label: "Type of Policy", type: "text", get: (o) => o.policy_type || o.products || "" },
          { key: "policy_no", label: "Policy No.", type: "text", mono: true, get: (o) => o.policy_no || "" },
          { key: "insurer_name", label: "Insurer", type: "text", get: (o) => o.insurer_name || o.insurer || "" },
          { key: "measure", label: "SI / Lives / Limit", type: "number", mono: true, get: (o) => Number(o.measureValue) || 0, render: (o) => o.measureValue ? `${(o.measureType === "No. of Lives") ? Number(o.measureValue).toLocaleString("en-IN") : formatINR(o.measureValue)}` : "—" },
          { key: "totalPremium", label: "Total Premium", type: "number", mono: true, get: (o) => Number(o.totalPremium) || 0, render: (o) => o.totalPremium ? formatINR(o.totalPremium) : "—" },
          { key: "period_to", label: "Policy End", type: "date", get: (o) => o.period_to || "", render: (o) => <EndDateCell date={o.period_to} /> },
        ]} />
      {modal && (
        <Modal title={modal.mode === "add" ? "Add Proposal" : "Edit Proposal"} onClose={() => setModal(null)} onSave={save} onDelete={modal.mode === "edit" ? async () => { await onDelete(modal.data.id); setModal(null); } : null}>
          {modal.mode === "add" && (
            <div style={{ marginBottom: 14, padding: 12, backgroundColor: "#F6FBFF", border: "1px solid #C7D4DD", borderRadius: 8 }}>
              <label style={lbl}>Clone details from (optional)</label>
              <select value={modal.cloneFrom} onChange={(e) => cloneSource(e.target.value)} style={inputStyle}>
                <option value="">— start blank —</option>
                <optgroup label="Existing client">
                  {clients.map((c) => <option key={c.id} value={`client:${c.id}`}>{c.name}</option>)}
                </optgroup>
                <optgroup label="Existing proposal">
                  {rows.map((o) => <option key={o.id} value={`proposal:${o.id}`}>{o.title}{o.clientName ? ` — ${o.clientName}` : ""}</option>)}
                </optgroup>
              </select>
              <div style={{ fontSize: 10.5, color: "#8a8273", marginTop: 4 }}>Copies client name, address, GSTIN and contacts — you can edit everything after.</div>
            </div>
          )}

          <SectionLabel text="Proposal" />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Field label="Proposal Title *" value={modal.data.title} onChange={setD("title")} placeholder="e.g. GPT Castings — Fire renewal 2026" />
            <Field label="Stage" value={modal.data.stage} onChange={setD("stage")} options={RFQ_STAGES} />
            <Field label="Type of Policy / Policy Name" value={modal.data.policy_type} onChange={setD("policy_type")} />
            <Field label="Existing Policy No. (if any)" value={modal.data.policy_no} onChange={setD("policy_no")} />
          </div>

          <SectionLabel text="Client / Insured" />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Field label="Client Name" value={modal.data.clientName} onChange={setD("clientName")} />
            <Field label="GSTIN" value={modal.data.gstin} onChange={setD("gstin")} />
          </div>
          <Field label="Client Address" value={modal.data.clientAddress} onChange={setD("clientAddress")} />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Field label="Hypothecation (bank / financier)" value={modal.data.hypothecation} onChange={setD("hypothecation")} />
            <Field label="Intermediary / Agent / Broker" value={modal.data.intermediary} onChange={setD("intermediary")} />
          </div>

          <SectionLabel text="Insurer" />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Field label="Insurer Name" value={modal.data.insurer_name} onChange={setD("insurer_name")} />
            <Field label="RM (our relationship manager)" value={modal.data.rmName} onChange={setD("rmName")} />
          </div>
          <Field label="Insurer Office Address" value={modal.data.insurerAddress} onChange={setD("insurerAddress")} />

          <SectionLabel text="Cover & premium" />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1.4fr", gap: 12 }}>
            <Field label="Measure" value={modal.data.measureType} onChange={setD("measureType")} options={MEASURE_TYPES} />
            <Field label={modal.data.measureType || "Sum Insured"} type="number" value={modal.data.measureValue} onChange={setD("measureValue")} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Field label="Total Premium (₹)" type="number" value={modal.data.totalPremium} onChange={setD("totalPremium")} />
            <Field label="Net Premium (₹)" type="number" value={modal.data.netPremium} onChange={setD("netPremium")} />
            <Field label="Policy Start Date" type="date" value={modal.data.period_from} onChange={setD("period_from")} />
            <Field label="Policy End Date" type="date" value={modal.data.period_to} onChange={setD("period_to")} />
          </div>

          <SectionLabel text="Contact persons (up to 4)" />
          {(modal.data.contacts || []).map((c, i) => (
            <div key={i} style={{ display: "grid", gridTemplateColumns: "1.3fr 1fr 1.3fr 1fr auto", gap: 8, alignItems: "end", marginBottom: 8 }}>
              <div><label style={lblSm}>Name</label><input value={c.name || ""} onChange={(e) => setContact(i, "name", e.target.value)} style={{ ...inputStyle, fontSize: 12 }} /></div>
              <div><label style={lblSm}>Number</label><input value={c.number || ""} onChange={(e) => setContact(i, "number", e.target.value)} style={{ ...inputStyle, fontSize: 12 }} /></div>
              <div><label style={lblSm}>Email</label><input value={c.email || ""} onChange={(e) => setContact(i, "email", e.target.value)} style={{ ...inputStyle, fontSize: 12 }} /></div>
              <div><label style={lblSm}>Designation</label><input value={c.designation || ""} onChange={(e) => setContact(i, "designation", e.target.value)} style={{ ...inputStyle, fontSize: 12 }} /></div>
              <button onClick={() => removeContact(i)} style={{ background: "none", border: "none", color: "#A8392F", cursor: "pointer", padding: "8px 4px" }} title="Remove contact"><Trash2 size={14} /></button>
            </div>
          ))}
          {(modal.data.contacts || []).length < 4 && (
            <button onClick={addContact} style={{ display: "inline-flex", alignItems: "center", gap: 5, background: "none", border: "1px dashed #C7D4DD", borderRadius: 6, padding: "6px 12px", color: "#1F5C99", cursor: "pointer", fontSize: 12, fontWeight: 600 }}><Plus size={13} /> Add contact</button>
          )}

          <div style={{ marginTop: 14 }}>
            <label style={lbl}>Remarks</label>
            <textarea value={modal.data.remarks || ""} onChange={(e) => setModal((m) => ({ ...m, data: { ...m.data, remarks: e.target.value } }))} rows={2} style={{ ...inputStyle, resize: "vertical" }} placeholder="Renewal note, why QBL, market rollover details…" />
          </div>
        </Modal>
      )}
    </div>
  );
}

function SectionLabel({ text }) {
  return <div style={{ fontSize: 11, fontWeight: 700, color: "#1F5C99", textTransform: "uppercase", letterSpacing: "0.04em", margin: "16px 0 8px", paddingBottom: 4, borderBottom: "1px solid #EAE3D3" }}>{text}</div>;
}
const lblSm = { fontSize: 10.5, fontWeight: 600, color: "#8a8273", display: "block", marginBottom: 3 };

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
// ============================================================
//  MARINE MODULE
//  Sub-tabs: Active / Inactive policies, plus the four notice views
//  (Renewals, SI Consumption, Late Declarations, Balance Transfer).
//  Everything is listed chronologically, nearest expiry first.
// ============================================================
const MARINE_SUBS = [
  { k: "active", label: "Active Policies" },
  { k: "inactive", label: "Inactive" },
  { k: "renewals", label: "Renewals" },
  { k: "consumption", label: "SI Consumption" },
  { k: "late", label: "Late Declarations" },
  { k: "transfer", label: "Balance Transfer" },
];

function MarineTab({ marinePolicies, decls, pools, endorsements, selected, setSelected,
                     onCreatePool, onUpdatePool, onDeletePool,
                     onCreateDecl, onUpdateDecl, onCreateEndo, onUpdatePolicy }) {
  const [sub, setSub] = useState("active");
  const today = todayISO();

  const poolsFor = (pid) => (pools || []).filter((p) => p.policy_id === pid);
  const declsFor = (pid) => (decls || []).filter((d) => d.policy_id === pid);
  const endosFor = (pid) => (endorsements || []).filter((e) => e.policy_id === pid);

  // policy-level rollup across all its pools
  const rollup = (policy) => {
    const ps = poolsFor(policy.id);
    const ds = declsFor(policy.id);
    const es = endosFor(policy.id);
    let limit = 0, consumed = 0;
    ps.forEach((pool) => { const b = poolBalance(pool, ds, es); limit += b.limit; consumed += b.consumed; });
    const grace = Number(policy.graceDays) || 7;
    let worst = null, overdueCount = 0;
    ps.forEach((pool) => {
      periodStatuses(policy, pool, ds, grace).forEach((st) => {
        if (st.state === "Overdue") {
          overdueCount++;
          if (worst === null || ["amber", "orange", "red"].indexOf(st.severity) > ["amber", "orange", "red"].indexOf(worst)) worst = st.severity;
        }
      });
    });
    return { pools: ps, limit, consumed, balance: limit - consumed,
      consumedPct: limit > 0 ? (consumed / limit) * 100 : 0,
      worstSeverity: worst, overdueCount,
      allFiled: ps.length > 0 && allPeriodsFiled(policy, ps, ds) };
  };

  const byExpiry = (a, b) => (a.period_to || "9999").localeCompare(b.period_to || "9999");
  const active = marinePolicies.filter((p) => (p.period_to || "") >= today && p.status !== "Cancelled").sort(byExpiry);
  const inactive = marinePolicies.filter((p) => (p.period_to || "") < today || p.status === "Cancelled").sort(byExpiry);

  if (selected) {
    const policy = marinePolicies.find((x) => x.id === selected);
    if (!policy) { setSelected(null); return null; }
    return <MarinePolicyDetail policy={policy} pools={poolsFor(policy.id)} decls={declsFor(policy.id)}
      endorsements={endosFor(policy.id)} onBack={() => setSelected(null)}
      onCreatePool={onCreatePool} onUpdatePool={onUpdatePool} onDeletePool={onDeletePool}
      onCreateDecl={onCreateDecl} onUpdateDecl={onUpdateDecl} onCreateEndo={onCreateEndo} onUpdatePolicy={onUpdatePolicy} />;
  }

  // ---- notice datasets ----
  const renewalRows = active.filter((p) => { const d = daysUntil(p.period_to); return d !== null && d <= 90; });
  const consumptionRows = active.map((p) => ({ ...p, _r: rollup(p) })).filter((r) => r._r.pools.length > 0).sort((a, b) => b._r.consumedPct - a._r.consumedPct);
  const lateRows = active.map((p) => ({ ...p, _r: rollup(p) })).filter((r) => r._r.overdueCount > 0)
    .sort((a, b) => ["amber", "orange", "red"].indexOf(b._r.worstSeverity) - ["amber", "orange", "red"].indexOf(a._r.worstSeverity));
  const transferRows = marinePolicies.map((p) => ({ ...p, _r: rollup(p) }))
    .filter((r) => r._r.allFiled && r._r.balance > 0).sort(byExpiry);

  const policyCols = (extra = []) => [
    { key: "insured_name", label: "Insured", type: "text", bold: true, get: (p) => p.insured_name || "" },
    { key: "policy_no", label: "Policy No.", type: "text", mono: true, get: (p) => p.policy_no || "" },
    { key: "declarationMode", label: "Declaration", type: "text", get: (p) => p.declarationMode || "Monthly" },
    { key: "period_to", label: "Expiry", type: "date", get: (p) => p.period_to || "", render: (p) => <EndDateCell date={p.period_to} status={p.status} /> },
    ...extra,
  ];

  return (
    <div>
      <TabHeader title="Marine" subtitle="Declaration-based marine policies, their voyage-wise sum insured pools, and the notices that need action." />
      <div style={{ display: "flex", gap: 4, backgroundColor: "#EFE9DA", borderRadius: 8, padding: 3, marginBottom: 16, flexWrap: "wrap" }}>
        {MARINE_SUBS.map((s) => {
          let badge = 0;
          if (s.k === "renewals") badge = renewalRows.length;
          if (s.k === "late") badge = lateRows.length;
          if (s.k === "transfer") badge = transferRows.length;
          return (
            <button key={s.k} onClick={() => setSub(s.k)} style={{ padding: "7px 14px", fontSize: 12.5, fontWeight: 600, border: "none", borderRadius: 6, cursor: "pointer", backgroundColor: sub === s.k ? "#FFFEFA" : "transparent", color: sub === s.k ? "#1F5C99" : "#8a8273", display: "flex", alignItems: "center", gap: 6 }}>
              {s.label}
              {badge > 0 && <span style={{ backgroundColor: "#A8392F", color: "#fff", borderRadius: 10, padding: "1px 6px", fontSize: 10.5, fontWeight: 700 }}>{badge}</span>}
            </button>
          );
        })}
      </div>

      {sub === "active" && (
        <DataTable rows={active} onRowClick={(p) => setSelected(p.id)} searchPlaceholder="Search active marine policies…" exportName="Marine-Active" minWidth={1100}
          emptyMessage="No active marine policies."
          columns={policyCols([
            { key: "limit", label: "Total SI", type: "number", mono: true, get: (p) => rollup(p).limit, render: (p) => formatINR(rollup(p).limit) },
            { key: "balance", label: "Balance SI", type: "number", mono: true, bold: true, get: (p) => rollup(p).balance, render: (p) => { const r = rollup(p); return <span style={{ color: r.consumedPct >= 85 ? "#A8392F" : r.consumedPct >= 70 ? "#B8722A" : "#1B6E5C" }}>{formatINR(r.balance)}</span>; } },
            { key: "used", label: "Used", type: "number", get: (p) => rollup(p).consumedPct, render: (p) => <ConsumptionBar pct={rollup(p).consumedPct} /> },
            { key: "alerts", label: "Alerts", type: "custom", render: (p) => { const r = rollup(p); return r.overdueCount > 0 ? <Pill label={`${r.overdueCount} overdue`} color={SEVERITY_COLORS[r.worstSeverity]} /> : <span style={{ color: "#8a8273" }}>—</span>; } },
          ])} />
      )}

      {sub === "inactive" && (
        <DataTable rows={inactive} onRowClick={(p) => setSelected(p.id)} searchPlaceholder="Search expired marine policies…" exportName="Marine-Inactive" minWidth={950}
          emptyMessage="No expired marine policies."
          columns={policyCols([
            { key: "limit", label: "Total SI", type: "number", mono: true, get: (p) => rollup(p).limit, render: (p) => formatINR(rollup(p).limit) },
            { key: "balance", label: "Unused SI", type: "number", mono: true, get: (p) => rollup(p).balance, render: (p) => formatINR(rollup(p).balance) },
          ])} />
      )}

      {sub === "renewals" && (
        <NoticeView title="Upcoming renewals" note="Marine policies expiring within 90 days, soonest first."
          rows={renewalRows} onRowClick={(p) => setSelected(p.id)} exportName="Marine-Renewals"
          columns={policyCols([
            { key: "daysLeft", label: "Days to expiry", type: "number", get: (p) => daysUntil(p.period_to) ?? 9999, render: (p) => { const d = daysUntil(p.period_to); return <Pill label={d < 0 ? "Expired" : `${d} days`} color={d <= 14 ? "#A8392F" : d <= 30 ? "#B8722A" : "#1F5C99"} />; } },
            { key: "balance", label: "Balance SI", type: "number", mono: true, get: (p) => rollup(p).balance, render: (p) => formatINR(rollup(p).balance) },
          ])} />
      )}

      {sub === "consumption" && (
        <NoticeView title="Sum insured consumption" note="How much of each policy's SI has been declared. Highest consumption first — these may need an enhancement endorsement."
          rows={consumptionRows} onRowClick={(p) => setSelected(p.id)} exportName="Marine-SI-Consumption"
          columns={policyCols([
            { key: "limit", label: "Total SI", type: "number", mono: true, get: (p) => p._r.limit, render: (p) => formatINR(p._r.limit) },
            { key: "consumed", label: "Declared", type: "number", mono: true, get: (p) => p._r.consumed, render: (p) => formatINR(p._r.consumed) },
            { key: "balance", label: "Balance", type: "number", mono: true, bold: true, get: (p) => p._r.balance, render: (p) => formatINR(p._r.balance) },
            { key: "pct", label: "Consumed", type: "number", get: (p) => p._r.consumedPct, render: (p) => <ConsumptionBar pct={p._r.consumedPct} wide /> },
          ])} />
      )}

      {sub === "late" && (
        <NoticeView title="Late declarations" note="Periods past their due date plus grace. Graded by how far overdue: amber, orange, then red."
          rows={lateRows} onRowClick={(p) => setSelected(p.id)} exportName="Marine-Late-Declarations"
          columns={policyCols([
            { key: "severity", label: "Severity", type: "text", get: (p) => p._r.worstSeverity || "", render: (p) => <Pill label={SEVERITY_LABELS[p._r.worstSeverity] || "—"} color={SEVERITY_COLORS[p._r.worstSeverity]} /> },
            { key: "overdue", label: "Periods overdue", type: "number", get: (p) => p._r.overdueCount },
          ])} />
      )}

      {sub === "transfer" && (
        <NoticeView title="Balance transfer / refund" note="All declaration periods filed and sum insured still unused — the balance is due for transfer to the renewal policy or refund."
          rows={transferRows} onRowClick={(p) => setSelected(p.id)} exportName="Marine-Balance-Transfer"
          columns={policyCols([
            { key: "balance", label: "Unused balance", type: "number", mono: true, bold: true, get: (p) => p._r.balance, render: (p) => <span style={{ color: "#1F5C99", fontWeight: 700 }}>{formatINR(p._r.balance)}</span> },
            { key: "action", label: "Action", type: "custom", render: () => <Pill label="Transfer / Refund due" color="#1F5C99" /> },
          ])} />
      )}
    </div>
  );
}

function NoticeView({ title, note, rows, columns, onRowClick, exportName }) {
  return (
    <div>
      <h3 style={{ margin: "0 0 4px", fontSize: 16, fontFamily: "'Source Serif 4', Georgia, serif", color: "#152A47" }}>{title}</h3>
      <p style={{ fontSize: 12.5, color: "#8a8273", marginTop: 0, marginBottom: 14 }}>{note}</p>
      <DataTable rows={rows} columns={columns} onRowClick={onRowClick} exportName={exportName} minWidth={1000} emptyMessage="Nothing needs attention here." searchPlaceholder="Search…" />
    </div>
  );
}

function ConsumptionBar({ pct, wide }) {
  const p = Math.max(0, Math.min(100, pct || 0));
  const color = p >= 85 ? "#A8392F" : p >= 70 ? "#B8722A" : "#1B6E5C";
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
      <span style={{ width: wide ? 110 : 70, height: 7, backgroundColor: "#E8E1D0", borderRadius: 4, overflow: "hidden" }}>
        <span style={{ display: "block", width: `${p}%`, height: "100%", backgroundColor: color }} />
      </span>
      <span style={{ fontSize: 11.5, color, fontWeight: 600, fontFamily: "'IBM Plex Mono', monospace" }}>{p.toFixed(0)}%</span>
    </span>
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

// ============================================================
//  MARINE POLICY DETAIL — pools, declaration schedule, corrections, endorsements
// ============================================================
function MarinePolicyDetail({ policy, pools, decls, endorsements, onBack,
                              onCreatePool, onUpdatePool, onDeletePool,
                              onCreateDecl, onUpdateDecl, onCreateEndo, onUpdatePolicy }) {
  const [poolModal, setPoolModal] = useState(null);
  const [declModal, setDeclModal] = useState(null);
  const [fixModal, setFixModal] = useState(null);
  const [endoModal, setEndoModal] = useState(null);
  const grace = Number(policy.graceDays) || 7;
  const mode = policy.declarationMode || "Monthly";

  const totals = pools.reduce((acc, pool) => {
    const b = poolBalance(pool, decls, endorsements);
    acc.limit += b.limit; acc.consumed += b.consumed; return acc;
  }, { limit: 0, consumed: 0 });
  const totalBalance = totals.limit - totals.consumed;

  const savePool = async () => {
    const d = poolModal.data;
    if (!d.label) return;
    if (poolModal.mode === "add") await onCreatePool({ ...d, policy_id: policy.id });
    else await onUpdatePool(d.id, d);
    setPoolModal(null);
  };

  const fileDeclaration = async () => {
    const m = declModal;
    const pool = pools.find((p) => p.id === m.poolId);
    if (!pool || !m.value) return;
    const bal = poolBalance(pool, decls, endorsements);
    const val = Number(m.value) || 0;
    if (val > bal.balance) {
      setDeclModal((x) => ({ ...x, error: `Rejected: ₹${val.toLocaleString("en-IN")} exceeds the pool's available balance of ₹${Math.round(bal.balance).toLocaleString("en-IN")}. File an SI enhancement endorsement first.` }));
      return;
    }
    await onCreateDecl({
      policy_id: policy.id, pool_id: pool.id,
      period_start: m.start, period_end: m.end,
      transaction_type: mode === "Certificate" ? "Certificate" : "Declaration",
      declaredValue: val,
      specialRatePct: m.specialRate || "",
      premium: declarationPremium(pool, val, m.specialRate),
      subjectMatter: m.subjectMatter || "",
      filedOn: todayISO(), corrections: [],
    });
    setDeclModal(null);
  };

  const saveCorrection = async () => {
    const m = fixModal;
    if (!m.value || !m.narration) { setFixModal((x) => ({ ...x, error: "Both the corrected value and a narration are required." })); return; }
    const pool = pools.find((p) => p.id === m.decl.pool_id);
    const corrections = [...(m.decl.corrections || []), { value: Number(m.value), narration: m.narration, at: todayISO() }];
    await onUpdateDecl(m.decl.id, { ...m.decl, corrections, premium: declarationPremium(pool, m.value, m.decl.specialRatePct) });
    setFixModal(null);
  };

  const saveEndorsement = async () => {
    const m = endoModal;
    const d = m.data;
    if (m.kind === "SI Enhancement") {
      if (!d.pool_id || !d.amount) return;
      const pool = pools.find((p) => p.id === d.pool_id);
      await onCreateEndo({
        policy_id: policy.id, pool_id: d.pool_id, endorsement_type: "SI Enhancement",
        effective_date: d.effective_date || todayISO(),
        amount: Number(d.amount),
        ratePct: d.ratePct !== "" && d.ratePct != null ? Number(d.ratePct) : Number(pool.rate_pct) || 0,
        premium: declarationPremium(pool, d.amount, d.ratePct),
        narration: d.narration || "",
      });
    } else {
      if (!d.newExpiry) return;
      await onCreateEndo({
        policy_id: policy.id, pool_id: null, endorsement_type: "Early Expiry",
        effective_date: d.effective_date || todayISO(),
        newExpiry: d.newExpiry, previousExpiry: policy.period_to, narration: d.narration || "",
      });
      // The schedule is derived from the policy's expiry, so changing it here
      // automatically re-cuts every remaining declaration period.
      await onUpdatePolicy(policy.id, { ...policy, period_to: d.newExpiry });
    }
    setEndoModal(null);
  };

  return (
    <div>
      <button onClick={onBack} style={{ background: "none", border: "none", color: "#1F5C99", cursor: "pointer", fontSize: 13, fontWeight: 600, marginBottom: 12 }}>← Back to marine policies</button>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
        <div>
          <h2 style={{ margin: "0 0 4px", fontSize: 20, fontFamily: "'Source Serif 4', Georgia, serif", color: "#152A47" }}>{policy.insured_name}</h2>
          <div style={{ fontSize: 12.5, color: "#8a8273", fontFamily: "'IBM Plex Mono', monospace" }}>
            {policy.policy_no} · {mode} · {formatDate(policy.period_from)} → {formatDate(policy.period_to)}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => setEndoModal({ kind: "SI Enhancement", data: { effective_date: todayISO() } })} style={smallBtn}><Plus size={13} /> SI Enhancement</button>
          <button onClick={() => setEndoModal({ kind: "Early Expiry", data: { effective_date: todayISO() } })} style={smallBtn}><Calendar size={13} /> Change Expiry</button>
        </div>
      </div>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", margin: "16px 0 20px" }}>
        <StatCard icon={Anchor} label="Total SI" value={formatINR(totals.limit)} sub={`${pools.length} pool(s)`} accent="#1F5C99" />
        <StatCard icon={FileText} label="Declared" value={formatINR(totals.consumed)} accent="#6B5B95" />
        <StatCard icon={IndianRupee} label="Balance SI" value={formatINR(totalBalance)} sub="live" accent={totalBalance <= 0 ? "#A8392F" : "#1B6E5C"} />
      </div>

      {/* ---- SI POOLS ---- */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <h3 style={{ margin: 0, fontSize: 15, fontFamily: "'Source Serif 4', Georgia, serif", color: "#152A47" }}>Sum insured pools</h3>
        <button onClick={() => setPoolModal({ mode: "add", data: { voyageTypes: [] } })} style={smallBtn}><Plus size={13} /> Add Pool</button>
      </div>
      {pools.length === 0 && (
        <div style={{ padding: 16, backgroundColor: "#FFF8EF", border: "1px solid #EAD7B8", borderRadius: 8, fontSize: 13, color: "#8a6d3b", marginBottom: 18 }}>
          No pools yet. Add one for each sum insured limit — a pool can cover a single voyage type, or several sharing one combined limit.
        </div>
      )}
      {pools.map((pool) => (
        <PoolPanel key={pool.id} policy={policy} pool={pool} decls={decls} endorsements={endorsements} grace={grace}
          onEdit={() => setPoolModal({ mode: "edit", data: { ...pool } })}
          onDelete={async () => { if (confirm(`Delete pool "${pool.label}" and its declarations?`)) await onDeletePool(pool.id); }}
          onFile={(p) => setDeclModal({ poolId: pool.id, start: p.start, end: p.end, value: "", specialRate: "", subjectMatter: pool.subjectMatter || "" })}
          onFix={(decl) => setFixModal({ decl, value: String(effectiveValue(decl)), narration: "" })} />
      ))}

      {/* ---- ENDORSEMENTS ---- */}
      {endorsements.length > 0 && (
        <div style={{ marginTop: 22 }}>
          <h3 style={{ margin: "0 0 10px", fontSize: 15, fontFamily: "'Source Serif 4', Georgia, serif", color: "#152A47" }}>Endorsements</h3>
          <div style={{ overflowX: "auto", border: "1px solid #EAE3D3", borderRadius: 8, backgroundColor: "#FFFEFA" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5, minWidth: 760 }}>
              <thead><tr style={{ backgroundColor: "#EDE7D8", textAlign: "left" }}>{["Date", "Type", "Pool", "Amount / Change", "Rate", "Premium", "Narration"].map((h) => <th key={h} style={{ padding: "8px 11px", fontSize: 10.5, fontWeight: 700, color: "#6B6356", textTransform: "uppercase" }}>{h}</th>)}</tr></thead>
              <tbody>
                {endorsements.map((e) => {
                  const pool = pools.find((p) => p.id === e.pool_id);
                  return (
                    <tr key={e.id} style={{ borderTop: "1px solid #EAE3D3" }}>
                      <td style={{ padding: "8px 11px" }}>{formatDate(e.effective_date)}</td>
                      <td style={{ padding: "8px 11px" }}><Pill label={e.endorsement_type} color={e.endorsement_type === "SI Enhancement" ? "#1B6E5C" : "#B8722A"} /></td>
                      <td style={{ padding: "8px 11px" }}>{pool ? pool.label : "Policy"}</td>
                      <td style={{ padding: "8px 11px", fontFamily: "'IBM Plex Mono', monospace" }}>
                        {e.endorsement_type === "SI Enhancement" ? `+ ${formatINR(e.amount)}` : `${formatDate(e.previousExpiry)} → ${formatDate(e.newExpiry)}`}
                      </td>
                      <td style={{ padding: "8px 11px", fontFamily: "'IBM Plex Mono', monospace" }}>{e.ratePct != null && e.ratePct !== "" ? `${e.ratePct}%` : "—"}</td>
                      <td style={{ padding: "8px 11px", fontFamily: "'IBM Plex Mono', monospace" }}>{e.premium ? formatINR(e.premium) : "—"}</td>
                      <td style={{ padding: "8px 11px", color: "#6B6356", whiteSpace: "normal" }}>{e.narration || "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ---- MODALS ---- */}
      {poolModal && (
        <Modal title={poolModal.mode === "add" ? "Add Sum Insured Pool" : "Edit Pool"} onClose={() => setPoolModal(null)} onSave={savePool}
          onDelete={poolModal.mode === "edit" ? async () => { await onDeletePool(poolModal.data.id); setPoolModal(null); } : null}>
          <Field label="Pool Label *" value={poolModal.data.label} onChange={(v) => setPoolModal((m) => ({ ...m, data: { ...m.data, label: v } }))} placeholder="e.g. Export + Domestic Sales" />
          <div style={{ marginBottom: 13 }}>
            <label style={lbl}>Voyage types covered by this pool</label>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4, maxHeight: 190, overflowY: "auto", border: "1px solid #D8CFB8", borderRadius: 7, padding: 10, backgroundColor: "#FFFEFA" }}>
              {VOYAGE_TYPES.map((v) => {
                const sel = (poolModal.data.voyageTypes || []).includes(v);
                return (
                  <label key={v} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, cursor: "pointer", padding: "2px 0" }}>
                    <input type="checkbox" checked={sel} onChange={() => setPoolModal((m) => {
                      const cur = m.data.voyageTypes || [];
                      return { ...m, data: { ...m.data, voyageTypes: sel ? cur.filter((x) => x !== v) : [...cur, v] } };
                    })} />
                    {v}
                  </label>
                );
              })}
            </div>
            <div style={{ fontSize: 10.5, color: "#8a8273", marginTop: 4 }}>Tick one voyage type for a separate limit, or several to share one combined limit.</div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Field label="Sum Insured Limit (₹)" type="number" value={poolModal.data.si_limit} onChange={(v) => setPoolModal((m) => ({ ...m, data: { ...m.data, si_limit: v } }))} />
            <Field label="Rate %" type="number" value={poolModal.data.rate_pct} onChange={(v) => setPoolModal((m) => ({ ...m, data: { ...m.data, rate_pct: v } }))} placeholder="e.g. 0.5" />
          </div>
          <Field label="Subject matter of transits" value={poolModal.data.subjectMatter} onChange={(v) => setPoolModal((m) => ({ ...m, data: { ...m.data, subjectMatter: v } }))} placeholder="e.g. Ferro alloys in bulk, packed castings" />
          <div>
            <label style={lbl}>Special reference — voyages / transport specifically covered or excluded</label>
            <textarea value={poolModal.data.specialReference || ""} onChange={(e) => setPoolModal((m) => ({ ...m, data: { ...m.data, specialReference: e.target.value } }))} rows={3} style={{ ...inputStyle, resize: "vertical" }} placeholder="e.g. Covers carriage by road and rail only. Air transit excluded. Special rate applies to Capital Goods." />
          </div>
        </Modal>
      )}

      {declModal && (() => {
        const pool = pools.find((p) => p.id === declModal.poolId);
        const bal = poolBalance(pool, decls, endorsements);
        const prem = declarationPremium(pool, declModal.value, declModal.specialRate);
        return (
          <Modal title={mode === "Certificate" ? "Enter Certificate Declaration" : "File Declaration"} onClose={() => setDeclModal(null)} onSave={fileDeclaration} saveLabel="File">
            <div style={{ fontSize: 12.5, color: "#6B6356", marginBottom: 12 }}>
              <strong>{pool.label}</strong> · period {formatDate(declModal.start)} → {formatDate(declModal.end)} · available balance <strong>{formatINR(bal.balance)}</strong>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <Field label="Declared Value (₹) *" type="number" value={declModal.value} onChange={(v) => setDeclModal((m) => ({ ...m, value: v, error: "" }))} />
              <Field label="Special voyage rate % (optional)" type="number" value={declModal.specialRate} onChange={(v) => setDeclModal((m) => ({ ...m, specialRate: v }))} placeholder={`default ${pool.rate_pct || 0}%`} />
            </div>
            <Field label="Subject matter of transit" value={declModal.subjectMatter} onChange={(v) => setDeclModal((m) => ({ ...m, subjectMatter: v }))} />
            <div style={{ backgroundColor: "#F6FBFF", border: "1px solid #C7D4DD", borderRadius: 7, padding: "10px 12px", fontSize: 12.5, color: "#1F5C99" }}>
              Premium at {declModal.specialRate || pool.rate_pct || 0}%: <strong>{formatINR(prem)}</strong>
              <div style={{ color: "#6B6356", marginTop: 3 }}>Balance after filing: {formatINR(bal.balance - (Number(declModal.value) || 0))}</div>
            </div>
            {declModal.error && <div style={{ marginTop: 10, backgroundColor: "#FBF1EF", border: "1px solid #E8C8C2", borderRadius: 6, padding: "9px 12px", fontSize: 12.5, color: "#A8392F", fontWeight: 600 }}>{declModal.error}</div>}
          </Modal>
        );
      })()}

      {fixModal && (
        <Modal title="Correct / Rectify Declaration" onClose={() => setFixModal(null)} onSave={saveCorrection} saveLabel="Save correction">
          <div style={{ fontSize: 12.5, color: "#6B6356", marginBottom: 12 }}>
            Period {formatDate(fixModal.decl.period_start)} → {formatDate(fixModal.decl.period_end)} · originally declared <strong>{formatINR(fixModal.decl.declaredValue)}</strong>
          </div>
          {(fixModal.decl.corrections || []).length > 0 && (
            <div style={{ marginBottom: 14, border: "1px solid #EAD7B8", borderRadius: 7, backgroundColor: "#FFF8EF", padding: 10 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#B8722A", textTransform: "uppercase", marginBottom: 6 }}>Correction history</div>
              {fixModal.decl.corrections.map((c, i) => (
                <div key={i} style={{ fontSize: 12, color: "#6B6356", paddingTop: 4, borderTop: i ? "1px solid #EAD7B8" : "none" }}>
                  <strong style={{ fontFamily: "'IBM Plex Mono', monospace" }}>{formatINR(c.value)}</strong> · {formatDate(c.at)} — {c.narration}
                </div>
              ))}
            </div>
          )}
          <Field label="Corrected Value (₹) *" type="number" value={fixModal.value} onChange={(v) => setFixModal((m) => ({ ...m, value: v, error: "" }))} />
          <div>
            <label style={lbl}>Narration / remarks *</label>
            <textarea value={fixModal.narration} onChange={(e) => setFixModal((m) => ({ ...m, narration: e.target.value, error: "" }))} rows={3} style={{ ...inputStyle, resize: "vertical" }} placeholder="Why is this being corrected…" />
          </div>
          <div style={{ fontSize: 11.5, color: "#8a8273" }}>The original entry is kept. Each correction is added to the history above, and the latest value is what counts against the balance.</div>
          {fixModal.error && <div style={{ marginTop: 10, fontSize: 12.5, color: "#A8392F", fontWeight: 600 }}>{fixModal.error}</div>}
        </Modal>
      )}

      {endoModal && (
        <Modal title={endoModal.kind === "SI Enhancement" ? "Sum Insured Enhancement" : "Change Policy Expiry"} onClose={() => setEndoModal(null)} onSave={saveEndorsement} saveLabel="Record endorsement">
          {endoModal.kind === "SI Enhancement" ? (
            <>
              <div style={{ marginBottom: 13 }}>
                <label style={lbl}>Pool to enhance *</label>
                <select value={endoModal.data.pool_id || ""} onChange={(e) => setEndoModal((m) => ({ ...m, data: { ...m.data, pool_id: e.target.value } }))} style={inputStyle}>
                  <option value="">— select pool —</option>
                  {pools.map((p) => <option key={p.id} value={p.id}>{p.label} (rate {p.rate_pct || 0}%)</option>)}
                </select>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <Field label="Enhancement Amount (₹) *" type="number" value={endoModal.data.amount} onChange={(v) => setEndoModal((m) => ({ ...m, data: { ...m.data, amount: v } }))} />
                <Field label="Rate % (blank = policy rate)" type="number" value={endoModal.data.ratePct} onChange={(v) => setEndoModal((m) => ({ ...m, data: { ...m.data, ratePct: v } }))} placeholder="special voyage rate" />
              </div>
              <Field label="Effective Date" type="date" value={endoModal.data.effective_date} onChange={(v) => setEndoModal((m) => ({ ...m, data: { ...m.data, effective_date: v } }))} />
              {endoModal.data.pool_id && endoModal.data.amount && (() => {
                const pool = pools.find((p) => p.id === endoModal.data.pool_id);
                return <div style={{ backgroundColor: "#F6FBFF", border: "1px solid #C7D4DD", borderRadius: 7, padding: "10px 12px", fontSize: 12.5, color: "#1F5C99", marginBottom: 12 }}>
                  Premium at {endoModal.data.ratePct || pool.rate_pct || 0}%: <strong>{formatINR(declarationPremium(pool, endoModal.data.amount, endoModal.data.ratePct))}</strong>
                </div>;
              })()}
            </>
          ) : (
            <>
              <div style={{ backgroundColor: "#FFF8EF", border: "1px solid #EAD7B8", borderRadius: 7, padding: "10px 12px", fontSize: 12.5, color: "#8a6d3b", marginBottom: 13 }}>
                Current expiry <strong>{formatDate(policy.period_to)}</strong>. Setting an earlier date re-cuts the remaining declaration periods automatically.
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <Field label="New Expiry Date *" type="date" value={endoModal.data.newExpiry} onChange={(v) => setEndoModal((m) => ({ ...m, data: { ...m.data, newExpiry: v } }))} />
                <Field label="Effective Date" type="date" value={endoModal.data.effective_date} onChange={(v) => setEndoModal((m) => ({ ...m, data: { ...m.data, effective_date: v } }))} />
              </div>
            </>
          )}
          <div>
            <label style={lbl}>Narration</label>
            <textarea value={endoModal.data.narration || ""} onChange={(e) => setEndoModal((m) => ({ ...m, data: { ...m.data, narration: e.target.value } }))} rows={2} style={{ ...inputStyle, resize: "vertical" }} />
          </div>
        </Modal>
      )}
    </div>
  );
}

// ---- one pool: balance, period schedule, filed declarations ----
function PoolPanel({ policy, pool, decls, endorsements, grace, onEdit, onDelete, onFile, onFix }) {
  const b = poolBalance(pool, decls, endorsements);
  const statuses = periodStatuses(policy, pool, decls, grace);
  const voyages = pool.voyageTypes || [];

  return (
    <div style={{ border: "1px solid #C7D4DD", borderRadius: 10, marginBottom: 16, backgroundColor: "#FFFEFA", overflow: "hidden" }}>
      <div style={{ padding: "13px 16px", backgroundColor: "#F6FBFF", borderBottom: "1px solid #C7D4DD", display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 260 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 5 }}>
            <strong style={{ fontSize: 14.5, color: "#152A47" }}>{pool.label}</strong>
            <Pill label={`${pool.rate_pct || 0}%`} color="#1F5C99" />
            {voyages.length > 1 && <Pill label="Combined limit" color="#6B5B95" />}
          </div>
          {voyages.length > 0 && <div style={{ fontSize: 11.5, color: "#6B6356", marginBottom: 4 }}>{voyages.join(" · ")}</div>}
          {pool.subjectMatter && <div style={{ fontSize: 11.5, color: "#8a8273" }}><em>Subject matter:</em> {pool.subjectMatter}</div>}
          {pool.specialReference && <div style={{ fontSize: 11.5, color: "#B8722A", marginTop: 3 }}><em>Special reference:</em> {pool.specialReference}</div>}
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 11, color: "#8a8273", textTransform: "uppercase", letterSpacing: "0.04em" }}>Balance</div>
          <div style={{ fontSize: 19, fontWeight: 700, fontFamily: "'IBM Plex Mono', monospace", color: b.balance <= 0 ? "#A8392F" : "#1B6E5C" }}>{formatINR(b.balance)}</div>
          <div style={{ fontSize: 11.5, color: "#8a8273" }}>of {formatINR(b.limit)}{b.enhanced > 0 && ` (incl. ${formatINR(b.enhanced)} enhanced)`}</div>
          <div style={{ marginTop: 5 }}><ConsumptionBar pct={b.consumedPct} wide /></div>
          <div style={{ marginTop: 7, display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <button onClick={onEdit} style={{ background: "none", border: "none", color: "#1F5C99", cursor: "pointer", fontSize: 11.5, fontWeight: 600 }}>Edit pool</button>
            <button onClick={onDelete} style={{ background: "none", border: "none", color: "#A8392F", cursor: "pointer", fontSize: 11.5, fontWeight: 600 }}>Delete</button>
          </div>
        </div>
      </div>

      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5, minWidth: 820 }}>
          <thead>
            <tr style={{ backgroundColor: "#EDE7D8", textAlign: "left" }}>
              {["Declaration Period", "Status", "Declared Value", "Premium", "Subject matter", ""].map((h) => (
                <th key={h} style={{ padding: "8px 11px", fontSize: 10.5, fontWeight: 700, color: "#6B6356", textTransform: "uppercase" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {statuses.map((st) => {
              const d = st.decl;
              const corrected = d && (d.corrections || []).length > 0;
              return (
                <tr key={st.start} style={{ borderTop: "1px solid #EAE3D3" }}>
                  <td style={{ padding: "9px 11px", whiteSpace: "nowrap" }}>{formatDate(st.start)} → {formatDate(st.end)}</td>
                  <td style={{ padding: "9px 11px" }}>
                    {st.state === "Filed" && <Pill label="Filed" color="#1B6E5C" />}
                    {st.state === "Pending" && <Pill label="Not yet due" color="#8a8273" />}
                    {st.state === "Due" && <Pill label="Due" color="#1F5C99" />}
                    {st.state === "Overdue" && <Pill label={`${SEVERITY_LABELS[st.severity]} · ${st.daysLate}d late`} color={SEVERITY_COLORS[st.severity]} />}
                  </td>
                  <td style={{ padding: "9px 11px", fontFamily: "'IBM Plex Mono', monospace" }}>
                    {d ? formatINR(effectiveValue(d)) : "—"}
                    {corrected && <div style={{ fontSize: 10, color: "#B8722A", fontWeight: 600 }}>corrected ×{d.corrections.length}</div>}
                  </td>
                  <td style={{ padding: "9px 11px", fontFamily: "'IBM Plex Mono', monospace" }}>{d && d.premium ? formatINR(d.premium) : "—"}</td>
                  <td style={{ padding: "9px 11px", color: "#6B6356", whiteSpace: "normal" }}>{d?.subjectMatter || "—"}</td>
                  <td style={{ padding: "9px 11px", textAlign: "right" }}>
                    {d
                      ? <button onClick={() => onFix(d)} style={{ background: "none", border: "1px solid #C7D4DD", borderRadius: 5, padding: "3px 9px", color: "#1F5C99", cursor: "pointer", fontSize: 10.5, fontWeight: 600, whiteSpace: "nowrap" }}>Correct</button>
                      : <button onClick={() => onFile(st)} style={{ background: "#1F5C99", border: "none", borderRadius: 5, padding: "4px 11px", color: "#fff", cursor: "pointer", fontSize: 10.5, fontWeight: 600, whiteSpace: "nowrap" }}>File</button>}
                  </td>
                </tr>
              );
            })}
            {statuses.length === 0 && <tr><td colSpan={6} style={{ padding: 14, textAlign: "center", color: "#8a8273" }}>Set the policy period to generate declaration periods.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const smallBtn = { display: "inline-flex", alignItems: "center", gap: 5, padding: "7px 13px", fontSize: 12.5, fontWeight: 600, backgroundColor: "#FFFEFA", color: "#1F5C99", border: "1px solid #C7D4DD", borderRadius: 7, cursor: "pointer" };




// ---------- Other Functions: per-policy selectors ----------
function membersFor(members, policyId) {
  return (members || []).filter((m) => m.policy_id === policyId);
}
function endorsementsFor(endorsements, policyId) {
  return (endorsements || [])
    .filter((e) => e.policy_id === policyId)
    .sort((a, b) => (b.effective_date || "").localeCompare(a.effective_date || ""));
}
function locationsFor(locations, policyId) {
  return (locations || []).filter((l) => l.policy_id === policyId);
}
// Head-count by status for a member list.
function lifeCounts(members) {
  const list = members || [];
  const by = (st) => list.filter((m) => (m.status || "Active") === st).length;
  return {
    total: list.length,
    active: by("Active"),
    deleted: by("Deleted"),
    pendingAdd: by("Pending Addition"),
    pendingDel: by("Pending Deletion"),
    suspended: by("Suspended"),
  };
}
// Sum insured and premium across the ACTIVE lives only.
function memberTotals(members) {
  const active = (members || []).filter((m) => (m.status || "Active") === "Active");
  return {
    si: active.reduce((t, m) => t + (Number(m.sumInsured) || 0), 0),
    premium: active.reduce((t, m) => t + (Number(m.premium) || 0), 0),
  };
}

// ---------- Other Functions: rollup helpers ----------

// GMC/GPA endorsement dashboard figures. Added/deleted lives come from the
// movement arrays held on each endorsement, so one endorsement can move many
// employees and still stay a single auditable document.
function endorsementRollup(endorsements) {
  let added = 0, deleted = 0, pending = 0, completed = 0, premiumDiff = 0;
  (endorsements || []).forEach((e) => {
    added += (e.added || []).length;
    deleted += (e.deleted || []).length;
    if ((e.status || "Pending") === "Completed") completed++; else if (e.status === "Pending") pending++;
    premiumDiff += Number(e.premiumDiff) || 0;
  });
  return { count: (endorsements || []).length, added, deleted, pending, completed, premiumDiff };
}

// Active lives: Opening + Added - Deleted, per the spec. "Opening" is the count
// of members who were not introduced by an endorsement.
function livesRollup(members, endorsements) {
  const list = members || [];
  const active = list.filter((m) => (m.status || "Active") === "Active").length;
  const deletedNow = list.filter((m) => m.status === "Deleted").length;
  const pendingAdd = list.filter((m) => m.status === "Pending Addition").length;
  const pendingDel = list.filter((m) => m.status === "Pending Deletion").length;
  const er = endorsementRollup(endorsements);
  const opening = Math.max(0, list.length - er.added);
  return {
    total: list.length, active, deleted: deletedNow, pendingAdd, pendingDel,
    opening, added: er.added, removed: er.deleted,
    // Opening Lives + Added Lives - Deleted Lives
    computed: opening + er.added - er.deleted,
    sumInsured: list.filter((m) => (m.status || "Active") === "Active").reduce((t, m) => t + (Number(m.sumInsured) || 0), 0),
    premium: list.filter((m) => (m.status || "Active") === "Active").reduce((t, m) => t + (Number(m.premium) || 0), 0),
  };
}

// CD account. The running balance is derived by walking the ordered rows, so
// it can never drift out of step with the transactions themselves.
function cdSummary(entries, policyId) {
  const rows = (entries || [])
    .filter((e) => e.policy_id === policyId)
    .sort((a, b) => (a.txn_date || "").localeCompare(b.txn_date || ""));
  let opening = 0, deposits = 0, debits = 0, refunds = 0, running = 0;
  const out = rows.map((r) => {
    const debit = Number(r.debit) || 0;
    const credit = Number(r.credit) || 0;
    if (r.txn_type === "Opening Balance") opening += credit - debit;
    else if (r.txn_type === "Deposit") deposits += credit;
    else if (r.txn_type === "Premium Debit") debits += debit;
    else if (r.txn_type === "Refund Credit") refunds += credit;
    running += credit - debit;
    return { ...r, debit, credit, runningBalance: running };
  });
  return { rows: out, opening, deposits, debits, refunds, balance: running };
}

// Property: total sum insured and the split by asset head.
function propertyRollup(locations) {
  const byHead = {};
  ASSET_HEADS.forEach((h) => { byHead[h.key] = 0; });
  let total = 0;
  (locations || []).forEach((l) => {
    ASSET_HEADS.forEach((h) => {
      const v = Number(l[h.key]) || 0;
      byHead[h.key] += v;
      total += v;
    });
  });
  return { count: (locations || []).length, total, byHead };
}

// Project instalments. Status is computed from the due date and how much has
// been paid, rather than stored, so it can never go stale as dates pass.
function instalmentRollup(instalments, policyId) {
  const today = todayISO();
  const rows = (instalments || [])
    .filter((i) => i.policy_id === policyId)
    .sort((a, b) => (a.due_date || "").localeCompare(b.due_date || ""))
    .map((i) => {
      const gross = (Number(i.amount) || 0) + (Number(i.gst) || 0);
      const paid = Number(i.paid_amount) || 0;
      const outstanding = Math.max(0, gross - paid);
      let computedStatus;
      if (paid >= gross && gross > 0) computedStatus = "Paid";
      else if (paid > 0) computedStatus = "Partially Paid";
      else if (!i.due_date) computedStatus = "Upcoming";
      else if (i.due_date < today) computedStatus = "Overdue";
      else if (i.due_date === today) computedStatus = "Due Today";
      else computedStatus = "Upcoming";
      return { ...i, gross, paid, outstanding, computedStatus };
    });
  const count = (st) => rows.filter((r) => r.computedStatus === st).length;
  const nextDue = rows.find((r) => r.computedStatus !== "Paid");
  return {
    rows,
    total: rows.reduce((t, r) => t + r.gross, 0),
    paid: rows.reduce((t, r) => t + r.paid, 0),
    outstanding: rows.reduce((t, r) => t + r.outstanding, 0),
    upcoming: count("Upcoming"), overdue: count("Overdue"),
    dueToday: count("Due Today"), completed: count("Paid"),
    nextDue: nextDue ? nextDue.due_date : null,
  };
}

// ---------- Other Functions: shared constants ----------
// Member statuses per the GMC/GHI lifecycle spec.
const MEMBER_STATUSES = ["Active", "Deleted", "Pending Addition", "Pending Deletion", "Suspended"];
const MEMBER_STATUS_COLORS = {
  Active: "#1B6E5C", Deleted: "#A8392F", "Pending Addition": "#1F5C99",
  "Pending Deletion": "#B8722A", Suspended: "#6B5B95",
};

const RELATIONSHIPS = ["Self", "Spouse", "Son", "Daughter", "Father", "Mother", "Father-in-law", "Mother-in-law"];

const GMC_ENDORSEMENT_TYPES = [
  "Addition", "Deletion", "Correction", "Marriage", "Child Addition", "Parent Addition",
  "SI Revision", "Department Change", "Location Change", "Cancellation",
];
const GPA_ENDORSEMENT_TYPES = [
  "Addition", "Deletion", "Salary Revision", "Occupation Change", "SI Revision", "Correction",
];
const ENDORSEMENT_STATUSES = ["Pending", "Completed", "Rejected"];
const ENDO_STATUS_COLORS = { Pending: "#B8722A", Completed: "#1B6E5C", Rejected: "#A8392F" };

// Property asset heads. Location total sum insured is the sum of these.
const ASSET_HEADS = [
  { key: "building", label: "Building" },
  { key: "plant", label: "Plant & Machinery" },
  { key: "stock", label: "Stock" },
  { key: "furniture", label: "Furniture & Fixtures" },
  { key: "electrical", label: "Electrical Installation" },
  { key: "computers", label: "Computers" },
  { key: "other", label: "Other Assets" },
];

const INSTALMENT_STATUS_COLORS = {
  Upcoming: "#1F5C99", "Due Today": "#B8722A", Overdue: "#A8392F",
  Paid: "#1B6E5C", "Partially Paid": "#C2571E",
};

// ============================================================
//  OTHER FUNCTIONS — GMC/GHI, GPA, Property, Project
// ============================================================
const OTHER_MODULES = [
  { k: "gmc", label: "GMC / GHI", icon: Users },
  { k: "gpa", label: "GPA", icon: Shield },
  { k: "property", label: "Property", icon: Building2 },
  { k: "project", label: "Project", icon: Activity },
];

function OtherFunctionsTab(props) {
  const [mod, setMod] = useState("gmc");
  const [selected, setSelected] = useState(null);
  const switchMod = (k) => { setMod(k); setSelected(null); };

  return (
    <div>
      <TabHeader title="Other Functions" subtitle="Group health, personal accident, property and project policies — each with its own registers, endorsement lifecycle and dashboards." />
      <div style={{ display: "flex", gap: 4, backgroundColor: "#EFE9DA", borderRadius: 8, padding: 3, marginBottom: 18, flexWrap: "wrap" }}>
        {OTHER_MODULES.map((m) => {
          const Icon = m.icon;
          return (
            <button key={m.k} onClick={() => switchMod(m.k)} style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 16px", fontSize: 13, fontWeight: 600, border: "none", borderRadius: 6, cursor: "pointer", backgroundColor: mod === m.k ? "#FFFEFA" : "transparent", color: mod === m.k ? "#1F5C99" : "#8a8273" }}>
              <Icon size={14} /> {m.label}
            </button>
          );
        })}
      </div>
      {mod === "gmc" && <BenefitModule scheme="GMC" selected={selected} setSelected={setSelected} {...props} />}
      {mod === "gpa" && <BenefitModule scheme="GPA" selected={selected} setSelected={setSelected} {...props} />}
      {mod === "property" && <PropertyModule selected={selected} setSelected={setSelected} {...props} />}
      {mod === "project" && <ProjectModule selected={selected} setSelected={setSelected} {...props} />}
    </div>
  );
}

// ---------- shared: sub-tab strip ----------
function SubTabs({ tabs, active, onChange }) {
  return (
    <div style={{ display: "flex", gap: 2, borderBottom: "1px solid #E5DCC6", marginBottom: 16, overflowX: "auto" }}>
      {tabs.map((t) => (
        <button key={t.k} onClick={() => onChange(t.k)} style={{ padding: "10px 15px", fontSize: 12.5, fontWeight: 600, background: "none", border: "none", cursor: "pointer", whiteSpace: "nowrap", borderBottom: active === t.k ? "2px solid #1F5C99" : "2px solid transparent", color: active === t.k ? "#1F5C99" : "#8a8273" }}>
          {t.label}{t.badge > 0 && <span style={{ marginLeft: 6, backgroundColor: "#A8392F", color: "#fff", borderRadius: 10, padding: "1px 6px", fontSize: 10, fontWeight: 700 }}>{t.badge}</span>}
        </button>
      ))}
    </div>
  );
}

function SummaryRow({ items }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 12, backgroundColor: "#FFFEFA", border: "1px solid #EAE3D3", borderRadius: 10, padding: 16, marginBottom: 18 }}>
      {items.map((i) => (
        <div key={i.label}>
          <div style={{ fontSize: 10.5, color: "#8a8273", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 3 }}>{i.label}</div>
          <div style={{ fontSize: 14.5, fontWeight: 600, color: i.color || "#2B2620", fontFamily: i.mono ? "'IBM Plex Mono', monospace" : "inherit" }}>{i.value}</div>
        </div>
      ))}
    </div>
  );
}

// ============================================================
//  GMC / GHI  and  GPA  (shared shape, scheme-specific fields)
// ============================================================
function BenefitModule({ scheme, selected, setSelected, policies, clients, members, benefitEndos, cdEntries,
                         onCreateMember, onUpdateMember, onDeleteMember, onCreateEndo, onUpdateEndo, onCreateCd }) {
  const isGMC = scheme === "GMC";
  const match = (p) => {
    const t = (p.policy_type || "").toUpperCase();
    return isGMC ? (t.includes("GMC") || t.includes("GHI") || t.includes("HEALTH")) : (t.includes("GPA") || t.includes("ACCIDENT"));
  };
  const list = policies.filter(match).sort((a, b) => (a.period_to || "9999").localeCompare(b.period_to || "9999"));
  const clientName = (id) => clients.find((c) => c.id === id)?.name || "";

  if (selected) {
    const policy = list.find((p) => p.id === selected) || policies.find((p) => p.id === selected);
    if (!policy) { setSelected(null); return null; }
    return <BenefitPolicyDetail scheme={scheme} policy={policy}
      members={membersFor(members, policy.id)} endorsements={endorsementsFor(benefitEndos, policy.id)}
      cdEntries={cdEntries} onBack={() => setSelected(null)}
      onCreateMember={onCreateMember} onUpdateMember={onUpdateMember} onDeleteMember={onDeleteMember}
      onCreateEndo={onCreateEndo} onUpdateEndo={onUpdateEndo} onCreateCd={onCreateCd} />;
  }

  return (
    <DataTable rows={list} onRowClick={(p) => setSelected(p.id)} exportName={`${scheme}-Policies`} minWidth={1150}
      searchPlaceholder={`Search ${scheme} policies…`}
      emptyMessage={`No ${scheme} policies yet. Add one in the Policies tab with "${isGMC ? "GMC" : "GPA"}" in the policy type.`}
      columns={[
        { key: "insurerName", label: "Insurance Company", type: "text", get: (p) => p.insurerName || "" },
        { key: "insured_name", label: "Client", type: "text", bold: true, get: (p) => p.insured_name || "" },
        { key: "policy_no", label: "Policy No.", type: "text", mono: true, get: (p) => p.policy_no || "" },
        { key: "period", label: "Policy Period", type: "date", get: (p) => p.period_to || "", render: (p) => <span style={{ color: "#8a8273", fontSize: 12 }}>{formatDate(p.period_from)} → {formatDate(p.period_to)}</span> },
        { key: "lives", label: isGMC ? "Total Lives" : "Lives", type: "number", get: (p) => membersFor(members, p.id).length },
        { key: "active", label: "Active", type: "number", get: (p) => lifeCounts(membersFor(members, p.id)).active, render: (p) => <strong>{lifeCounts(membersFor(members, p.id)).active}</strong> },
        ...(isGMC ? [] : [{ key: "totalSI", label: "Total SI", type: "number", mono: true, get: (p) => memberTotals(membersFor(members, p.id)).si, render: (p) => formatINR(memberTotals(membersFor(members, p.id)).si) }]),
        { key: "premium", label: "Premium", type: "number", mono: true, get: (p) => Number(p.premium) || 0, render: (p) => formatINR(p.premium) },
        ...(isGMC ? [{ key: "cd", label: "CD Balance", type: "number", mono: true, get: (p) => cdSummary(cdEntries, p.id).balance, render: (p) => { const b = cdSummary(cdEntries, p.id).balance; return <span style={{ color: b < 0 ? "#A8392F" : "#1B6E5C", fontWeight: 600 }}>{formatINR(b)}</span>; } }] : []),
        { key: "endos", label: "Endorsements", type: "number", get: (p) => endorsementsFor(benefitEndos, p.id).length },
        { key: "status", label: "Status", type: "text", get: (p) => p.status || "", render: (p) => <Pill label={p.status || "Draft"} color={STATUS_COLORS[p.status || "Draft"]} /> },
      ]} />
  );
}

function BenefitPolicyDetail({ scheme, policy, members, endorsements, cdEntries, onBack,
                               onCreateMember, onUpdateMember, onDeleteMember, onCreateEndo, onUpdateEndo, onCreateCd }) {
  const isGMC = scheme === "GMC";
  const [sub, setSub] = useState("summary");
  const [memberModal, setMemberModal] = useState(null);
  const [endoModal, setEndoModal] = useState(null);
  const [cdModal, setCdModal] = useState(null);
  const [openEndo, setOpenEndo] = useState(null);

  const counts = lifeCounts(members);
  const totals = memberTotals(members);
  const roll = endorsementRollup(endorsements);
  const cd = cdSummary(cdEntries, policy.id);
  const daysToExpiry = daysUntil(policy.period_to);

  const tabs = [
    { k: "summary", label: "Policy Summary" },
    { k: "members", label: isGMC ? "Employee Master" : "Employee Register" },
    { k: "endorsements", label: "Endorsement Register", badge: roll.pending },
    ...(isGMC ? [{ k: "cd", label: "CD Account" }] : [{ k: "ledger", label: "Premium Ledger" }]),
    { k: "renewal", label: "Renewal" },
  ];

  const saveMember = async () => {
    const d = memberModal.data;
    if (!d.member_name) return;
    if (memberModal.mode === "add") await onCreateMember({ ...d, policy_id: policy.id });
    else await onUpdateMember(d.id, d);
    setMemberModal(null);
  };

  const saveEndorsement = async () => {
    const d = endoModal.data;
    if (!d.endorsement_no || !d.endorsement_type) return;
    const created = await onCreateEndo({
      ...d, policy_id: policy.id,
      addedCount: Number(d.addedCount) || 0,
      deletedCount: Number(d.deletedCount) || 0,
      premiumDiff: Number(d.premiumDiff) || 0,
      status: d.status || "Pending",
    });
    // Addition premiums debit the CD account, deletion refunds credit it.
    if (isGMC && created) {
      const entry = cdEntryFromEndorsement({ ...d, premiumDiff: Number(d.premiumDiff) || 0 }, policy.id);
      if (entry) await onCreateCd(entry);
    }
    setEndoModal(null);
  };

  return (
    <div>
      <button onClick={onBack} style={{ background: "none", border: "none", color: "#1F5C99", cursor: "pointer", fontSize: 13, fontWeight: 600, marginBottom: 12 }}>← Back to {scheme} policies</button>
      <h2 style={{ margin: "0 0 4px", fontSize: 20, fontFamily: "'Source Serif 4', Georgia, serif", color: "#152A47" }}>{policy.insured_name}</h2>
      <div style={{ fontSize: 12.5, color: "#8a8273", fontFamily: "'IBM Plex Mono', monospace", marginBottom: 16 }}>
        {policy.policy_no} · {policy.insurerName} · {formatDate(policy.period_from)} → {formatDate(policy.period_to)}
      </div>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 18 }}>
        <StatCard icon={Users} label="Current Lives" value={counts.active} sub={`${counts.total} on register`} accent="#1F5C99" />
        <StatCard icon={Plus} label="Added" value={roll.added} sub={`${counts.pendingAddition} pending`} accent="#1B6E5C" />
        <StatCard icon={Trash2} label="Deleted" value={roll.deleted} sub={`${counts.pendingDeletion} pending`} accent="#A8392F" />
        {isGMC
          ? <StatCard icon={IndianRupee} label="CD Balance" value={formatINR(cd.balance)} sub={`${formatINR(cd.debits)} debited`} accent={cd.balance < 0 ? "#A8392F" : "#1B6E5C"} />
          : <StatCard icon={Shield} label="Current Total SI" value={formatINR(totals.si)} accent="#6B5B95" />}
      </div>

      <SubTabs tabs={tabs} active={sub} onChange={setSub} />

      {sub === "summary" && (
        <div>
          <SummaryRow items={[
            { label: "Insurance Company", value: policy.insurerName || "—" },
            { label: "Policy No.", value: policy.policy_no || "—", mono: true },
            { label: "Policy Period", value: `${formatDate(policy.period_from)} → ${formatDate(policy.period_to)}` },
            { label: "Premium", value: formatINR(policy.premium), mono: true },
            { label: isGMC ? "Total Lives" : "Lives", value: counts.total },
            { label: "Active Lives", value: counts.active, color: "#1B6E5C" },
            { label: "Total Sum Insured", value: formatINR(totals.si), mono: true },
            { label: "Status", value: policy.status || "Draft" },
          ]} />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(210px,1fr))", gap: 12 }}>
            <MiniCard label="Pending Endorsements" value={roll.pending} color="#B8722A" />
            <MiniCard label="Completed Endorsements" value={roll.completed} color="#1B6E5C" />
            <MiniCard label="Net Premium Difference" value={formatINR(roll.premiumDiff)} color={roll.premiumDiff >= 0 ? "#A8392F" : "#1B6E5C"} />
            {isGMC && <MiniCard label="Premium Refunded" value={formatINR(cd.refunds)} color="#1B6E5C" />}
            <MiniCard label="Suspended Lives" value={counts.suspended} color="#6B6356" />
          </div>
        </div>
      )}

      {sub === "members" && (
        <div>
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 10 }}>
            <button onClick={() => setMemberModal({ mode: "add", data: { status: "Active" } })} style={smallBtn}><Plus size={13} /> Add {isGMC ? "Life" : "Employee"}</button>
          </div>
          <DataTable rows={members} onRowClick={(m) => setMemberModal({ mode: "edit", data: { ...m } })} exportName={`${scheme}-Members`} minWidth={isGMC ? 1150 : 950} searchPlaceholder="Search members…"
            emptyMessage="No lives on this policy yet."
            columns={[
              { key: "member_code", label: "Employee ID", type: "text", mono: true, get: (m) => m.member_code || "" },
              { key: "member_name", label: "Name", type: "text", bold: true, get: (m) => m.member_name || "" },
              ...(isGMC ? [
                { key: "relationship", label: "Relationship", type: "text", get: (m) => m.relationship || "" },
                { key: "dob", label: "DOB", type: "date", get: (m) => m.dob || "", render: (m) => formatDate(m.dob) },
                { key: "doj", label: "DOJ", type: "date", get: (m) => m.doj || "", render: (m) => formatDate(m.doj) },
                { key: "dol", label: "DOL", type: "date", get: (m) => m.dol || "", render: (m) => m.dol ? formatDate(m.dol) : "—" },
                { key: "department", label: "Department", type: "text", get: (m) => m.department || "" },
                { key: "location", label: "Location", type: "text", get: (m) => m.location || "" },
              ] : [
                { key: "salary", label: "Salary", type: "number", mono: true, get: (m) => Number(m.salary) || 0, render: (m) => m.salary ? formatINR(m.salary) : "—" },
                { key: "occupation", label: "Occupation", type: "text", get: (m) => m.occupation || "" },
                { key: "category", label: "Category", type: "text", get: (m) => m.category || "" },
              ]),
              { key: "sumInsured", label: "Sum Insured", type: "number", mono: true, get: (m) => Number(m.sumInsured) || 0, render: (m) => formatINR(m.sumInsured) },
              { key: "premium", label: "Premium", type: "number", mono: true, get: (m) => Number(m.premium) || 0, render: (m) => formatINR(m.premium) },
              { key: "status", label: "Status", type: "text", get: (m) => m.status || "", render: (m) => <Pill label={m.status || "Active"} color={MEMBER_STATUS_COLORS[m.status || "Active"]} /> },
            ]} />
        </div>
      )}

      {sub === "endorsements" && (
        <div>
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 10 }}>
            <button onClick={() => setEndoModal({ data: { effective_date: todayISO(), status: "Pending", endorsement_no: `END-${String(endorsements.length + 1).padStart(3, "0")}` } })} style={smallBtn}><Plus size={13} /> New Endorsement</button>
          </div>
          <DataTable rows={endorsements} onRowClick={(e) => setOpenEndo(e)} exportName={`${scheme}-Endorsements`} minWidth={1150} searchPlaceholder="Search endorsements…"
            emptyMessage="No endorsements recorded."
            columns={[
              { key: "effective_date", label: "Date", type: "date", get: (e) => e.effective_date || "", render: (e) => formatDate(e.effective_date) },
              { key: "endorsement_no", label: "Endorsement No.", type: "text", mono: true, bold: true, get: (e) => e.endorsement_no || "" },
              { key: "insurer", label: "Insurance Company", type: "text", get: () => policy.insurerName || "" },
              { key: "endorsement_type", label: "Type", type: "text", get: (e) => e.endorsement_type || "", render: (e) => <Pill label={e.endorsement_type} color="#1F5C99" /> },
              { key: "addedCount", label: "Added", type: "number", get: (e) => Number(e.addedCount) || 0 },
              { key: "deletedCount", label: "Deleted", type: "number", get: (e) => Number(e.deletedCount) || 0 },
              { key: "premiumDiff", label: "Premium Diff", type: "number", mono: true, get: (e) => Number(e.premiumDiff) || 0, render: (e) => { const d = Number(e.premiumDiff) || 0; return <span style={{ color: d > 0 ? "#A8392F" : d < 0 ? "#1B6E5C" : "#6B6356", fontWeight: 600 }}>{d > 0 ? "+" : ""}{formatINR(d)}</span>; } },
              { key: "status", label: "Status", type: "text", get: (e) => e.status || "", render: (e) => <Pill label={e.status || "Pending"} color={e.status === "Completed" ? "#1B6E5C" : e.status === "Rejected" ? "#A8392F" : "#B8722A"} /> },
              { key: "remarks", label: "Remarks", type: "text", wrap: true, get: (e) => e.remarks || "" },
            ]} />
        </div>
      )}

      {sub === "cd" && (
        <div>
          <SummaryRow items={[
            { label: "Opening Balance", value: formatINR(cd.opening), mono: true },
            { label: "Deposits", value: formatINR(cd.deposits), mono: true, color: "#1B6E5C" },
            { label: "Premium Debits", value: formatINR(cd.debits), mono: true, color: "#A8392F" },
            { label: "Refund Credits", value: formatINR(cd.refunds), mono: true, color: "#1B6E5C" },
            { label: "Current Balance", value: formatINR(cd.balance), mono: true, color: cd.balance < 0 ? "#A8392F" : "#1B6E5C" },
          ]} />
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 10 }}>
            <button onClick={() => setCdModal({ data: { txn_date: todayISO(), txn_type: "Deposit" } })} style={smallBtn}><Plus size={13} /> Add Transaction</button>
          </div>
          <div style={{ overflowX: "auto", border: "1px solid #EAE3D3", borderRadius: 10, backgroundColor: "#FFFEFA" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5, minWidth: 950 }}>
              <thead><tr style={{ backgroundColor: "#EDE7D8", textAlign: "left" }}>{["Date", "Reference", "Endorsement No.", "Transaction Type", "Debit", "Credit", "Running Balance", "Remarks"].map((h) => <th key={h} style={{ padding: "8px 11px", fontSize: 10.5, fontWeight: 700, color: "#6B6356", textTransform: "uppercase" }}>{h}</th>)}</tr></thead>
              <tbody>
                {cd.rows.map((r) => (
                  <tr key={r.id} style={{ borderTop: "1px solid #EAE3D3" }}>
                    <td style={{ padding: "9px 11px", whiteSpace: "nowrap" }}>{formatDate(r.txn_date)}</td>
                    <td style={{ padding: "9px 11px" }}>{r.reference || "—"}</td>
                    <td style={{ padding: "9px 11px", fontFamily: "'IBM Plex Mono', monospace" }}>{r.endorsementNo || "—"}</td>
                    <td style={{ padding: "9px 11px" }}><Pill label={r.txn_type} color={r.txn_type === "Deposit" ? "#1F5C99" : r.txn_type === "Premium Debit" ? "#A8392F" : "#1B6E5C"} /></td>
                    <td style={{ padding: "9px 11px", fontFamily: "'IBM Plex Mono', monospace", color: "#A8392F" }}>{r.debit ? formatINR(r.debit) : "—"}</td>
                    <td style={{ padding: "9px 11px", fontFamily: "'IBM Plex Mono', monospace", color: "#1B6E5C" }}>{r.credit ? formatINR(r.credit) : "—"}</td>
                    <td style={{ padding: "9px 11px", fontFamily: "'IBM Plex Mono', monospace", fontWeight: 700 }}>{formatINR(r.runningBalance)}</td>
                    <td style={{ padding: "9px 11px", color: "#6B6356", whiteSpace: "normal" }}>{r.remarks || "—"}</td>
                  </tr>
                ))}
                {cd.rows.length === 0 && <tr><td colSpan={8} style={{ padding: 18, textAlign: "center", color: "#8a8273" }}>No CD transactions yet. Endorsement premiums post here automatically.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {sub === "ledger" && (
        <div>
          <SummaryRow items={[
            { label: "Premium Debited", value: formatINR(endorsements.filter((e) => Number(e.premiumDiff) > 0).reduce((s, e) => s + Number(e.premiumDiff), 0)), mono: true, color: "#A8392F" },
            { label: "Premium Refunded", value: formatINR(Math.abs(endorsements.filter((e) => Number(e.premiumDiff) < 0).reduce((s, e) => s + Number(e.premiumDiff), 0))), mono: true, color: "#1B6E5C" },
            { label: "Net Difference", value: formatINR(roll.premiumDiff), mono: true },
          ]} />
          <DataTable rows={endorsements.filter((e) => Number(e.premiumDiff) !== 0)} exportName="GPA-Premium-Ledger" minWidth={860} searchPlaceholder="Search ledger…"
            emptyMessage="No premium movements yet."
            columns={[
              { key: "effective_date", label: "Date", type: "date", get: (e) => e.effective_date || "", render: (e) => formatDate(e.effective_date) },
              { key: "endorsement_no", label: "Endorsement", type: "text", mono: true, get: (e) => e.endorsement_no || "" },
              { key: "endorsement_type", label: "Type", type: "text", get: (e) => e.endorsement_type || "" },
              { key: "debit", label: "Debit", type: "number", mono: true, get: (e) => Math.max(0, Number(e.premiumDiff) || 0), render: (e) => Number(e.premiumDiff) > 0 ? <span style={{ color: "#A8392F" }}>{formatINR(e.premiumDiff)}</span> : "—" },
              { key: "credit", label: "Credit", type: "number", mono: true, get: (e) => Math.max(0, -(Number(e.premiumDiff) || 0)), render: (e) => Number(e.premiumDiff) < 0 ? <span style={{ color: "#1B6E5C" }}>{formatINR(Math.abs(e.premiumDiff))}</span> : "—" },
              { key: "remarks", label: "Remarks", type: "text", wrap: true, get: (e) => e.remarks || "" },
            ]} />
        </div>
      )}

      {sub === "renewal" && (
        <SummaryRow items={[
          { label: "Expiry Date", value: formatDate(policy.period_to) },
          { label: "Days to Expiry", value: daysToExpiry === null ? "—" : (daysToExpiry < 0 ? `Expired ${Math.abs(daysToExpiry)}d ago` : `${daysToExpiry} days`), color: daysToExpiry !== null && daysToExpiry <= 30 ? "#A8392F" : "#2B2620" },
          { label: "Lives at Renewal", value: counts.active },
          { label: "Current Total SI", value: formatINR(totals.si), mono: true },
          { label: "Premium", value: formatINR(policy.premium), mono: true },
          ...(isGMC ? [{ label: "CD Balance to carry", value: formatINR(cd.balance), mono: true, color: "#1F5C99" }] : []),
        ]} />
      )}

      {/* ---- member modal ---- */}
      {memberModal && (
        <Modal title={memberModal.mode === "add" ? `Add ${isGMC ? "Life" : "Employee"}` : "Edit Record"} onClose={() => setMemberModal(null)} onSave={saveMember}
          onDelete={memberModal.mode === "edit" ? async () => { await onDeleteMember(memberModal.data.id); setMemberModal(null); } : null}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Field label="Employee ID" value={memberModal.data.member_code} onChange={(v) => setMemberModal((m) => ({ ...m, data: { ...m.data, member_code: v } }))} />
            <Field label="Name *" value={memberModal.data.member_name} onChange={(v) => setMemberModal((m) => ({ ...m, data: { ...m.data, member_name: v } }))} />
            {isGMC ? (<>
              <Field label="Relationship" value={memberModal.data.relationship} onChange={(v) => setMemberModal((m) => ({ ...m, data: { ...m.data, relationship: v } }))} options={RELATIONSHIPS} />
              <Field label="Date of Birth" type="date" value={memberModal.data.dob} onChange={(v) => setMemberModal((m) => ({ ...m, data: { ...m.data, dob: v } }))} />
              <Field label="Date of Joining" type="date" value={memberModal.data.doj} onChange={(v) => setMemberModal((m) => ({ ...m, data: { ...m.data, doj: v } }))} />
              <Field label="Date of Leaving" type="date" value={memberModal.data.dol} onChange={(v) => setMemberModal((m) => ({ ...m, data: { ...m.data, dol: v } }))} />
              <Field label="Department" value={memberModal.data.department} onChange={(v) => setMemberModal((m) => ({ ...m, data: { ...m.data, department: v } }))} />
              <Field label="Location" value={memberModal.data.location} onChange={(v) => setMemberModal((m) => ({ ...m, data: { ...m.data, location: v } }))} />
            </>) : (<>
              <Field label="Salary (₹)" type="number" value={memberModal.data.salary} onChange={(v) => setMemberModal((m) => ({ ...m, data: { ...m.data, salary: v } }))} />
              <Field label="Occupation" value={memberModal.data.occupation} onChange={(v) => setMemberModal((m) => ({ ...m, data: { ...m.data, occupation: v } }))} />
              <Field label="Category" value={memberModal.data.category} onChange={(v) => setMemberModal((m) => ({ ...m, data: { ...m.data, category: v } }))} placeholder="e.g. Cat I / Manual / Clerical" />
            </>)}
            <Field label="Sum Insured (₹)" type="number" value={memberModal.data.sumInsured} onChange={(v) => setMemberModal((m) => ({ ...m, data: { ...m.data, sumInsured: v } }))} />
            <Field label="Premium (₹)" type="number" value={memberModal.data.premium} onChange={(v) => setMemberModal((m) => ({ ...m, data: { ...m.data, premium: v } }))} />
            <Field label="Status" value={memberModal.data.status} onChange={(v) => setMemberModal((m) => ({ ...m, data: { ...m.data, status: v } }))} options={MEMBER_STATUSES} />
          </div>
        </Modal>
      )}

      {/* ---- endorsement modal ---- */}
      {endoModal && (
        <Modal title="New Endorsement" onClose={() => setEndoModal(null)} onSave={saveEndorsement} saveLabel="Record">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Field label="Endorsement No. *" value={endoModal.data.endorsement_no} onChange={(v) => setEndoModal((m) => ({ ...m, data: { ...m.data, endorsement_no: v } }))} />
            <Field label="Type *" value={endoModal.data.endorsement_type} onChange={(v) => setEndoModal((m) => ({ ...m, data: { ...m.data, endorsement_type: v } }))} options={isGMC ? GMC_ENDORSEMENT_TYPES : GPA_ENDORSEMENT_TYPES} />
            <Field label="Employees Added" type="number" value={endoModal.data.addedCount} onChange={(v) => setEndoModal((m) => ({ ...m, data: { ...m.data, addedCount: v } }))} />
            <Field label="Employees Deleted" type="number" value={endoModal.data.deletedCount} onChange={(v) => setEndoModal((m) => ({ ...m, data: { ...m.data, deletedCount: v } }))} />
            <Field label="Premium Difference (₹, +/−)" type="number" value={endoModal.data.premiumDiff} onChange={(v) => setEndoModal((m) => ({ ...m, data: { ...m.data, premiumDiff: v } }))} placeholder="+ debit, − refund" />
            <Field label="Effective Date" type="date" value={endoModal.data.effective_date} onChange={(v) => setEndoModal((m) => ({ ...m, data: { ...m.data, effective_date: v } }))} />
            <Field label="Status" value={endoModal.data.status} onChange={(v) => setEndoModal((m) => ({ ...m, data: { ...m.data, status: v } }))} options={ENDORSEMENT_STATUSES} />
          </div>
          <div>
            <label style={lbl}>Affected employees / remarks</label>
            <textarea value={endoModal.data.remarks || ""} onChange={(e) => setEndoModal((m) => ({ ...m, data: { ...m.data, remarks: e.target.value } }))} rows={3} style={{ ...inputStyle, resize: "vertical" }} placeholder="Names and movement type, supporting document references…" />
          </div>
          {isGMC && Number(endoModal.data.premiumDiff) !== 0 && !isNaN(Number(endoModal.data.premiumDiff)) && (
            <div style={{ backgroundColor: "#F6FBFF", border: "1px solid #C7D4DD", borderRadius: 7, padding: "10px 12px", fontSize: 12.5, color: "#1F5C99" }}>
              This will post automatically to the CD account as a <strong>{Number(endoModal.data.premiumDiff) > 0 ? "premium debit" : "refund credit"}</strong> of {formatINR(Math.abs(Number(endoModal.data.premiumDiff)))}.
            </div>
          )}
        </Modal>
      )}

      {/* ---- CD transaction modal ---- */}
      {cdModal && (
        <Modal title="CD Account Transaction" onClose={() => setCdModal(null)} onSave={async () => {
          const d = cdModal.data;
          if (!d.txn_type) return;
          await onCreateCd({ policy_id: policy.id, txn_date: d.txn_date || todayISO(), txn_type: d.txn_type,
            reference: d.reference || "", endorsementNo: d.endorsementNo || "",
            debit: Number(d.debit) || 0, credit: Number(d.credit) || 0, remarks: d.remarks || "" });
          setCdModal(null);
        }} saveLabel="Post">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Field label="Date" type="date" value={cdModal.data.txn_date} onChange={(v) => setCdModal((m) => ({ ...m, data: { ...m.data, txn_date: v } }))} />
            <Field label="Transaction Type" value={cdModal.data.txn_type} onChange={(v) => setCdModal((m) => ({ ...m, data: { ...m.data, txn_type: v } }))} options={["Deposit", "Premium Debit", "Refund Credit", "Adjustment"]} />
            <Field label="Reference" value={cdModal.data.reference} onChange={(v) => setCdModal((m) => ({ ...m, data: { ...m.data, reference: v } }))} />
            <Field label="Endorsement No." value={cdModal.data.endorsementNo} onChange={(v) => setCdModal((m) => ({ ...m, data: { ...m.data, endorsementNo: v } }))} />
            <Field label="Debit (₹)" type="number" value={cdModal.data.debit} onChange={(v) => setCdModal((m) => ({ ...m, data: { ...m.data, debit: v } }))} />
            <Field label="Credit (₹)" type="number" value={cdModal.data.credit} onChange={(v) => setCdModal((m) => ({ ...m, data: { ...m.data, credit: v } }))} />
          </div>
          <Field label="Remarks" value={cdModal.data.remarks} onChange={(v) => setCdModal((m) => ({ ...m, data: { ...m.data, remarks: v } }))} />
        </Modal>
      )}

      {/* ---- endorsement detail ---- */}
      {openEndo && (
        <Modal title={`Endorsement ${openEndo.endorsement_no}`} onClose={() => setOpenEndo(null)}
          onSave={async () => { await onUpdateEndo(openEndo.id, { ...openEndo, status: openEndo.status === "Completed" ? "Pending" : "Completed" }); setOpenEndo(null); }}
          saveLabel={openEndo.status === "Completed" ? "Mark Pending" : "Mark Completed"}>
          <SummaryRow items={[
            { label: "Type", value: openEndo.endorsement_type },
            { label: "Effective Date", value: formatDate(openEndo.effective_date) },
            { label: "Employees Added", value: openEndo.addedCount || 0, color: "#1B6E5C" },
            { label: "Employees Deleted", value: openEndo.deletedCount || 0, color: "#A8392F" },
            { label: "Premium Difference", value: formatINR(openEndo.premiumDiff), mono: true, color: Number(openEndo.premiumDiff) > 0 ? "#A8392F" : "#1B6E5C" },
            { label: "Status", value: openEndo.status || "Pending" },
          ]} />
          <div style={{ fontSize: 12.5, color: "#6B6356" }}>
            <strong style={{ display: "block", marginBottom: 4, color: "#152A47" }}>Affected employees / remarks</strong>
            {openEndo.remarks || "No detail recorded."}
          </div>
        </Modal>
      )}
    </div>
  );
}

function MiniCard({ label, value, color }) {
  return (
    <div style={{ backgroundColor: "#FFFEFA", border: "1px solid #EAE3D3", borderRadius: 9, padding: "13px 15px" }}>
      <div style={{ fontSize: 10.5, color: "#8a8273", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700, color: color || "#2B2620", fontFamily: "'Source Serif 4', Georgia, serif" }}>{value}</div>
    </div>
  );
}

// ============================================================
//  PROPERTY — location-wise sum insured
// ============================================================
function PropertyModule({ selected, setSelected, policies, locations, onCreateLocation, onUpdateLocation, onDeleteLocation }) {
  const list = policies.filter((p) => { const t = (p.policy_type || "").toUpperCase(); return t.includes("FIRE") || t.includes("SFSP") || t.includes("PROPERTY") || t.includes("BURGLARY"); })
    .sort((a, b) => (a.period_to || "9999").localeCompare(b.period_to || "9999"));

  if (selected) {
    const policy = policies.find((p) => p.id === selected);
    if (!policy) { setSelected(null); return null; }
    return <PropertyDetail policy={policy} locations={locationsFor(locations, policy.id)} onBack={() => setSelected(null)}
      onCreateLocation={onCreateLocation} onUpdateLocation={onUpdateLocation} onDeleteLocation={onDeleteLocation} />;
  }

  return (
    <DataTable rows={list} onRowClick={(p) => setSelected(p.id)} exportName="Property-Policies" minWidth={1050} searchPlaceholder="Search property policies…"
      emptyMessage='No property policies yet. Add one in the Policies tab with "Fire" or "Property" in the policy type.'
      columns={[
        { key: "insurerName", label: "Insurance Company", type: "text", get: (p) => p.insurerName || "" },
        { key: "insured_name", label: "Client", type: "text", bold: true, get: (p) => p.insured_name || "" },
        { key: "policy_no", label: "Policy Number", type: "text", mono: true, get: (p) => p.policy_no || "" },
        { key: "period_from", label: "Start Date", type: "date", get: (p) => p.period_from || "", render: (p) => formatDate(p.period_from) },
        { key: "period_to", label: "Expiry Date", type: "date", get: (p) => p.period_to || "", render: (p) => <EndDateCell date={p.period_to} status={p.status} /> },
        { key: "locations", label: "Locations", type: "number", get: (p) => locationsFor(locations, p.id).length },
        { key: "totalSI", label: "Total Sum Insured", type: "number", mono: true, bold: true, get: (p) => propertyRollup(locationsFor(locations, p.id)).total, render: (p) => formatINR(propertyRollup(locationsFor(locations, p.id)).total) },
        { key: "status", label: "Status", type: "text", get: (p) => p.status || "", render: (p) => <Pill label={p.status || "Draft"} color={STATUS_COLORS[p.status || "Draft"]} /> },
      ]} />
  );
}

function PropertyDetail({ policy, locations, onBack, onCreateLocation, onUpdateLocation, onDeleteLocation }) {
  const [sub, setSub] = useState("summary");
  const [locModal, setLocModal] = useState(null);
  const roll = propertyRollup(locations);

  const save = async () => {
    const d = locModal.data;
    if (!d.location_name) return;
    if (locModal.mode === "add") await onCreateLocation({ ...d, policy_id: policy.id });
    else await onUpdateLocation(d.id, d);
    setLocModal(null);
  };

  return (
    <div>
      <button onClick={onBack} style={{ background: "none", border: "none", color: "#1F5C99", cursor: "pointer", fontSize: 13, fontWeight: 600, marginBottom: 12 }}>← Back to property policies</button>
      <h2 style={{ margin: "0 0 4px", fontSize: 20, fontFamily: "'Source Serif 4', Georgia, serif", color: "#152A47" }}>{policy.insured_name}</h2>
      <div style={{ fontSize: 12.5, color: "#8a8273", fontFamily: "'IBM Plex Mono', monospace", marginBottom: 16 }}>
        {policy.policy_no} · {policy.insurerName} · {formatDate(policy.period_from)} → {formatDate(policy.period_to)}
      </div>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 18 }}>
        <StatCard icon={Building2} label="Total Locations" value={roll.count} accent="#1F5C99" />
        <StatCard icon={IndianRupee} label="Total SI" value={formatINR(roll.total)} accent="#6B5B95" />
        <StatCard icon={FileText} label="Building SI" value={formatINR(roll.byHead.building)} accent="#3D6B8C" />
        <StatCard icon={Activity} label="Machinery SI" value={formatINR(roll.byHead.plantMachinery)} accent="#1B6E5C" />
        <StatCard icon={Anchor} label="Stock SI" value={formatINR(roll.byHead.stock)} accent="#B8722A" />
      </div>

      <SubTabs tabs={[{ k: "summary", label: "Policy Summary" }, { k: "locations", label: "Location-wise Assets" }, { k: "renewal", label: "Renewal" }]} active={sub} onChange={setSub} />

      {sub === "summary" && (
        <div>
          <SummaryRow items={[
            { label: "Insurance Company", value: policy.insurerName || "—" },
            { label: "Policy Number", value: policy.policy_no || "—", mono: true },
            { label: "Start Date", value: formatDate(policy.period_from) },
            { label: "Expiry Date", value: formatDate(policy.period_to) },
            { label: "Premium", value: formatINR(policy.premium), mono: true },
            { label: "Total Sum Insured", value: formatINR(roll.total), mono: true, color: "#1F5C99" },
          ]} />
          <h4 style={{ margin: "0 0 10px", fontSize: 14, fontFamily: "'Source Serif 4', Georgia, serif", color: "#152A47" }}>Sum insured by asset head</h4>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 12 }}>
            {ASSET_HEADS.map((h) => <MiniCard key={h.key} label={h.label} value={formatINR(roll.byHead[h.key])} color={roll.byHead[h.key] > 0 ? "#152A47" : "#b8b0a0"} />)}
          </div>
        </div>
      )}

      {sub === "locations" && (
        <div>
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 10 }}>
            <button onClick={() => setLocModal({ mode: "add", data: {} })} style={smallBtn}><Plus size={13} /> Add Location</button>
          </div>
          <DataTable rows={locations} onRowClick={(l) => setLocModal({ mode: "edit", data: { ...l } })} exportName="Property-Locations" minWidth={1250} searchPlaceholder="Search locations…"
            emptyMessage="No locations yet. Add each insured location and its asset-wise sum insured."
            columns={[
              { key: "location_name", label: "Location", type: "text", bold: true, get: (l) => l.location_name || "" },
              { key: "occupancy", label: "Occupancy", type: "text", get: (l) => l.occupancy || "" },
              ...ASSET_HEADS.map((h) => ({ key: h.key, label: h.label, type: "number", mono: true, get: (l) => Number(l[h.key]) || 0, render: (l) => l[h.key] ? formatINR(l[h.key]) : "—" })),
              { key: "total", label: "Total SI", type: "number", mono: true, bold: true, get: (l) => locationTotal(l), render: (l) => <span style={{ color: "#1F5C99" }}>{formatINR(locationTotal(l))}</span> },
            ]} />
        </div>
      )}

      {sub === "renewal" && (
        <SummaryRow items={[
          { label: "Expiry Date", value: formatDate(policy.period_to) },
          { label: "Days to Expiry", value: daysUntil(policy.period_to) === null ? "—" : `${daysUntil(policy.period_to)} days`, color: daysUntil(policy.period_to) <= 30 ? "#A8392F" : "#2B2620" },
          { label: "Locations to re-declare", value: roll.count },
          { label: "Total SI at renewal", value: formatINR(roll.total), mono: true },
        ]} />
      )}

      {locModal && (
        <Modal title={locModal.mode === "add" ? "Add Location" : "Edit Location"} onClose={() => setLocModal(null)} onSave={save}
          onDelete={locModal.mode === "edit" ? async () => { await onDeleteLocation(locModal.data.id); setLocModal(null); } : null}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Field label="Location Name *" value={locModal.data.location_name} onChange={(v) => setLocModal((m) => ({ ...m, data: { ...m.data, location_name: v } }))} />
            <Field label="Occupancy" value={locModal.data.occupancy} onChange={(v) => setLocModal((m) => ({ ...m, data: { ...m.data, occupancy: v } }))} placeholder="e.g. Ferro alloy manufacturing" />
          </div>
          <Field label="Address" value={locModal.data.address} onChange={(v) => setLocModal((m) => ({ ...m, data: { ...m.data, address: v } }))} />
          <div style={{ fontSize: 11, fontWeight: 700, color: "#1F5C99", textTransform: "uppercase", margin: "6px 0 8px" }}>Sum insured by asset head</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            {ASSET_HEADS.map((h) => (
              <Field key={h.key} label={`${h.label} (₹)`} type="number" value={locModal.data[h.key]} onChange={(v) => setLocModal((m) => ({ ...m, data: { ...m.data, [h.key]: v } }))} />
            ))}
          </div>
          <div style={{ backgroundColor: "#F6FBFF", border: "1px solid #C7D4DD", borderRadius: 7, padding: "10px 12px", fontSize: 13, color: "#1F5C99", fontWeight: 600 }}>
            Location total: {formatINR(locationTotal(locModal.data))}
          </div>
        </Modal>
      )}
    </div>
  );
}

// ============================================================
//  PROJECT — instalments, extensions, timeline
// ============================================================
function ProjectModule({ selected, setSelected, policies, instalments, extensions,
                         onCreateInstalment, onUpdateInstalment, onDeleteInstalment, onCreateExtension }) {
  const list = policies.filter((p) => { const t = (p.policy_type || "").toUpperCase(); return t.includes("PROJECT") || t.includes("CAR") || t.includes("EAR") || t.includes("ERECTION") || t.includes("CONTRACT"); })
    .sort((a, b) => (a.period_to || "9999").localeCompare(b.period_to || "9999"));

  if (selected) {
    const policy = policies.find((p) => p.id === selected);
    if (!policy) { setSelected(null); return null; }
    return <ProjectDetail policy={policy} instalments={instalments} extensions={(extensions || []).filter((e) => e.policy_id === policy.id)}
      onBack={() => setSelected(null)} onCreateInstalment={onCreateInstalment} onUpdateInstalment={onUpdateInstalment}
      onDeleteInstalment={onDeleteInstalment} onCreateExtension={onCreateExtension} />;
  }

  return (
    <DataTable rows={list} onRowClick={(p) => setSelected(p.id)} exportName="Project-Policies" minWidth={1200} searchPlaceholder="Search project policies…"
      emptyMessage='No project policies yet. Add one in the Policies tab with "Project", "CAR" or "EAR" in the policy type.'
      columns={[
        { key: "insurerName", label: "Insurance Company", type: "text", get: (p) => p.insurerName || "" },
        { key: "insured_name", label: "Client", type: "text", bold: true, get: (p) => p.insured_name || "" },
        { key: "projectName", label: "Project Name", type: "text", get: (p) => p.projectName || "" },
        { key: "policy_no", label: "Policy Number", type: "text", mono: true, get: (p) => p.policy_no || "" },
        { key: "period_from", label: "Start", type: "date", get: (p) => p.period_from || "", render: (p) => formatDate(p.period_from) },
        { key: "period_to", label: "Expiry", type: "date", get: (p) => p.period_to || "", render: (p) => <EndDateCell date={p.period_to} status={p.status} /> },
        { key: "contractValue", label: "Contract Value", type: "number", mono: true, get: (p) => Number(p.contractValue) || 0, render: (p) => p.contractValue ? formatINR(p.contractValue) : "—" },
        { key: "premium", label: "Premium", type: "number", mono: true, get: (p) => Number(p.premium) || 0, render: (p) => formatINR(p.premium) },
        { key: "outstanding", label: "Outstanding", type: "number", mono: true, get: (p) => instalmentRollup(instalments, p.id).outstanding, render: (p) => { const r = instalmentRollup(instalments, p.id); return <span style={{ color: r.overdue > 0 ? "#A8392F" : "#6B6356", fontWeight: r.overdue > 0 ? 700 : 400 }}>{formatINR(r.outstanding)}</span>; } },
        { key: "alerts", label: "Alerts", type: "custom", render: (p) => { const r = instalmentRollup(instalments, p.id); return r.overdue > 0 ? <Pill label={`${r.overdue} overdue`} color="#A8392F" /> : r.dueToday > 0 ? <Pill label="Due today" color="#B8722A" /> : <span style={{ color: "#8a8273" }}>—</span>; } },
      ]} />
  );
}

function ProjectDetail({ policy, instalments, extensions, onBack, onCreateInstalment, onUpdateInstalment, onDeleteInstalment, onCreateExtension }) {
  const [sub, setSub] = useState("summary");
  const [instModal, setInstModal] = useState(null);
  const [extModal, setExtModal] = useState(null);
  const roll = instalmentRollup(instalments, policy.id);

  const saveInst = async () => {
    const d = instModal.data;
    if (!d.due_date) return;
    if (instModal.mode === "add") await onCreateInstalment({ ...d, policy_id: policy.id, instalment_no: Number(d.instalment_no) || roll.rows.length + 1 });
    else await onUpdateInstalment(d.id, d);
    setInstModal(null);
  };

  // Chronological timeline across instalments, extensions and policy milestones.
  const timeline = [
    { date: policy.period_from, kind: "Policy", text: "Policy inception" },
    { date: policy.projectStart, kind: "Project", text: "Project start" },
    { date: policy.expectedCompletion, kind: "Project", text: "Expected completion" },
    { date: policy.actualCompletion, kind: "Project", text: "Actual completion" },
    ...roll.rows.map((i) => ({ date: i.due_date, kind: "Instalment", text: `Instalment #${i.instalment_no} — ${formatINR(Number(i.amount) + Number(i.gst || 0))} (${i.computedStatus})`, status: i.computedStatus })),
    ...extensions.map((e) => ({ date: e.new_expiry, kind: "Extension", text: `Extension ${e.extension_no || ""} — expiry to ${formatDate(e.new_expiry)}` })),
    { date: policy.period_to, kind: "Policy", text: "Policy expiry" },
  ].filter((t) => t.date).sort((a, b) => a.date.localeCompare(b.date));

  return (
    <div>
      <button onClick={onBack} style={{ background: "none", border: "none", color: "#1F5C99", cursor: "pointer", fontSize: 13, fontWeight: 600, marginBottom: 12 }}>← Back to project policies</button>
      <h2 style={{ margin: "0 0 4px", fontSize: 20, fontFamily: "'Source Serif 4', Georgia, serif", color: "#152A47" }}>{policy.projectName || policy.insured_name}</h2>
      <div style={{ fontSize: 12.5, color: "#8a8273", fontFamily: "'IBM Plex Mono', monospace", marginBottom: 16 }}>
        {policy.policy_no} · {policy.insurerName} · {formatDate(policy.period_from)} → {formatDate(policy.period_to)}
      </div>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 18 }}>
        <StatCard icon={Calendar} label="Upcoming Instalments" value={roll.upcoming} accent="#1F5C99" />
        <StatCard icon={AlertCircle} label="Overdue Instalments" value={roll.overdue} sub={roll.dueToday > 0 ? `${roll.dueToday} due today` : ""} accent={roll.overdue > 0 ? "#A8392F" : "#8a8273"} />
        <StatCard icon={IndianRupee} label="Outstanding" value={formatINR(roll.outstanding)} sub={`of ${formatINR(roll.total)}`} accent="#B8722A" />
        <StatCard icon={RefreshCw} label="Next Policy Expiry" value={formatDate(policy.period_to)} sub={daysUntil(policy.period_to) !== null ? `${daysUntil(policy.period_to)} days` : ""} accent="#6B5B95" />
      </div>

      <SubTabs tabs={[
        { k: "summary", label: "Project Summary" },
        { k: "instalments", label: "Premium Instalments", badge: roll.overdue },
        { k: "extensions", label: "Extensions" },
        { k: "timeline", label: "Timeline" },
      ]} active={sub} onChange={setSub} />

      {sub === "summary" && (
        <SummaryRow items={[
          { label: "Insurance Company", value: policy.insurerName || "—" },
          { label: "Project Name", value: policy.projectName || "—" },
          { label: "Contract Value", value: formatINR(policy.contractValue), mono: true },
          { label: "Premium", value: formatINR(policy.premium), mono: true },
          { label: "Project Start", value: formatDate(policy.projectStart) },
          { label: "Expected Completion", value: formatDate(policy.expectedCompletion) },
          { label: "Actual Completion", value: policy.actualCompletion ? formatDate(policy.actualCompletion) : "—" },
          { label: "Maintenance Period", value: policy.maintenancePeriod || "—" },
          { label: "Defects Liability Period", value: policy.defectsLiability || "—" },
          { label: "Extensions Recorded", value: extensions.length },
        ]} />
      )}

      {sub === "instalments" && (
        <div>
          <SummaryRow items={[
            { label: "Total Payable", value: formatINR(roll.total), mono: true },
            { label: "Paid", value: formatINR(roll.paid), mono: true, color: "#1B6E5C" },
            { label: "Outstanding", value: formatINR(roll.outstanding), mono: true, color: "#A8392F" },
            { label: "Next Due", value: roll.nextDue ? `#${roll.nextDue.instalment_no} · ${formatDate(roll.nextDue.due_date)}` : "All paid" },
          ]} />
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 10 }}>
            <button onClick={() => setInstModal({ mode: "add", data: { instalment_no: roll.rows.length + 1, due_date: todayISO() } })} style={smallBtn}><Plus size={13} /> Add Instalment</button>
          </div>
          <DataTable rows={roll.rows} onRowClick={(i) => setInstModal({ mode: "edit", data: { ...i } })} exportName="Project-Instalments" minWidth={1050} searchPlaceholder="Search instalments…"
            emptyMessage="No instalments scheduled."
            columns={[
              { key: "instalment_no", label: "Inst. No.", type: "number", bold: true, get: (i) => Number(i.instalment_no) || 0 },
              { key: "due_date", label: "Due Date", type: "date", get: (i) => i.due_date || "", render: (i) => formatDate(i.due_date) },
              { key: "amount", label: "Amount", type: "number", mono: true, get: (i) => Number(i.amount) || 0, render: (i) => formatINR(i.amount) },
              { key: "gst", label: "GST", type: "number", mono: true, get: (i) => Number(i.gst) || 0, render: (i) => formatINR(i.gst) },
              { key: "paidAmount", label: "Paid", type: "number", mono: true, get: (i) => Number(i.paidAmount) || 0, render: (i) => formatINR(i.paidAmount) },
              { key: "outstanding", label: "Outstanding", type: "number", mono: true, get: (i) => i.outstanding, render: (i) => <span style={{ color: i.outstanding > 0 ? "#A8392F" : "#1B6E5C", fontWeight: 600 }}>{formatINR(i.outstanding)}</span> },
              { key: "paymentDate", label: "Payment Date", type: "date", get: (i) => i.paymentDate || "", render: (i) => i.paymentDate ? formatDate(i.paymentDate) : "—" },
              { key: "computedStatus", label: "Status", type: "text", get: (i) => i.computedStatus, render: (i) => <Pill label={i.computedStatus} color={INSTALMENT_STATUS_COLORS[i.computedStatus]} /> },
              { key: "remarks", label: "Remarks", type: "text", wrap: true, get: (i) => i.remarks || "" },
            ]} />
        </div>
      )}

      {sub === "extensions" && (
        <div>
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 10 }}>
            <button onClick={() => setExtModal({ data: { new_expiry: "", extension_no: `EXT-${String(extensions.length + 1).padStart(2, "0")}` } })} style={smallBtn}><Plus size={13} /> Add Extension</button>
          </div>
          <DataTable rows={extensions} exportName="Project-Extensions" minWidth={800} searchPlaceholder="Search extensions…"
            emptyMessage="No extensions recorded."
            columns={[
              { key: "extension_no", label: "Extension No.", type: "text", mono: true, bold: true, get: (e) => e.extension_no || "" },
              { key: "new_expiry", label: "Extended To", type: "date", get: (e) => e.new_expiry || "", render: (e) => formatDate(e.new_expiry) },
              { key: "additionalPremium", label: "Additional Premium", type: "number", mono: true, get: (e) => Number(e.additionalPremium) || 0, render: (e) => formatINR(e.additionalPremium) },
              { key: "reason", label: "Reason", type: "text", wrap: true, get: (e) => e.reason || "" },
            ]} />
        </div>
      )}

      {sub === "timeline" && (
        <div style={{ backgroundColor: "#FFFEFA", border: "1px solid #EAE3D3", borderRadius: 10, padding: 18 }}>
          {timeline.length === 0 ? <p style={{ fontSize: 13, color: "#8a8273", margin: 0 }}>Nothing scheduled yet.</p> : timeline.map((t, i) => {
            const past = t.date < todayISO();
            const color = { Policy: "#6B5B95", Project: "#1F5C99", Instalment: t.status === "Overdue" ? "#A8392F" : t.status === "Paid" ? "#1B6E5C" : "#B8722A", Extension: "#C2571E" }[t.kind];
            return (
              <div key={i} style={{ display: "flex", gap: 14, alignItems: "flex-start", paddingBottom: i === timeline.length - 1 ? 0 : 16, position: "relative" }}>
                <div style={{ width: 88, flexShrink: 0, fontSize: 11.5, color: past ? "#a89f8c" : "#152A47", fontWeight: 600, textAlign: "right", paddingTop: 1 }}>{formatDate(t.date)}</div>
                <div style={{ position: "relative", flexShrink: 0 }}>
                  <div style={{ width: 11, height: 11, borderRadius: "50%", backgroundColor: past ? "#D8CFB8" : color, marginTop: 3 }} />
                  {i < timeline.length - 1 && <div style={{ position: "absolute", left: 5, top: 16, width: 1, height: "calc(100% + 6px)", backgroundColor: "#E5DCC6" }} />}
                </div>
                <div style={{ paddingBottom: 2 }}>
                  <Pill label={t.kind} color={color} />
                  <div style={{ fontSize: 13, color: past ? "#8a8273" : "#2B2620", marginTop: 3 }}>{t.text}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {instModal && (
        <Modal title={instModal.mode === "add" ? "Add Instalment" : "Edit Instalment"} onClose={() => setInstModal(null)} onSave={saveInst}
          onDelete={instModal.mode === "edit" ? async () => { await onDeleteInstalment(instModal.data.id); setInstModal(null); } : null}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Field label="Instalment No." type="number" value={instModal.data.instalment_no} onChange={(v) => setInstModal((m) => ({ ...m, data: { ...m.data, instalment_no: v } }))} />
            <Field label="Due Date *" type="date" value={instModal.data.due_date} onChange={(v) => setInstModal((m) => ({ ...m, data: { ...m.data, due_date: v } }))} />
            <Field label="Amount (₹)" type="number" value={instModal.data.amount} onChange={(v) => setInstModal((m) => ({ ...m, data: { ...m.data, amount: v } }))} />
            <Field label="GST (₹)" type="number" value={instModal.data.gst} onChange={(v) => setInstModal((m) => ({ ...m, data: { ...m.data, gst: v } }))} />
            <Field label="Paid Amount (₹)" type="number" value={instModal.data.paidAmount} onChange={(v) => setInstModal((m) => ({ ...m, data: { ...m.data, paidAmount: v } }))} />
            <Field label="Payment Date" type="date" value={instModal.data.paymentDate} onChange={(v) => setInstModal((m) => ({ ...m, data: { ...m.data, paymentDate: v } }))} />
          </div>
          <Field label="Remarks" value={instModal.data.remarks} onChange={(v) => setInstModal((m) => ({ ...m, data: { ...m.data, remarks: v } }))} />
          <div style={{ backgroundColor: "#F6FBFF", border: "1px solid #C7D4DD", borderRadius: 7, padding: "10px 12px", fontSize: 12.5, color: "#1F5C99" }}>
            Outstanding: <strong>{formatINR(instalmentOutstanding(instModal.data))}</strong> · Status: <strong>{instalmentStatus(instModal.data)}</strong>
            <div style={{ color: "#6B6356", marginTop: 3 }}>Status is worked out from the amounts and due date, so it always reflects reality.</div>
          </div>
        </Modal>
      )}

      {extModal && (
        <Modal title="Add Extension" onClose={() => setExtModal(null)} onSave={async () => {
          const d = extModal.data;
          if (!d.new_expiry) return;
          await onCreateExtension({ ...d, policy_id: policy.id });
          setExtModal(null);
        }} saveLabel="Record">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Field label="Extension No." value={extModal.data.extension_no} onChange={(v) => setExtModal((m) => ({ ...m, data: { ...m.data, extension_no: v } }))} />
            <Field label="Extended To *" type="date" value={extModal.data.new_expiry} onChange={(v) => setExtModal((m) => ({ ...m, data: { ...m.data, new_expiry: v } }))} />
            <Field label="Additional Premium (₹)" type="number" value={extModal.data.additionalPremium} onChange={(v) => setExtModal((m) => ({ ...m, data: { ...m.data, additionalPremium: v } }))} />
          </div>
          <Field label="Reason" value={extModal.data.reason} onChange={(v) => setExtModal((m) => ({ ...m, data: { ...m.data, reason: v } }))} placeholder="e.g. Civil work delayed by monsoon" />
        </Modal>
      )}
    </div>
  );
}
