import { useEffect, useState } from 'react';
import { useDerivWSContext } from '@/components/custom/deriv-ws-provider';

/**
 * Subscribes to real, live balance updates (not just the snapshot from auth).
 * Uses the same ws.send/ws.onMessage pattern already proven in
 * use-open-positions.ts for proposal_open_contract subscriptions.
 */
export function useLiveBalance(fallback: { balance: number; currency: string } | null) {
  const { ws, isConnected } = useDerivWSContext();
  const [live, setLive] = useState<{ balance: number; currency: string } | null>(null);

  useEffect(() => {
    if (!ws || !isConnected) return;
    let isMounted = true;

    ws.send({ balance: 1, subscribe: 1 }).catch(() => {});

    const unsubscribeListener = ws.onMessage((data: { msg_type?: string; balance?: { balance: number; currency: string } }) => {
      if (!isMounted) return;
      if (data?.msg_type === 'balance' && data.balance) {
        setLive({ balance: data.balance.balance, currency: data.balance.currency });
      }
    });

    return () => {
      isMounted = false;
      unsubscribeListener?.();
      ws.send({ forget_all: 'balance' }).catch(() => {});
    };
  }, [ws, isConnected]);

  return live ?? fallback;
}
