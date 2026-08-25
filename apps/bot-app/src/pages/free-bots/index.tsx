import { useState } from 'react';
import classNames from 'classnames';
import { observer } from 'mobx-react-lite';
import { useStore } from '@/hooks/useStore';
import { loadStrategyIntoBuilder } from './load-strategy';
import './free-bots.scss';

type TBot = {
    file: string;
    name: string;
    description: string;
    tag: string;
    // Distinct visual treatment for a specific flagship bot. Not a system —
    // just a hook for the handful of cards that were asked to stand out.
    theme?: 'gold-robotic' | 'vvip-gold';
};

// Small geometric robot glyph — the icon set has no robot, and this is
// simple enough (five primitive shapes) that hand-drawing it carries none of
// the risk complex path data would.
const RobotGlyph = () => (
    <svg viewBox='0 0 24 24' width='18' height='18' fill='none' aria-hidden='true'>
        <rect x='5' y='3' width='2' height='3' fill='currentColor' />
        <circle cx='6' cy='2.5' r='1.4' fill='currentColor' />
        <rect x='4' y='7' width='16' height='13' rx='3.5' stroke='currentColor' strokeWidth='1.6' />
        <circle cx='9.5' cy='13' r='1.6' fill='currentColor' />
        <circle cx='14.5' cy='13' r='1.6' fill='currentColor' />
        <rect x='8.5' y='16.5' width='7' height='1.6' rx='0.8' fill='currentColor' />
        <rect x='0.5' y='11' width='2.2' height='5' rx='1.1' fill='currentColor' />
        <rect x='21.3' y='11' width='2.2' height='5' rx='1.1' fill='currentColor' />
    </svg>
);

// Hexagonal chip/crest glyph for the VVIP card — deliberately distinct from
// the robot above so the two flagship cards don't read as the same badge.
const ChipGlyph = () => (
    <svg viewBox='0 0 24 24' width='16' height='16' fill='none' aria-hidden='true'>
        <path
            d='M12 2 21 7v10l-9 5-9-5V7z'
            stroke='currentColor'
            strokeWidth='1.5'
            strokeLinejoin='round'
        />
        <path d='M12 8 16 10.5v5L12 18l-4-2.5v-5z' fill='currentColor' opacity='0.9' />
    </svg>
);

// --- Premium: fixed-ladder bots ------------------------------------------
// One staking rule across all five, to Roy's spec: 10 USD base, x2.5 after a
// loss, straight back to 10 after a win, take profit 50, stop loss 200.
// Everything is editable in Bot Builder after loading.
const PREMIUM_BOTS: TBot[] = [
    {
        file: 'v1_over2_x25.xml',
        name: 'Over 2 — x2.5 Ladder',
        description:
            'Volatility 100 (1s), Over 2 (wins on 3-9). Stakes 10 USD, x2.5 after a loss, back to 10 after a win. Take profit 50, stop loss 200.',
        tag: 'Premium',
    },
    {
        file: 'v2_over1_x25.xml',
        name: 'Over 1 — x2.5 Ladder',
        description:
            'Volatility 100 (1s), Over 1 (wins on 2-9) — a higher hit rate than Over 2 but a smaller payout per win. Same ladder: 10 USD, x2.5, TP 50, SL 200.',
        tag: 'Premium',
    },
    {
        file: 'v3_even_x25.xml',
        name: 'Even — x2.5 Ladder',
        description:
            'Volatility 100 (1s), Digit Even. Roughly a coin flip with a near-double payout, so a win recovers far more of a ladder than Over 1 does. 10 USD, x2.5, TP 50, SL 200.',
        tag: 'Premium',
    },
    {
        file: 'v4_odd_x25.xml',
        name: 'Odd — x2.5 Ladder',
        description:
            'Volatility 100 (1s), Digit Odd. The mirror of the Even bot, same staking. 10 USD, x2.5, TP 50, SL 200.',
        tag: 'Premium',
    },
    {
        file: 'v5_rotator_x25.xml',
        name: 'Rotator — Over/Under x2.5',
        description:
            'Volatility 100 (1s). Rotates the contract on each loss: Over 2, then Under 7, then Over 1, then Under 8, then back. Any win resets both the rotation and the stake. 10 USD, x2.5, TP 50, SL 200. Deriv fixes trade type per bot, so this rotates within Over/Under rather than across Even/Odd and Differs.',
        tag: 'Premium',
    },
    // --- Gated entry -------------------------------------------------------
    // Same staking as above, but each only buys when its condition holds, so
    // they sit out most ticks instead of firing on every one.
    //
    // Worth being exact about what a gate does: it changes HOW OFTEN you
    // trade, not the odds of any single trade. Ticks are independent, so
    // "after a fall" or "after a low digit" tells you nothing about the next
    // digit. Fewer, more deliberate trades is a real difference in pace and
    // variance — it is not an edge, and the descriptions do not pretend it is.
    {
        file: 'g1_over1_gate01.xml',
        name: 'Over 1 — enter only after 0 or 1',
        description:
            'Buys Over 1 (wins on 2-9) only when the last digit was 0 or 1, skipping every other tick. 10 USD, x2.5 on loss, TP 50, SL 200.',
        tag: 'Premium',
    },
    {
        file: 'g2_over3_gate0123.xml',
        name: 'Over 3 — enter only after 0-3',
        description:
            'Buys Over 3 (wins on 4-9) only when the last digit was 0, 1, 2 or 3. Trades less often than the Over 1 version but pays more per win. 10 USD, x2.5 on loss, TP 50, SL 200.',
        tag: 'Premium',
    },
    {
        file: 'g6_over1_everytick_x5_gold.xml',
        name: 'Over 1 — every tick, x5',
        description:
            'No gate — buys Over 1 on every tick. 10 USD base, x5 on loss (steeper than the x2.5 bots, so the ladder climbs faster: 10, 50, 250 — three losses alone exceeds the 300 stop). Take profit 4.60, stop loss 300.',
        tag: 'Premium',
        theme: 'gold-robotic',
    },
    {
        file: 'g7_over1_everytick_x7_vvip.xml',
        name: 'Over 1 — every tick, x7',
        description:
            'The x5 bot above, unchanged, plus this separate x7 sibling: 10, 70, 490 on loss — two losses (80 total) stay under the 300 stop, but a third (490) blows straight past it in one trade, steeper than every other ladder here. Take profit 4.60, stop loss 300.',
        tag: 'Premium',
        theme: 'vvip-gold',
    },
    // --- Over 3 / Under 3 pair --------------------------------------------
    // Two separate bots (Deriv can't fire two contracts from one bot on the
    // same tick — see the note on the Rotator above) sharing the identical
    // entry gate, so run them in two sessions to have both act on the same
    // ticks. Different stakes, same trigger.
    //
    // This does NOT lock in a win. Under 3 wins on 0-2 and loses on 3-9 — on
    // digit 3 specifically, BOTH legs lose at once (-3 and -1 together), which
    // is the case a "the win always covers the loss" read of this pairing
    // misses. Combining two negative-edge bets on the same draw cannot turn
    // them into a positive-edge one, whatever the stakes — that holds even at
    // zero house edge, before Deriv's real edge makes it worse. What this
    // changes is the shape of outcomes (more frequent small gains, a rarer
    // larger loss), not the expected result.
    {
        file: 'g4_over3_x3_gate0123.xml',
        name: 'Over 3 — 3 USD, enter after 0-3',
        description:
            'Buys Over 3 (wins on 4-9) at 3 USD only when the last digit was 0-3. Pairs with the 1 USD Under 3 bot below on the same gate — run both to have them act on the same ticks. x2.5 on loss, TP 50, SL 200.',
        tag: 'Premium',
    },
    {
        file: 'g5_under3_x1_gate0123.xml',
        name: 'Under 3 — 1 USD, enter after 0-3',
        description:
            'Buys Under 3 (wins on 0-2) at 1 USD on the same gate as the 3 USD Over 3 bot above. On digit 3 specifically, both lose together — this pairing changes the shape of outcomes, it does not remove the house edge. x2.5 on loss, TP 50, SL 200.',
        tag: 'Premium',
    },
    {
        file: 's1_gated_over2_lowdigit.xml',
        name: 'Gated Over 2 — after a low digit',
        description:
            'Only buys Over 2 when the last digit was 2 or lower, so it skips most ticks. Same 10 USD x2.5 ladder, TP 50, SL 200. The gate sets how often it trades, not the odds of each trade.',
        tag: 'Premium',
    },
    {
        file: 's2_gated_even_afterfall.xml',
        name: 'Gated Even — after a fall',
        description:
            'Only buys Even when the previous tick fell. Even pays near 2x, the best payout of the common contracts, so each win is worth far more than an Over 1 win. 10 USD x2.5, TP 50, SL 200.',
        tag: 'Premium',
    },
    {
        file: 's3_gated_over1_highrise.xml',
        name: 'Gated Over 1 — high digit and rising',
        description:
            'The most selective of the three: buys Over 1 only when the last digit was 5 or higher AND the tick rose. Both conditions must hold, so it trades rarely. 10 USD x2.5, TP 50, SL 200.',
        tag: 'Premium',
    },
];

const BOTS: TBot[] = [
    ...PREMIUM_BOTS,
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
    // --- Standard staking-system templates (the classic Deriv Bot Builder
    // library, not custom-authored) \u2014 real, complete, well-known systems.
    // Honest framing: these are staking/money-management patterns, not
    // predictive signals. All parameters are editable after loading.
    {
        file: 'martingale.xml',
        name: 'Classic Martingale',
        description: 'Doubles the stake after every loss, resets to base stake on a win. No stake cap \u2014 high risk.',
        tag: 'Staking system',
    },
    {
        file: 'martingale_max-stake.xml',
        name: 'Martingale (Stake-Capped)',
        description: 'Same doubling-on-loss progression as classic Martingale, with a maximum stake ceiling.',
        tag: 'Staking system',
    },
    {
        file: 'dalembert.xml',
        name: "D'Alembert Recovery",
        description: 'Increases stake by one unit after a loss, decreases by one unit after a win \u2014 gentler than Martingale.',
        tag: 'Staking system',
    },
    {
        file: 'dalembert_max-stake.xml',
        name: "D'Alembert (Stake-Capped)",
        description: "Same one-unit up/down progression as D'Alembert Recovery, with a maximum stake ceiling.",
        tag: 'Staking system',
    },
    {
        file: 'reverse_martingale.xml',
        name: 'Reverse Martingale',
        description: 'Doubles the stake after a win instead of a loss (a.k.a. Paroli), resets to base stake on a loss.',
        tag: 'Staking system',
    },
    {
        file: 'reverse_dalembert.xml',
        name: "Reverse D'Alembert",
        description: 'Increases stake by one unit after a win, decreases by one unit after a loss.',
        tag: 'Staking system',
    },
    {
        file: 'oscars_grind.xml',
        name: "Oscar's Grind",
        description: 'Low-risk system that only raises stake after a win, aiming to grind out a 1-unit profit per cycle.',
        tag: 'Staking system',
    },
    {
        file: 'oscars_grind_max-stake.xml',
        name: "Oscar's Grind (Stake-Capped)",
        description: "Same grind-to-1-unit-profit cycle as Oscar's Grind, with a maximum stake ceiling.",
        tag: 'Staking system',
    },
    {
        file: '1_3_2_6.xml',
        name: '1-3-2-6 System',
        description: 'Fixed 1-3-2-6 unit betting sequence \u2014 exposure only increases after consecutive wins.',
        tag: 'Staking system',
    },
    {
        file: 'accumulators_martingale.xml',
        name: 'Accumulators Martingale',
        description: 'Classic Martingale staking applied to Accumulator contracts instead of Over/Under.',
        tag: 'Accumulators',
    },
    {
        file: 'accumulators_martingale_on_stat_reset.xml',
        name: 'Accumulators Martingale (Stat Reset)',
        description: 'Accumulators Martingale that resets its progression whenever the stat window resets.',
        tag: 'Accumulators',
    },
    {
        file: 'accumulators_dalembert.xml',
        name: "Accumulators D'Alembert",
        description: "D'Alembert's one-unit up/down staking applied to Accumulator contracts.",
        tag: 'Accumulators',
    },
    {
        file: 'accumulators_dalembert_on_stat_reset.xml',
        name: "Accumulators D'Alembert (Stat Reset)",
        description: "Accumulators D'Alembert that resets its progression whenever the stat window resets.",
        tag: 'Accumulators',
    },
    {
        file: 'accumulators_reverse_martingale.xml',
        name: 'Accumulators Reverse Martingale',
        description: 'Reverse Martingale (double on win) staking applied to Accumulator contracts.',
        tag: 'Accumulators',
    },
    {
        file: 'accumulators_reverse_martingale_on_stat_reset.xml',
        name: 'Accumulators Reverse Martingale (Stat Reset)',
        description: 'Accumulators Reverse Martingale that resets its progression whenever the stat window resets.',
        tag: 'Accumulators',
    },
    {
        file: 'accumulators_reverse_dalembert.xml',
        name: "Accumulators Reverse D'Alembert",
        description: "Reverse D'Alembert staking applied to Accumulator contracts.",
        tag: 'Accumulators',
    },
    {
        file: 'accumulators_reverse_dalembert_on_stat_reset.xml',
        name: "Accumulators Reverse D'Alembert (Stat Reset)",
        description: "Accumulators Reverse D'Alembert that resets its progression whenever the stat window resets.",
        tag: 'Accumulators',
    },
];

// Filters are derived from the real `tag` values on BOTS above — no bot is
// listed under a category it doesn't actually belong to.
const DIGIT_TAGS = ['Over/Under', 'Even/Odd', 'Matches/Differs'];

const FILTERS: { id: string; label: string; match: (bot: TBot) => boolean }[] = [
    { id: 'all', label: 'All', match: () => true },
    { id: 'premium', label: 'Premium', match: bot => bot.tag === 'Premium' },
    { id: 'digits', label: 'Digits', match: bot => DIGIT_TAGS.includes(bot.tag) },
    { id: 'staking', label: 'Staking systems', match: bot => bot.tag === 'Staking system' },
    { id: 'accumulators', label: 'Accumulators', match: bot => bot.tag === 'Accumulators' },
];

const FreeBots = observer(() => {
    const { load_modal, dashboard } = useStore();
    const [loadingFile, setLoadingFile] = useState<string | null>(null);
    const [errorFile, setErrorFile] = useState<string | null>(null);
    const [filter, setFilter] = useState('all');

    const handleLoadBot = async (bot: TBot) => {
        setErrorFile(null);
        setLoadingFile(bot.file);
        try {
            await loadStrategyIntoBuilder(bot.file, bot.name, { load_modal, dashboard });
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
            <div className='vx-freebots__filters'>
                {FILTERS.map(f => {
                    const count = BOTS.filter(f.match).length;
                    return (
                        <button
                            type='button'
                            key={f.id}
                            className={filter === f.id ? 'is-active' : ''}
                            onClick={() => setFilter(f.id)}
                        >
                            {f.label} <span className='vx-freebots__filter-count'>{count}</span>
                        </button>
                    );
                })}
            </div>
            <div className='vx-freebots__grid'>
                {BOTS.filter(FILTERS.find(f => f.id === filter)?.match ?? (() => true)).map(bot => (
                    <div
                        className={classNames('vx-freebots__card', {
                            'vx-freebots__card--gold': bot.theme === 'gold-robotic',
                            'vx-freebots__card--vvip': bot.theme === 'vvip-gold',
                        })}
                        key={bot.file}
                    >
                        {bot.theme === 'vvip-gold' && <span className='vx-freebots__vvip-sheen' aria-hidden='true' />}
                        {bot.theme === 'gold-robotic' && (
                            <span className='vx-freebots__badge'>
                                <RobotGlyph />
                            </span>
                        )}
                        {bot.theme === 'vvip-gold' && (
                            <>
                                <span className='vx-freebots__vvip-pill'>VVIP</span>
                                <span className='vx-freebots__badge vx-freebots__badge--chip'>
                                    <ChipGlyph />
                                </span>
                            </>
                        )}
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
