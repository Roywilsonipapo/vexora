# Vexora

Monorepo for all four Vexora apps. Each is deployed independently on Vercel,
pointed at its own subfolder via Project Settings → Root Directory.

- `apps/bot-app` — main hub: Dashboard, Bot Builder, Free Bots, Analysis Tool,
  Risk Calculator. Vercel Root Directory: `apps/bot-app`
- `apps/digits-app` — standalone digit analysis app. Vercel Root Directory: `apps/digits-app`
- `apps/risefall-app` — Rise/Fall trading app. Vercel Root Directory: `apps/risefall-app`
- `apps/accumulators-app` — Accumulators trading app. Vercel Root Directory: `apps/accumulators-app`

## Working on an app

    cd apps/<app-name>
    npm install
    npm run dev

## Deploying

Push to `main` — each Vercel project auto-deploys from its own subfolder.
Manual deploy: `cd apps/<app-name> && vercel --prod`
