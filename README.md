# EFL Board

Time, tasks, payments, cases and clients for Edwards Family Law, mirroring the Airtable base.
Next.js App Router, deployed on Vercel, data in Neon Postgres, two-way sync with Airtable.

## Pages
- **Time** - Board (capture and edit entries), Reports, Data (CSV / Excel export)
- **Tasks** - the Airtable Tasks table, with saved views and a Modified column
- **Payments** - firm income, two-way, with Airtable's formula splits read-only
- **Cases** - the Status table, every field, with a column picker
- **Clients** - the Clients table, every field, with a column picker
- **Setup** - environment status, sync controls, import and wipe

## Environment variables (set in Vercel)
| Name | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | yes | Neon Postgres connection string |
| `AUTH_SECRET` | yes | Signs the session cookie |
| `GOOGLE_CLIENT_ID` | yes | Google sign-in |
| `GOOGLE_CLIENT_SECRET` | yes | Google sign-in |
| `AIRTABLE_TOKEN` | yes | Needs data.records:read, data.records:write and schema.bases:read |
| `ANTHROPIC_API_KEY` | no | Powers the Make billing ready button |
| `APP_URL` | no | Pins the sign-in address, e.g. https://efl-time-board-edwardslaw.vercel.app |
| `API_TOKEN` | no | Lets outside automations post time entries |
| `ALLOWED_DOMAINS` | no | Defaults to edwardsfamilylaw.com |

## Sync
`vercel.json` runs the time sync every 15 minutes and the task sync a few minutes behind it.
Both can also be run by hand from the Setup page.
