import { useNavigate } from 'react-router-dom';
import './welcome-screen.scss';

const TESTIMONIALS = [
    {
        initials: 'KM',
        quote: 'The Digit Analysis tool reads the market for me before I even build a strategy. Genuinely useful, not just decoration.',
        name: 'Kelvin M.',
        role: 'Volatility Trader',
    },
    {
        initials: 'DG',
        quote: 'Fast execution, and the risk calculator keeps me from oversizing a trade when I get impatient.',
        name: 'Delvoux G.',
        role: 'Forex Specialist',
    },
    {
        initials: 'AK',
        quote: 'Built my own strategy in Bot Builder, no code. Backtests matched live results closely.',
        name: 'Aisha K.',
        role: 'Algorithmic Trader',
    },
];

const WelcomeScreen = () => {
    const navigate = useNavigate();

    return (
        <div className='vx-welcome'>
            <div className='vx-welcome__topbar'>
                <div className='vx-welcome__logo'>
                    <div className='vx-welcome__logo-mark'>V</div>
                    <span>Vexora</span>
                </div>
            </div>

            <div className='vx-welcome__hero'>
                <div className='vx-welcome__badge'>⚡ Trusted by traders worldwide</div>
                <h1>
                    Welcome to <span>Vexora</span>
                </h1>
                <p>Your all-in-one workspace for automated trading, smart bots, and real-time market insights.</p>
                <button className='vx-welcome__cta' onClick={() => navigate('/dashboard')}>
                    Start Trading Now <span>→</span>
                </button>
                <div className='vx-welcome__trust-row'>
                    <span>✓ No credit card required</span>
                    <span>✓ Free demo account</span>
                </div>
            </div>

            <div className='vx-welcome__testimonials'>
                {TESTIMONIALS.map(t => (
                    <div className='vx-welcome__card' key={t.initials}>
                        <div className='vx-welcome__avatar'>{t.initials}</div>
                        <p>&ldquo;{t.quote}&rdquo;</p>
                        <div className='vx-welcome__name'>{t.name}</div>
                        <div className='vx-welcome__role'>{t.role}</div>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default WelcomeScreen;
