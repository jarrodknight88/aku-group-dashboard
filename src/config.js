// Business-rule constants. These will grow a Settings surface later —
// keep every rule threshold here rather than inline in pages/scripts.

/** Single-transaction tip above this auto-creates a held exception (section 8). */
export const TIP_HOLD_THRESHOLD = 500

/** Days a large tip is held from the transaction date (chargeback window). */
export const TIP_HOLD_DAYS = 14

/** Rule name used for auto-held large tips — shared by page copy and (later) the import-time evaluator. */
export const TIP_HOLD_RULE = `Tip over $${TIP_HOLD_THRESHOLD} — auto-hold`

/** Per-employee accountability targets on the Void & Discount drill-down (% of own sales). */
export const PERSONAL_VOID_TARGET = 1
export const PERSONAL_DISCOUNT_TARGET = 3
