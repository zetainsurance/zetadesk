import { supabase } from "./supabaseClient";

// ------------------------------------------------------------
//  Per-record data layer.
//  Every table is a real list of rows. We read a whole table into
//  memory for display, but every CREATE / UPDATE / DELETE touches
//  exactly ONE row. There is no "save the whole book" operation,
//  so the catastrophic-overwrite failure mode cannot occur.
// ------------------------------------------------------------

// Split a flat UI object into the table's real columns + a jsonb `data` bag.
// Anything not a real column rides along in `data` so the schema stays simple.
function splitRow(obj, columns) {
  const row = {};
  const data = {};
  Object.entries(obj || {}).forEach(([k, v]) => {
    if (k === "id" || k === "created_at" || k === "updated_at") return;
    if (columns.includes(k)) row[k] = v === "" ? null : v;
    else data[k] = v;
  });
  row.data = data;
  return row;
}

// Flatten a DB row back into the single object the UI works with.
function flattenRow(row) {
  if (!row) return null;
  const { data, ...rest } = row;
  return { ...rest, ...(data || {}) };
}

// Column whitelist per table (everything else goes into jsonb `data`).
const COLUMNS = {
  clients: ["name", "type", "contact_person", "phone", "email"],
  insurers: ["insurer", "branch"],
  vendors: ["vendor_name"],
  products: ["name", "vertical", "category"],
  opportunities: ["client_id", "title", "stage"],
  policies: ["source_opportunity_id", "insured_name", "policy_no", "policy_type", "status", "period_from", "period_to"],
  marine_declarations: ["policy_id", "pool_id", "period_start", "period_end", "seq", "transaction_type"],
  marine_pools: ["policy_id", "label", "si_limit", "rate_pct"],
  marine_endorsements: ["policy_id", "pool_id", "endorsement_type", "effective_date"],
  members: ["policy_id", "member_code", "member_name", "status"],
  benefit_endorsements: ["policy_id", "endorsement_no", "endorsement_type", "effective_date", "status"],
  cd_ledger: ["policy_id", "txn_date", "txn_type"],
  property_locations: ["policy_id", "location_name"],
  project_instalments: ["policy_id", "instalment_no", "due_date", "status"],
  project_extensions: ["policy_id", "extension_no", "new_expiry"],
  claims: ["client_id", "claim_no", "status"],
  team_members: ["name"],
  calls: ["rm_name", "company_name", "call_date", "status"],
  visits: ["rm_name", "company_name", "visit_date", "status"],
};

export async function listAll(table) {
  const { data, error } = await supabase.from(table).select("*").order("created_at", { ascending: true });
  if (error) return { ok: false, error: error.message, rows: [] };
  return { ok: true, error: null, rows: (data || []).map(flattenRow) };
}

export async function insertRow(table, obj) {
  const row = splitRow(obj, COLUMNS[table] || []);
  const { data, error } = await supabase.from(table).insert(row).select("*").single();
  if (error) return { ok: false, error: error.message, row: null };
  return { ok: true, error: null, row: flattenRow(data) };
}

export async function updateRow(table, id, obj) {
  const row = splitRow(obj, COLUMNS[table] || []);
  const { data, error } = await supabase.from(table).update(row).eq("id", id).select("*").single();
  if (error) return { ok: false, error: error.message, row: null };
  return { ok: true, error: null, row: flattenRow(data) };
}

export async function deleteRow(table, id) {
  const { error } = await supabase.from(table).delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  return { ok: true, error: null };
}

// Bulk insert (used by Excel imports). Each element becomes its own row.
export async function insertMany(table, objs) {
  const rows = (objs || []).map((o) => splitRow(o, COLUMNS[table] || []));
  if (rows.length === 0) return { ok: true, error: null, rows: [] };
  const { data, error } = await supabase.from(table).insert(rows).select("*");
  if (error) return { ok: false, error: error.message, rows: [] };
  return { ok: true, error: null, rows: (data || []).map(flattenRow) };
}
