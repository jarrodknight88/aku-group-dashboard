# Zapier cutover — Fillout → Evernote → Supabase invoices

One zap, ordered steps. Step 1 (Evernote note) stays exactly as it is today —
this only replaces the Google-Sheet write with a Supabase POST as the final
step, so `evernote_link` / `evernote_id` arrive already populated.

## Step: Webhooks by Zapier → POST

| Field | Value |
|---|---|
| URL | `https://bvqubtromgldqnnhfeuz.supabase.co/rest/v1/invoices` |
| Payload type | JSON |
| Wrap request in array | No |

### Headers

| Header | Value |
|---|---|
| `apikey` | *(service role key — Supabase dashboard → Settings → API → `service_role`)* |
| `Authorization` | `Bearer ` + the same service role key |
| `Content-Type` | `application/json` |
| `Prefer` | `resolution=ignore-duplicates` |

`ignore-duplicates` + the unique `submission_id` column make retries and
Zapier replays idempotent — a resent submission is silently skipped.

### Body (map from the Fillout trigger + Evernote step)

```json
{
  "submission_id":   "{{Fillout Submission ID}}",
  "submitted_at":    "{{Fillout Submission Time}}",
  "location_id":     "{{location uuid — use the lookup table below}}",
  "vendor_name_raw": "{{Vendor dropdown value, or the New-vendor free-text field when chosen}}",
  "invoice_number":  "{{Invoice Number}}",
  "invoice_date":    "{{Invoice Date, YYYY-MM-DD}}",
  "amount":          "{{Invoice Amount, plain number}}",
  "file_url":        "{{File Upload URL}}",
  "notes":           "{{Notes}}",
  "evernote_link":   "{{Evernote step → note link}}",
  "evernote_id":     "{{Evernote step → note id}}"
}
```

Use a Zapier **Formatter → Lookup Table** for `location_id`
(get the three uuids from the dashboard DB → `select id, name from locations`,
or ask and I'll print them). Do **not** send `status` — the database trigger
sets it: rules 1–4 run on insert, normal invoices auto-approve, anomalies
land in the dashboard's Financials → Review Queue and on the Exceptions page.

## Cutover order

1. Add the POST step to the existing zap (keep the sheet write for a
   parallel-run week if you want a safety net).
2. Watch Financials → Review Queue after a few submissions.
3. Remove the sheet write; the sheet is retired as system of record.

## Notes

- The service role key bypasses RLS — it lives only inside Zapier.
- Vendor names resolve through `vendor_aliases` (161 historical spellings
  seeded); an unseen name auto-creates the vendor and flags the invoice as
  "New vendor" for one-time review. After approving, set its default category
  in the vendors table (Settings UI for this is on the roadmap) and add the
  spelling to the Fillout dropdown.
- Rule thresholds are rows in `invoice_rule_config` — tune without redeploy.
