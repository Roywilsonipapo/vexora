import { useState } from 'react';
import { observer } from 'mobx-react-lite';
import { useStore } from '@/hooks/useStore';
import { getDemoMirrorStore, TMirrorLogKind } from './demo-mirror-store';
import './demo-mirror.scss';

const STATUS_LABEL: Record<string, string> = {
    idle: 'Off',
    connecting: 'Connecting…',
    armed: 'Armed',
    error: 'Error',
};

const LOG_GLYPH: Record<TMirrorLogKind, string> = {
    armed: '●',
    disarmed: '○',
    fired: '▲',
    skipped: '—',
    failed: '!',
    'auto-disarmed': '■',
};

/**
 * Compact bar at the top of Bot Builder — see demo-mirror-store.ts for the
 * full design rationale and safety rules. Kept slim on purpose: the
 * Blockly workspace below needs the vertical space, and this is a control,
 * not a dashboard.
 */
const DemoMirrorPanel = observer(() => {
    const root_store = useStore();
    const store = getDemoMirrorStore(root_store);

    const [stakeCapInput, setStakeCapInput] = useState(store.stake_cap ? String(store.stake_cap) : '');
    const [showConfirm, setShowConfirm] = useState(false);
    const [showLog, setShowLog] = useState(false);

    if (!store.can_arm) {
        return (
            <div className='vx-mirror vx-mirror--unavailable'>
                <span>Mirror to real: needs both a demo and a real account on this login.</span>
            </div>
        );
    }

    const cap = Math.max(0, parseFloat(stakeCapInput) || 0);

    const handleArmClick = () => {
        if (!(cap > 0)) return;
        setShowConfirm(true);
    };

    const confirmArm = () => {
        setShowConfirm(false);
        store.arm(cap);
    };

    return (
        <div className='vx-mirror'>
            <div className='vx-mirror__row'>
                <span className={`vx-mirror__status vx-mirror__status--${store.status}`}>
                    <span className='vx-mirror__status-dot' />
                    Mirror to real: {STATUS_LABEL[store.status]}
                </span>

                {!store.is_armed && store.status !== 'connecting' && (
                    <>
                        <label className='vx-mirror__cap'>
                            <span>Stake cap</span>
                            <input
                                type='number'
                                min='0'
                                step='0.01'
                                placeholder='e.g. 1.00'
                                value={stakeCapInput}
                                onChange={e => setStakeCapInput(e.target.value)}
                            />
                        </label>
                        <button type='button' className='vx-mirror__arm' onClick={handleArmClick} disabled={!(cap > 0)}>
                            Arm
                        </button>
                    </>
                )}

                {store.is_armed && (
                    <>
                        <span className='vx-mirror__cap-readout'>cap {store.stake_cap}</span>
                        <button type='button' className='vx-mirror__disarm' onClick={store.disarm}>
                            Disarm
                        </button>
                    </>
                )}

                <button type='button' className='vx-mirror__log-toggle' onClick={() => setShowLog(v => !v)}>
                    {showLog ? 'Hide log' : 'Log'}
                </button>
            </div>

            {showLog && (
                <ul className='vx-mirror__log'>
                    {store.log.length === 0 && <li className='vx-mirror__log-empty'>Nothing yet.</li>}
                    {store.log.map(entry => (
                        <li key={entry.id} className={`vx-mirror__log-item vx-mirror__log-item--${entry.kind}`}>
                            <span className='vx-mirror__log-glyph'>{LOG_GLYPH[entry.kind]}</span>
                            <span className='vx-mirror__log-text'>{entry.text}</span>
                            <span className='vx-mirror__log-time'>
                                {new Date(entry.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                        </li>
                    ))}
                </ul>
            )}

            {showConfirm && (
                <div className='vx-mirror__confirm'>
                    <div className='vx-mirror__confirm-card'>
                        <h4>Arm the real-money mirror?</h4>
                        <p>
                            Every demo trade up to <strong>{cap}</strong> will also buy on your real account (
                            {store.real_account_id}) at the same time. Trades above the cap are skipped, not
                            resized. This uses real money.
                        </p>
                        <div className='vx-mirror__confirm-actions'>
                            <button type='button' onClick={() => setShowConfirm(false)}>
                                Cancel
                            </button>
                            <button type='button' className='vx-mirror__confirm-yes' onClick={confirmArm}>
                                Arm it
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
});

export default DemoMirrorPanel;
