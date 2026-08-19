# Premium bots — build spec

Handoff document. Task descriptions do not survive between sessions; this file does.

## Scope

A Premium section in Free Bots with five bots. Every one defaults to a **1 USD stake** and
is gated on explicit entry or sizing conditions rather than firing on every tick.

## Honest framing (do not drop this)

Synthetic indices are random per tick with a fixed house edge. No strategy changes expected
value. What these bots genuinely control is **exposure** — position sizing, drawdown limits,
session stops, recovery pacing. Name and describe each bot for what it actually controls.
Do not write copy claiming any of them beats the house edge, improves win rate, or maximises
profit. That claim would be false and would ship inside the product.

## The five designs

### 1. Drawdown Governor
Tiered recovery with a hard step cap. Stake steps up after a loss, but the ladder is capped at
N steps and then **resets to base** instead of continuing to climb — the runaway-martingale
failure mode is the thing being engineered out. A session loss ceiling stops the bot outright.

### 2. Profit Ladder Lock
Banks a percentage of every win into a locked variable. Only unlocked profit plus the base
stake is ever at risk, so a winning session cannot fully round-trip back to zero. Take-profit
target ratchets upward as the locked total grows.

### 3. Cool-Down Circuit Breaker
After K consecutive losses, forces M rounds at minimum stake before normal sizing resumes.
Caps the damage of a losing streak by refusing to size up while the streak is live.

### 4. Volatility-Gated Entry
Only purchases when recent tick movement clears a threshold; otherwise calls `trade_again`
without buying. This is the bot that most literally "only works under special conditions" —
most ticks it simply does not trade.

### 5. Equity Curve Stop
Tracks session peak profit and stops on an X% retrace from that peak. A trailing stop on the
session as a whole rather than on any single contract.

## Strategy XML format

Learned from `public/free-bots/11_over1_martingale_recovery.xml` (~9KB). Match it exactly.

- Root: `<xml xmlns="https://developers.google.com/blockly/xml" is_dbot="true" collection="false">`
- `<variables>` declares `id` + name; every later reference must use the **matching id** in
  `<field name="VAR" id="...">`. Mismatched ids load as broken blocks.
- Top-level blocks and their coordinates:
  - `trade_definition` at `x=0 y=60`, containing statements `TRADE_OPTIONS`, `INITIALIZATION`, `SUBMARKET`
  - `before_purchase` at `x=0 y=900`
  - `after_purchase` at `x=0 y=1400`
- Market chain, each nested inside the previous block's `<next>`:
  `trade_definition_market` (`MARKET_LIST` / `SUBMARKET_LIST` / `SYMBOL_LIST`)
  -> `trade_definition_tradetype` -> `trade_definition_contracttype`
  -> `trade_definition_candleinterval` -> `trade_definition_restartbuysell`
  -> `trade_definition_restartonerror`
- Purchase: `<block type="purchase"><field name="PURCHASE_LIST">DIGITOVER</field></block>`
- Win/loss branch: `contract_check_result` with `CHECK_RESULT=win`
- Running P/L: `total_profit` block
- Alerts: `notify` with `NOTIFICATION_TYPE` and `NOTIFICATION_SOUND`
- **Every value slot needs a `<shadow>` fallback alongside the real `<block>`.** Omitting the
  shadow is the most common way these files load subtly wrong.

## Registration

Add each bot to the `BOTS` array in `src/pages/free-bots/index.tsx` with a new tag so the
Premium filter picks it up. Files go in `public/free-bots/`.

## Verification — required, not optional

These place real orders. Before shipping, load **each** bot into Bot Builder and confirm:

- it mounts without broken/orphaned blocks
- the barrier, contract type and symbol are what the description claims
- the stake initialises to 1 USD
- the cap/stop/gate actually fires (step cap resets, session stop halts, gate skips a tick)

A clean type-check and build prove none of the above.
