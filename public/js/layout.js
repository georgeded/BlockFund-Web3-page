// Renders the shared header, dialogs and footer. Load it synchronously at the top of <body>.

const PROFILE_DECIMALS = 3;
const shortAddress = a => `${a.slice(0, 6)}...${a.slice(-4)}`;
const formatBF = n => n.toLocaleString('en-US', { maximumFractionDigits: PROFILE_DECIMALS }) + ' BF';

// Gradient avatar derived from the address.
function avatarStyle(address) {
    const h = parseInt(address.slice(2, 8), 16) % 360;
    return `linear-gradient(135deg, hsl(${h} 80% 62%), hsl(${(h + 70) % 360} 75% 48%))`;
}

// The last confirmed session, shown until site.js has checked it with the server again.
const cachedSession = (() => {
    if (!localStorage.getItem('session')) return null;
    try {
        const info = JSON.parse(localStorage.getItem('sessionInfo'));
        return info && /^0x[0-9a-fA-F]{40}$/.test(info.address) && typeof info.balance === 'number' ? info : null;
    } catch {
        return null;
    }
})();

(function () {
    // Set the theme before first paint: saved choice, else the OS setting.
    const saved = localStorage.getItem('darkMode');
    const dark = saved === null ? matchMedia('(prefers-color-scheme: dark)').matches : saved === 'true';
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    // Avoid a locked flash on holder pages; site.js re-checks the session.
    if (localStorage.getItem('session')) document.body.classList.add('logged-in');
})();

const ICONS = {
    sun: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
    moon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/></svg>',
    menu: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M4 7h16M4 12h16M4 17h16"/></svg>',
    close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    chevron: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>',
    wallet: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M19 7V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/><path d="M21 9h-6a3 3 0 0 0 0 6h6z"/><circle cx="15.5" cy="12" r=".6" fill="currentColor"/></svg>',
    lock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>',
    copy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/></svg>',
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5 9-10"/></svg>',
    arrow: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
    github: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 .5a11.5 11.5 0 0 0-3.64 22.41c.58.1.79-.25.79-.56v-2c-3.2.7-3.88-1.37-3.88-1.37-.52-1.33-1.28-1.69-1.28-1.69-1.05-.71.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.29 1.19-3.1-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.17 1.18a11 11 0 0 1 5.77 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.84 1.19 3.1 0 4.42-2.69 5.39-5.25 5.68.41.36.78 1.06.78 2.14v3.17c0 .31.21.67.8.56A11.5 11.5 0 0 0 12 .5z"/></svg>',
    linkedin: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M20.45 20.45h-3.56v-5.57c0-1.33-.02-3.04-1.85-3.04-1.85 0-2.14 1.45-2.14 2.94v5.67H9.35V9h3.41v1.56h.05c.48-.9 1.64-1.85 3.37-1.85 3.6 0 4.27 2.37 4.27 5.46v6.28zM5.34 7.43a2.07 2.07 0 1 1 0-4.13 2.07 2.07 0 0 1 0 4.13zM7.12 20.45H3.56V9h3.56v11.45zM22.22 0H1.77C.79 0 0 .77 0 1.73v20.54C0 23.23.79 24 1.77 24h20.45c.98 0 1.78-.77 1.78-1.73V1.73C24 .77 23.2 0 22.22 0z"/></svg>',
};

const NAV = [
    { label: 'Learn', href: '/pages/learn.html', items: [
        { label: 'Technology', desc: 'How BlockFund is built', href: '/pages/learn.html#technology' },
        { label: 'Holder benefits', desc: 'What holding BF unlocks', href: '/pages/learn.html#benefits' },
        { label: 'How to get BF', desc: 'Faucet, swap, done', href: '/pages/learn.html#get-bf' },
    ]},
    { label: 'Use', href: '/pages/use.html', items: [
        { label: 'Setup guide', desc: 'Wallet to BF in five steps', href: '/pages/use.html#guide' },
        { label: 'Test ETH faucets', desc: 'Free Base Sepolia ETH', href: '/pages/use.html#faucets' },
        { label: 'BlockFund Swap', desc: 'Trade ETH, WETH, USDC for BF', href: '/pages/swap.html' },
    ]},
    { label: 'Participate', href: '/pages/participate.html', items: [
        { label: 'Join the community', desc: 'Become a holder', href: '/pages/participate.html#join' },
        { label: 'Documentation', desc: 'The full project write-up', href: '/pages/participate.html#docs' },
        { label: 'Feedback', desc: 'Tell us what to improve', href: '/pages/participate.html#feedback' },
    ]},
    { label: 'Swap', href: '/pages/swap.html' },
    { label: 'Holders', href: '/pages/news.html', holders: true, items: [
        { label: 'News', desc: 'Latest crypto headlines', href: '/pages/news.html' },
        { label: 'Graphs', desc: 'Live market + BF activity', href: '/pages/graphs.html' },
        { label: 'Group chat', desc: 'Talk with other holders', href: '/pages/chat.html' },
    ]},
];

const TEAM = [
    { name: 'George Dedempilis', linkedin: 'https://www.linkedin.com/in/george-dedempilis/', github: 'https://github.com/georgeded' },
    { name: 'Dean Kok', linkedin: 'https://www.linkedin.com/in/dean-kok/', github: 'https://github.com/deank055' },
];

function navItemHtml(item) {
    const path = location.pathname === '/' ? '/index.html' : location.pathname;
    const base = href => href.split('#')[0];
    // Pages with their own top-level link (Swap) don't also highlight their parent menu.
    const active = base(item.href) === path ||
        (!NAV.some(n => base(n.href) === path) && (item.items || []).some(i => base(i.href) === path));
    const cls = `nav-item${active ? ' active' : ''}`;
    const lock = item.holders ? `<span class="lock" title="Holders only">${ICONS.lock}</span>` : '';
    if (!item.items) return `<div class="${cls}"><a class="nav-link" href="${item.href}">${item.label}</a></div>`;
    return `<div class="${cls}">
        <a class="nav-link" href="${item.href}" aria-haspopup="true">${lock}${item.label}${ICONS.chevron}</a>
        <div class="dropdown">${item.items.map(i =>
            `<a href="${i.href}"><span>${i.label}</span><small>${i.desc}</small></a>`).join('')}
        </div>
    </div>`;
}

document.currentScript.insertAdjacentHTML('beforebegin', `
<header class="site-header">
    <div class="header-inner">
        <a href="/" class="brand" aria-label="BlockFund home"><span class="logo-mark"></span><span>BlockFund</span></a>
        <nav class="main-nav" aria-label="Main">${NAV.map(navItemHtml).join('')}</nav>
        <div class="header-actions">
            <button class="icon-btn" id="themeToggle" aria-label="Toggle dark mode"><span class="i-sun">${ICONS.sun}</span><span class="i-moon">${ICONS.moon}</span></button>
            <button class="btn btn-sm" id="loginButton"${cachedSession ? ' hidden' : ''}>Log in</button>
            <button class="profile-chip" id="profileChip"${cachedSession ? '' : ' hidden'}>
                <span class="chip-balance" id="currentBalance">${cachedSession ? formatBF(cachedSession.balance) : ''}</span>
                <span class="chip-avatar" id="chipAvatar"${cachedSession ? ` style="background: ${avatarStyle(cachedSession.address)}"` : ''}></span>
                <span class="mono" id="publicAddress">${cachedSession ? shortAddress(cachedSession.address) : ''}</span>
            </button>
            <button class="icon-btn menu-toggle" id="menuToggle" aria-label="Open menu" aria-expanded="false">${ICONS.menu}</button>
        </div>
    </div>
    <nav class="mobile-nav" id="mobileNav" aria-label="Mobile">
        ${NAV.filter(i => !i.holders).map(i => `<a href="${i.href}">${i.label}</a>`).join('')}
        ${NAV.find(i => i.holders).items.map(i => `<a href="${i.href}"><span class="lock">${ICONS.lock}</span>${i.label}</a>`).join('')}
    </nav>
</header>

<dialog class="modal" id="loginModal">
    <form method="dialog" class="modal-close-form"><button class="icon-btn" aria-label="Close">${ICONS.close}</button></form>
    <span class="eyebrow">Holders only</span>
    <h2>Log in</h2>
    <p class="muted">Sign in with the wallet that holds your BF on ${BLOCKFUND.chainName}. Signing is free and sends no transaction.</p>
    <div class="wallet-options" id="walletOptions"></div>
    <p class="form-error" id="loginError" role="alert"></p>
</dialog>

<dialog class="modal" id="profileModal">
    <form method="dialog" class="modal-close-form"><button class="icon-btn" aria-label="Close">${ICONS.close}</button></form>
    <span class="eyebrow">Your profile</span>
    <p class="profile-note" id="profileNote" hidden>You are already logged in.</p>
    <div class="profile-head"><span class="chip-avatar lg" id="profileAvatar"></span><h2 id="profileBalance"></h2></div>
    <p class="muted small">Address</p>
    <div class="address-row">
        <span class="mono" id="profilePublicKey"></span>
        <button type="button" class="icon-btn" id="copyAddress" aria-label="Copy address" title="Copy address">${ICONS.copy}</button>
    </div>
    <div class="row gap">
        <a class="btn btn-ghost" id="profileExplorer" target="_blank" rel="noopener">View on explorer</a>
        <button class="btn btn-ghost" id="logout">Log out</button>
    </div>
</dialog>
`);

document.addEventListener('DOMContentLoaded', () => {
    const year = new Date().getFullYear();
    document.body.insertAdjacentHTML('beforeend', `
<footer class="site-footer">
    <div class="footer-grid">
        <div class="footer-brand">
            <a href="/" class="brand"><span class="logo-mark"></span><span>BlockFund</span></a>
            <p class="muted small">A student-built token on ${BLOCKFUND.chainName}. Testnet only, no real value.</p>
            <a class="icon-btn" href="https://github.com/georgeded/BlockFund-Web3-page" target="_blank" rel="noopener" aria-label="Source code on GitHub" title="Source code on GitHub">${ICONS.github}</a>
        </div>
        ${NAV.filter(i => i.items && !i.holders).map(i => `
        <div>
            <h4>${i.label}</h4>
            <ul>${i.items.map(s => `<li><a href="${s.href}">${s.label}</a></li>`).join('')}</ul>
        </div>`).join('')}
        <div>
            <h4>Team</h4>
            <ul>${TEAM.map(m => `
                <li><details class="person">
                    <summary>${m.name}</summary>
                    <div class="person-links">
                        <a href="${m.linkedin}" target="_blank" rel="noopener">${ICONS.linkedin}LinkedIn</a>
                        <a href="${m.github}" target="_blank" rel="noopener">${ICONS.github}GitHub</a>
                    </div>
                </details></li>`).join('')}
            </ul>
        </div>
    </div>
    <div class="footer-bottom">
        <span>© ${year} BlockFund.org</span>
        <span class="mono">${BLOCKFUND.chainName} (chain ${BLOCKFUND.chainId})</span>
    </div>
</footer>`);
});
