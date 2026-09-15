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
                        <div className='vx-hero'>
                            <h1 className='vx-hero__greeting'>
                                {client.loginid
                                    ? localize('Hello {{name}}', { name: display_name || client.loginid })
                                    : localize('Welcome to HEDGEBFX')}{' '}
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
