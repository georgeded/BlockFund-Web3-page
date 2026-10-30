// Theme, menu, dialogs and login session. Runs on every page after layout.js.

const $ = id => document.getElementById(id);

function setTheme(theme) {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('darkMode', theme === 'dark' ? 'true' : 'false');
    document.dispatchEvent(new CustomEvent('themechange', { detail: theme }));
}
const isDark = () => document.documentElement.dataset.theme === 'dark';

$('themeToggle').addEventListener('click', () => setTheme(isDark() ? 'light' : 'dark'));

const menuToggle = $('menuToggle');
menuToggle.addEventListener('click', () => {
    const open = document.body.classList.toggle('menu-open');
    menuToggle.setAttribute('aria-expanded', String(open));
});
$('mobileNav').addEventListener('click', e => {
    if (e.target.closest('a')) document.body.classList.remove('menu-open');
});

document.querySelectorAll('dialog.modal').forEach(d => {
    d.addEventListener('click', e => { if (e.target === d) d.close(); });
});

// The current holder session ({ address, balance, token, coordinator }) or null.
window.holderSession = null;

function setSession(session) {
    window.holderSession = session;
    document.body.classList.toggle('logged-in', Boolean(session));
    $('loginButton').hidden = Boolean(session);
    $('profileChip').hidden = !session;
    if (session) {
        localStorage.setItem('session', session.token);
        const { address, balance, coordinator } = session;
        localStorage.setItem('sessionInfo', JSON.stringify({ address, balance, coordinator }));
        $('currentBalance').textContent = formatBF(session.balance);
        $('publicAddress').textContent = shortAddress(session.address);
        $('profileBalance').textContent = formatBF(session.balance);
        $('profilePublicKey').textContent = session.address;
        $('profileExplorer').href = `${BLOCKFUND.explorer}/token/${BLOCKFUND.bfToken}?a=${session.address}`;
        $('chipAvatar').style.background = $('profileAvatar').style.background = avatarStyle(session.address);
    } else {
        localStorage.removeItem('session');
        localStorage.removeItem('sessionInfo');
    }
    document.dispatchEvent(new CustomEvent('sessionchange', { detail: session }));
}

function openProfile(note) {
    $('profileNote').hidden = !note;
    $('profileModal').showModal();
}

// Every login button lands here; a holder who is already logged in sees their profile instead.
function openLogin() {
    if (window.holderSession) return openProfile(true);
    renderWalletOptions();
    $('loginModal').showModal();
}

$('loginButton').addEventListener('click', openLogin);
$('profileChip').addEventListener('click', () => openProfile(false));
$('copyAddress').addEventListener('click', () => {
    const button = $('copyAddress');
    navigator.clipboard.writeText(window.holderSession.address).then(() => {
        button.innerHTML = ICONS.check;
        button.setAttribute('aria-label', 'Address copied');
        setTimeout(() => {
            button.innerHTML = ICONS.copy;
            button.setAttribute('aria-label', 'Copy address');
        }, 1500);
    });
});
$('logout').addEventListener('click', () => {
    $('profileModal').close();
    setSession(null);
});

async function api(url, { method = 'GET', body, token } = {}) {
    const res = await fetch(url, {
        method,
        headers: {
            ...(body ? { 'Content-Type': 'application/json' } : {}),
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({ success: false, error: `Server error (${res.status})` }));
    if (!data.success) throw Object.assign(new Error(data.error || 'Request failed'), { code: data.code, status: res.status });
    return data;
}

// Re-check a saved session with the server, which also re-checks the BF balance.
const savedToken = localStorage.getItem('session');
if (savedToken) {
    if (cachedSession) setSession({ ...cachedSession, token: savedToken });
    api('/api/session', { token: savedToken })
        .then(session => setSession({ ...session, token: savedToken }))
        .catch(err => {
            if (err.status === 401 || err.status === 403) setSession(null);
            else console.error('Could not check session:', err);
        });
}
// Keys from the old password login.
['isLoggedIn', 'publicKey'].forEach(key => localStorage.removeItem(key));

function showLoginError(err) {
    const error = $('loginError');
    if (err.code === 'NO_BF') {
        error.innerHTML = 'This wallet does not hold any BF yet. <a href="/pages/swap.html">Claim free BF on the Swap page</a>, then log in again.';
    } else if (err.code === 4001 || err.code === 'ACTION_REJECTED') {
        error.textContent = 'Request rejected in your wallet.';
    } else if (err.code === -32002) {
        error.textContent = 'Your wallet already has a request waiting. Open the wallet to continue.';
    } else {
        error.textContent = err.message || String(err);
    }
}

function finishLogin(session) {
    setSession(session);
    $('loginModal').close();
}

const toHex = text => '0x' + [...new TextEncoder().encode(text)].map(b => b.toString(16).padStart(2, '0')).join('');

async function connectWallet(wallet, button) {
    $('loginError').textContent = '';
    useWallet(wallet);
    const provider = wallet.provider;
    button.disabled = true;
    try {
        const [account] = await provider.request({ method: 'eth_requestAccounts' });
        const { nonce, message } = await api('/api/auth/challenge', { method: 'POST', body: { address: account } });
        const signature = await provider.request({ method: 'personal_sign', params: [toHex(message), account] });
        finishLogin(await api('/api/auth/verify', { method: 'POST', body: { nonce, signature } }));
    } catch (err) {
        console.error('Wallet login failed:', err);
        showLoginError(err);
    } finally {
        button.disabled = false;
    }
}

function walletButton(label, iconSrc, primary) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = primary ? 'btn btn-accent btn-block' : 'wallet-option';
    if (iconSrc) {
        const img = document.createElement('img');
        img.src = iconSrc;
        img.alt = '';
        button.append(img);
    } else {
        button.insertAdjacentHTML('beforeend', ICONS.wallet);
    }
    button.append(Object.assign(document.createElement('span'), { textContent: label }));
    return button;
}

// One button per installed wallet; deep links on phones without one; install links otherwise.
function renderWalletOptions() {
    const box = $('walletOptions');
    box.replaceChildren();
    const list = availableWallets();

    if (list.length === 1) {
        const [wallet] = list;
        const label = wallet.info.rdns === 'injected' ? 'Connect wallet' : `Connect ${wallet.info.name}`;
        const button = walletButton(label, wallet.info.icon, true);
        button.addEventListener('click', () => connectWallet(wallet, button));
        box.append(button);
    } else if (list.length > 1) {
        box.insertAdjacentHTML('beforeend', '<p class="wallet-hint">Choose a wallet</p>');
        list.forEach(wallet => {
            const button = walletButton(wallet.info.name, wallet.info.icon, false);
            button.addEventListener('click', () => connectWallet(wallet, button));
            box.append(button);
        });
    } else if (isMobile()) {
        box.insertAdjacentHTML('beforeend', '<p class="wallet-hint">Open BlockFund in your wallet app to connect</p>');
        MOBILE_WALLETS.forEach(w => {
            const link = Object.assign(document.createElement('a'), { className: 'wallet-option', href: w.url() });
            link.insertAdjacentHTML('beforeend', ICONS.wallet);
            link.append(Object.assign(document.createElement('span'), { textContent: `Open in ${w.name}` }));
            box.append(link);
        });
    } else {
        box.innerHTML = `<p class="wallet-hint">No wallet found in this browser. Install one, then reload this page:</p>
            <a class="wallet-option" href="https://metamask.io/download/" target="_blank" rel="noopener">${ICONS.wallet}<span>MetaMask</span></a>
            <a class="wallet-option" href="https://rabby.io/" target="_blank" rel="noopener">${ICONS.wallet}<span>Rabby</span></a>
            <a class="wallet-option" href="https://www.coinbase.com/wallet/downloads" target="_blank" rel="noopener">${ICONS.wallet}<span>Coinbase Wallet</span></a>`;
    }
}

renderWalletOptions();
document.addEventListener('walletschange', renderWalletOptions);

// Holder-only sections show a blurred preview with a login prompt until the visitor logs in.
document.querySelectorAll('.holders-gate').forEach(gate => {
    gate.insertAdjacentHTML('afterbegin', `
        <div class="gate-card">
            <span class="gate-icon">${ICONS.lock}</span>
            <h3>Holders only</h3>
            <p>Log in with a wallet that holds BF to unlock this page. No BF yet? The swap page has a free daily claim.</p>
            <div class="row gap-sm">
                <button class="btn btn-accent btn-sm" data-open-login>Log in</button>
                <a class="btn btn-ghost btn-sm" href="/pages/swap.html">Get free BF</a>
            </div>
        </div>`);
});
// Links to /?login (old registration URLs) open the login dialog.
if (new URLSearchParams(location.search).has('login')) openLogin();

document.addEventListener('click', e => {
    if (e.target.closest('[data-open-login]')) openLogin();
    // Only one team-member menu open at a time; clicking elsewhere closes it.
    const open = e.target.closest('details.person');
    document.querySelectorAll('details.person[open]').forEach(d => { if (d !== open) d.open = false; });
});

const revealObserver = new IntersectionObserver(entries => {
    entries.forEach(e => {
        if (e.isIntersecting) {
            e.target.classList.add('in');
            revealObserver.unobserve(e.target);
        }
    });
}, { threshold: 0.12 });
document.querySelectorAll('.reveal').forEach(el => revealObserver.observe(el));

document.addEventListener('click', e => {
    const btn = e.target.closest('[data-copy]');
    if (!btn) return;
    navigator.clipboard.writeText(btn.dataset.copy).then(() => {
        const label = btn.textContent;
        btn.textContent = 'Copied';
        setTimeout(() => (btn.textContent = label), 1200);
    });
});
