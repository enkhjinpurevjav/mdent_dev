/**
 * Helper functions for doctor income/sales calculation.
 *
 * These pure functions handle the three key algorithmic pieces:
 *  1. Mapping the discount-percent enum to a numeric value.
 *  2. Computing per-line net amounts by applying the discount percent to each line.
 *  3. Allocating a single payment proportionally by remaining discounted net due.
 */

/**
 * Convert invoice discount percent enum to a numeric percentage.
 *
 * Billing stores discount as an enum (ZERO / FIVE / TEN) and may be extended
 * in future. This function is the single source of truth for that mapping.
 *
 * @param {string|null|undefined} discountEnum
 * @returns {number} Numeric percent (0, 5, 10, …)
 */
export function discountPercentEnumToNumber(discountEnum) {
  if (!discountEnum) return 0;
  switch (String(discountEnum).toUpperCase()) {
    case "FIVE": return 5;
    case "TEN":  return 10;
    case "ZERO":
    default:     return 0;
  }
}

/**
 * Compute the net amount for each service line by applying the discount percent
 * proportionally to each non-PREVIOUS SERVICE line.
 *
 * Each line's net due is:
 *   net[i] = round(gross[i] × (1 − discountPct / 100))
 *
 * Products are excluded from discount logic (caller must pass only SERVICE items).
 *
 * @param {Array<{id: number, lineTotal?: number, unitPrice?: number, quantity?: number}>} serviceItems
 *   Non-PREVIOUS SERVICE invoice items.
 * @param {number} discountPct - Numeric discount percent (e.g. 0, 5, 10).
 * @returns {Map<number, number>} Map from itemId → net amount after discount.
 */
export function computeServiceNetProportionalDiscount(serviceItems, discountPct) {
  const netByItemId = new Map();
  for (const it of serviceItems) {
    const gross = Number(it.lineTotal || it.unitPrice * it.quantity || 0);
    const net = Math.max(0, Math.round(gross * (1 - discountPct / 100)));
    netByItemId.set(it.id, net);
  }
  return netByItemId;
}

/**
 * Allocate a payment amount proportionally across service lines by each line's
 * remaining discounted net due (including IMAGING lines).
 *
 * Algorithm:
 *  1. Compute each line's share = remainingDue[line] / totalRemainingDue.
 *  2. Initial allocation: floor(paymentAmount × share), capped at remainingDue[line].
 *  3. leftover = paymentAmount − Σ allocations (rounding residual, at most N − 1 ₮).
 *  4. Distribute leftover 1 ₮ at a time to lines with the largest fractional remainder
 *     (largest-remainder method), subject to per-line capacity cap.
 *
 * The `remainingDue` map is mutated in place so that later payments in the same
 * date range only allocate to still-unpaid portions.
 *
 * Edge cases covered:
 *  - payment < total due     → partial allocation, remainingDue decremented accordingly.
 *  - payment > total due     → capped to totalRemainingDue (no over-payment).
 *  - equal-sized lines       → each line receives paymentAmount / N (within rounding).
 *  - tiny line               → receives proportionally small share (no overflow forced).
 *  - multiple payments       → remainingDue tracks running balance across calls.
 *  - sum(allocations) == P   → guaranteed by largest-remainder rounding.
 *
 * @param {number} paymentAmount - Total payment amount to allocate (integer MNT).
 * @param {number[]} lineIds - Ordered list of service line IDs to allocate across.
 * @param {Map<number, number>} remainingDue - Mutable map of lineId → remaining due amount.
 * @returns {Map<number, number>} Map from lineId → allocated amount for this payment.
 */
export function allocatePaymentProportionalByRemaining(paymentAmount, lineIds, remainingDue) {
  const result = new Map();
  if (lineIds.length === 0 || paymentAmount <= 0) return result;

  const totalRemaining = lineIds.reduce((sum, id) => sum + (remainingDue.get(id) || 0), 0);
  if (totalRemaining <= 0) {
    for (const id of lineIds) result.set(id, 0);
    return result;
  }

  // Cap payment to total remaining so we never over-allocate.
  const P = Math.min(paymentAmount, totalRemaining);

  // Initial integer allocation: floor(P × share), capped at each line's remaining due.
  const allocs = new Map();
  let allocated = 0;
  const fracs = [];

  for (const id of lineIds) {
    const due = remainingDue.get(id) || 0;
    const exact = P * (due / totalRemaining);
    const floored = Math.min(due, Math.floor(exact));
    allocs.set(id, floored);
    allocated += floored;
    fracs.push({ id, capacity: due - floored, frac: exact - Math.floor(exact) });
  }

  // Distribute leftover 1 ₮ at a time using the largest-remainder method.
  let leftover = P - allocated;
  fracs.sort((a, b) => b.frac - a.frac || b.capacity - a.capacity);

  for (const { id, capacity } of fracs) {
    if (leftover <= 0) break;
    const add = Math.min(leftover, capacity);
    allocs.set(id, (allocs.get(id) || 0) + add);
    leftover -= add;
  }

  // Build result and update remainingDue for subsequent payments.
  for (const id of lineIds) {
    const a = allocs.get(id) || 0;
    result.set(id, a);
    remainingDue.set(id, Math.max(0, (remainingDue.get(id) || 0) - a));
  }

  return result;
}
