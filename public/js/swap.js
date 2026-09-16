// Swap page: reads use the public RPC, transactions go through the selected wallet.

const NATIVE = '0x0000000000000000000000000000000000000000';
const SLIPPAGE_BPS = 50n; // 0.5%

const SWAP_ABI = [
    'function supportedTokens() view returns (address[] tokens, uint256[] rates)',
    'function reserve(address token) view returns (uint256)',
    'function faucetAmount() view returns (uint256)',
    'function faucetCooldown() view returns (uint256)',
    'function nextClaimAt(address user) view returns (uint256)',
    'function buy(address tokenIn, uint256 amountIn, uint256 minBfOut) payable returns (uint256)',
    'function sell(address tokenOut, uint256 bfIn, uint256 minOut) returns (uint256)',
    'function claim()',
];
const ERC20_ABI = [
    'function balanceOf(address) view returns (uint256)',
    'function allowance(address owner, address spender) view returns (uint256)',
    'function approve(address spender, uint256 value) returns (bool)',
    'function symbol() view returns (string)',
    'function decimals() view returns (uint8)',
];

const TOKEN_COLORS = { ETH: '#627eea', WETH: '#8a6cf0', USDC: '#2775ca' };
const BF = { address: BLOCKFUND.bfToken, symbol: 'BF', decimals: 18 };

// Same rate format as the contract: BF per 1e18 base units of the pay token.
const toRate = (bfPerToken, decimals) => (BigInt(bfPerToken) * 10n ** 36n) / 10n ** BigInt(decimals);
const PREVIEW_TOKENS = [
    { address: NATIVE, symbol: 'ETH', decimals: 18, rate: toRate(10000, 18) },
    { address: '0x4200000000000000000000000000000000000006', symbol: 'WETH', decimals: 18, rate: toRate(10000, 18) },
    { address: '0x036CbD53842c5426634e7929541eC2318f3dCF7e', symbol: 'USDC', decimals: 6, rate: toRate(5, 6) },
];

const state = {
    mode: 'buy',
    tokens: [],
    selected: 0,
    account: null,
    chainOk: false,
    balances: {},
    reserves: {},
    faucetAmount: 25n * 10n ** 18n,
    faucetCooldown: 86400n,
    nextClaim: 0n,
    busy: false,
};

const el = id => document.getElementById(id);
const reader = new ethers.JsonRpcProvider(BLOCKFUND.rpcUrl, BLOCKFUND.chainId, { staticNetwork: true });
const swapRead = BLOCKFUND.deployed ? new ethers.Contract(BLOCKFUND.swap, SWAP_ABI, reader) : null;
const erc20 = (address, runner = reader) => new ethers.Contract(address, ERC20_ABI, runner);

function fmt(value, decimals, maxFrac = 6) {
    const [i, f = ''] = ethers.formatUnits(value, decimals).split('.');
    const frac = f.slice(0, maxFrac).replace(/0+$/, '');
    return Number(i).toLocaleString('en-US') + (frac ? '.' + frac : '');
}

function parseAmount(text, decimals) {
    const clean = (text || '').trim();
    if (!clean || !/^\d*\.?\d*$/.test(clean)) return 0n;
    const [i, f = ''] = clean.split('.');
    try {
        return ethers.parseUnits(`${i || '0'}.${f.slice(0, decimals) || '0'}`, decimals);
    } catch {
        return 0n;
    }
}

function tokenIcon(symbol) {
    const bg = symbol === 'BF'
        ? 'linear-gradient(135deg, var(--accent), var(--accent-3))'
        : TOKEN_COLORS[symbol] || 'var(--text-3)';
    return `<span class="token-icon" style="background:${bg}">${symbol.slice(0, 4)}</span>`;
}

const payToken = () => (state.mode === 'buy' ? state.tokens[state.selected] : BF);
const receiveToken = () => (state.mode === 'buy' ? BF : state.tokens[state.selected]);

function quote(amountIn) {
    const t = state.tokens[state.selected];
    if (!t || amountIn === 0n) return 0n;
    return state.mode === 'buy' ? (amountIn * t.rate) / 10n ** 18n : (amountIn * 10n ** 18n) / t.rate;
}

function setStatus(html, kind = '') {
    const s = el('swapStatus');
    s.className = `swap-status ${kind}`;
    s.innerHTML = html;
}

function txLink(hash) {
    return `<a href="${BLOCKFUND.explorer}/tx/${hash}" target="_blank" rel="noopener">View transaction</a>`;
}

function errorMessage(err) {
    if (err?.code === 'ACTION_REJECTED' || err?.code === 4001) return 'Transaction rejected in wallet.';
    const reason = err?.reason || err?.shortMessage || err?.info?.error?.message || err?.message || String(err);
    return reason.replace(/^execution reverted:?\s*/i, '').replace(/^Swap:\s*/, '');
}

async function loadMarket() {
    if (!swapRead) {
        state.tokens = PREVIEW_TOKENS;
        return;
    }
    const [[addresses, rates], faucetAmount, faucetCooldown] = await Promise.all([
        swapRead.supportedTokens(),
        swapRead.faucetAmount(),
        swapRead.faucetCooldown(),
    ]);
    state.faucetAmount = faucetAmount;
    state.faucetCooldown = faucetCooldown;
    state.tokens = await Promise.all(addresses.map(async (address, i) => {
        if (address === NATIVE) return { address, symbol: 'ETH', decimals: 18, rate: rates[i] };
        const t = erc20(address);
        const [symbol, decimals] = await Promise.all([t.symbol(), t.decimals()]);
        return { address, symbol, decimals: Number(decimals), rate: rates[i] };
    }));
    await loadReserves();
}

async function loadReserves() {
    if (!swapRead) return;
    const all = [...state.tokens, BF];
    const values = await Promise.all(all.map(t =>
        t === BF ? erc20(BF.address).balanceOf(BLOCKFUND.swap) : swapRead.reserve(t.address)));
    all.forEach((t, i) => (state.reserves[t.address] = values[i]));
}

async function loadAccount() {
    if (!state.account) return;
    const all = [...state.tokens, ...(BLOCKFUND.deployed ? [BF] : [])];
    const values = await Promise.all(all.map(t =>
        t.address === NATIVE ? reader.getBalance(state.account) : erc20(t.address).balanceOf(state.account)));
    all.forEach((t, i) => (state.balances[t.address] = values[i]));
    if (swapRead) state.nextClaim = await swapRead.nextClaimAt(state.account);
}

async function refresh() {
    try {
        await Promise.all([loadReserves(), loadAccount()]);
    } catch (err) {
        console.error('Refresh failed:', err);
    }
    render();
}

async function syncWallet() {
    if (!currentWallet()) return;
    const [accounts, chainId] = await Promise.all([
        walletProvider().request({ method: 'eth_accounts' }),
        walletProvider().request({ method: 'eth_chainId' }),
    ]);
    state.account = accounts[0] ? ethers.getAddress(accounts[0]) : null;
    state.chainOk = parseInt(chainId, 16) === BLOCKFUND.chainId;
    state.balances = {};
    await refresh();
}

async function signer() {
    return new ethers.BrowserProvider(walletProvider()).getSigner();
}

async function ensureAllowance(token, amount) {
    const s = await signer();
    const allowance = await erc20(token.address).allowance(state.account, BLOCKFUND.swap);
    if (allowance >= amount) return;
    setStatus(`Approve ${token.symbol} in your wallet...`);
    const tx = await erc20(token.address, s).approve(BLOCKFUND.swap, amount);
    setStatus(`Approving ${token.symbol}... ${txLink(tx.hash)}`);
    await tx.wait();
}

async function executeSwap() {
    const pay = payToken();
    const receive = receiveToken();
    const amountIn = parseAmount(el('payAmount').value, pay.decimals);
    const out = quote(amountIn);
    const minOut = out - (out * SLIPPAGE_BPS) / 10000n;
    const swap = new ethers.Contract(BLOCKFUND.swap, SWAP_ABI, await signer());

    if (pay.address !== NATIVE) await ensureAllowance(pay, amountIn);

    setStatus('Confirm the swap in your wallet...');
    const tx = state.mode === 'buy'
        ? await swap.buy(pay.address, amountIn, minOut, { value: pay.address === NATIVE ? amountIn : 0n })
        : await swap.sell(receive.address, amountIn, minOut);
    setStatus(`Swapping... ${txLink(tx.hash)}`);
    await tx.wait();
    setStatus(`Swapped ${fmt(amountIn, pay.decimals)} ${pay.symbol} for ${fmt(out, receive.decimals)} ${receive.symbol}. ${txLink(tx.hash)}`, 'ok');
    el('payAmount').value = '';
}

async function onAction() {
    if (state.busy) return;
    state.busy = true;
    render();
    try {
        if (!currentWallet()) {
            // The login dialog lists install links, or wallet apps to open on phones.
            document.getElementById('loginModal').showModal();
        } else if (!state.account) {
            await walletProvider().request({ method: 'eth_requestAccounts' });
        } else if (!state.chainOk) {
            await addBaseSepolia();
        } else {
            await executeSwap();
        }
    } catch (err) {
        console.error(err);
        setStatus(errorMessage(err), 'error');
    } finally {
        state.busy = false;
        await syncWallet();
    }
}

async function onClaim() {
    if (state.busy) return;
    state.busy = true;
    render();
    try {
        if (!currentWallet()) document.getElementById('loginModal').showModal();
        else if (!state.account) await walletProvider().request({ method: 'eth_requestAccounts' });
        else if (!state.chainOk) await addBaseSepolia();
        else {
            const swap = new ethers.Contract(BLOCKFUND.swap, SWAP_ABI, await signer());
            setStatus('Confirm the claim in your wallet...');
            const tx = await swap.claim();
            setStatus(`Claiming... ${txLink(tx.hash)}`);
            await tx.wait();
            setStatus(`Claimed ${fmt(state.faucetAmount, 18)} BF. ${txLink(tx.hash)}`, 'ok');
        }
    } catch (err) {
        console.error(err);
        setStatus(errorMessage(err), 'error');
    } finally {
        state.busy = false;
        await syncWallet();
    }
}

function tokenSelectHtml() {
    const t = state.tokens[state.selected];
    if (!t) return '';
    return `<div class="token-select">${tokenIcon(t.symbol)}
        <select id="tokenSelect" aria-label="Token">${state.tokens.map((x, i) =>
            `<option value="${i}" ${i === state.selected ? 'selected' : ''}>${x.symbol}</option>`).join('')}
        </select></div>`;
}

function renderSlots() {
    const bfBadge = `<span class="token-badge">${tokenIcon('BF')}BF</span>`;
    el('paySlot').innerHTML = state.mode === 'buy' ? tokenSelectHtml() : bfBadge;
    el('receiveSlot').innerHTML = state.mode === 'buy' ? bfBadge : tokenSelectHtml();
    el('tokenSelect')?.addEventListener('change', e => {
        state.selected = Number(e.target.value);
        renderSlots();
        render();
    });
    document.querySelectorAll('.swap-tabs button').forEach(b =>
        b.setAttribute('aria-selected', String(b.dataset.mode === state.mode)));
}

function render() {
    const pay = payToken();
    const receive = receiveToken();
    if (!pay || !receive) return;

    const amountIn = parseAmount(el('payAmount').value, pay.decimals);
    const out = quote(amountIn);
    const payBal = state.balances[pay.address];
    const recvBal = state.balances[receive.address];
    const reserve = state.reserves[receive.address];
    const t = state.tokens[state.selected];

    el('receiveAmount').value = out > 0n ? fmt(out, receive.decimals) : '';
    el('payBalance').textContent = payBal !== undefined ? `Balance ${fmt(payBal, pay.decimals, 4)}` : '';
    el('receiveBalance').textContent = recvBal !== undefined ? `Balance ${fmt(recvBal, receive.decimals, 4)}` : '';
    el('maxBtn').hidden = payBal === undefined || payBal === 0n;
    el('payHint').textContent = pay.address === NATIVE ? 'Keep a little ETH for gas' : '';

    const bfPerToken = (t.rate * 10n ** BigInt(t.decimals)) / 10n ** 18n;
    el('rateText').textContent = `1 ${t.symbol} = ${fmt(bfPerToken, 18)} BF`;
    el('minText').textContent = out > 0n ? `${fmt(out - (out * SLIPPAGE_BPS) / 10000n, receive.decimals)} ${receive.symbol}` : '-';
    el('reserveText').textContent = reserve !== undefined ? `${fmt(reserve, receive.decimals, 2)} ${receive.symbol}` : '-';

    const badge = el('netBadge');
    badge.className = 'net-badge' + (state.account ? (state.chainOk ? ' ok' : ' bad') : '');
    badge.textContent = !state.account ? 'Not connected'
        : state.chainOk ? `${state.account.slice(0, 6)}...${state.account.slice(-4)}` : 'Wrong network';

    // Button shows the first unmet requirement.
    const btn = el('actionBtn');
    let label = 'Swap';
    let enabled = true;
    if (state.busy) [label, enabled] = ['Waiting for wallet...', false];
    else if (!currentWallet()) label = 'Install a wallet';
    else if (!state.account) label = 'Connect wallet';
    else if (!state.chainOk) label = 'Switch to Base Sepolia';
    else if (!BLOCKFUND.deployed) [label, enabled] = ['Swap not deployed yet', false];
    else if (amountIn === 0n) [label, enabled] = ['Enter an amount', false];
    else if (payBal !== undefined && amountIn > payBal) [label, enabled] = [`Insufficient ${pay.symbol} balance`, false];
    else if (out === 0n) [label, enabled] = ['Amount too small', false];
    else if (reserve !== undefined && out > reserve) [label, enabled] = ['Not enough liquidity', false];
    btn.textContent = label;
    btn.disabled = !enabled;

    renderFaucet();
}

function renderFaucet() {
    const hours = Number(state.faucetCooldown) / 3600;
    el('faucetCooldown').textContent = hours >= 1 ? `${+hours.toFixed(1)}h` : `${Number(state.faucetCooldown) / 60}m`;
    el('faucetAmount').textContent = `${fmt(state.faucetAmount, 18)} BF`;

    const btn = el('claimBtn');
    const wait = Number(state.nextClaim) - Math.floor(Date.now() / 1000);
    const bfReserve = state.reserves[BF.address];
    btn.disabled = state.busy || !BLOCKFUND.deployed;

    if (!BLOCKFUND.deployed) {
        el('faucetCountdown').textContent = 'Not deployed';
    } else if (!currentWallet() || !state.account) {
        el('faucetCountdown').textContent = 'Ready';
        btn.textContent = 'Connect to claim';
        btn.disabled = state.busy || !currentWallet();
    } else if (!state.chainOk) {
        el('faucetCountdown').textContent = 'Ready';
        btn.textContent = 'Switch to Base Sepolia';
    } else if (wait > 0) {
        const h = Math.floor(wait / 3600), m = Math.floor((wait % 3600) / 60), s = wait % 60;
        el('faucetCountdown').textContent = [h, m, s].map(n => String(n).padStart(2, '0')).join(':');
        btn.textContent = 'Claimed. Come back later';
        btn.disabled = true;
    } else if (bfReserve !== undefined && bfReserve < state.faucetAmount) {
        el('faucetCountdown').textContent = 'Empty';
        btn.textContent = 'Faucet is dry';
        btn.disabled = true;
    } else {
        el('faucetCountdown').textContent = 'Ready';
        btn.textContent = `Claim ${fmt(state.faucetAmount, 18)} BF`;
    }
}

function setMode(mode) {
    state.mode = mode;
    el('payAmount').value = '';
    setStatus('');
    renderSlots();
    render();
}

async function init() {
    el('notDeployed').hidden = BLOCKFUND.deployed;
    document.querySelectorAll('.swap-tabs button').forEach(b => b.addEventListener('click', () => setMode(b.dataset.mode)));
    el('flipBtn').addEventListener('click', () => setMode(state.mode === 'buy' ? 'sell' : 'buy'));
    el('payAmount').addEventListener('input', () => { setStatus(''); render(); });
    el('maxBtn').addEventListener('click', () => {
        const pay = payToken();
        el('payAmount').value = ethers.formatUnits(state.balances[pay.address] || 0n, pay.decimals);
        render();
    });
    el('actionBtn').addEventListener('click', onAction);
    el('claimBtn').addEventListener('click', onClaim);
    el('addTokenSide').addEventListener('click', async () => {
        const status = el('addTokenStatus');
        status.className = 'form-error small';
        status.textContent = '';
        try {
            if (await watchBF()) {
                status.className = 'form-error small ok';
                status.textContent = 'BF added to your wallet.';
            }
        } catch (err) {
            status.textContent = errorMessage(err);
        }
        await syncWallet();
    });

    try {
        await loadMarket();
    } catch (err) {
        console.error('Failed to load swap market:', err);
        state.tokens = PREVIEW_TOKENS;
        setStatus('Could not reach Base Sepolia. Showing preview rates.', 'error');
    }
    renderSlots();
    render();

    // Follow account and network changes on whichever wallet is selected.
    let watched = null;
    const watchWallet = () => {
        const wallet = currentWallet();
        if (!wallet || wallet.provider === watched) return;
        watched?.removeListener?.('accountsChanged', syncWallet);
        watched?.removeListener?.('chainChanged', syncWallet);
        watched = wallet.provider;
        watched.on?.('accountsChanged', syncWallet);
        watched.on?.('chainChanged', syncWallet);
        syncWallet();
    };
    document.addEventListener('walletschange', watchWallet);
    document.addEventListener('walletselect', watchWallet);
    watchWallet();

    // Let users with several wallets pick one without logging in.
    const select = el('walletSelect');
    const renderWalletSelect = () => {
        const list = availableWallets();
        select.hidden = list.length < 2;
        select.replaceChildren(...list.map(w => new Option(w.info.name, w.info.rdns, false, w === currentWallet())));
    };
    select.addEventListener('change', () => useWallet(availableWallets().find(w => w.info.rdns === select.value)));
    document.addEventListener('walletschange', renderWalletSelect);
    document.addEventListener('walletselect', renderWalletSelect);
    renderWalletSelect();
    setInterval(renderFaucet, 1000);
    setInterval(refresh, 30000);
}

init();
