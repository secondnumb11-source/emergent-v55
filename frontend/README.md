# Legal Practice Management App

TanStack Start + React 19 + Vite + Tailwind v4 + Lovable Cloud (Supabase)
application for managing Saudi legal practice workflows: cases, clients,
judicial powers of attorney, execution requests, Najiz integration, client
and employee portals, and AI-assisted drafting.

---

## Prerequisites

- **Bun** ≥ 1.3 (`curl -fsSL https://bun.sh/install | bash`)
- **Node** ≥ 20 (only needed for a few maintenance scripts)
- A **Lovable Cloud** project (managed Supabase) — enable it from the Lovable
  UI. The following env vars are injected automatically:
  - `VITE_SUPABASE_URL`
  - `VITE_SUPABASE_PUBLISHABLE_KEY`
  - `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (server only)
  - `LOVABLE_API_KEY` (for the AI Gateway)

If running outside Lovable, copy `.env.example` → `.env` and fill values.

---

## Local setup

```bash
bun install
bun run dev              # starts Vite on http://localhost:8080
```

Open the app at http://localhost:8080. The auth wall redirects to `/auth`.

### Common scripts

| Command | Purpose |
| --- | --- |
| `bun run dev` | Vite dev server with HMR |
| `bun run build` | Type-check + production build |
| `bun run build:dev` | Fast dev build (uses `tsgo`) |
| `bun run typecheck` | `tsc --noEmit` |
| `bun run lint` | ESLint over the whole repo |
| `bun run test` | Node/bun unit + regression tests under `tests/` |
| `bun test tests/najiz-display.test.mjs` | Just the Najiz parser tests |
| `bun run test:rls` | Playwright tests under `tests/playwright/` |
| `bun run gen:types` | Regenerate Supabase types |
| `bun run cron:status` | Report pg_cron job status |

---

## Project layout (high level)

```
src/
  routes/                    # File-based routes (TanStack Router)
    _authenticated/          # Auth-gated subtree
      app.cases.tsx          # Cases management
      app.archive.tsx        # Documents archive (accepts ?case=)
      app.execution.tsx      # Najiz-synced execution requests
      app.powers.tsx         # Najiz-synced judicial POAs
      app.ai.*.tsx           # AI-assisted drafting tools
    api/public/*             # Public webhooks / cron endpoints
  components/                # Shared UI + feature components
  lib/                       # Client helpers + *.functions.ts server RPC
    najiz-display.ts         # Display-time parser for Najiz text blobs
    export-cases-xlsx.ts     # Excel export for the cases list
    pdf-export.ts            # RTL-aware PDF export
  integrations/supabase/     # Client + server-side Supabase wrappers
supabase/migrations/         # Database migrations (Lovable Cloud)
tests/                       # Unit + e2e + Playwright tests
bot/                         # Najiz scraping helpers (standalone)
extension/                   # Chrome extension for Najiz data capture
```

---

## Najiz data display

The Najiz platform returns semi-structured Arabic text where labels and
values are often concatenated (e.g. `جهةالإصدار...`). Ingestion writes the
raw blobs to the database unchanged. The UI reformats them at render time
using `src/lib/najiz-display.ts`:

- `parseExecutionRow` → structured `{ court, requestType, creditor, debtor,
  amount, decisions }` for execution cards.
- `parsePowerRow` → structured `{ wakalahNumber, issueDate, expiryDate,
  issuer, agent, agencyClauses }` for POA cards.
- `hasStructuredExecution` / `hasStructuredPower` → tell the UI when to
  render the parsed layout vs. a safe fallback.
- `prettyFallback(text, keywords)` → readable multi-line fallback when the
  parser cannot recover enough structure.

Do **not** change the ingestion path (sync jobs, scrapers, DB columns) when
adjusting card layouts — parsing lives entirely on the display side.

---

## Testing

- Unit tests: `bun run test` (runs every `tests/*.test.mjs`)
- Najiz parser: `bun test tests/najiz-display.test.mjs`
- Playwright: `bun run test:rls` (requires `bunx playwright install` once)

---

## Deploying

Publish from the Lovable UI. Preview and production URLs are stable across
renames:

- `project--<project-id>.lovable.app` — production
- `project--<project-id>-dev.lovable.app` — latest preview build

Use these URLs when configuring external webhooks and cron callers.