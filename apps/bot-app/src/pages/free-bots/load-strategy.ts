import { DBOT_TABS } from '@/constants/bot-contents';
import { save_types } from '@/external/bot-skeleton/constants/save-type';

/**
 * Loads a strategy XML from /free-bots into the real Bot Builder workspace.
 *
 * Shared by the Free Bots page and the Signal Scanner results table so there is
 * exactly one copy of the workspace-mount wait below. That wait is the whole
 * point of this helper: switching tabs does not synchronously mount Blockly, and
 * loading into it too early is what caused the old "bot loads into a hidden
 * preview" bug. Poll for the real workspace instead of guessing with a timeout.
 *
 * Throws on failure; callers own the error UI.
 */
export const loadStrategyIntoBuilder = async (
    file: string,
    name: string,
    stores: { load_modal?: any; dashboard?: any }
): Promise<void> => {
    const { load_modal, dashboard } = stores;

    const response = await fetch(`/free-bots/${file}`);
    if (!response.ok) throw new Error('fetch failed');
    const xml = await response.text();

    if (!load_modal || !dashboard) throw new Error('store not ready');

    dashboard.setActiveTab(DBOT_TABS.BOT_BUILDER);

    await new Promise<void>((resolve, reject) => {
        const start = Date.now();
        const check = () => {
            if (window.Blockly?.derivWorkspace) resolve();
            else if (Date.now() - start > 8000) reject(new Error('workspace did not mount'));
            else setTimeout(check, 100);
        };
        check();
    });

    await load_modal.loadStrategyToBuilder(
        { id: file, name, save_type: save_types.UNSAVED, timestamp: Date.now(), xml },
        true
    );
};
