# Salesforce CRM — Playwright + TypeScript

## Setup

```bash
npm ci
npx playwright install chromium webkit
```

## Running

```bash
npm test              # all projects
npm run test:smoke    # @smoke subset (also the WebKit project's filter)
npm run test:headed   # watch it run
npm run test:ui       # Playwright UI mode
npm run typecheck     # tsc --noEmit
npm run report        # open the HTML report
```

## Layout

```
src/pages/       Page Objects — locators and intent
src/flows/       multi-page choreography
src/fixtures/    Playwright fixtures wiring POMs + test data
src/data/        test-data factories
src/utils/       shared helpers
tests/           specs
```

Each folder exposes an `index.ts` barrel, reachable through a path alias
(`@pages`, `@utils`, `@data`, …). Imports name the module rather than the
file, so moving a file inside a folder never rewrites call sites.

## Conventions

- **No `waitForTimeout`.** Wait on real application signals.
- **Role- and label-based locators.** Avoid anchoring on generated attributes
  that regenerate on every render.
- **Config, data and logic stay separated.** Specs read as scenarios;
  locators live in page objects; cross-page sequences live in flows.
- **Parallel-safe by construction.** Test data carries a per-run unique
  suffix so workers cannot collide.
