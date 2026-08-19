// @ts-nocheck — vendored bot code with known upstream type gaps; see AGENTS.md
// TODO: Complete MobX integration for popup functionality
// Some code is kept commented out pending popup integration
import React from 'react';
import classNames from 'classnames';
import { observer } from 'mobx-react-lite';
import GoogleDrive from '@/components/load-modal/google-drive';
import Dialog from '@/components/shared_ui/dialog';
import MobileFullPageModal from '@/components/shared_ui/mobile-full-page-modal';
import Text from '@/components/shared_ui/text';
import { DBOT_TABS } from '@/constants/bot-contents';
import { useStore } from '@/hooks/useStore';
import { DerivLightGoogleDriveIcon } from '@deriv/quill-icons/Illustration';
import { Localize, localize } from '@deriv-com/translations';
import { useDevice } from '@deriv-com/ui';
/* [AI] - Analytics event tracking removed - see migrate-docs/MONITORING_PACKAGES.md for re-implementation guide */
/* [/AI] */
import DashboardBotList from './bot-list/dashboard-bot-list';

// Inline glyphs rather than quill-icons: these need to inherit the card's
// accent colour via currentColor and sit at a fixed 21px inside the tile,
// which the packaged illustration icons (fixed fills, 48px art) can't do.
const IconFolder = () => (
    <svg viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='1.9' strokeLinejoin='round'>
        <path d='M3 7a2 2 0 0 1 2-2h4l2 2.5h8a2 2 0 0 1 2 2V17a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z' />
    </svg>
);

const IconRobot = () => (
    <svg viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='1.9' strokeLinejoin='round'>
        <rect x='4' y='8' width='16' height='12' rx='2.5' />
        <path d='M12 4v4M9 14h.01M15 14h.01' strokeLinecap='round' />
    </svg>
);

const IconPuzzle = () => (
    <svg viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='1.9' strokeLinejoin='round'>
        <path d='M10 4h4v2.2a1.8 1.8 0 1 0 3.6 0V4H20v4.4h-2.2a1.8 1.8 0 1 0 0 3.6H20V20h-4.4v-2.2a1.8 1.8 0 1 0-3.6 0V20H4v-4.4h2.2a1.8 1.8 0 1 0 0-3.6H4V8h6V4Z' />
    </svg>
);

const IconBolt = () => (
    <svg viewBox='0 0 24 24' fill='currentColor'>
        <path d='M13.5 2 5 13.2h5.4L9.9 22l8.6-11.4h-5.5L13.5 2Z' />
    </svg>
);

type TCardProps = {
    has_dashboard_strategies: boolean;
    is_mobile: boolean;
};

type TCardArray = {
    id: string;
    icon: React.ReactElement;
    content: React.ReactElement;
    description: React.ReactElement;
    accent: string;
    callback: () => void;
};

const Cards = observer(({ is_mobile, has_dashboard_strategies }: TCardProps) => {
    const { dashboard, load_modal, quick_strategy, google_drive } = useStore();
    const { toggleLoadModal, setActiveTabIndex } = load_modal;
    const { is_google_drive_configured } = google_drive;
    const { isDesktop } = useDevice();
    const { onCloseDialog, dialog_options, is_dialog_open, setActiveTab, setPreviewOnPopup } = dashboard;
    const { setFormVisibility } = quick_strategy;

    const openFileLoader = () => {
        toggleLoadModal();
        setActiveTabIndex(is_mobile ? 0 : 1);
        setActiveTab(DBOT_TABS.BOT_BUILDER);
    };

    const openGoogleDriveDialog = () => {
        const google_drive_tab_index = isDesktop ? 2 : 1;
        toggleLoadModal();
        setActiveTabIndex(google_drive_tab_index); // Google Drive tab index
        setActiveTab(DBOT_TABS.BOT_BUILDER);
    };

    const actions: TCardArray[] = [
        {
            id: 'my-computer',
            icon: <IconFolder />,
            content: is_mobile ? <Localize i18n_default_text='Upload' /> : <Localize i18n_default_text='Upload Bot' />,
            description: <Localize i18n_default_text='Import an XML bot from your computer' />,
            accent: 'red',
            callback: () => {
                openFileLoader();
                /* [AI] - Analytics event tracking removed - see migrate-docs/MONITORING_PACKAGES.md for re-implementation guide */
                /* [/AI] */
            },
        },
        {
            id: 'free-bots',
            icon: <IconRobot />,
            content: <Localize i18n_default_text='Free Bots' />,
            description: <Localize i18n_default_text='Browse ready-made trading strategies' />,
            accent: 'green',
            callback: () => setActiveTab(DBOT_TABS.FREE_BOTS),
        },
        {
            id: 'bot-builder',
            icon: <IconPuzzle />,
            content: <Localize i18n_default_text='Bot Editor' />,
            description: <Localize i18n_default_text='Build a custom bot with the visual editor' />,
            accent: 'purple',
            callback: () => {
                setActiveTab(DBOT_TABS.BOT_BUILDER);
                /* [AI] - Analytics event tracking removed - see migrate-docs/MONITORING_PACKAGES.md for re-implementation guide */
                /* [/AI] */
            },
        },
        {
            id: 'quick-strategy',
            icon: <IconBolt />,
            content: <Localize i18n_default_text='Quick Strategy' />,
            description: <Localize i18n_default_text='Start fast with a pre-built strategy template' />,
            accent: 'amber',
            callback: () => {
                setActiveTab(DBOT_TABS.BOT_BUILDER);
                setFormVisibility(true);
                /* [AI] - Analytics event tracking removed - see migrate-docs/MONITORING_PACKAGES.md for re-implementation guide */
                /* [/AI] */
            },
        },
        {
            id: 'google-drive',
            icon: <DerivLightGoogleDriveIcon height='48px' width='48px' />,
            content: <Localize i18n_default_text='Google Drive' />,
            description: <Localize i18n_default_text='Import a bot saved in Google Drive' />,
            accent: 'blue',
            callback: () => {
                openGoogleDriveDialog();
                /* [AI] - Analytics event tracking removed - see migrate-docs/MONITORING_PACKAGES.md for re-implementation guide */
                /* [/AI] */
            },
        },
    ]
        // Hide the Google Drive tile when the feature isn't configured (no GD_* env vars).
        .filter(action => action.id !== 'google-drive' || is_google_drive_configured);

    return React.useMemo(
        () => (
            <div
                className={classNames('tab__dashboard__table', {
                    'tab__dashboard__table--minimized': has_dashboard_strategies && is_mobile,
                })}
            >
                <div
                    className={classNames('tab__dashboard__table__tiles', {
                        'tab__dashboard__table__tiles--minimized': has_dashboard_strategies && is_mobile,
                    })}
                    id='tab__dashboard__table__tiles'
                >
                    {actions.map(icons => {
                        const { icon, content, description, accent, callback, id } = icons;
                        return (
                            <div
                                key={id}
                                className={classNames('tab__dashboard__table__block', `vx-card--${accent}`, {
                                    'tab__dashboard__table__block--minimized': has_dashboard_strategies && is_mobile,
                                })}
                                onClick={() => callback()}
                            >
                                <div
                                    className={classNames('tab__dashboard__table__images', {
                                        'tab__dashboard__table__images--minimized': has_dashboard_strategies,
                                    })}
                                    width='8rem'
                                    height='8rem'
                                    icon={icon}
                                    id={id}
                                >
                                    {icon}
                                </div>
                                <Text color='prominent' weight='bold' size={is_mobile ? 'xxs' : 'xs'} className='vx-card__title'>
                                    {content}
                                </Text>
                                <Text color='less-prominent' size='xxxs' className='vx-card__desc'>
                                    {description}
                                </Text>
                                <Text size='xxxs' weight='bold' className='vx-card__open'>
                                    <Localize i18n_default_text='Open' /> &rarr;
                                </Text>
                            </div>
                        );
                    })}

                    {!isDesktop ? (
                        <Dialog
                            title={dialog_options.title}
                            is_visible={is_dialog_open}
                            onCancel={onCloseDialog}
                            is_mobile_full_width
                            className='dc-dialog__wrapper--google-drive'
                            has_close_icon
                        >
                            <GoogleDrive />
                        </Dialog>
                    ) : (
                        <MobileFullPageModal
                            is_modal_open={is_dialog_open}
                            className='load-strategy__wrapper'
                            header={localize('Load strategy')}
                            onClickClose={() => {
                                setPreviewOnPopup(false);
                                onCloseDialog();
                            }}
                            height_offset='80px'
                        >
                            <div label='Google Drive' className='google-drive-label'>
                                <GoogleDrive />
                            </div>
                        </MobileFullPageModal>
                    )}
                </div>
                <DashboardBotList />
            </div>
        ),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [is_dialog_open, has_dashboard_strategies, is_google_drive_configured]
    );
});

export default Cards;
