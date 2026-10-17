import React from 'react';
import classNames from 'classnames';
import { observer } from 'mobx-react-lite';
import Money from '@/components/shared_ui/money';
import VxNamePrompt from '@/components/vx-name-prompt';
import { useDisplayName } from '@/hooks/useDisplayName';
import { useStore } from '@/hooks/useStore';
import { localize } from '@deriv-com/translations';
import { useDevice } from '@deriv-com/ui';
import OnboardTourHandler from '../tutorials/dbot-tours/onboarding-tour';
import Announcements from './announcements';
import Cards from './cards';
import InfoPanel from './info-panel';

type TMobileIconGuide = {
    handleTabChange: (active_number: number) => void;
};

const TAGLINES = [
    'Your Ultimate Deriv Trading Companion.',
    'The trend is your friend — until it ends.',
    'Plan the trade. Trade the plan.',
    'Risk first. Profit second.',
];

const DashboardComponent = observer(({ handleTabChange }: TMobileIconGuide) => {
    const { load_modal, dashboard, client, transactions, run_panel } = useStore();
    const { dashboard_strategies } = load_modal;
    const { active_tab, active_tour } = dashboard;
    const has_dashboard_strategies = !!dashboard_strategies?.length;
    const { isDesktop, isTablet } = useDevice();
    // Picked once per mount so the line doesn't churn on every re-render.
    const tagline = React.useMemo(() => localize(TAGLINES[Math.floor(Math.random() * TAGLINES.length)]), []);
    const { name: display_name, save: saveDisplayName, skip: skipDisplayName, should_prompt } = useDisplayName(
        client.is_logged_in
    );

    return (
        <React.Fragment>
            <div
                className={classNames('tab__dashboard', {
                    'tab__dashboard--tour-active': active_tour,
                })}
            >
                <div className='tab__dashboard__content'>
                    {client.is_logged_in && (
                        <Announcements is_mobile={!isDesktop} is_tablet={isTablet} handleTabChange={handleTabChange} />
                    )}
                    <div className='quick-panel'>
                        <div className='vx-promo'>
                            <svg className='vx-promo__art' viewBox='0 0 120 120' fill='none' aria-hidden='true'>
                                <defs>
                                    <linearGradient id='vxPromoGradient' x1='0' y1='0' x2='1' y2='1'>
                                        <stop offset='0' stopColor='#00ff85' />
                                        <stop offset='.5' stopColor='#36e9ff' />
                                        <stop offset='1' stopColor='#ff5fd8' />
                                    </linearGradient>
                                </defs>
                                <circle cx='60' cy='60' r='46' stroke='url(#vxPromoGradient)' strokeWidth='2' opacity='0.5' />
                                <circle cx='60' cy='60' r='33' stroke='url(#vxPromoGradient)' strokeWidth='1.4' opacity='0.7' className='vx-promo__ring' />
                                <polygon points='60,32 82,60 60,88 38,60' fill='url(#vxPromoGradient)' opacity='0.18' />
                                <circle cx='60' cy='60' r='10' fill='url(#vxPromoGradient)' />
                            </svg>
                            <div className='vx-promo__text'>
                                <p className='vx-promo__eyebrow'>{localize('Season 2030 · New Look')}</p>
                                <p className='vx-promo__title'>{localize('Apexindices, Reskinned')}</p>
                                <p className='vx-promo__sub'>
                                    {localize('A holographic interface across every tab — same tools underneath, sharper to read.')}
                                </p>
                            </div>
                        </div>
                        <div className='vx-hero'>
                            <h1 className='vx-hero__greeting'>
                                {client.loginid
                                    ? localize('Hello {{name}}', { name: display_name || client.loginid })
                                    : localize('Welcome to Apexindices')}{' '}
                                <span className='vx-hero__wave'>👋</span>
                            </h1>
                            <p className='vx-hero__tagline'>{tagline}</p>
                        </div>
                        <div className='vx-quick-actions-label'>{localize('Quick actions')}</div>
                        <Cards has_dashboard_strategies={has_dashboard_strategies} is_mobile={!isDesktop} />
                        {client.is_logged_in && (
                            <div className='vx-ledger'>
                                <div className='vx-ledger__stat'>
                                    <div className='vx-ledger__label'>{localize('Session P/L')}</div>
                                    <div
                                        className={classNames('vx-ledger__value', {
                                            'vx-ledger__value--profit': transactions.statistics.total_profit >= 0,
                                            'vx-ledger__value--loss': transactions.statistics.total_profit < 0,
                                        })}
                                    >
                                        <Money
                                            amount={transactions.statistics.total_profit}
                                            currency={client.currency}
                                            has_sign
                                        />
                                    </div>
                                </div>
                                <div className='vx-ledger__stat'>
                                    <div className='vx-ledger__label'>{localize('Drawdown')}</div>
                                    <div className='vx-ledger__value vx-ledger__value--loss'>
                                        <Money
                                            amount={-transactions.statistics.max_drawdown}
                                            currency={client.currency}
                                            has_sign
                                        />
                                    </div>
                                </div>
                                <div className='vx-ledger__stat vx-ledger__stat--status'>
                                    <div className='vx-ledger__label'>{localize('Status')}</div>
                                    <div className='vx-ledger__value'>
                                        {run_panel.is_running ? localize('Running') : localize('Idle')}
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
            <InfoPanel />
            {active_tab === 0 && <OnboardTourHandler is_mobile={!isDesktop} />}
            {should_prompt && <VxNamePrompt onSave={saveDisplayName} onSkip={skipDisplayName} />}
        </React.Fragment>
    );
});

export default DashboardComponent;
