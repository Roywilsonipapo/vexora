/**
 * Writes a scan result into a strategy template.
 *
 * Loading a fixed template after a scan is close to useless — you get a bot for
 * the right *kind* of contract but the wrong market and barrier, and have to
 * retype both. This rewrites three things in the template XML so the loaded bot
 * is actually the signal that was found:
 *
 *   - SYMBOL_LIST   -> the scanned market
 *   - PURCHASE_LIST -> the observed direction (over/under, even/odd, match, rise/fall)
 *   - PREDICTION    -> the digit or barrier, for the contract types that take one
 *
 * Everything else in the template — stake, recovery, stop loss — is left alone.
 * The trade type is NOT touched: templates are chosen per strategy so the
 * category already matches, and rewriting it risks producing a contract the
 * market does not offer.
 *
 * Returns the mutated XML string, or the original if it can't be parsed. A
 * template that loads with the wrong market is bad; one that fails to load at
 * all is worse.
 */
export const applySignalToXml = (
    xml: string,
    signal: { purchase: string; prediction?: number },
    symbol: string
): string => {
    try {
        const doc = new DOMParser().parseFromString(xml, 'text/xml');
        if (doc.querySelector('parsererror')) return xml;

        const setField = (name: string, value: string) => {
            doc.querySelectorAll(`field[name="${name}"]`).forEach(el => {
                el.textContent = value;
            });
        };

        setField('SYMBOL_LIST', symbol);
        setField('PURCHASE_LIST', signal.purchase);

        if (typeof signal.prediction === 'number') {
            const value = String(signal.prediction);
            // Scope to the PREDICTION input only — a blanket NUM rewrite would
            // also clobber stake and duration.
            const pred = doc.querySelector('value[name="PREDICTION"]');

            // A PREDICTION input can hold a shadow AND a real block. When a
            // variables_get is present it WINS over the shadow, so writing the
            // shadow alone leaves the bot trading the variable's value while
            // the XML looks correct. Follow the variable to its initialiser and
            // set that instead — this is where the barrier really lives.
            const var_ref = pred?.querySelector('block[type="variables_get"] field[name="VAR"]');
            const var_id = var_ref?.getAttribute('id');

            if (var_id) {
                doc.querySelectorAll(`block[type="variables_set"] > field[name="VAR"]`).forEach(field => {
                    if (field.getAttribute('id') !== var_id) return;
                    const setter = field.parentElement;
                    setter
                        ?.querySelector('value[name="VALUE"] field[name="NUM"]')
                        ?.replaceChildren(doc.createTextNode(value));
                });
            }

            // Also set the shadow, so templates without the variable indirection
            // still get the right barrier.
            pred?.querySelectorAll(':scope > shadow > field[name="NUM"]').forEach(el => {
                el.textContent = value;
            });
        }

        return new XMLSerializer().serializeToString(doc);
    } catch {
        return xml;
    }
};

export default applySignalToXml;
