import { useState } from 'react';
import './vx-digits-embed.scss';

/**
 * Embeds the REAL, live Digits Analysis panel from the separately-deployed
 * digits-app (via its ?embed=1 mode, which strips its own header/footer/
 * login chrome — see digits-app/app/page.tsx + components/digits-view.tsx).
 *
 * This replaces the old in-house "Market Analysis" tab, which computed its
 * own (inaccurate) stats independently. This iframe shows the actual same
 * analysis surface that's live on the real Digits app — same data, same
 * numbers, no duplicate/divergent logic to maintain.
 */
const DIGITS_EMBED_URL = 'https://vexora-digits.vercel.app/?embed=1';

const VxDigitsEmbed = () => {
    const [is_loaded, setIsLoaded] = useState(false);

    return (
        <div className='vx-digits-embed'>
            {!is_loaded && (
                <div className='vx-digits-embed__loading'>
                    <div className='vx-digits-embed__spinner' />
                    <p className='vx-digits-embed__label'>Loading analysis</p>
                    <p className='vx-digits-embed__sublabel'>Connecting to the live tick feed…</p>
                </div>
            )}
            <iframe
                className='vx-digits-embed__frame'
                src={DIGITS_EMBED_URL}
                title='Digits Analysis'
                onLoad={() => setIsLoaded(true)}
                style={{ opacity: is_loaded ? 1 : 0 }}
            />
        </div>
    );
};

export default VxDigitsEmbed;
