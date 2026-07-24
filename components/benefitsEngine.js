// ============================================================
//  Benefits / Property / Project engine
//  Pure functions, no React. Kept separate so the money-and-lives
//  arithmetic can be reasoned about and tested on its own.
// ============================================================

export const MEMBER_STATUSES = ["Active", "Deleted", "Pending Addition", "Pending Deletion", "Suspended"];

export const GMC_ENDORSEMENT_TYPES = [
  "Addition", "Deletion", "Correction", "Marriage", "Child Addition",
  "Parent Addition", "SI Revision", "Department Change", "Location Change", "Cancellation",
];

export const GPA_ENDORSEMENT_TYPES = [
  "Addition", "Deletion", "Salary Revision", "Occupation Change", "SI Revision", "Correction",
];

export const RELATIONSHIPS = ["Self", "Spouse", "Son", "Daughter", "Father", "Mother", "Father-in-law", "Mother-in-law"];

export const ENDORSEMENT_STATUSES = ["Pending", "Completed", "Rejected"];

export const ASSET_HEADS = [
  { key: "building", label: "Building" },
  { key: "plantMachinery", label: "Plant & Machinery" },
  { key: "stock", label: "Stock" },
  { key: "furniture", label: "Furniture & Fixtures" },
  { key: "electrical", label: "Electrical Installation" },
  { key: "computers", label: "Computers" },
  { key: "other", label: "Other Assets" },
];

const num = (v) => Number(v) || 0;

// ---------- MEMBERS ----------

export function membersFor(members, policyId) {
  return (members || []).filter((m) => m.policy_id === policyId);
}

/**
 * Active Lives = Opening + Added − Deleted.
 * "Pending Addition" is not yet on risk; "Pending Deletion" still is,
 * so it counts as active until the endorsement completes.
 */
export function lifeCounts(members) {
  const list = members || [];
  const count = (s) => list.filter((m) => (m.status || "Active") === s).length;
  const active = count("Active") + count("Pending Deletion");
  return {
    total: list.length,
    active,
    deleted: count("Deleted"),
    pendingAddition: count("Pending Addition"),
    pendingDeletion: count("Pending Deletion"),
    suspended: count("Suspended"),
  };
}

/** Sum insured and premium across the lives currently on risk. */
export function memberTotals(members) {
  return (members || [])
    .filter((m) => (m.status || "Active") === "Active" || m.status === "Pending Deletion")
    .reduce((acc, m) => {
      acc.si += num(m.sumInsured);
      acc.premium += num(m.premium);
      return acc;
    }, { si: 0, premium: 0 });
}

// ---------- ENDORSEMENTS ----------

export function endorsementsFor(endorsements, policyId) {
  return (endorsements || [])
    .filter((e) => e.policy_id === policyId)
    .sort((a, b) => (b.effective_date || "").localeCompare(a.effective_date || ""));
}

/** Movement counts and net premium across a policy's endorsements. */
export function endorsementRollup(endorsements) {
  return (endorsements || []).reduce((acc, e) => {
    acc.added += num(e.addedCount);
    acc.deleted += num(e.deletedCount);
    acc.premiumDiff += num(e.premiumDiff);
    if ((e.status || "Pending") === "Pending") acc.pending++;
    if (e.status === "Completed") acc.completed++;
    return acc;
  }, { added: 0, deleted: 0, premiumDiff: 0, pending: 0, completed: 0 });
}

// ---------- CD ACCOUNT ----------

/**
 * Running balance over the CD ledger, oldest first.
 * Deposits and refund credits add; premium debits subtract.
 */
export function cdLedger(entries, policyId) {
  const rows = (entries || [])
    .filter((e) => e.policy_id === policyId)
    .sort((a, b) => (a.txn_date || "").localeCompare(b.txn_date || ""));
  let running = 0;
  return rows.map((r) => {
    running += num(r.credit) - num(r.debit);
    return { ...r, runningBalance: running };
  });
}

export function cdSummary(entries, policyId) {
  const rows = cdLedger(entries, policyId);
  const sum = (pred, field) => rows.filter(pred).reduce((s, r) => s + num(r[field]), 0);
  const deposits = sum((r) => r.txn_type === "Deposit", "credit");
  const refunds = sum((r) => r.txn_type === "Refund Credit", "credit");
  const debits = sum(() => true, "debit");
  const opening = rows.length > 0 ? num(rows[0].openingBalance) : 0;
  return {
    opening,
    deposits,
    refunds,
    debits,
    balance: rows.length > 0 ? rows[rows.length - 1].runningBalance : 0,
    rows,
  };
}

/** A CD entry generated automatically from an endorsement's premium difference. */
export function cdEntryFromEndorsement(endo, policyId) {
  const diff = num(endo.premiumDiff);
  if (diff === 0) return null;
  return {
    policy_id: policyId,
    txn_date: endo.effective_date,
    txn_type: diff > 0 ? "Premium Debit" : "Refund Credit",
    reference: endo.endorsement_no || "",
    endorsementNo: endo.endorsement_no || "",
    debit: diff > 0 ? diff : 0,
    credit: diff < 0 ? Math.abs(diff) : 0,
    remarks: `${endo.endorsement_type || "Endorsement"} — ${num(endo.addedCount)} added, ${num(endo.deletedCount)} deleted`,
  };
}

// ---------- PROPERTY ----------

export function locationsFor(locations, policyId) {
  return (locations || []).filter((l) => l.policy_id === policyId);
}

export function locationTotal(loc) {
  return ASSET_HEADS.reduce((s, h) => s + num(loc[h.key]), 0);
}

/** Policy-level rollup: total SI plus a breakdown by asset head. */
export function propertyRollup(locations) {
  const byHead = {};
  ASSET_HEADS.forEach((h) => { byHead[h.key] = 0; });
  let total = 0;
  (locations || []).forEach((loc) => {
    ASSET_HEADS.forEach((h) => { byHead[h.key] += num(loc[h.key]); });
    total += locationTotal(loc);
  });
  return { total, byHead, count: (locations || []).length };
}

// ---------- PROJECT INSTALMENTS ----------

/**
 * Instalment status derived from amounts and the due date, so it can never
 * drift out of step with reality the way a manually-set status would.
 */
export function instalmentStatus(inst, todayStr) {
  const today = todayStr || new Date().toISOString().slice(0, 10);
  const amount = num(inst.amount) + num(inst.gst);
  const paid = num(inst.paidAmount);
  if (paid >= amount && amount > 0) return "Paid";
  if (paid > 0) return "Partially Paid";
  if (!inst.due_date) return "Upcoming";
  if (inst.due_date === today) return "Due Today";
  if (inst.due_date < today) return "Overdue";
  return "Upcoming";
}

export function instalmentOutstanding(inst) {
  return Math.max(0, num(inst.amount) + num(inst.gst) - num(inst.paidAmount));
}

export function instalmentsFor(instalments, policyId, todayStr) {
  return (instalments || [])
    .filter((i) => i.policy_id === policyId)
    .sort((a, b) => (a.due_date || "").localeCompare(b.due_date || ""))
    .map((i) => ({ ...i, computedStatus: instalmentStatus(i, todayStr), outstanding: instalmentOutstanding(i) }));
}

export function instalmentRollup(instalments, policyId, todayStr) {
  const rows = instalmentsFor(instalments, policyId, todayStr);
  const by = (s) => rows.filter((r) => r.computedStatus === s);
  return {
    rows,
    total: rows.reduce((s, r) => s + num(r.amount) + num(r.gst), 0),
    paid: rows.reduce((s, r) => s + num(r.paidAmount), 0),
    outstanding: rows.reduce((s, r) => s + r.outstanding, 0),
    upcoming: by("Upcoming").length,
    dueToday: by("Due Today").length,
    overdue: by("Overdue").length,
    partiallyPaid: by("Partially Paid").length,
    paidCount: by("Paid").length,
    nextDue: rows.find((r) => r.computedStatus !== "Paid") || null,
  };
}

export const INSTALMENT_STATUS_COLORS = {
  Upcoming: "#3D6B8C",
  "Due Today": "#B8722A",
  Overdue: "#A8392F",
  Paid: "#1B6E5C",
  "Partially Paid": "#6B5B95",
};

export const MEMBER_STATUS_COLORS = {
  Active: "#1B6E5C",
  Deleted: "#A8392F",
  "Pending Addition": "#B8722A",
  "Pending Deletion": "#C2571E",
  Suspended: "#6B6356",
};
