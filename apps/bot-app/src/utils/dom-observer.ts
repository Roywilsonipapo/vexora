export const waitForDomElement = (selector: string, observingParent?: Element) => {
    return new Promise(resolve => {
        if (document.querySelector(selector)) {
            resolve(document.querySelector(selector));
            return;
        }

        const observer = new MutationObserver(() => {
            if (document.querySelector(selector)) {
                resolve(document.querySelector(selector));
                observer.disconnect();
            }
        });

        observer.observe(observingParent ?? document.body, {
            childList: true,
            subtree: true,
        });
    });
};

// Polls for window.Blockly.derivWorkspace to exist, since the Bot Builder tab
// mounts and injects Blockly asynchronously after setActiveTab fires. Loading a
// strategy before this resolves silently no-ops (nothing to inject blocks into).
// Times out after ~8s so a genuinely failed page doesn't hang the caller forever.
export const waitForDerivWorkspace = (timeout_ms = 8000): Promise<boolean> => {
    return new Promise(resolve => {
        const started = Date.now();
        const check = () => {
            if ((window as any)?.Blockly?.derivWorkspace) {
                resolve(true);
                return;
            }
            if (Date.now() - started > timeout_ms) {
                resolve(false);
                return;
            }
            requestAnimationFrame(check);
        };
        check();
    });
};
