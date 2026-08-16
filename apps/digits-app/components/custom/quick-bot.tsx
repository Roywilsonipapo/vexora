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
  const [lastMessage, setLastMessage] = useState('');

  const currentStakeRef = useRef(0);
  const pendingContractId = useRef<number | null>(null);
  const isRunningRef = useRef(false);
  // True once we've changed stake/digit and are waiting for a matching fresh
  // proposal before we're allowed to buy — this is what "Purchase Failed:
  // Unknown contract proposal" meant: buying against a stale/empty proposal.
  const awaitingFreshProposal = useRef(false);

  const armNextBuy = (nextStake: number, barrierVal: number) => {
    currentStakeRef.current = nextStake;
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
    setLastMessage('Starting…');
    armNextBuy(stake, Number(barrier));
  };

  const stopBot = () => {
    isRunningRef.current = false;
    awaitingFreshProposal.current = false;
    setIsRunning(false);
    setLastMessage('Stopped.');
  };

  // Fire the buy only once a real, fresh, non-loading proposal is available —
  // never on a timer guess.
  useEffect(() => {
    if (!isRunningRef.current || !awaitingFreshProposal.current) return;
    if (isProposalLoading || !proposal) return;
    awaitingFreshProposal.current = false;
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
    <div className="vx-quickbot-strip">
      <span className="vx-quickbot-strip__label">Quick Bot</span>
      <label>
        Stake<input value={initialStake} onChange={e => setInitialStake(e.target.value)} disabled={isRunning} />
      </label>
      <label>
        ×<input value={multiplier} onChange={e => setMultiplier(e.target.value)} disabled={isRunning} />
      </label>
      <label>
        Over<input value={barrier} onChange={e => setBarrier(e.target.value)} disabled={isRunning} />
      </label>
      <label>
        SL<input value={stopLoss} onChange={e => setStopLoss(e.target.value)} disabled={isRunning} />
      </label>
      <label>
        TP<input value={takeProfit} onChange={e => setTakeProfit(e.target.value)} disabled={isRunning} />
      </label>
      {!isRunning ? (
        <button className="vx-quickbot-strip__start" onClick={startBot} disabled={isBuying}>Start</button>
      ) : (
        <button className="vx-quickbot-strip__stop" onClick={stopBot}>Stop</button>
      )}
      <span>Trades: {tradeCount}</span>
      <span className={totalProfit >= 0 ? 'is-positive' : 'is-negative'}>P/L: {totalProfit.toFixed(2)}</span>
      {lastMessage && <span className="vx-quickbot-strip__msg">{lastMessage}</span>}
    </div>
  );
}
