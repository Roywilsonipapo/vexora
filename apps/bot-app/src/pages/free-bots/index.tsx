import { useState } from 'react';
import { observer } from 'mobx-react-lite';
import { useStore } from '@/hooks/useStore';
import { loadStrategyIntoBuilder } from './load-strategy';
import './free-bots.scss';

type TBot = {
    file: string;
    name: string;
    description: string;
    tag: string;
};

// --- Premium: exposure-control bots -------------------------------------
// These are risk-management systems, not edge. Synthetic indices are random
// per tick with a fixed house edge, so no strategy changes expected value —
// what these control is how much is at risk and when to stop. Descriptions
// say what each one actually does; none of them claim to beat the house.
// All default to a 1 USD stake. Full spec: docs/premium-bots-spec.md
const PREMIUM_BOTS: TBot[] = [
    {
        file: 'p1_drawdown_governor.xml',
        name: 'Drawdown Governor',
        description:
            'Recovery ladder with a hard 4-step cap that resets to the 1 USD base instead of climbing further — the runaway-martingale failure mode is engineered out. Stops the session at −20 USD.',
        tag: 'Premium',
    },
    {
        file: 'p2_profit_ladder_lock.xml',
        name: 'Profit Ladder Lock',
        description:
            'Banks half of every win into a locked total and never re-risks it, so a winning session cannot fully round-trip. Flat 1 USD stake, stops once 5 USD is banked or at −15 USD.',
        tag: 'Premium',
    },
    {
        file: 'p3_cooldown_circuit_breaker.xml',
        name: 'Cool-Down Circuit Breaker',
        description:
            'After 3 losses in a row it drops to a 0.35 USD minimum stake for 5 rounds before normal sizing resumes. Refuses to size up while a streak is live. Stops at −15 USD.',
        tag: 'Premium',
    },
    {
        file: 'p4_volatility_gated_entry.xml',
        name: 'Volatility-Gated Entry',
        description:
            'Only buys when the last digit is 3 or lower and the tick fell; otherwise it skips and waits. Trades far less often than the others by design. 1 USD flat, +6 target, −12 stop.',
        tag: 'Premium',
    },
    {
        file: 'p5_equity_curve_stop.xml',
        name: 'Equity Curve Stop',
        description:
            'Tracks session peak profit and stops once 2 USD has been given back from that peak, arming only after +3. A trailing stop on the session rather than any single trade.',
        tag: 'Premium',
    },
    // --- Stake-escalation trio -------------------------------------------
    // These take the risk in the STAKE rather than the barrier: each sits on a
    // high-hit-rate barrier and steps the stake up after a loss. High hit rate
    // means small payouts, so a single loss takes several wins to recover —
    // which is exactly why each one carries a hard step cap, a take profit and
    // a session stop. Market and barrier are fixed per bot and pre-selected.
    {
        file: 'p6_safe_barrier_escalator.xml',
        name: 'Safe Barrier Escalator — Over 1',
        description:
            'Volatility 100 (1s), Over 1 — wins on any last digit 2–9. Stakes 3 USD, doubles after a loss, caps at 4 steps then returns to base. Take profit +15, session stop −60.',
        tag: 'Premium',
    },
    {
        file: 'p7_deep_under_escalator.xml',
        name: 'Deep Under Escalator — Under 8',
        description:
            'Volatility 50, Under 8 — wins on any last digit 0–7. Stakes 3 USD, doubles after a loss, caps at 4 steps then returns to base. Take profit +15, session stop −60.',
        tag: 'Premium',
    },
    {
        file: 'p8_wide_barrier_grind.xml',
        name: 'Wide Barrier Grind — Over 2',
        description:
            'Volatility 25, Over 2 — wins on 3–9, so a lower hit rate than the other two but a larger payout. Stakes 3 USD, steps up ×1.8 with a 5-step cap. Take profit +12, session stop −45.',
        tag: 'Premium',
    },
    {
        file: 'p9_deficit_recovery_engine.xml',
        name: 'Deficit Recovery Engine — Over 4',
        description:
            'Sizes each stake to the deficit you actually have, not a fixed ladder: down 10 USD it stakes 3.95 and clears that plus a 5 USD target in 4 wins, where a flat 1 USD would need 16. Over 4 on Volatility 100 is deliberate — it wins ~50% but pays ~0.95 per unit, and payout is what repays a deficit. Stake ceiling 25 USD, session floor −60.',
        tag: 'Premium',
    },
    // --- Greedy switch trio ------------------------------------------------
    // Grind a high-hit-rate barrier at 50 USD, and the moment the session goes
    // negative, switch the BARRIER to one that pays several times more per unit
    // and size the stake to clear the shortfall in 2-3 wins.
    //
    // Deriv cannot change trade type mid-bot — the purchase block's options are
    // fixed by the trade definition — so this switches barrier within
    // Over/Under instead. That is the part that actually matters anyway: it is
    // payout per unit, not hit rate, that repays a deficit.
    {
        file: 'p10_greedy_switch_50.xml',
        name: 'Greedy Switch — Over 1 → Over 4',
        description:
            'Volatility 100. Grinds Over 1 at 50 USD (wins on 2–9, pays little). On going negative it switches to Over 4, which pays roughly 5× more per unit, and sizes to clear the deficit plus 10 USD in 2 wins. Stake ceiling 200, session floor −400.',
        tag: 'Premium',
    },
    {
        file: 'p11_greedy_switch_v100.xml',
        name: 'Greedy Switch — Over 2 → Over 5',
        description:
            'Volatility 100 (1s). Grinds Over 2 at 50 USD, recovers on Over 5 — a lower hit rate but a much larger payout — spread over 3 wins for a 15 USD target. Fewer, larger recovery trades. Ceiling 200, floor −400.',
        tag: 'Premium',
    },
    {
        file: 'p12_greedy_under_switch.xml',
        name: 'Greedy Switch — Under 8 → Under 5',
        description:
            'Volatility 50, the Under-side mirror. Grinds Under 8 at 50 USD (wins on 0–7) and recovers on Under 5, clearing the shortfall in 2 wins. Ceiling 200, session floor −400.',
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
