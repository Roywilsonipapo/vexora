/**
 * Auto-Runner sound engine.
 *
 * Synthesized with the Web Audio API — deliberately not a sample of any real
 * airline's chime. Those are copyrighted and unavailable to ship in this app;
 * this instead composes small original bell/chime motifs in the same
 * register (soft sine/triangle tones, a few stacked harmonics, a gentle
 * reverb-like tail) that read as "premium cabin announcement" without being
 * a copy of one.
 *
 * One shared AudioContext, created lazily on first use since browsers block
 * audio until a user gesture — the Auto-Runner's own Start button click is
 * that gesture.
 */

let ctx: AudioContext | null = null;

const getCtx = (): AudioContext | null => {
    if (typeof window === 'undefined') return null;
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    if (!ctx || ctx.state === 'closed') ctx = new AC();
    if (ctx.state === 'suspended') ctx.resume().catch(() => undefined);
    return ctx;
};

type TTone = { freq: number; start: number; duration: number; gain?: number; type?: OscillatorType };

const playTones = (tones: TTone[]) => {
    const audio = getCtx();
    if (!audio) return;
    const master = audio.createGain();
    master.gain.value = 0.32;
    master.connect(audio.destination);

    tones.forEach(({ freq, start, duration, gain = 0.5, type = 'sine' }) => {
        const osc = audio.createOscillator();
        const env = audio.createGain();
        osc.type = type;
        osc.frequency.value = freq;

        const t0 = audio.currentTime + start;
        const t1 = t0 + duration;

        // Soft attack, gentle decay tail — this is what makes a synthesized
        // tone read as a "chime" instead of a beep.
        env.gain.setValueAtTime(0, t0);
        env.gain.linearRampToValueAtTime(gain, t0 + Math.min(0.04, duration * 0.3));
        env.gain.exponentialRampToValueAtTime(0.001, t1);

        osc.connect(env);
        env.connect(master);
        osc.start(t0);
        osc.stop(t1 + 0.05);
    });
};

// A bright two-note "ding-dong" ascending major interval — the universal
// shape of a cabin chime — followed by a soft resolving third note.
const CHIME_PROFIT: TTone[] = [
    { freq: 987.77, start: 0, duration: 0.55, gain: 0.5, type: 'sine' }, // B5
    { freq: 1318.51, start: 0.16, duration: 0.6, gain: 0.45, type: 'sine' }, // E6
    { freq: 1567.98, start: 0.34, duration: 0.7, gain: 0.4, type: 'triangle' }, // G6
    // Harmonic shimmer layer, quieter, an octave up.
    { freq: 1975.53, start: 0.34, duration: 0.5, gain: 0.12, type: 'sine' },
];

// A softer, descending minor shape — still a chime, but reads as "gentle
// notice" rather than celebration, for a loss-restart announcement.
const CHIME_LOSS: TTone[] = [
    { freq: 880, start: 0, duration: 0.5, gain: 0.4, type: 'sine' }, // A5
    { freq: 698.46, start: 0.18, duration: 0.65, gain: 0.4, type: 'sine' }, // F5
];

// A fuller three-note fanfare for hitting the daily profit target — the
// biggest moment, so it gets the richest chord.
const CHIME_TARGET: TTone[] = [
    { freq: 783.99, start: 0, duration: 0.4, gain: 0.45, type: 'sine' }, // G5
    { freq: 987.77, start: 0.14, duration: 0.4, gain: 0.45, type: 'sine' }, // B5
    { freq: 1174.66, start: 0.28, duration: 0.4, gain: 0.45, type: 'sine' }, // D6
    { freq: 1567.98, start: 0.44, duration: 0.9, gain: 0.5, type: 'triangle' }, // G6
    { freq: 2349.32, start: 0.44, duration: 0.7, gain: 0.15, type: 'sine' }, // shimmer
];

// A low, unambiguous double-tone for the daily loss limit — deliberately
// not alarming, just clearly "this is the stop."
const CHIME_STOP: TTone[] = [
    { freq: 587.33, start: 0, duration: 0.45, gain: 0.42, type: 'sine' }, // D5
    { freq: 440, start: 0.22, duration: 0.7, gain: 0.42, type: 'sine' }, // A4
];

// A short single rising tone for "engine armed / starting."
const CHIME_START: TTone[] = [
    { freq: 659.25, start: 0, duration: 0.22, gain: 0.35, type: 'sine' },
    { freq: 987.77, start: 0.1, duration: 0.35, gain: 0.35, type: 'sine' },
];

export const playProfitChime = () => playTones(CHIME_PROFIT);
export const playLossChime = () => playTones(CHIME_LOSS);
export const playTargetChime = () => playTones(CHIME_TARGET);
export const playStopChime = () => playTones(CHIME_STOP);
export const playStartChime = () => playTones(CHIME_START);

/** Unlocks the AudioContext on a real user gesture, so later programmatic
 *  chimes (fired from a mobx reaction, not a click) aren't silently blocked
 *  by the browser's autoplay policy. Call this from the Start button handler. */
export const primeAudio = () => {
    const audio = getCtx();
    if (audio?.state === 'suspended') audio.resume().catch(() => undefined);
};
