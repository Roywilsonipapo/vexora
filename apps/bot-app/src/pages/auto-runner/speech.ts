/**
 * Auto-Runner voice announcer — Web Speech API.
 *
 * Picks randomly from a small pool per event type so a long session doesn't
 * repeat the exact same line every cycle. Falls back silently (no throw,
 * no console noise) on browsers/devices without SpeechSynthesis — this is a
 * nice-to-have layer on top of the sound + on-screen log, never a dependency.
 */

const PROFIT_LINES = [
    (amount: string) => `Profit reached. Plus ${amount}. Resetting and running again.`,
    (amount: string) => `Target hit on this run, plus ${amount}. Resetting the panel and starting the next run.`,
    (amount: string) => `Nice one. Plus ${amount} this run. Resetting, then running again.`,
];

const LOSS_LINES = [
    (amount: string) => `Run closed, minus ${amount}. Resetting and running again.`,
    (amount: string) => `This run ended down ${amount}. Resetting the panel and starting the next run.`,
    (amount: string) => `Minus ${amount} on that run. Resetting, then running again.`,
];

const DAILY_TARGET_LINES = [
    (total: string) => `Daily profit target reached. Total for today, plus ${total}. Stopping for the day.`,
    (total: string) => `That's the daily target. Today's total is plus ${total}. Auto-Runner is stopping now.`,
];

const DAILY_LOSS_LINES = [
    (total: string) => `Daily loss limit reached. Total for today, minus ${total}. Stopping for the day.`,
    (total: string) => `That's the daily loss limit. Today's total is minus ${total}. Auto-Runner is stopping now.`,
];

const START_LINES = [
    'Auto-Runner armed. Starting the first run.',
    'Auto-Runner is live. Pressing run now.',
];

const STOPPED_MANUAL_LINE = 'Auto-Runner stopped.';

const pick = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

let voice: SpeechSynthesisVoice | null = null;
let voices_loaded = false;

const pickVoice = () => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return null;
    const list = window.speechSynthesis.getVoices();
    if (!list.length) return null;
    voices_loaded = true;
    // Prefer a natural-sounding English voice if one is installed; otherwise
    // let the browser use its default.
    return (
        list.find(v => /en-(US|GB|AU)/i.test(v.lang) && /Natural|Neural|Premium/i.test(v.name)) ||
        list.find(v => /en-(US|GB|AU)/i.test(v.lang)) ||
        list[0]
    );
};

if (typeof window !== 'undefined' && window.speechSynthesis) {
    window.speechSynthesis.onvoiceschanged = () => {
        voice = pickVoice();
    };
}

const speak = (text: string) => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;
    try {
        if (!voices_loaded) voice = pickVoice();
        window.speechSynthesis.cancel(); // don't stack overlapping announcements
        const utter = new SpeechSynthesisUtterance(text);
        utter.rate = 0.98;
        utter.pitch = 1.02;
        utter.volume = 1;
        if (voice) utter.voice = voice;
        window.speechSynthesis.speak(utter);
    } catch {
        // Speech synthesis can throw on some locked-down mobile browsers —
        // the sound chime and on-screen log already carry the message.
    }
};

const fmt = (n: number) => Math.abs(n).toFixed(2);

export const announceCycleProfit = (amount: number, currency: string) => speak(pick(PROFIT_LINES)(`${fmt(amount)} ${currency}`));
export const announceCycleLoss = (amount: number, currency: string) => speak(pick(LOSS_LINES)(`${fmt(amount)} ${currency}`));
export const announceDailyTarget = (total: number, currency: string) =>
    speak(pick(DAILY_TARGET_LINES)(`${fmt(total)} ${currency}`));
export const announceDailyLoss = (total: number, currency: string) =>
    speak(pick(DAILY_LOSS_LINES)(`${fmt(total)} ${currency}`));
export const announceStart = () => speak(pick(START_LINES));
export const announceManualStop = () => speak(STOPPED_MANUAL_LINE);

export const cancelSpeech = () => {
    if (typeof window !== 'undefined' && window.speechSynthesis) {
        try {
            window.speechSynthesis.cancel();
        } catch {
            /* nothing to cancel */
        }
    }
};
