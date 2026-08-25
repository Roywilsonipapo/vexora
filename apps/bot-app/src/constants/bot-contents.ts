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
    ACADEMY: 7,
    JOURNAL: 8,
    AUTO_RUNNER: 9,
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
];

export const DEBOUNCE_INTERVAL_TIME = 500;
