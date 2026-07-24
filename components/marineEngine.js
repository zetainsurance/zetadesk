// ============================================================
//  Marine declaration engine
//  Pure functions — no React, no database. Kept separate so the
//  money-critical logic can be reasoned about and tested on its own.
// ============================================================

export const VOYAGE_TYPES = [
  "Domestic Sales",
  "Domestic Purchase",
  "Domestic Other",
  "Interdepot Movement",
  "Export",
  "Import",
  "Export and Domestic Sales",
  "Export and Domestic Purchase",
  "Import and Domestic Purchase",
  "Import and Export",
  "Domestic Purchase and Import",
  "Capital Goods",
  "Domestic Transits",
];

export const DECLARATION_MODES = ["Monthly", "Quarterly", "Certificate"];

function toISO(d) { return d.toISOString().slice(0, 10); }
function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }

export function todayISO() { return new Date().toISOString().slice(0, 10); }

export function daysBetween(fromISO, toISOStr) {
  if (!fromISO || !toISOStr) return null;
  const a = new Date(fromISO), b = new Date(toISOStr);
  if (isNaN(a) || isNaN(b)) return null;
  return Math.round((b - a) / 86400000);
}

/**
 * Declaration periods for a policy.
 *  Monthly     — inception to that month's end, then whole calendar months,
 *                final block ends on expiry.
 *  Quarterly   — 3-calendar-month anniversary blocks (minus one day),
 *                final block ends on expiry.
 *  Certificate — a single period covering the whole policy year.
 *
 * Because the schedule is derived from the CURRENT expiry date, an early-expiry
 * endorsement automatically re-cuts the remaining periods — no stored schedule
 * to migrate, and no orphan periods beyond the new expiry.
 */
export function generatePeriods(periodFrom, periodTo, mode) {
  if (!periodFrom || !periodTo) return [];
  const start = new Date(periodFrom);
  const end = new Date(periodTo);
  if (isNaN(start) || isNaN(end) || end < start) return [];
  if (mode === "Certificate") return [{ start: toISO(start), end: toISO(end) }];

  const out = [];
  let cursor = new Date(start);
  let guard = 0;
  while (cursor <= end && guard < 600) {
    guard++;
    let blockEnd;
    if (mode === "Quarterly") {
      blockEnd = addDays(new Date(cursor.getFullYear(), cursor.getMonth() + 3, cursor.getDate()), -1);
    } else {
      blockEnd = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0);
    }
    const sliceEnd = blockEnd > end ? end : blockEnd;
    out.push({ start: toISO(cursor), end: toISO(sliceEnd) });
    cursor = addDays(sliceEnd, 1);
  }
  return out;
}

/** Declarations filed against a pool, oldest first. */
export function declarationsForPool(declarations, poolId) {
  return (declarations || [])
    .filter((d) => d.pool_id === poolId)
    .sort((a, b) => (a.period_start || "").localeCompare(b.period_start || ""));
}

/**
 * Effective declared value of an entry. Corrections are non-destructive: the
 * original stays, each correction is appended with its own narration, and the
 * latest correction is what counts against the balance.
 */
export function effectiveValue(decl) {
  const corrections = decl.corrections || [];
  if (corrections.length > 0) {
    const last = corrections[corrections.length - 1];
    return Number(last.value) || 0;
  }
  return Number(decl.declaredValue) || 0;
}

/**
 * Live balance for a pool: SI limit, plus any enhancement endorsements,
 * less every declaration filed against it.
 */
export function poolBalance(pool, declarations, endorsements) {
  const base = Number(pool.si_limit) || 0;
  const enhanced = (endorsements || [])
    .filter((e) => e.pool_id === pool.id && e.endorsement_type === "SI Enhancement")
    .reduce((s, e) => s + (Number(e.amount) || 0), 0);
  const consumed = declarationsForPool(declarations, pool.id)
    .reduce((s, d) => s + effectiveValue(d), 0);
  const limit = base + enhanced;
  return {
    limit,
    enhanced,
    consumed,
    balance: limit - consumed,
    consumedPct: limit > 0 ? (consumed / limit) * 100 : 0,
  };
}

/** Premium for a declared value. Special-voyage rate overrides the pool rate. */
export function declarationPremium(pool, value, specialRatePct) {
  const rate = specialRatePct !== "" && specialRatePct != null && !isNaN(Number(specialRatePct))
    ? Number(specialRatePct)
    : Number(pool.rate_pct) || 0;
  return +(((Number(value) || 0) * rate) / 100).toFixed(2);
}

/**
 * Period status per pool. A period is Filed once a declaration exists for it,
 * otherwise Pending (not yet due), or Overdue with a severity grade.
 *
 * Severity is graded off the grace period, as agreed:
 *   overdue up to 1x grace   -> amber
 *   1x to 2x grace           -> orange
 *   beyond 3x grace          -> red
 */
export function periodStatuses(policy, pool, declarations, graceDays = 7) {
  const mode = policy.declarationMode || "Monthly";
  const periods = generatePeriods(policy.period_from, policy.period_to, mode);
  const filed = declarationsForPool(declarations, pool.id);
  const today = todayISO();

  return periods.map((p) => {
    const decl = filed.find((d) => d.period_start === p.start);
    if (decl) {
      return { ...p, state: "Filed", decl, severity: null, daysLate: null };
    }
    // Declaration for a period falls due the day after the period ends.
    const dueFrom = p.end;
    if (today <= dueFrom) return { ...p, state: "Pending", decl: null, severity: null, daysLate: null };
    const late = daysBetween(dueFrom, today) - graceDays;
    if (late <= 0) return { ...p, state: "Due", decl: null, severity: null, daysLate: 0 };
    let severity = "amber";
    if (late > graceDays * 3) severity = "red";
    else if (late > graceDays) severity = "orange";
    return { ...p, state: "Overdue", decl: null, severity, daysLate: late };
  });
}

/** True once every period for the policy has been filed across all pools. */
export function allPeriodsFiled(policy, pools, declarations) {
  const mode = policy.declarationMode || "Monthly";
  const periods = generatePeriods(policy.period_from, policy.period_to, mode);
  if (periods.length === 0 || (pools || []).length === 0) return false;
  return (pools || []).every((pool) => {
    const filed = declarationsForPool(declarations, pool.id);
    return periods.every((p) => filed.some((d) => d.period_start === p.start));
  });
}

export const SEVERITY_COLORS = { amber: "#B8722A", orange: "#C2571E", red: "#A8392F" };
export const SEVERITY_LABELS = { amber: "Amber", orange: "Orange", red: "Red" };
