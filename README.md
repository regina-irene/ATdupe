# EFL Time Board

Time and task capture for Edwards Family Law, replacing the Airtable Time table.
Next.js App Router, deployed on Vercel, data in Neon Postgres, two-way sync with Airtable.

## Pages
- **Time** - Board (capture and edit entries), Reports, Data (CSV / Excel export)
- **Tasks** - the Airtable Tasks table, with saved views and a Modified column
- **Setup** - environment status, time sync, task sync, import and wipe controls

## Environment variables (set in Vercel)
| Name | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | yes | Neon Postgres connection string |
| `AUTH_SECRET` | yes | Signs the session cookie |
| `GOOGLE_CLIENT_ID` | yes | Google sign-in |
| `GOOGLE_CLIENT_SECRET` | yes | Google sign-in |
| `AIRTABLE_TOKEN` | yes | Needs data.records:read and data.records:write |
| `ANTHROPIC_API_KEY` | no | Powers the Make billing ready button |
| `APP_URL` | no | Pins the sign-in address, e.g. https://efl-time-board-edwardslaw.vercel.app |
| `API_TOKEN` | no | Lets outside automations post time entries |
| `ALLOWED_DOMAINS` | no | Defaults to edwardsfamilylaw.com |

## Sync
`vercel.json` runs the time sync every 15 minutes and the task sync a few minutes behind it.
Both can also be run by hand from the Setup page.
