'use client';

import { useEffect, useRef, useState } from 'react';
import { useDerivWSContext } from './deriv-ws-provider';
import { useOpenPositions } from '@/hooks/use-open-positions';
import type { BuyResult, ProposalInfo } from '@deriv/core';

interface QuickBotProps {
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

const MAX_TRADES_SAFETY_CAP = 200;

export function QuickBot(props: QuickBotProps) {
  const {
    setTradeType,
    setContractMode,
    setSelectedDigit,
    setStake,
    buyContract,
    buyResult,
    isBuying,
    proposal,
    isProposalLoading,
    isAuthenticated,
  } = props;
  const { ws, isConnected } = useDerivWSContext();
  const { positions: openPositions } = useOpenPositions(ws, isConnected, isAuthenticated);

  const [initialStake, setInitialStake] = useState('0.5');
  const [multiplier, setMultiplier] = useState('4');
  const [barrier, setBarrier] = useState('1');
  const [stopLoss, setStopLoss] = useState('6');
  const [takeProfit, setTakeProfit] = useState('4');

  const [isRunning, setIsRunning] = useState(false);
  const [totalProfit, setTotalProfit] = useState(0);
  const [tradeCount, setTradeCount] = useState(0);
  const [totalStake, setTotalStake] = useState(0);
  const [totalPayout, setTotalPayout] = useState(0);
  const [wins, setWins] = useState(0);
  const [losses, setLosses] = useState(0);
  const [lastMessage, setLastMessage] = useState('');
  const [isCollapsed, setIsCollapsed] = useState(false);

  const PRESETS: Record<string, { stake: string; multiplier: string; barrier: string; sl: string; tp: string }> = {
    conservative: { stake: '0.5', multiplier: '2', barrier: '2', sl: '5', tp: '3' },
    balanced: { stake: '0.5', multiplier: '4', barrier: '1', sl: '6', tp: '4' },
    aggressive: { stake: '1', multiplier: '6', barrier: '0', sl: '10', tp: '8' },
  };
  const applyPreset = (key: string) => {
    const p = PRESETS[key];
    if (!p) return;
    setInitialStake(p.stake);
    setMultiplier(p.multiplier);
    setBarrier(p.barrier);
    setStopLoss(p.sl);
    setTakeProfit(p.tp);
  };

  const currentStakeRef = useRef(0);
  const pendingContractId = useRef<number | null>(null);
  const isRunningRef = useRef(false);
  // True once we've changed stake/digit and are waiting for a matching fresh
  // proposal before we're allowed to buy — this is what "Purchase Failed:
  // Unknown contract proposal" meant: buying against a stale/empty proposal.
  const awaitingFreshProposal = useRef(false);
  const lastBoughtProposalId = useRef<string | null>(null);

  const armNextBuy = (nextStake: number, barrierVal: number) => {
    currentStakeRef.current = nextStake;
    setTotalStake(s => s + nextStake);
    setTradeType('over-under');
    setContractMode('DIGITOVER');
    setSelectedDigit(barrierVal);
    setStake(String(nextStake));
    awaitingFreshProposal.current = true;
  };

  const startBot = () => {
    const stake = Number(initialStake);
    if (!stake || stake <= 0) {
      setLastMessage('Enter a valid initial stake first.');
      return;
    }
    isRunningRef.current = true;
    setIsRunning(true);
    setTotalProfit(0);
    setTradeCount(0);
    setTotalStake(0);
    setTotalPayout(0);
    setWins(0);
    setLosses(0);
    setLastMessage('Starting…');
    armNextBuy(stake, Number(barrier));
  };

  const stopBot = () => {
    isRunningRef.current = false;
    awaitingFreshProposal.current = false;
    setIsRunning(false);
    setLastMessage('Stopped.');
  };

  const resetStats = () => {
    setTotalProfit(0);
    setTradeCount(0);
    setTotalStake(0);
    setTotalPayout(0);
    setWins(0);
    setLosses(0);
    setLastMessage('');
  };

  // Fire the buy only once a real, fresh, non-loading proposal is available —
  // "fresh" means its id actually differs from the one we last bought, since
  // resetting stake back to its original value after a win can leave the
  // proposal unchanged (same params = same quote), which used to make the
  // bot wait forever for a "change" that would never come.
  useEffect(() => {
    if (!isRunningRef.current || !awaitingFreshProposal.current) return;
    if (isProposalLoading || !proposal) return;
    if (proposal.id === lastBoughtProposalId.current) return;
    awaitingFreshProposal.current = false;
    lastBoughtProposalId.current = proposal.id;
    void buyContract();
  }, [proposal, isProposalLoading, buyContract]);

  useEffect(() => {
    if (buyResult?.contractId) {
      pendingContractId.current = buyResult.contractId;
      setTradeCount(c => c + 1);
    }
  }, [buyResult]);

  useEffect(() => {
    if (!isRunningRef.current || !pendingContractId.current) return;
    const position = openPositions.find(p => p.contract_id === pendingContractId.current);
    if (!position || !position.is_sold) return;

    const profit = Number(position.profit) || 0;
    const payout = profit > 0 ? profit + currentStakeRef.current : 0;
    setTotalPayout(p => p + payout);
    if (profit > 0) setWins(w => w + 1);
    else setLosses(l => l + 1);
    pendingContractId.current = null;

    setTotalProfit(prev => {
      const next = prev + profit;
      const tp = Number(takeProfit);
      const sl = Number(stopLoss);

      if (next >= tp || next <= -sl || tradeCount >= MAX_TRADES_SAFETY_CAP) {
        isRunningRef.current = false;
        setIsRunning(false);
        setLastMessage(
          tradeCount >= MAX_TRADES_SAFETY_CAP
            ? 'Stopped: safety limit of 200 trades reached.'
            : `Stopped: ${next >= tp ? 'take profit' : 'stop loss'} reached (${next.toFixed(2)}).`
        );
        return next;
      }

      const isWin = profit > 0;
      const nextStake = isWin ? Number(initialStake) : currentStakeRef.current * Number(multiplier);
      setLastMessage(isWin ? 'Won — resetting stake.' : `Lost — stake now ${nextStake.toFixed(2)}.`);
      armNextBuy(nextStake, Number(barrier));
      return next;
    });
  }, [openPositions, initialStake, multiplier, stopLoss, takeProfit, tradeCount, barrier]);

  return (
    <div className={`vx-quickbot-panel${isCollapsed ? ' is-collapsed' : ''}`}>
      <div className="vx-quickbot-panel__head">
        <h3 className="vx-quickbot-panel__title">Quick Bot</h3>
        <button
          type="button"
          className="vx-quickbot-panel__collapse"
          onClick={() => setIsCollapsed(c => !c)}
          aria-label={isCollapsed ? 'Expand' : 'Collapse'}
        >
          {isCollapsed ? '‹' : '›'}
        </button>
      </div>

      {!isCollapsed && (
        <>
      <div className="vx-quickbot-panel__presets">
        <label>Simple strategy</label>
        <select onChange={e => applyPreset(e.target.value)} disabled={isRunning} defaultValue="">
          <option value="" disabled>Choose a preset…</option>
          <option value="conservative">Conservative (2× recovery)</option>
          <option value="balanced">Balanced (4× recovery)</option>
          <option value="aggressive">Aggressive (6× recovery)</option>
        </select>
      </div>

      <div className="vx-quickbot-panel__inputs">
        <label>
          Stake
          <input value={initialStake} onChange={e => setInitialStake(e.target.value)} disabled={isRunning} />
        </label>
        <label>
          Recovery ×
          <input value={multiplier} onChange={e => setMultiplier(e.target.value)} disabled={isRunning} />
        </label>
        <label>
          Over digit
          <input value={barrier} onChange={e => setBarrier(e.target.value)} disabled={isRunning} />
        </label>
        <label>
          Stop loss
          <input value={stopLoss} onChange={e => setStopLoss(e.target.value)} disabled={isRunning} />
        </label>
        <label>
          Take profit
          <input value={takeProfit} onChange={e => setTakeProfit(e.target.value)} disabled={isRunning} />
        </label>
      </div>

      {!isRunning ? (
        <button className="vx-quickbot-panel__run" onClick={startBot} disabled={isBuying}>
          ▶ Run
        </button>
      ) : (
        <button className="vx-quickbot-panel__stop" onClick={stopBot}>
          ■ Stop
        </button>
      )}
      <div className="vx-quickbot-panel__status">{isRunning ? 'Bot is running' : lastMessage || 'Bot is not running'}</div>

      <div className="vx-quickbot-panel__stats">
        <div>
          <span className="vx-quickbot-panel__stat-label">Total stake</span>
          <span className="vx-quickbot-panel__stat-value">{totalStake.toFixed(2)}</span>
        </div>
        <div>
          <span className="vx-quickbot-panel__stat-label">Total payout</span>
          <span className="vx-quickbot-panel__stat-value">{totalPayout.toFixed(2)}</span>
        </div>
        <div>
          <span className="vx-quickbot-panel__stat-label">No. of runs</span>
          <span className="vx-quickbot-panel__stat-value">{tradeCount}</span>
        </div>
        <div>
          <span className="vx-quickbot-panel__stat-label">Contracts won</span>
          <span className="vx-quickbot-panel__stat-value is-positive">{wins}</span>
        </div>
        <div>
          <span className="vx-quickbot-panel__stat-label">Contracts lost</span>
          <span className="vx-quickbot-panel__stat-value is-negative">{losses}</span>
        </div>
        <div>
          <span className="vx-quickbot-panel__stat-label">Total profit/loss</span>
          <span className={`vx-quickbot-panel__stat-value ${totalProfit >= 0 ? 'is-positive' : 'is-negative'}`}>
            {totalProfit.toFixed(2)}
          </span>
        </div>
      </div>

      <button className="vx-quickbot-panel__reset" onClick={resetStats} disabled={isRunning}>
        Reset
      </button>

      <p className="vx-quickbot-panel__disclaimer">
        This runs real trades on your account. Test on demo first.
      </p>
        </>
      )}
    </div>
  );
}
