import { useState } from 'react';
import './vx-name-prompt.scss';

type TVxNamePrompt = {
    onSave: (name: string) => void;
    onSkip: () => void;
};

/**
 * One-time "what should we call you" prompt — replaces the loginid-based
 * dashboard greeting. See hooks/useDisplayName.ts for why this asks instead
 * of reading a real name from the account.
 */
const VxNamePrompt = ({ onSave, onSkip }: TVxNamePrompt) => {
    const [value, setValue] = useState('');

    const submit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!value.trim()) return;
        onSave(value);
    };

    return (
        <div className='vx-name-prompt'>
            <form className='vx-name-prompt__card' onSubmit={submit}>
                <h3>What should we call you?</h3>
                <p>Vexora will greet you by this name instead of your account ID. Asked once — you can change it later in Settings.</p>
                <input
                    type='text'
                    autoFocus
                    maxLength={40}
                    placeholder='Your name'
                    value={value}
                    onChange={e => setValue(e.target.value)}
                />
                <div className='vx-name-prompt__actions'>
                    <button type='button' className='vx-name-prompt__skip' onClick={onSkip}>
                        Not now
                    </button>
                    <button type='submit' className='vx-name-prompt__save' disabled={!value.trim()}>
                        Save
                    </button>
                </div>
            </form>
        </div>
    );
};

export default VxNamePrompt;
