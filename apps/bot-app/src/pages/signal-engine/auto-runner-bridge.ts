import { DBOT_TABS } from '@/constants/bot-contents';
import { save_types } from '@/external/bot-skeleton/constants/save-type';
import { getAutoRunnerStore } from '@/pages/auto-runner/auto-runner-store';
import RootStore from '@/stores/root-store';
import { buildDigitsBotXml, buildForexBotXml, TFlatBotParams } from './bot-xml-builder';

/**
 * The actual "ML decides, Auto-Runner takes over" handoff: builds the flat
 * -stake bot for this one validated decision, loads it into Bot Builder the
 * same way pages/free-bots/load-strategy.ts does (poll for the real
 * workspace mount, then load_modal.loadStrategyToBuilder), and starts
 * Auto-Runner — which presses Run itself and owns every restart after that.
 *
 * This is a one-shot handoff, not a continuous bridge: Binary Scalper does
 * not keep feeding new decisions into a running Auto-Runner session. Once
 * this resolves, the caller disarms — Auto-Runner and the risk/restart
 * rules already built into it are what's actually managing the money from
 * this point on.
 */
export const handOffToAutoRunner = async (
    root_store: RootStore,
    market_type: 'forex' | 'digits',
    params: TFlatBotParams
): Promise<void> => {
    const xml = market_type === 'forex' ? buildForexBotXml(params) : buildDigitsBotXml(params);

    const { load_modal, dashboard } = root_store;
    if (!load_modal || !dashboard) throw new Error('Bot Builder is not ready.');

    dashboard.setActiveTab(DBOT_TABS.BOT_BUILDER);

    await new Promise<void>((resolve, reject) => {
        const start = Date.now();
        const check = () => {
            if ((window as unknown as { Blockly?: { derivWorkspace?: unknown } }).Blockly?.derivWorkspace) resolve();
            else if (Date.now() - start > 8000) reject(new Error('Bot Builder workspace did not mount.'));
            else setTimeout(check, 100);
        };
        check();
    });

    await load_modal.loadStrategyToBuilder(
        {
            id: 'binary-scalper-ml',
            name: 'Binary Scalper (ML decision)',
            save_type: save_types.UNSAVED,
            timestamp: Date.now(),
            xml,
        },
        true
    );

    getAutoRunnerStore(root_store).start();
};
