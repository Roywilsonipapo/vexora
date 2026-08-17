import { useState } from 'react';
import { observer } from 'mobx-react-lite';
import { DBOT_TABS } from '@/constants/bot-contents';
import { save_types } from '@/external/bot-skeleton/constants/save-type';
import { useStore } from '@/hooks/useStore';
import './free-bots.scss';

type TBot = {
    file: string;
    name: string;
    description: string;
    tag: string;
};

const BOTS: TBot[] = [
    {
        file: '01_overunder_cascade_recovery.xml',
        name: 'Over/Under Cascade Recovery',
        description: 'Over 1, switches to Under 5 after a loss, martingale with a hard step cap, resets on win.',
        tag: 'Over/Under',
    },
    {
        file: '02_digit_frequency_mean_reversion.xml',
        name: 'Digit Frequency Mean-Reversion',
        description: 'Flips Odd/Even after 2 losses. Approximated from win/loss streak, not live tick-history scanning.',
        tag: 'Even/Odd',
    },
    {
        file: '03_differs_most_frequent_digit.xml',
        name: 'Differs — Most Frequent Digit',
        description: 'Differs on digit 5 with martingale. Fixed digit, not a live frequency scan — see full notes below.',
        tag: 'Matches/Differs',
    },
    {
        file: '04_dual_safe_barrier_alternation.xml',
        name: 'Dual Safe-Barrier Alternation',
        description: 'Alternates Over 2 / Under 7 every trade, martingale on loss.',
        tag: 'Over/Under',
    },
    {
        file: '05_matches_avoidance_ladder.xml',
        name: 'Matches-Avoidance Ladder',
        description: 'Differs on digit 3 with martingale. Fixed digit, not a live frequency scan.',
        tag: 'Matches/Differs',
    },
    {
        file: '06_trend_confirmation_overunder.xml',
        name: 'Trend-Confirmation Over/Under',
        description: 'Ships as a bare Over 1 martingale skeleton — the trend-confirmation logic wasn\u2019t buildable. Starting point only.',
        tag: 'Over/Under',
    },
    {
        file: '07_evenodd_streak_breaker.xml',
        name: 'Even/Odd Streak-Breaker',
        description: 'Flips parity after 3 losses in a row, martingale. Approximated from streak, not live scanning.',
        tag: 'Even/Odd',
    },
    {
        file: '08_volatility_adaptive_barrier.xml',
        name: 'Volatility-Adaptive Barrier',
        description: 'Same logic as Dual Safe-Barrier — no real volatility read is available to Bot Builder.',
        tag: 'Over/Under',
    },
    {
        file: '09_take_profit_lock_stepdown.xml',
        name: 'Take-Profit Lock Step-Down',
        description: 'Over 1; banks 50% of stake on each win instead of a full reset, to protect profit mid-session.',
        tag: 'Over/Under',
    },
    {
        file: '10_hybrid_multicontract_roundrobin.xml',
        name: 'Hybrid Round-Robin',
        description: 'Over 1 / Under 5 round-robin — 2 of the spec\u2019s 4 contract types (can\u2019t mix categories in one bot).',
        tag: 'Over/Under',
    },
    {
        file: '11_over1_martingale_recovery.xml',
        name: 'Over 1 Martingale Recovery',
        description:
            'Over 1, $1 stake. On a loss, stake \u00d75 to recover; resets to $1 on a win. Stops at $3 profit with a success alert + sound, or \u2212$13 loss. All values editable in Bot Builder.',
        tag: 'Over/Under',
    },
];

const FreeBots = observer(() => {
    const { load_modal, dashboard } = useStore();
    const [loadingFile, setLoadingFile] = useState<string | null>(null);
    const [errorFile, setErrorFile] = useState<string | null>(null);

    const handleLoadBot = async (bot: TBot) => {
        setErrorFile(null);
        setLoadingFile(bot.file);
        try {
            const response = await fetch(`/free-bots/${bot.file}`);
            if (!response.ok) throw new Error('fetch failed');
            const xml = await response.text();

            if (!load_modal || !dashboard) throw new Error('store not ready');

            dashboard.setActiveTab(DBOT_TABS.BOT_BUILDER);

            // Wait for the real Blockly workspace to actually mount before loading into it —
            // a blind setTimeout here is what caused the old "loads into a hidden preview" bug.
            await new Promise<void>((resolve, reject) => {
                const start = Date.now();
                const check = () => {
                    if (window.Blockly?.derivWorkspace) resolve();
                    else if (Date.now() - start > 8000) reject(new Error('workspace did not mount'));
                    else setTimeout(check, 100);
                };
                check();
            });

            await load_modal.loadStrategyToBuilder(
                { id: bot.file, name: bot.name, save_type: save_types.UNSAVED, timestamp: Date.now(), xml },
                true
            );
        } catch {
            setErrorFile(bot.file);
        } finally {
            setLoadingFile(null);
        }
    };

    return (
        <div className='vx-freebots'>
            <div className='vx-freebots__header'>
                <h2>Free Bots</h2>
                <p>
                    Real strategy files, ready to load into Bot Builder. Every one enforces stop loss, take profit,
                    and a hard martingale step cap. Several use approximated signals instead of live tick-history
                    scanning — read each description, and always test on demo before running with real funds.
                </p>
            </div>
            <div className='vx-freebots__grid'>
                {BOTS.map(bot => (
                    <div className='vx-freebots__card' key={bot.file}>
                        <span className='vx-freebots__tag'>{bot.tag}</span>
                        <h3>{bot.name}</h3>
                        <p>{bot.description}</p>
                        <button
                            type='button'
                            className='vx-freebots__load'
                            onClick={() => handleLoadBot(bot)}
                            disabled={loadingFile === bot.file}
                        >
                            {loadingFile === bot.file ? 'Loading…' : 'Load Bot'}
                        </button>
                        {errorFile === bot.file && (
                            <span className='vx-freebots__error'>Could not load this file — try again.</span>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
});

export default FreeBots;
