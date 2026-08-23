/**
 * Vexora Academy — course content.
 *
 * Everything factual here is either exact maths (digit probabilities are
 * combinatorial and provable) or measured (tick intervals came from
 * ticks_history timestamps). Payout figures are fetched live from Deriv rather
 * than hardcoded, because they move and a stale number here would teach
 * something false.
 *
 * The one rule for this file: no claim that any strategy produces positive
 * expected value on synthetic indices. It doesn't, and an academy that says
 * otherwise is worse than no academy — the reader risks real money on it.
 * Teach the mechanics, the maths and the risk profile honestly; that is
 * genuinely more useful than invented edges.
 */

export type TLesson = {
    id: string;
    title: string;
    minutes: number;
    /** Short hook shown in the module list. */
    summary: string;
    /** Body paragraphs. Rendered in order. */
    body: string[];
    /** Optional table: header row then data rows. */
    table?: { head: string[]; rows: string[][] };
    /** The single thing to remember. */
    takeaway: string;
};

export type TModule = {
    id: string;
    title: string;
    subtitle: string;
    lessons: TLesson[];
};

export const ACADEMY: TModule[] = [
    {
        id: 'foundations',
        title: 'Foundations',
        subtitle: 'What you are actually trading',
        lessons: [
            {
                id: 'what-are-synthetics',
                title: 'What a synthetic index really is',
                minutes: 4,
                summary: 'Not a market. A random number generator with a published tick rate.',
                body: [
                    'Volatility 100, Volatility 75, Jump 50 and the rest are not markets. Nobody is buying or selling anything. They are random number generators run by Deriv, audited, and designed to behave like a price series without being one.',
                    'This matters more than anything else in this academy. A real market has participants, order flow, news and momentum — things that can genuinely persist and be traded. A synthetic index has none of that. Each tick is generated independently of every tick before it.',
                    'That independence is the whole game. It means the sequence has no memory. The generator does not know that digit 4 has not appeared for thirty ticks, and nothing in it makes 4 more likely next.',
                    'People lose money here mostly because they assume otherwise. Everything else in this course follows from taking the independence seriously.',
                ],
                takeaway: 'Each tick is independent. The sequence has no memory, so nothing that already happened changes what comes next.',
            },
            {
                id: 'the-indices',
                title: 'The indices, and why tick rate matters',
                minutes: 5,
                summary: 'The (1s) variants tick twice as fast. That doubles your trade rate and your risk rate.',
                body: [
                    'Each volatility index has a number that describes how violently it moves. Volatility 10 drifts; Volatility 100 lurches. For digit trading this barely matters, because you are betting on the last digit of the price rather than on the size of the move.',
                    'What matters far more is tick rate. The standard indices produce one tick every two seconds. The (1s) variants produce one every second. Measured directly from tick history: Volatility 100 Index averages 2.00 seconds per tick, or 30 ticks a minute; Volatility 100 (1s) Index averages 1.00 second, or 60 a minute.',
                    'With a one-tick contract duration, tick rate is your speed limit. No setting anywhere makes a bot trade faster than the market ticks.',
                    'The trap: doubling your trade rate doubles how fast you reach your stop loss just as surely as it doubles how fast you reach take profit. Speed is not an edge. It is a multiplier on whatever your strategy already does.',
                ],
                table: {
                    head: ['Index', 'Seconds per tick', 'Trades per minute'],
                    rows: [
                        ['Volatility 100 Index', '2.00', '30'],
                        ['Volatility 100 (1s) Index', '1.00', '60'],
                    ],
                },
                takeaway: 'Tick rate sets your maximum trade rate. Faster is not better, it is just faster — in both directions.',
            },
        ],
    },
    {
        id: 'contracts',
        title: 'The contracts',
        subtitle: 'Over/Under, Even/Odd, Matches/Differs',
        lessons: [
            {
                id: 'over-under',
                title: 'Over / Under',
                minutes: 6,
                summary: 'You pick a barrier. The probability is fixed and knowable to the exact fraction.',
                body: [
                    'The last digit of the price is one of ten equally likely values, 0 through 9. Over 2 wins when the digit is 3 to 9 — seven of ten outcomes, exactly 70%. Under 7 wins on 0 to 6, also exactly 70%.',
                    'There is no estimation here. These are counting problems, and the answers are exact fractions. Anyone who tells you Over 2 "usually hits around 70%" is describing something you can know precisely.',
                    'Note the asymmetry: Over 0 wins 90% of the time and Over 8 only 10%. Same contract type, wildly different profile. The barrier is the entire decision.',
                    'The critical part comes next: the more likely a contract is to win, the less it pays. That relationship is not incidental — it is how the product is priced, and it is covered in the House Edge lesson.',
                ],
                table: {
                    head: ['Contract', 'Wins on', 'Probability', 'Break-even payout'],
                    rows: [
                        ['Over 0', '1-9', '90%', '1.111x'],
                        ['Over 1', '2-9', '80%', '1.250x'],
                        ['Over 2', '3-9', '70%', '1.429x'],
                        ['Over 3', '4-9', '60%', '1.667x'],
                        ['Over 4', '5-9', '50%', '2.000x'],
                        ['Over 5', '6-9', '40%', '2.500x'],
                        ['Over 6', '7-9', '30%', '3.333x'],
                        ['Over 7', '8-9', '20%', '5.000x'],
                        ['Over 8', '9', '10%', '10.000x'],
                    ],
                },
                takeaway: 'Over N wins with probability (9-N)/10. Under N wins with probability N/10. Exact, every time.',
            },
            {
                id: 'even-odd',
                title: 'Even / Odd',
                minutes: 3,
                summary: 'The cleanest contract on the platform: exactly 50%, and the best payout per unit risked.',
                body: [
                    'Five of the ten digits are even (0, 2, 4, 6, 8) and five are odd. Exactly 50%, with no barrier to choose and nothing to tune.',
                    'Because the probability is the lowest of the common contracts, the payout is the highest — usually somewhere near 1.95x. That single fact makes Even/Odd the most efficient contract for recovering a deficit, which the Staking module covers in detail.',
                    'A caution people get wrong constantly: zero is even. If you are counting parity by hand off the analysis tool, that one digit will quietly corrupt your tally.',
                ],
                takeaway: 'Exactly 50% with the highest payout of the common contracts. Zero counts as even.',
            },
            {
                id: 'matches-differs',
                title: 'Matches / Differs',
                minutes: 4,
                summary: 'The most extreme pair. Differs wins nine times in ten and pays almost nothing.',
                body: [
                    'Matches wins only when the last digit equals the exact digit you picked: one in ten, 10%. Differs is its mirror at 90%.',
                    'Differs is seductive because a 90% win rate feels close to certain. But the payout is roughly 1.11x, so a win returns about eleven cents per dollar. One loss erases the profit from roughly nine wins.',
                    'That asymmetry is the single most common way people lose money on this platform. A long green streak builds confidence and a small balance; one red trade takes it back. Nothing has gone wrong when this happens — it is the contract working exactly as priced.',
                    'Matches is the opposite shape: mostly losses with an occasional large win. Same expected value, completely different experience.',
                ],
                takeaway: 'Differs wins 9 in 10 and pays about 0.11 per unit. One loss undoes roughly nine wins. That is arithmetic, not bad luck.',
            },
        ],
    },
    {
        id: 'edge',
        title: 'Payout and edge',
        subtitle: 'The number nobody publishes',
        lessons: [
            {
                id: 'house-edge',
                title: 'Where the house edge lives',
                minutes: 7,
                summary: 'Compare the real payout to the break-even payout. The gap is the edge, and it is always against you.',
                body: [
                    'Every contract has a break-even payout: the payout at which you would come out flat over a long run. It is simply 1 divided by the win probability. Over 2 wins 70% of the time, so break-even is 1 / 0.7 = 1.429x.',
                    'Deriv pays slightly less than that. If Over 2 pays 1.38x against a 1.429x break-even, the gap is where their revenue comes from. It is not hidden or dishonest — it is how the product is priced, exactly like the spread at a bookmaker.',
                    'The consequence is worth stating plainly: expected value per trade is slightly negative on every contract. No barrier is better than another once you account for payout. No staking system changes it, because multiplying your stake multiplies a negative number.',
                    'This does not mean you cannot win. Variance is large and sessions are short, so winning sessions are common. It means that over enough trades the average drifts down, and it drifts faster the more you trade.',
                    'Use the live table on this page to see the current gap on each contract. That number, not a signal, is what you are actually up against.',
                ],
                takeaway: 'Break-even payout is 1 / probability. Deriv pays just under it. That gap is the edge and no strategy removes it.',
            },
            {
                id: 'variance',
                title: 'Variance, streaks and why they feel meaningful',
                minutes: 6,
                summary: 'A ten-loss streak on a 50% contract is unremarkable. Expect it roughly once per thousand trades.',
                body: [
                    'On a 50% contract the chance of ten consecutive losses is 0.5 to the power of ten, about 1 in 1024. That sounds rare until you notice a bot on a 1s index places 60 trades a minute. You will see it within twenty minutes.',
                    'On Over 1 at 80%, five losses in a row is 0.2 to the fifth — about 1 in 3125. Rarer, but each of those losses hurts far more relative to the tiny wins.',
                    'The human brain treats streaks as information. It is not. On an independent sequence a streak carries no signal about what comes next, and the generator has no tendency to "balance out". Believing otherwise is the gambler\'s fallacy, and it is the most expensive mistake in this course.',
                    'The practical use of this lesson is sizing. If you know a ten-streak is routine rather than exceptional, you can pick a stake and a ladder that survive one — instead of being surprised by something that was always going to happen.',
                ],
                table: {
                    head: ['Contract', 'Win rate', 'Odds of 5 losses', 'Odds of 10 losses'],
                    rows: [
                        ['Even / Odd', '50%', '1 in 32', '1 in 1,024'],
                        ['Over 2', '70%', '1 in 412', '1 in 169,351'],
                        ['Over 1', '80%', '1 in 3,125', '1 in 9,765,625'],
                    ],
                },
                takeaway: 'Streaks are expected, not meaningful. Size for the streak you will definitely see, not the one you hope to avoid.',
            },
        ],
    },
    {
        id: 'staking',
        title: 'Staking systems',
        subtitle: 'What they actually do to your risk',
        lessons: [
            {
                id: 'martingale',
                title: 'Martingale and its multiples',
                minutes: 7,
                summary: 'Trades many small wins for one rare catastrophic loss. It does not change expected value.',
                body: [
                    'Martingale multiplies your stake after each loss so that one win recovers everything. At x2.5 from a 10 stake the ladder runs 10, 25, 62.50, 156.25, 390.63.',
                    'Four consecutive losses stake 253.75 in total. On a 70% contract four losses in a row happens roughly once in every 123 sequences — often enough that a session lasting a few hundred trades will meet it.',
                    'What martingale genuinely does is reshape the distribution of outcomes. You win small amounts frequently and lose a large amount rarely. The average is unchanged, because the house edge applies to every stake in the ladder, and the ladder stakes more.',
                    'The honest way to use it is with a step cap that returns to base rather than climbing forever, plus a session stop. Both bound the tail. Neither makes the system profitable.',
                    'A specific trap: if your stop loss is 200 and your ladder reaches a 156.25 stake, a single loss blows through the stop mid-ladder. The stop then fires with the ladder unrecovered — the worst of both. Check that your ladder depth and your stop are compatible before running anything.',
                ],
                table: {
                    head: ['Step', 'Stake at x2.5', 'Total risked'],
                    rows: [
                        ['1', '10.00', '10.00'],
                        ['2', '25.00', '35.00'],
                        ['3', '62.50', '97.50'],
                        ['4', '156.25', '253.75'],
                        ['5', '390.63', '644.38'],
                    ],
                },
                takeaway: 'Martingale converts frequent small wins into a rare large loss. Cap the steps and check the ladder fits inside your stop.',
            },
            {
                id: 'payout-repays',
                title: 'Payout is what repays a deficit, not hit rate',
                minutes: 6,
                summary: 'The most useful idea in this course, and the least known.',
                body: [
                    'Suppose you are down 10 and want it back. On Over 1, which pays about 0.19 profit per unit staked, a 1 stake earns 0.19 a win — you need roughly 53 wins. On Even, paying about 0.95, the same 1 stake needs about 11.',
                    'The high hit rate feels safer and is far worse at recovery. Over 1 wins four times out of five, and each win contributes almost nothing toward the hole.',
                    'This is why grinding a high-probability barrier and hoping to recover a drawdown does not work. The contract that wins most often is precisely the contract that repays least per win.',
                    'If you are going to attempt recovery at all, do it on a contract whose payout is large enough to matter — Even/Odd, or a mid barrier like Over 4. And size to the actual deficit rather than to a fixed ladder, so the stake reflects the hole you are in.',
                    'This does not beat the edge. It just means that if you are going to take the risk, you take it in a form that can actually finish the job.',
                ],
                table: {
                    head: ['Contract', 'Profit per 1 staked', 'Wins to recover 10'],
                    rows: [
                        ['Differs', '~0.11', '~91'],
                        ['Over 1', '~0.19', '~53'],
                        ['Over 2', '~0.38', '~27'],
                        ['Even / Odd', '~0.95', '~11'],
                        ['Over 5', '~1.40', '~8'],
                    ],
                },
                takeaway: 'Recovery speed depends on payout per win, not on how often you win. Pick the contract accordingly.',
            },
        ],
    },
    {
        id: 'practice',
        title: 'Practice',
        subtitle: 'Using the analysis tool without fooling yourself',
        lessons: [
            {
                id: 'reading-analysis',
                title: 'What the Analysis Tool can and cannot tell you',
                minutes: 6,
                summary: 'It is a description of the past. Treating it as a forecast is the expensive mistake.',
                body: [
                    'The digit percentages are a genuine count of what happened over the sample. If it says digit 4 appeared 8.6% of the time in the last thousand ticks, that is true and useful for understanding the sample.',
                    'It is not a prediction. Over a thousand ticks each digit should appear about 10% of the time, but random sampling means values between roughly 8% and 12% are entirely ordinary. A digit sitting at 8.6% is not "due" — the generator has no memory of it.',
                    'A concrete test you can run yourself: note the least frequent digit, then watch the next fifty ticks. It will not appear more often than the others in any reliable way. Do this once and the intuition sticks better than any explanation.',
                    'What the tool is genuinely good for: confirming a market is live and behaving normally, seeing how large ordinary deviation looks so you stop reading meaning into it, and picking barriers with your eyes open about the probability involved.',
                ],
                takeaway: 'The Analysis Tool describes what happened. It says nothing about the next tick, and no reading of it produces an entry signal.',
            },
            {
                id: 'demo-discipline',
                title: 'Practising properly on demo',
                minutes: 5,
                summary: 'Run it long enough to meet a bad streak, or you have learned nothing.',
                body: [
                    'A demo session of twenty trades tells you almost nothing. Most short sessions are profitable simply because the edge is small and variance is large. That is exactly how a losing strategy convinces you it works.',
                    'Run several hundred trades minimum, and specifically keep going through a losing streak. The question is never whether it makes money on a good run — it is what the bad run costs, and whether your stop fires where you expected.',
                    'Record three numbers per session: the largest stake the ladder reached, the deepest drawdown from your best point, and the longest losing streak. Those tell you whether the configuration survives. Final profit or loss over a short session tells you almost nothing.',
                    'Then change exactly one variable at a time. Changing stake and barrier and multiplier together leaves you unable to attribute the difference to anything.',
                ],
                takeaway: 'Judge a configuration by its worst stretch, not its best. Largest stake, deepest drawdown, longest streak.',
            },
        ],
    },
];

export const TOTAL_LESSONS = ACADEMY.reduce((n, m) => n + m.lessons.length, 0);
export const TOTAL_MINUTES = ACADEMY.reduce(
    (n, m) => n + m.lessons.reduce((x, l) => x + l.minutes, 0),
    0
);
