'use client';

import { useMemo, useState } from 'react';
import type { ActiveSymbol, Tick, BuyResult, ProposalInfo } from '@deriv/core';
import type { DigitStats } from '@/lib/types';
import { getLastDigit } from '@/lib/digit-stats';

interface DigitsAnalysisProps {
  symbols: ActiveSymbol[];
  activeSymbol: ActiveSymbol | null;
  selectSymbol: (symbol: string) => void;
  currentTick: Tick | null;
  lastDigit: number | null;
  digitStats: DigitStats;
  prices: number[];
  pipSize: number;
  setTradeType: (type: 'over-under') => void;
  setContractMode: (mode: 'DIGITOVER') => void;
  setSelectedDigit: (digit: number) => void;
  stake: string;
  setStake: (stake: string) => void;
  buyContract: () => Promise<void>;
  buyResult: BuyResult | null;
  buyError: string | null;
  isBuying: boolean;
  clearBuyResult: () => void;
  proposal: ProposalInfo | null;
  isProposalLoading: boolean;
  isAuthenticated: boolean;
}

const CHIP_PAGE = 10;
const CHIP_MAX = 60;

export function DigitsAnalysis(props: DigitsAnalysisProps) {
  const { symbols, activeSymbol, selectSymbol, currentTick, lastDigit, digitStats, prices, pipSize } = props;
  const [barrier, setBarrier] = useState(5);
  const [matchDigit, setMatchDigit] = useState(2);

  const [ouVisible, setOuVisible] = useState(CHIP_PAGE);
  const [mdVisible, setMdVisible] = useState(CHIP_PAGE);
  const [eoVisible, setEoVisible] = useState(CHIP_PAGE);
  const [rfVisible, setRfVisible] = useState(CHIP_PAGE);

  const stats = useMemo(() => {
    const { counts, percentages, totalTicks } = digitStats;
    const total = totalTicks || 1;
    const maxDigit = percentages.indexOf(Math.max(...percentages));
    const minDigit = percentages.indexOf(Math.min(...percentages));

    const evenCount = [0, 2, 4, 6, 8].reduce((a, d) => a + (counts[d] || 0), 0);
    const oddCount = total - evenCount;

    // Two-way split: Under = digit <= barrier, Over = digit > barrier (no separate "equal" bucket).
    const underCount = counts.slice(0, barrier + 1).reduce((a, b) => a + b, 0);
    const overCount = total - underCount;

    const matchCount = counts[matchDigit] || 0;
    const differCount = total - matchCount;

    let riseCount = 0;
    let fallCount = 0;
    for (let i = 1; i < prices.length; i++) {
      if (prices[i] > prices[i - 1]) riseCount++;
      else fallCount++;
    }
    const riseFallTotal = riseCount + fallCount || 1;

    return {
      total,
      maxDigit,
      minDigit,
      evenCount,
      oddCount,
      underCount,
      overCount,
      matchCount,
      differCount,
      riseCount,
      fallCount,
      riseFallTotal,
    };
  }, [digitStats, barrier, matchDigit, prices]);

  // Recent-outcome sequences, most recent first.
  const recentDigits = useMemo(
    () => prices.slice(-CHIP_MAX).reverse().map((p) => getLastDigit(p, pipSize)),
    [prices, pipSize]
  );

  const ouSeq = useMemo(() => recentDigits.map((d) => (d > barrier ? 'O' : 'U')), [recentDigits, barrier]);
  const mdSeq = useMemo(() => recentDigits.map((d) => (d === matchDigit ? 'M' : 'D')), [recentDigits, matchDigit]);
  const eoSeq = useMemo(() => recentDigits.map((d) => (d % 2 === 0 ? 'E' : 'O')), [recentDigits]);
  const rfSeq = useMemo(() => {
    const rev = prices.slice(-CHIP_MAX).reverse();
    const out: string[] = [];
    for (let i = 0; i < rev.length - 1; i++) {
      out.push(rev[i] > rev[i + 1] ? 'R' : 'F');
    }
    return out;
  }, [prices]);

  return (
    <div className="vx-danalysis">
      <div className="vx-danalysis__topbar">
        <div className="vx-danalysis__market">
          <select
            className="vx-danalysis__market-select"
            value={activeSymbol?.underlying_symbol ?? ''}
            onChange={(e) => selectSymbol(e.target.value)}
          >
            {symbols.map((s) => (
              <option key={s.underlying_symbol} value={s.underlying_symbol}>
                {s.underlying_symbol_name}
              </option>
            ))}
          </select>
        </div>
        <div className="vx-danalysis__ticks">
          <span className="vx-danalysis__ticks-label">TICKS</span>
          <span className="vx-danalysis__ticks-num">{stats.total}</span>
        </div>
        <div className="vx-danalysis__price">
          <span className="vx-danalysis__price-label">LIVE PRICE</span>
          <span className="vx-danalysis__price-num">{currentTick?.quote ?? '—'}</span>
        </div>
      </div>

      <div className="vx-danalysis__digitrow">
        {digitStats.percentages.map((pct, i) => (
          <div
            key={i}
            className={
              'vx-danalysis__digit' +
              (i === stats.maxDigit ? ' is-hot' : '') +
              (i === stats.minDigit ? ' is-cold' : '') +
              (i === barrier ? ' is-barrier' : '') +
              (i === matchDigit ? ' is-match' : '') +
              (i === lastDigit ? ' is-touched' : '')
            }
          >
            {i}
            <span className="vx-danalysis__digit-pct">{pct.toFixed(1)}%</span>
            {i === lastDigit && <div className="vx-danalysis__pointer" />}
          </div>
        ))}
      </div>

      <div className="vx-danalysis__legend">
        <span><i className="vx-dot is-hot" /> Most frequent</span>
        <span><i className="vx-dot is-cold" /> Least frequent</span>
        <span><i className="vx-dot is-barrier" /> Over/Under barrier</span>
        <span><i className="vx-dot is-match" /> Match digit</span>
        <span><i className="vx-dot is-touched" /> Current tick</span>
      </div>

      <div className="vx-danalysis__grid">
        <Panel title="Over / Under">
          <DigitPicker value={barrier} onChange={setBarrier} activeClass="is-barrier" />
          <StatBar label="Over" count={stats.overCount} total={stats.total} color="var(--vx-green)" />
          <StatBar label="Under" count={stats.underCount} total={stats.total} color="var(--vx-white)" />
          <ChipRow seq={ouSeq} visible={ouVisible} onMore={() => setOuVisible((v) => Math.min(v + CHIP_PAGE, ouSeq.length))} colorFor={chipColorOU} />
        </Panel>

        <Panel title="Match / Differ">
          <DigitPicker value={matchDigit} onChange={setMatchDigit} activeClass="is-match" />
          <StatBar label="Match" count={stats.matchCount} total={stats.total} color="var(--vx-green)" />
          <StatBar label="Differ" count={stats.differCount} total={stats.total} color="var(--vx-white)" />
          <ChipRow seq={mdSeq} visible={mdVisible} onMore={() => setMdVisible((v) => Math.min(v + CHIP_PAGE, mdSeq.length))} colorFor={chipColorMD} />
        </Panel>

        <Panel title="Even / Odd">
          <StatBar label="Even" count={stats.evenCount} total={stats.total} color="var(--vx-green)" />
          <StatBar label="Odd" count={stats.oddCount} total={stats.total} color="var(--vx-white)" />
          <ChipRow seq={eoSeq} visible={eoVisible} onMore={() => setEoVisible((v) => Math.min(v + CHIP_PAGE, eoSeq.length))} colorFor={chipColorEO} />
        </Panel>

        <Panel title="Rise / Fall">
          <StatBar label="Rise" count={stats.riseCount} total={stats.riseFallTotal} color="var(--vx-green)" />
          <StatBar label="Fall" count={stats.fallCount} total={stats.riseFallTotal} color="var(--vx-white)" />
          <ChipRow seq={rfSeq} visible={rfVisible} onMore={() => setRfVisible((v) => Math.min(v + CHIP_PAGE, rfSeq.length))} colorFor={chipColorRF} />
        </Panel>
      </div>

      <p className="vx-danalysis__disclaimer">
        Descriptive statistics from real recent ticks — not predictions. Synthetic indices are generated to be
        statistically random, so past frequency doesn&apos;t change the odds of the next tick.
      </p>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="vx-panel">
      <div className="vx-panel__header">
        <h3>{title}</h3>
      </div>
      <div className="vx-panel__body">{children}</div>
    </div>
  );
}

function DigitPicker({ value, onChange, activeClass }: { value: number; onChange: (d: number) => void; activeClass: string }) {
  return (
    <div className="vx-picker">
      {Array.from({ length: 10 }).map((_, d) => (
        <button
          key={d}
          type="button"
          className={'vx-picker__digit' + (d === value ? ` is-selected ${activeClass}` : '')}
          onClick={() => onChange(d)}
        >
          {d}
        </button>
      ))}
    </div>
  );
}

function StatBar({ label, count, total, color }: { label: string; count: number; total: number; color: string }) {
  const pct = total ? (count / total) * 100 : 0;
  return (
    <div className="vx-statbar">
      <div className="vx-statbar__row">
        <span className="vx-statbar__label" style={{ color }}>{label}</span>
        <span className="vx-statbar__pct">{pct.toFixed(1)}%</span>
      </div>
      <div className="vx-statbar__track">
        <div className="vx-statbar__fill" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  );
}

function ChipRow({
  seq,
  visible,
  onMore,
  colorFor,
}: {
  seq: string[];
  visible: number;
  onMore: () => void;
  colorFor: (v: string) => string;
}) {
  if (seq.length === 0) return null;
  const shown = seq.slice(0, visible);
  return (
    <div className="vx-chips">
      {shown.map((v, i) => (
        <span key={i} className="vx-chip" style={{ color: colorFor(v), borderColor: colorFor(v) }}>
          {v}
        </span>
      ))}
      {visible < seq.length && (
        <button type="button" className="vx-chips__more" onClick={onMore}>
          + More
        </button>
      )}
    </div>
  );
}

function chipColorOU(v: string) {
  return v === 'O' ? 'var(--vx-green)' : 'var(--vx-white)';
}
function chipColorMD(v: string) {
  return v === 'M' ? 'var(--vx-green)' : 'var(--vx-white)';
}
function chipColorEO(v: string) {
  return v === 'E' ? 'var(--vx-green)' : 'var(--vx-white)';
}
function chipColorRF(v: string) {
  return v === 'R' ? 'var(--vx-green)' : 'var(--vx-white)';
}
