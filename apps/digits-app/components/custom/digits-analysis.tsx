'use client';

import { useMemo, useState } from 'react';
import type { ActiveSymbol, Tick } from '@deriv/core';
import type { DigitStats } from '@/lib/types';
import { QuickBot } from './quick-bot';

interface DigitsAnalysisProps {
  symbols: ActiveSymbol[];
  activeSymbol: ActiveSymbol | null;
  selectSymbol: (symbol: string) => void;
  currentTick: Tick | null;
  lastDigit: number | null;
  digitStats: DigitStats;
  setTradeType: (type: 'over-under') => void;
  setContractMode: (mode: 'DIGITOVER') => void;
  setSelectedDigit: (digit: number) => void;
  stake: string;
  setStake: (stake: string) => void;
  buyContract: () => Promise<void>;
  buyResult: unknown;
  buyError: string | null;
  isBuying: boolean;
  clearBuyResult: () => void;
  proposal: unknown;
  isProposalLoading: boolean;
  isAuthenticated: boolean;
}

export function DigitsAnalysis(props: DigitsAnalysisProps) {
  const { symbols, activeSymbol, selectSymbol, currentTick, lastDigit, digitStats } = props;
  const [barrier, setBarrier] = useState(5);
  const [matchDigit, setMatchDigit] = useState(2);

  const stats = useMemo(() => {
    const { counts, percentages, totalTicks } = digitStats;
    const total = totalTicks || 1;
    const maxDigit = percentages.indexOf(Math.max(...percentages));
    const minDigit = percentages.indexOf(Math.min(...percentages));

    const evenCount = [0, 2, 4, 6, 8].reduce((a, d) => a + (counts[d] || 0), 0);
    const oddCount = total - evenCount;
    const underCount = counts.slice(0, barrier).reduce((a, b) => a + b, 0);
    const equalCount = counts[barrier] || 0;
    const overCount = counts.slice(barrier + 1).reduce((a, b) => a + b, 0);
    const matchCount = counts[matchDigit] || 0;
    const differCount = total - matchCount;

    return { total, maxDigit, minDigit, evenCount, oddCount, underCount, equalCount, overCount, matchCount, differCount };
  }, [digitStats, barrier, matchDigit]);

  return (
    <div className="vx-danalysis">
      <div className="vx-danalysis__header">
        <h2>Digits Analysis</h2>
        <p>Same live numbers as Manual Trader — pick any market, including 1s and Jump indices.</p>
      </div>

      <div className="vx-danalysis__toprow">
        <div className="vx-danalysis__field">
          <label>Market</label>
          <select value={activeSymbol?.underlying_symbol ?? ''} onChange={e => selectSymbol(e.target.value)}>
            {symbols.map(s => (
              <option key={s.underlying_symbol} value={s.underlying_symbol}>
                {s.underlying_symbol_name}
              </option>
            ))}
          </select>
        </div>
        <div className="vx-danalysis__field">
          <label>Over/Under barrier</label>
          <input type="number" min={0} max={9} value={barrier} onChange={e => setBarrier(Math.max(0, Math.min(9, Number(e.target.value))))} />
        </div>
        <div className="vx-danalysis__field">
          <label>Match/Differ digit</label>
          <input type="number" min={0} max={9} value={matchDigit} onChange={e => setMatchDigit(Math.max(0, Math.min(9, Number(e.target.value))))} />
        </div>
      </div>

      <div className="vx-danalysis__price">
        <span className="vx-danalysis__price-num">{currentTick?.quote ?? '—'}</span>
        {lastDigit !== null && <span className="vx-danalysis__price-badge">{lastDigit}</span>}
      </div>

      <div className="vx-danalysis__section">
        <h3>Last digit distribution ({stats.total} ticks)</h3>
        <div className="vx-danalysis__digitrow">
          {digitStats.percentages.map((pct, i) => (
            <div
              key={i}
              className={
                'vx-danalysis__digit' +
                (i === lastDigit ? ' is-touched' : '') +
                (i === stats.maxDigit ? ' is-hot' : '') +
                (i === stats.minDigit ? ' is-cold' : '')
              }
            >
              {i === lastDigit && <div className="vx-danalysis__pointer" />}
              {i}
              <span className="vx-danalysis__digit-pct">{pct.toFixed(1)}%</span>
            </div>
          ))}
        </div>
      </div>

      <div className="vx-danalysis__twocol">
        <div className="vx-danalysis__section">
          <h3>Even / Odd</h3>
          <StatBar label="Even" count={stats.evenCount} total={stats.total} color="#8fd6b0" />
          <StatBar label="Odd" count={stats.oddCount} total={stats.total} color="#ff8a8a" />
        </div>
        <div className="vx-danalysis__section">
          <h3>Matches / Differs (digit {matchDigit})</h3>
          <StatBar label="Matches" count={stats.matchCount} total={stats.total} color="#8fd6b0" />
          <StatBar label="Differs" count={stats.differCount} total={stats.total} color="#ff8a8a" />
        </div>
      </div>

      <div className="vx-danalysis__section">
        <h3>Over / Under {barrier}</h3>
        <div className="vx-danalysis__threecol">
          <StatBar label="Under" count={stats.underCount} total={stats.total} color="#8fd6b0" />
          <StatBar label="Equal" count={stats.equalCount} total={stats.total} color="#98979e" />
          <StatBar label="Over" count={stats.overCount} total={stats.total} color="#ff8a8a" />
        </div>
      </div>

      <QuickBot
        setTradeType={props.setTradeType}
        setContractMode={props.setContractMode}
        setSelectedDigit={props.setSelectedDigit}
        stake={props.stake}
        setStake={props.setStake}
        buyContract={props.buyContract}
        buyResult={props.buyResult}
        buyError={props.buyError}
        isBuying={props.isBuying}
        clearBuyResult={props.clearBuyResult}
        proposal={props.proposal}
        isProposalLoading={props.isProposalLoading}
        isAuthenticated={props.isAuthenticated}
      />

      <p className="vx-danalysis__disclaimer">
        Descriptive statistics from real recent ticks — not predictions. Synthetic indices are generated to be
        statistically random, so past frequency doesn&apos;t change the odds of the next tick.
      </p>
    </div>
  );
}

function StatBar({ label, count, total, color }: { label: string; count: number; total: number; color: string }) {
  const pct = total ? (count / total) * 100 : 0;
  return (
    <div className="vx-danalysis__stat">
      <div className="vx-danalysis__stat-n" style={{ color }}>{count} ({pct.toFixed(1)}%)</div>
      <div className="vx-danalysis__stat-label">{label}</div>
      <div className="vx-danalysis__bar"><div className="vx-danalysis__bar-fill" style={{ width: `${pct}%`, background: color }} /></div>
    </div>
  );
}
