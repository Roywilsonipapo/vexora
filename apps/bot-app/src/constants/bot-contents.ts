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
    ANALYSIS_TOOL: 7,
    MANUAL_TRADER: 8,
    DIGITS: 9,
    TRADINGVIEW: 10,
    STRATEGY_PRO: 11,
    SPEEDBOT: 12,
    AI_SOFTWARE: 13,
    AUTO_TRADER: 14,
    // Home is placed last in the tab strip (far right), see main.tsx tab order.
    HOME: 15,
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
    'id-analysis-tool',
    'id-manual-trader',
    'id-digits',
    'id-tradingview',
    'id-strategy-pro',
    'id-speedbot',
    'id-ai-software',
    'id-auto-trader',
    'id-home',
];

export const DEBOUNCE_INTERVAL_TIME = 500;
