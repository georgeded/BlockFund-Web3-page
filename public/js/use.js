const ARROW = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M7 17L17 7M8 7h9v9"/></svg>';

function renderUsePage() {
    const status = document.getElementById('useStatus');
    const run = (fn, done) => async () => {
        status.className = 'form-error center';
        status.textContent = '';
        try {
            if ((await fn()) !== false) {
                status.className = 'form-error center ok';
                status.textContent = done;
            }
        } catch (err) {
            status.textContent = err.code === 4001 ? 'Request rejected in your wallet.' : err.message || String(err);
        }
    };

    document.getElementById('addNetwork').addEventListener('click', run(addBaseSepolia, 'Base Sepolia is added and selected in your wallet.'));
    document.getElementById('addToken').addEventListener('click', run(watchBF, 'BF added to your wallet.'));
    const copy = document.getElementById('copyToken');
    if (BLOCKFUND.deployed) copy.dataset.copy = BLOCKFUND.bfToken;
    else copy.disabled = true;

    document.getElementById('faucetList').innerHTML = BLOCKFUND.faucets.map(f => `
        <a class="card faucet reveal in" href="${f.url}" target="_blank" rel="noopener">
            <div><h3>${f.name}</h3><p>${f.note}</p></div>${ARROW}
        </a>`).join('');

    const rows = [
        ['Network name', BLOCKFUND.chainName],
        ['Chain ID', BLOCKFUND.chainId],
        ['RPC URL', BLOCKFUND.rpcUrl],
        ['Currency', 'ETH'],
        ['Explorer', BLOCKFUND.explorer],
        ['BF token', BLOCKFUND.bfToken || 'not deployed yet'],
    ];
    document.getElementById('networkDetails').innerHTML = rows.map(([k, v]) =>
        `<dt>${k}</dt><dd>${v}</dd><span>${String(v).startsWith('0x') || String(v).startsWith('http')
            ? `<button class="link-btn" data-copy="${v}">Copy</button>` : ''}</span>`).join('');
}

renderUsePage();
