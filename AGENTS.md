# Repo briefing for coding agents (Codex, Claude Code, etc.)

This is a monorepo: `apps/bot-app`, `apps/digits-app`, `apps/accumulators-app`,
`apps/risefall-app`. **Almost all active work happens in `apps/bot-app`** — a
Deriv bot-trading webapp, forked and heavily re-skinned. Unless told otherwise,
assume any task is about `apps/bot-app`.

## What this app is

- A Deriv trading bot-builder webapp (Blockly-based strategy editor + a set of
  custom trading tools), originally a Deriv/@deriv-com open-source template,
  progressively rebranded and re-themed.
- Brand name has changed twice this project: **Vexora → HEDGEBFX → Apexindices**
  (current). If you see any of the old names in code, comments, or docs,
  that's stale — the live app should say **Apexindices** everywhere.
- Git branch in active use: `dbtraders-redesign`. Remote:
  `https://github.com/Roywilsonipapo/vexora.git`.
- Production URL: **https://bot-app-bay.vercel.app** (Vercel).

## Commands

Run all of these from `apps/bot-app`, not the repo root:

```bash
npm run dev          # rsbuild dev server, http://localhost:4003 (first boot ~45-80s)
npx tsc --noEmit      # typecheck — do this after any .ts/.tsx change
vercel deploy --prod --yes   # deploy to bot-app-bay.vercel.app
```

`digits-app` deploys from the **monorepo root** instead — the opposite of
`bot-app`. Don't assume one app's deploy convention applies to another.

## Branding — how the app name resolves

`getAppName()` in `src/utils/branding.ts`:
`process.env.NEXT_PUBLIC_DERIV_APP_NAME || brandConfig?.platform?.name || 'Deriv Bot'`

That means **`.env.production`'s `NEXT_PUBLIC_DERIV_APP_NAME` wins over
`brand.config.json`'s `platform.name`** — editing only one of the two silently
does nothing. If renaming the brand, update both, plus these hardcoded
strings that don't route through `getAppName()`:

- `src/components/splash-screen/index.tsx` (splash text + single-letter mark)
- `src/components/vx-name-prompt/index.tsx` (prompt copy)
- `src/pages/dashboard/dashboard.tsx` ("Welcome to {{brand}}" greeting)
- `src/pages/academy/index.tsx` ("{{brand}} Academy" heading)

The header logo also checks `public/logo.png` (an actual image file) **before**
falling back to a themed letter-badge driven by `--brand-primary`. If a
rebrand still shows an old logo, check for a stale `public/logo.png` — delete
it to get the current theme's badge instead of regenerating an image.

**Never touch**: `vx_*`-prefixed `localStorage` keys (real user data), the
factual code comment in `pages/copy-trading/direct-derivws.ts` referencing the
external Deriv OAuth app `app_id` (describes real external system state, not
this app's branding).

## Current visual direction: "Season 2030"

The whole app runs one central theme file:
**`src/styles/vexora-dbtraders-theme.scss`**. It overrides the underlying
`@deriv-com` design-token CSS custom properties under `.theme--dark`, so
changing a handful of tokens there re-themes almost the entire app (header,
tabs, dashboard cards, buttons, most pages) without touching component code.

Current look, nicknamed "Season 2030" (an EA FC / PS5 Ultimate Team menu
aesthetic applied to a trading dashboard):

- Signature accent: green `#00ff85` (`--vx-orange` is the variable name —
  15+ files already reference it, so it was repurposed rather than renamed)
- Secondary "holo" accent pair: cyan `#36e9ff` + magenta `#ff5fd8`, used only
  for decorative glow/rarity, never for interactive/functional elements
- Display font: **Saira Condensed**, italic, 700–900 weight (imported via
  Google Fonts `@import` at the top of the theme file) — this is the closest
  legitimate free match to EA FC's actual broadcast type; deliberately not a
  system font, not a serif
- Pill-shaped buttons and tabs, a sliding green pill as the active-tab
  indicator, a one-time light-sweep animation on the hero band and promo
  banner, a `vx-screen-enter` fade+rise animation applied to every tab's root
  class (because each tab's component actually unmounts when you leave it —
  see "Tabs unmount" below — so this replays fresh each time you return)

Some pages deliberately did NOT get the full reskin:

- **Auto-Runner** (`src/pages/auto-runner/`) has its own bespoke design
  (currently a "photo panel": rotating generated background images with
  chip-style text overlays, count-up totals, a sparkline, toast
  notifications) — this was a separate design pass, not the Season 2030
  token cascade. Don't casually restyle it to match the rest without being
  asked.
- Free Bots' flagship card tiers (`vvip` / `legendary` / `mythic` in
  `vexora-dbtraders-theme.scss`) are their own gold/holo-foil showpiece
  treatment, independent of the primary accent — don't fold them into a
  general re-theme either.

## Hard-won gotchas (things that actually broke)

1. **Flexbox + `overflow-y: auto` crushes fixed-height children.** A flex
   column with `overflow-y: auto` suppresses the normal `min-height: auto`
   floor, so `flex-shrink` can crush a child with an explicit `height: 420px`
   down to ~1px if the flex container itself is short. Fix: `flex-shrink: 0`
   on any flex child that must keep its set height.
2. **A broad `button` reset silently wins over component-level border-radius.**
   `.theme--dark button:not(.dc-btn--primary) { border-radius: var(--vx-radius); }`
   in the central theme file has higher specificity than a plain
   `.my-component__button { border-radius: 50%; }` rule. If a button isn't
   taking the shape you gave it, add `!important` (consistent with the many
   existing `!important`s in this codebase fighting the same reset) rather
   than fighting specificity another way.
3. **Tabs unmount when you switch away.** The Tabs component
   (`components/shared_ui/tabs/tabs.tsx`) only renders the *active* tab's
   children — everything else is torn down. Anything that must keep running
   in the background (Auto-Runner's loop, for example) has to live in a
   MobX store on `RootStore`, not component state — see
   `pages/auto-runner/auto-runner-store.ts` for the established pattern
   (a store driven by a `reaction()`, not a `useEffect`).
4. **The floating global Run bar** (`components/vx-run-bar/`, `position:
   fixed`, bottom-center, z-index 40) is a separate control from any
   page-level Run/Stop buttons. Give page-level controls a visually distinct
   shape/label so they never read as a duplicate of the floating one, even
   when scrolled into visual proximity.

## Image assets

There is no OpenAI (or other) API key configured for this project, and no
plan to add one — image generation is done manually: the user prompts
ChatGPT (has a Pro subscription, not API billing) and hands over the
resulting files. When writing a prompt for that flow, always ask for
**background art only, no baked-in text/UI/buttons** — this app overlays
real HTML/CSS text on top of whatever image comes back, so baked-in text in
the image itself can't be used.

## Verification expectations

Before calling any UI change done:

- Typecheck (`npx tsc --noEmit` from `apps/bot-app`)
- Actually run the dev server and check it in a browser — don't just read
  the diff and assume it's correct
- Check **both** a ~375px mobile width and desktop width — this app is
  required to work on both
- Check the browser console for new errors/warnings introduced by the change

## Git / deploy boundaries

- Create commits only when asked. Stage files explicitly by name — never
  `git add -A` — because `.claude/launch.json` in this repo gets modified
  externally by tooling and should never be committed or reverted, and
  `build56.js` at the repo root is an untouched pre-existing empty file.
- Pushing and deploying are irreversible/visible actions — confirm with the
  user before running `git push` or `vercel deploy --prod` unless they've
  already asked for it in that turn.
