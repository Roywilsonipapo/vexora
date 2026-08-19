'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { LiveDigits } from '../components/live-digits';
import { normalizeAppConfig, type DigitsAppConfig } from '../lib/app-config';

/**
 * Deployed app. Reads the no-code config injected at deploy time
 * (public/app-config.json). When present, the configurable control styles/order
 * are applied; when absent, the standard Digits app renders unchanged. Either
 * way the app is fully functional (real trading + login).
 *
 * Supports an `?embed=1` query param for hosting the live Analysis panel
 * inside another app's iframe (see DigitsView.embedAnalysisOnly) — renders
 * just the analysis surface with no header/footer/login chrome.
 */
function DigitsPageInner() {
  const [config, setConfig] = useState<DigitsAppConfig | null | undefined>(undefined);
  const searchParams = useSearchParams();
  const embedAnalysisOnly = searchParams.get('embed') === '1';

  useEffect(() => {
    let cancelled = false;
    const base = process.env.NEXT_PUBLIC_BASE_PATH ?? '';
    fetch(`${base}/app-config.json`)
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (!cancelled) setConfig(data ? normalizeAppConfig(data) : null);
      })
      .catch(() => {
        if (!cancelled) setConfig(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (config === undefined) return <div className="min-h-dvh bg-background" />;
  return <LiveDigits appConfig={config ?? undefined} embedAnalysisOnly={embedAnalysisOnly} />;
}

export default function DigitsPage() {
  return (
    <Suspense fallback={<div className="min-h-dvh bg-background" />}>
      <DigitsPageInner />
    </Suspense>
  );
}
