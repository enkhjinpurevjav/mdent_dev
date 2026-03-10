/**
 * Helper functions for doctor income/sales calculation.
 *
 * These pure functions handle the three key algorithmic pieces:
 *  1. Mapping the discount-percent enum to a numeric value.
 *  2. Computing per-line net amounts by distributing the invoice discount equally.
 *  3. Allocating a single payment equally across service lines with overflow handling.
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
 * Compute the net amount for each service line by distributing the total
 * invoice service discount equally across all non-PREVIOUS SERVICE lines.
 *
 * Billing already applies the discount only to SERVICE lines (products are
 * never discounted). We therefore:
 *   totalServiceDiscount = totalServiceGross * discountPct / 100
 *   discountPerLine      = totalServiceDiscount / numLines
 *   net[i]              = max(0, gross[i] − discountPerLine)
 *
 * @param {Array<{id: number, lineTotal?: number, unitPrice?: number, quantity?: number}>} serviceItems
 *   Non-PREVIOUS SERVICE invoice items.
 * @param {number} discountPct - Numeric discount percent (e.g. 0, 5, 10).
 * @returns {Map<number, number>} Map from itemId → net amount after discount.
 */
export function computeServiceNetEqualDiscount(serviceItems, discountPct) {
  const netByItemId = new Map();
  const n = serviceItems.length;
  if (n === 0) return netByItemId;

  const totalGross = serviceItems.reduce(
    (sum, it) => sum + Number(it.lineTotal || it.unitPrice * it.quantity || 0),
    0
  );
  const totalDiscount = totalGross * (discountPct / 100);
  const discountPerLine = totalDiscount / n;

  for (const it of serviceItems) {
    const gross = Number(it.lineTotal || it.unitPrice * it.quantity || 0);
    const net = Math.max(0, gross - discountPerLine);
    netByItemId.set(it.id, net);
  }
  return netByItemId;
}

/**
 * Allocate a payment amount equally across service lines with overflow handling.
 *
 * Algorithm:
 *  1. target = paymentAmount / numLines
 *  2. First pass: allocate min(target, remainingDue[line]) per line.
 *  3. leftover = paymentAmount − Σ allocations (some lines were smaller than target).
 *  4. Distribute leftover to lines with the most remaining capacity (largest first)
 *     so that allocation never exceeds remainingDue for any line.
 *
 * The `remainingDue` map is mutated in place so that later payments in the same
 * date range only allocate to still-unpaid portions.
 *
 * Edge cases covered:
 *  - payment < total due  → partial allocation, remainingDue decremented accordingly.
 *  - equal split          → each line receives target when all dues ≥ target.
 *  - line smaller than target → overflow redistributed to lines with capacity.
 *  - multiple payments    → remainingDue tracks running balance across calls.
 *
 * @param {number} paymentAmount - Total payment amount to allocate.
 * @param {number[]} lineIds - Ordered list of service line IDs to allocate across.
 * @param {Map<number, number>} remainingDue - Mutable map of lineId → remaining due amount.
 * @returns {Map<number, number>} Map from lineId → allocated amount for this payment.
 */
export function allocatePaymentEqualSplitWithOverflow(paymentAmount, lineIds, remainingDue) {
  const result = new Map();
  const n = lineIds.length;
  if (n === 0 || paymentAmount <= 0) return result;

  const target = paymentAmount / n;
  let totalAllocated = 0;

  // First pass: allocate min(target, remainingDue) per line.
  for (const id of lineIds) {
    const due = remainingDue.get(id) || 0;
    const a = Math.min(target, due);
    result.set(id, a);
    totalAllocated += a;
  }

  // Distribute leftover to lines with the most remaining capacity.
  let leftover = paymentAmount - totalAllocated;
  if (leftover > 1e-9) {
    const sorted = lineIds
      .map((id) => ({
        id,
        capacity: Math.max(0, (remainingDue.get(id) || 0) - (result.get(id) || 0)),
      }))
      .filter((l) => l.capacity > 0)
      .sort((a, b) => b.capacity - a.capacity);

    for (const { id, capacity } of sorted) {
      if (leftover <= 1e-9) break;
      const extra = Math.min(leftover, capacity);
      result.set(id, (result.get(id) || 0) + extra);
      leftover -= extra;
    }
  }

  // Update remainingDue for subsequent payments.
  for (const [id, a] of result) {
    remainingDue.set(id, Math.max(0, (remainingDue.get(id) || 0) - a));
  }

  return result;
}
