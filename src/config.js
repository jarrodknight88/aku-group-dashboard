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

/** ADP company codes per location code. ⚠ Confirm against the actual ADP
    product before the first real export. */
export const ADP_CO_CODES = { atl: 'TGA', clt: 'TGC', afro: 'AFD' }

/** Pay periods are biweekly, Tuesday through the following Monday. */
export const PAY_PERIOD_DAYS = 14
/** Any known period-START Tuesday; periods tile forward/backward from here.
    ⚠ Confirm with the owner which Tuesday the current cycle actually started —
    if payroll runs a week off, shift this by 7 days. */
export const PAYROLL_ANCHOR = '2026-06-23'
