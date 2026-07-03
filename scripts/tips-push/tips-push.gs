/************ DASHBOARD PUSH — add to the existing tips Apps Script project ************
 * Pushes one night's reconciliation numbers into the Aku dashboard
 * (Supabase `daily_tips`, via the token-guarded `ingest_daily_tips` RPC).
 * Reuses the constants/helpers already in the project: TZ,
 * SOURCE_SPREADSHEET_ID, EXCLUDE_NAMES, findTipoutSectionStart_.
 *
 * Setup (once, per location's script):
 *   Project Settings → Script properties:
 *     DASH_SUPABASE_URL    https://bvqubtromgldqnnhfeuz.supabase.co
 *     DASH_SUPABASE_KEY    the dashboard's publishable (anon) key
 *     DASH_TIPS_TOKEN      the ingest token (see scripts/tips-push/README.md)
 *     DASH_LOCATION_CODE   this venue's dashboard code, e.g. atl
 *   Triggers → add a time-driven trigger on pushYesterdayTipsToDashboard
 *   (daily, 6–7am, after the night's sheet is finalized).
 *
 * Semantics match the weekly gratuity report exactly: rows above the tipout
 * section pull column K (earned tips), rows at/below pull column C (tipout
 * received), same-name rows are summed, junk/numeric names are skipped.
 ***************************************************************************************/

/** Trigger target: push yesterday's tab. */
function pushYesterdayTipsToDashboard() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  pushTipsForDate_(d);
}

/** Manual backfill: pushTipsRangeToDashboard('2026-06-01', '2026-06-30') */
function pushTipsRangeToDashboard(startIso, endIso) {
  const start = new Date(startIso + 'T12:00:00');
  const end = new Date(endIso + 'T12:00:00');
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    try {
      pushTipsForDate_(new Date(d));
    } catch (e) {
      console.warn(d.toDateString() + ': ' + e.message);
    }
  }
}

function pushTipsForDate_(dateObj) {
  const props = PropertiesService.getScriptProperties();
  const url = props.getProperty('DASH_SUPABASE_URL');
  const key = props.getProperty('DASH_SUPABASE_KEY');
  const token = props.getProperty('DASH_TIPS_TOKEN');
  const locCode = props.getProperty('DASH_LOCATION_CODE');
  if (!url || !key || !token || !locCode) throw new Error('Missing DASH_* script properties.');

  const noon = new Date(dateObj.getFullYear(), dateObj.getMonth(), dateObj.getDate(), 12, 0, 0);
  const tabName = Utilities.formatDate(noon, TZ, 'MM.dd.yy');
  const src = SpreadsheetApp.openById(SOURCE_SPREADSHEET_ID).getSheetByName(tabName);
  if (!src) {
    console.log('No tab named ' + tabName + ' — skipped.');
    return;
  }

  const data = src.getDataRange().getValues();
  const tipoutStart = findTipoutSectionStart_(data);

  const byName = new Map();
  for (let r = 1; r < data.length; r++) {
    const rawName = (data[r][0] ?? '').toString().trim();
    if (!rawName || EXCLUDE_NAMES.has(rawName) || /\d/.test(rawName)) continue;
    const isTipout = r >= tipoutStart;
    const amt = Number(data[r][isTipout ? 2 : 10]) || 0;
    if (!amt) continue;
    const k = rawName.toLowerCase();
    const cur = byName.get(k) || { name: rawName, amount: 0, section: isTipout ? 'tipout' : 'earned' };
    cur.amount += amt;
    if (!isTipout) cur.section = 'earned'; // earned wins when a name appears in both sections
    byName.set(k, cur);
  }

  const businessDate = Utilities.formatDate(noon, TZ, 'yyyy-MM-dd');
  const res = UrlFetchApp.fetch(url + '/rest/v1/rpc/ingest_daily_tips', {
    method: 'post',
    contentType: 'application/json',
    headers: { apikey: key, Authorization: 'Bearer ' + key },
    payload: JSON.stringify({
      p_token: token,
      p_location_code: locCode,
      p_business_date: businessDate,
      p_rows: Array.from(byName.values()),
    }),
    muteHttpExceptions: true,
  });
  if (res.getResponseCode() >= 300) {
    throw new Error('Dashboard push failed (' + res.getResponseCode() + '): ' + res.getContentText());
  }
  console.log(tabName + ' → pushed ' + byName.size + ' rows to dashboard (' + locCode + ')');
}
