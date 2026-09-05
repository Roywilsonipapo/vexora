/**
 * Builds a minimal, genuinely flat-stake Blockly bot XML for handing a
 * single validated ML decision off to Auto-Runner.
 *
 * No existing template in public/free-bots or src/xml is reusable here —
 * every one of them multiplies/adjusts stake after a win or loss
 * (martingale, cascade recovery, streak-breaker, gated tiers — all of
 * them). Binary Scalper's own risk engine already owns stake sizing and
 * loss limits, so the handed-off bot must never touch Stake itself: set
 * once in INITIALIZATION, purchase unconditionally, no after_purchase
 * logic at all. Auto-Runner's own restart cycle is what runs this again
 * for the next decision — this bot does not loop itself.
 *
 * Field values (MARKET_LIST/SUBMARKET_LIST/TRADETYPECAT_LIST/etc.) and the
 * overall block schema are copied from public/free-bots/g1_over1_gate01.xml
 * (digits) and martingale.xml (forex market/submarket naming), stripped of
 * their gating and stake-multiplying blocks.
 */

export type TFlatBotParams = {
    contract_type: string;
    symbol: string;
    duration: number;
    duration_unit: string;
    stake: number;
    barrier?: number;
};

const DIGIT_TRADETYPE: Record<string, string> = {
    DIGITOVER: 'overunder',
    DIGITUNDER: 'overunder',
    DIGITMATCH: 'matchesdiffers',
    DIGITDIFF: 'matchesdiffers',
    DIGITEVEN: 'evenodd',
    DIGITODD: 'evenodd',
};

const NEEDS_PREDICTION = ['DIGITOVER', 'DIGITUNDER', 'DIGITMATCH', 'DIGITDIFF'];

const tradeDefinitionChain = (
    market_list: string,
    submarket_list: string,
    symbol: string,
    tradetypecat_list: string,
    tradetype_list: string,
    contract_type: string
) => `<block type="trade_definition_market" id="vMarket" deletable="false" movable="false"><field name="MARKET_LIST">${market_list}</field><field name="SUBMARKET_LIST">${submarket_list}</field><field name="SYMBOL_LIST">${symbol}</field>
<next><block type="trade_definition_tradetype" id="vTradeType" deletable="false" movable="false"><field name="TRADETYPECAT_LIST">${tradetypecat_list}</field><field name="TRADETYPE_LIST">${tradetype_list}</field>
<next><block type="trade_definition_contracttype" id="vContractType" deletable="false" movable="false"><field name="TYPE_LIST">${contract_type}</field>
<next><block type="trade_definition_candleinterval" id="vCandle" deletable="false" movable="false"><field name="CANDLEINTERVAL_LIST">60</field>
<next><block type="trade_definition_restartbuysell" id="vRestartBuy" deletable="false" movable="false"><field name="TIME_MACHINE_ENABLED">FALSE</field>
<next><block type="trade_definition_restartonerror" id="vRestartErr" deletable="false" movable="false"><field name="RESTARTONERROR">TRUE</field></block></next>
</block></next></block></next></block></next></block>`;

const wrapBot = (trade_definition_chain: string, params: TFlatBotParams, has_prediction: boolean): string => `<xml xmlns="https://developers.google.com/blockly/xml" is_dbot="true" collection="false">
<variables><variable id="vStake">Stake</variable></variables>
<block type="trade_definition" id="vTradeDef" deletable="false" x="0" y="60">
<statement name="TRADE_OPTIONS">
${trade_definition_chain}
</statement>
<statement name="INITIALIZATION">
<block type="variables_set" id="vSetStake"><field name="VAR" id="vStake">Stake</field><value name="VALUE"><block type="math_number" id="vNumStake"><field name="NUM">${params.stake}</field></block></value></block>
</statement>
<statement name="SUBMARKET">
<block type="trade_definition_tradeoptions" id="vTradeOpts"><mutation has_first_barrier="false" has_second_barrier="false" has_prediction="${has_prediction}"></mutation><field name="DURATIONTYPE_LIST">${params.duration_unit}</field>
<value name="DURATION"><shadow type="math_number_positive" id="vShDuration"><field name="NUM">${params.duration}</field></shadow></value>
<value name="AMOUNT"><shadow type="math_number_positive" id="vShAmount"><field name="NUM">${params.stake}</field></shadow><block type="variables_get" id="vGetStakeAmt"><field name="VAR" id="vStake">Stake</field></block></value>
${has_prediction ? `<value name="PREDICTION"><shadow type="math_number_positive" id="vShPrediction"><field name="NUM">${params.barrier ?? 0}</field></shadow></value>` : ''}
</block>
</statement>
</block>
<block type="before_purchase" id="vBeforePurchase" deletable="false" x="0" y="900">
<statement name="BEFOREPURCHASE_STACK"><block type="purchase" id="vPurchase"><field name="PURCHASE_LIST">${params.contract_type}</field></block></statement>
</block>
<block type="after_purchase" id="vAfterPurchase" x="0" y="1400">
<statement name="AFTERPURCHASE_STACK"></statement>
</block>
</xml>`;

export const buildDigitsBotXml = (params: TFlatBotParams): string => {
    const tradetype = DIGIT_TRADETYPE[params.contract_type] ?? 'evenodd';
    const has_prediction = NEEDS_PREDICTION.includes(params.contract_type);
    const chain = tradeDefinitionChain('synthetic_index', 'random_index', params.symbol, 'digits', tradetype, params.contract_type);
    return wrapBot(chain, params, has_prediction);
};

export const buildForexBotXml = (params: TFlatBotParams): string => {
    const chain = tradeDefinitionChain('forex', 'major_pairs', params.symbol, 'callput', 'callput', params.contract_type);
    return wrapBot(chain, params, false);
};
