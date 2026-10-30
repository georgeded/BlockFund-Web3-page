const express = require('express');
const path = require('path');
const store = require('./store');
const { getNews } = require('./news');
const { getTransfers } = require('./transfers');
const { getMarkets } = require('./markets');
const { createChallenge, verifyChallenge } = require('./auth');
const { submitFeedback } = require('./feedback');
const { bfBalanceOf } = require('./chain');
const { issueToken, requireSession } = require('./session');
const { router: chatRouter, coordinatorName } = require('./chat');
const { handle, HttpError } = require('./http');

const PORT = process.env.PORT || 8080;
const PUBLIC_DIR = path.join(__dirname, '..', 'public');

const app = express();
app.set('trust proxy', 1); // Render terminates HTTPS in front of the app
app.use(express.json());

// Redirect old /html/*.html links.
const LEGACY_PAGES = ['Learn', 'Use', 'Participate', 'News', 'Graphs', 'Chat'];
app.get('/html/:page.html', (req, res, next) => {
    const page = LEGACY_PAGES.find(p => p === req.params.page);
    if (page) return res.redirect(301, `/pages/${page.toLowerCase()}.html`);
    if (req.params.page === 'index') return res.redirect(301, '/');
    if (req.params.page === 'register') return res.redirect(301, '/?login');
    next();
});

// Registration was replaced by wallet sign-in.
app.get('/pages/register.html', (req, res) => res.redirect(301, '/?login'));

app.use(express.static(PUBLIC_DIR));

// Sessions are only issued to addresses that hold BF right now.
async function holderSession(address) {
    const balance = await bfBalanceOf(address).catch(error => {
        console.error('Balance check failed:', error.message);
        throw new HttpError(502, 'Could not reach Base Sepolia to check your BF balance. Please try again.');
    });
    if (balance <= 0) throw Object.assign(new HttpError(403, 'This wallet does not hold any BF yet.'), { code: 'NO_BF' });
    return { address, balance, token: issueToken(address), coordinator: Boolean(coordinatorName(address)) };
}

app.post('/api/auth/challenge', (req, res) => {
    res.json({ success: true, ...createChallenge(req.body.address, req.get('host'), `${req.protocol}://${req.get('host')}`) });
});

app.post('/api/auth/verify', handle(async (req, res) => {
    const address = verifyChallenge(req.body.nonce, req.body.signature);
    res.json({ success: true, ...(await holderSession(address)) });
}));

// Re-checks a saved session, including whether the address still holds BF.
app.get('/api/session', requireSession, handle(async (req, res) => {
    const { token, ...session } = await holderSession(req.address);
    res.json({ success: true, ...session });
}));

app.use('/api/chat', chatRouter);

app.get('/api/news', handle(async (req, res) => {
    const articles = await getNews();
    if (!articles.length) throw new HttpError(502, 'News feeds are unreachable');
    res.json({ success: true, articles });
}));

app.get('/api/transfers', handle(async (req, res) => {
    try {
        res.json({ success: true, ...(await getTransfers()) });
    } catch (error) {
        console.error('Transfer history failed:', error.message);
        throw new HttpError(502, 'Transfer history is unavailable right now');
    }
}));

app.get('/api/markets', handle(async (req, res) => {
    try {
        res.json({ success: true, coins: await getMarkets() });
    } catch (error) {
        console.error('Market data failed:', error.message);
        throw new HttpError(502, 'Market data is unavailable right now');
    }
}));

app.post('/api/feedback', handle(async (req, res) => {
    await submitFeedback(req.body, req.ip);
    res.status(201).json({ success: true });
}));

app.use((error, req, res, next) => {
    if (!error.status) console.error(`${req.method} ${req.path} failed:`, error);
    res.status(error.status || 500).json({ success: false, error: error.status ? error.message : 'Internal Server Error', code: error.code });
});

store.init()
    .then(() => app.listen(PORT, () => console.log(`BlockFund running at http://localhost:${PORT} (storage: ${store.kind})`)))
    .catch(error => {
        console.error('Could not initialise storage:', error);
        process.exit(1);
    });
