# pull-tips — Run Payroll's tips-sheet reader

Deployed Supabase Edge Function. The Payroll page's **⟳ Run Payroll** button
invokes it with the signed-in user's JWT (org admins only); it reads the
nightly reconciliation Google Sheet's day tabs (`MM.dd.yy`) for the selected
pay period and replaces those days in `daily_tips`.

## What it reads from each day tab

Mirrors the sheet's weekly gratuity script:

- Rows **above** the first tipout-job row (Barback / Hookah Master /
  Service Bar / Host in column B) → column **K**: what the tipped employee
  is owed, already net of tip-out.
- Rows **at/below** that marker → column **C**: the tipout that support
  employee receives.
- Same-name rows are summed; junk/numeric names are skipped.
- The aggregate bottom rows (Hookah/Barback/Bartender Tipout, Final House
  Cash, Expected Cash) are skipped — that money is already counted in the
  individual rows above.

## Sheet access — Google service account (preferred)

1. In [console.cloud.google.com](https://console.cloud.google.com): create a
   project (any name) → **APIs & Services → Library → Google Sheets API →
   Enable**.
2. **IAM & Admin → Service Accounts → Create service account** (e.g.
   `aku-dashboard-reader`). No roles needed. After creating, open it →
   **Keys → Add key → Create new key → JSON** — a key file downloads.
3. Share the reconciliation spreadsheet with the service account's email
   (`…@….iam.gserviceaccount.com`) as **Viewer** — done by the sheet's owner;
   no link-sharing required.
4. In the Supabase dashboard: **Project Settings → Edge Functions →
   Secrets → Add new** — name `GOOGLE_SA_KEY`, value = the entire JSON key
   file contents. Takes effect immediately, no redeploy.

Without the secret the function falls back to the anonymous CSV export,
which only works if the sheet is link-shared as Viewer.

## Adding a location's sheet

Add its spreadsheet id to the `SHEETS` map in `index.ts` (keyed by the
dashboard `locations.code`) and redeploy.
