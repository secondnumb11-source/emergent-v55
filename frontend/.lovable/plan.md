# Plan: Cases Management Refactor + Exports + Testing Hardening

This is a large multi-part request. I'll execute it in phases, verifying between each phase.

## Phase 1 — Refactor `app.cases.tsx` into smaller components
Extract from the current monolithic route into `src/components/cases/`:
- `CasesFilters.tsx` — URL-synced filters (status, court, date range, search)
- `CasesList.tsx` — table/list rendering with sort
- `PagerBar.tsx` — pagination controls (reusable)
- `CaseDialog.tsx` — create/edit dialog (extract existing dialog)
- `CasesToolbar.tsx` — export buttons + bulk actions
- Keep `app.cases.tsx` as thin orchestrator wiring hooks + components

## Phase 2 — Wire Archive page to `?case=` param
- `app.archive.tsx`: read `?case=<id>` via `Route.useSearch()` with `validateSearch` (Zod)
- When `case` present: filter archived records to that case, preserve other URL filters
- Add breadcrumb linking back to the case

## Phase 3 — Implement `GroupedByCase` component
- New `src/components/cases/GroupedByCase.tsx` with typed model:
  ```ts
  type GroupedCase = { caseId: string; caseNumber: string; items: ArchiveItem[] }
  ```
- Groups archive items by case, renders one card per case with expandable items
- Update `app.archive.tsx` to use it when no `?case=` param is set

## Phase 4 — XLSX Export
- Add `xlsx` (SheetJS) dependency
- New `src/lib/export-cases-xlsx.ts` — takes filtered cases, produces workbook
- Columns: رقم القضية, العميل, المحكمة, النوع, الحالة, تاريخ الجلسة القادمة, الموكل, المدعى عليه, تاريخ الفتح
- Wire button in `CasesToolbar`

## Phase 5 — PDF Export with preview
- Reuse existing `src/lib/pdf-export.ts` (Arabic/RTL support)
- New `PdfPreviewDialog.tsx` — renders preview iframe of generated blob before download
- Wire button in `CasesToolbar`

## Phase 6 — TypeScript fixes
- Run `tsgo` to enumerate errors
- Add explicit types to all callback payloads (fixing TS7006 implicit-any)
- Resolve any missing module errors in `src/components/*`
- Add proper types to `GroupedByCase` data model (TS2304)

## Phase 7 — Najiz display robustness
- Add unit tests `src/lib/najiz-display.test.ts` with real sample rows (execution + powers)
- Implement safe fallback: when parser finds < N keywords, render raw text in a monospace block with a warning icon instead of run-on labels
- Test against 3-5 payload samples per type; fix any edge cases

## Phase 8 — Visual regression tests (Playwright)
- `tests/playwright/execution-card-visual.spec.ts`
- `tests/playwright/powers-card-visual.spec.ts`
- `tests/playwright/powers-detail-modal-visual.spec.ts`
- Seed with fixture data, screenshot each variant, store baselines under `tests/playwright/__screenshots__/`

## Phase 9 — Infra housekeeping
- **README.md**: full local setup (bun install, env vars, `bun run dev`, migrations, test commands)
- **patch-package nf3 warning**: regenerate patch against installed 0.3.19 or drop it if no longer needed
- Run `tsgo` + lint end-to-end; fix any remaining errors

## Execution notes
- I will NOT change Najiz sync/ingestion logic (per your earlier constraint) — only display + parser tests
- I will run `tsgo` after each phase touching TS
- Visual regression baselines will be committed; subsequent runs compare against them
- Each phase is independently shippable; if you want to descope, tell me which phases to skip

## Estimated scope
~25-30 new/modified files. This will take several turns to execute cleanly. Ready to proceed on your approval, or tell me which phases to run first (recommended order: 6 → 1 → 2 → 3 → 4 → 5 → 7 → 8 → 9).
