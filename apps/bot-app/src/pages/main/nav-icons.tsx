// Simple inline icons for the nav tabs that don't have a matching
// @deriv/quill-icons entry (Strategy Pro, Speedbot, AI Software, Auto
// Trader, Manual Trader, Bulk Trader, Copy Trader, Trade Academy).
// Same stroke-based style as the header's MenuItems icons.
const iconProps = {
    width: 24,
    height: 24,
    viewBox: '0 0 24 24',
    fill: 'none' as const,
    stroke: 'currentColor',
    strokeWidth: 1.6,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
};

export const StrategyProIcon = () => (
    <svg {...iconProps}>
        <circle cx='12' cy='12' r='9' />
        <circle cx='12' cy='12' r='5' />
        <circle cx='12' cy='12' r='1' />
    </svg>
);

export const SpeedbotIcon = () => (
    <svg {...iconProps}>
        <path d='M13 2 4 14h6l-1 8 9-12h-6l1-8z' />
    </svg>
);

export const AiSoftwareIcon = () => (
    <svg {...iconProps}>
        <path d='M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1' />
        <circle cx='12' cy='12' r='3.2' />
    </svg>
);

export const AutoTraderIcon = () => (
    <svg {...iconProps}>
        <rect x='4' y='8' width='16' height='11' rx='2' />
        <path d='M12 8V4M9 4h6' />
        <circle cx='9' cy='13.5' r='1.2' />
        <circle cx='15' cy='13.5' r='1.2' />
    </svg>
);

export const ManualTraderIcon = () => (
    <svg {...iconProps}>
        <path d='M9 12V4a1.5 1.5 0 0 1 3 0v6' />
        <path d='M12 10V3a1.5 1.5 0 0 1 3 0v7' />
        <path d='M15 10.5V6a1.5 1.5 0 0 1 3 0v8c0 4-2.5 7-6.5 7-3 0-4.3-1-5.7-2.8L3 14.6c-.6-.9-.3-1.9.5-2.3.7-.4 1.5-.2 2.1.4L9 15.5' />
    </svg>
);

export const BulkTraderIcon = () => (
    <svg {...iconProps}>
        <path d='m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3z' />
        <path d='M12 3v18M4 7.5 12 12l8-4.5' />
    </svg>
);

export const CopyTraderIcon = () => (
    <svg {...iconProps}>
        <rect x='4' y='4' width='13' height='13' rx='2' />
        <path d='M9 20h9a2 2 0 0 0 2-2V9' />
    </svg>
);

export const TradeAcademyIcon = () => (
    <svg {...iconProps}>
        <path d='m2 8 10-5 10 5-10 5-10-5z' />
        <path d='M6 10.5V16c0 1.5 2.7 3 6 3s6-1.5 6-3v-5.5' />
        <path d='M22 8v6' />
    </svg>
);
