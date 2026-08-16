import React from 'react';

type TState = { hasError: boolean };
type TProps = { children: React.ReactNode; label: string };

// Local error boundary for individual Vexora tabs (Market Analysis, Free Bots,
// Risk Calculator). If one of these crashes, it shows an inline retry instead
// of taking down the whole app — the original global ErrorBoundary was doing
// that before, which is why a bug in one new tab blanked everything.
class VxTabBoundary extends React.Component<TProps, TState> {
    constructor(props: TProps) {
        super(props);
        this.state = { hasError: false };
    }

    static getDerivedStateFromError() {
        return { hasError: true };
    }

    componentDidCatch(error: unknown) {
        // eslint-disable-next-line no-console
        console.error(`Vexora tab "${this.props.label}" crashed:`, error);
    }

    handleRetry = () => this.setState({ hasError: false });

    render() {
        if (this.state.hasError) {
            return (
                <div style={{ padding: 40, textAlign: 'center' }}>
                    <p style={{ marginBottom: 16, color: '#b7b6bc' }}>
                        Something went wrong loading {this.props.label}. This is isolated to this tab — the rest of
                        the app is unaffected.
                    </p>
                    <button
                        type='button'
                        onClick={this.handleRetry}
                        style={{
                            padding: '10px 20px',
                            borderRadius: 10,
                            background: '#ff6b00',
                            color: '#fff',
                            border: 'none',
                            fontWeight: 700,
                            cursor: 'pointer',
                        }}
                    >
                        Try again
                    </button>
                </div>
            );
        }
        return this.props.children;
    }
}

export default VxTabBoundary;
