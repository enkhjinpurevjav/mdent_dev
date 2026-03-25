/**
 * Shared SSE subscriber store.
 * Key: `${date}:${branchId}` where branchId is "" for "all branches" mode.
 * Value: Set of response objects for active SSE connections.
 */

/** @type {Map<string, Set<import('express').Response>>} */
const sseSubscribers = new Map();

export function sseKey(date, branchId) {
  return `${date}:${branchId ?? ""}`;
}

/**
 * Register an SSE response object for a given date + branchId scope.
 * Returns a cleanup function to call on disconnect.
 */
export function sseSubscribe(date, branchId, res) {
  const key = sseKey(date, branchId);
  if (!sseSubscribers.has(key)) {
    sseSubscribers.set(key, new Set());
  }
  sseSubscribers.get(key).add(res);
  return () => {
    const set = sseSubscribers.get(key);
    if (set) {
      set.delete(res);
      if (set.size === 0) sseSubscribers.delete(key);
    }
  };
}

/**
 * Broadcast an SSE event to subscribers watching the given date + branchId pair.
 * Delivers to:
 *  1. Subscribers watching the exact (date, branchId) pair.
 *  2. Subscribers watching all branches for the date (branchId === "").
 *
 * @param {string} event
 * @param {object} payload
 * @param {string} date     - YYYY-MM-DD
 * @param {string|number} branchId
 */
export function sseBroadcast(event, payload, date, branchId) {
  const data = JSON.stringify(payload);
  const message = `event: ${event}\ndata: ${data}\n\n`;

  const keysToNotify = new Set([
    sseKey(date, String(branchId)),  // exact branch match
    sseKey(date, ""),                // all-branches subscribers for this date
  ]);

  for (const key of keysToNotify) {
    const subscribers = sseSubscribers.get(key);
    if (!subscribers) continue;
    for (const res of subscribers) {
      try {
        res.write(message);
        if (typeof res.flush === "function") res.flush();
      } catch {
        // ignore write errors; connection cleanup is handled by the 'close' event
      }
    }
  }
}

/**
 * Broadcast an SSE event to ALL active subscribers regardless of date/branchId.
 * Used for cross-cutting events like patient_visit_card_updated.
 *
 * @param {string} event
 * @param {object} payload
 */
export function sseBroadcastAll(event, payload) {
  const data = JSON.stringify(payload);
  const message = `event: ${event}\ndata: ${data}\n\n`;

  for (const subscribers of sseSubscribers.values()) {
    for (const res of subscribers) {
      try {
        res.write(message);
        if (typeof res.flush === "function") res.flush();
      } catch {
        // ignore write errors; connection cleanup is handled by the 'close' event
      }
    }
  }
}
