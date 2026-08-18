type TTabsTitle = {
    [key: string]: string | number;
};

type TDashboardTabIndex = {
    [key: string]: number;
};

export const tabs_title: TTabsTitle = Object.freeze({
    WORKSPACE: 'Workspace',
    CHART: 'Chart',
});

export const DBOT_TABS: TDashboardTabIndex = Object.freeze({
    DASHBOARD: 0,
    BOT_BUILDER: 1,
    CHART: 2,
    TUTORIAL: 3,
    MARKET_ANALYSIS: 4,
    FREE_BOTS: 5,
    RISK_CALCULATOR: 6,
    // Appended after RISK_CALCULATOR rather than interleaved, so existing
    // DBOT_TABS.* references elsewhere keep pointing at the same tab.
    STRATEGY_PRO: 7,
    SPEEDBOT: 8,
    AI_SOFTWARE: 9,
    AUTO_TRADER: 10,
    MANUAL_TRADER: 11,
    BULK_TRADER: 12,
    COPY_TRADER: 13,
    TRADE_ACADEMY: 14,
});

export const MAX_STRATEGIES = 10;

export const TAB_IDS = [
    'id-dbot-dashboard',
    'id-bot-builder',
    'id-charts',
    'id-tutorials',
    'id-market-analysis',
    'id-free-bots',
    'id-risk-calculator',
    'id-strategy-pro',
    'id-speedbot',
    'id-ai-software',
    'id-auto-trader',
    'id-manual-trader',
    'id-bulk-trader',
    'id-copy-trader',
    'id-trade-academy',
];

export const DEBOUNCE_INTERVAL_TIME = 500;
