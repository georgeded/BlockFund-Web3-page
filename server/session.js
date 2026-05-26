// Signed session tokens. Set SESSION_SECRET so they survive restarts.
const crypto = require('crypto');

const SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
const TTL_MS = 7 * 24 * 60 * 60 * 1000;

const sign = data => crypto.createHmac('sha256', SECRET).update(data).digest('base64url');

function issueToken(address) {
    const payload = Buffer.from(JSON.stringify({ address, exp: Date.now() + TTL_MS })).toString('base64url');
    return `${payload}.${sign(payload)}`;
}

// Returns the address for a valid, unexpired token, otherwise null.
function readToken(token) {
    const [payload, signature] = String(token || '').split('.');
    if (!payload || !signature) return null;
    const expected = Buffer.from(sign(payload));
    const given = Buffer.from(signature);
    if (expected.length !== given.length || !crypto.timingSafeEqual(expected, given)) return null;
    try {
        const { address, exp } = JSON.parse(Buffer.from(payload, 'base64url').toString());
        return exp > Date.now() ? address : null;
    } catch {
        return null;
    }
}

// Express middleware: accepts "Authorization: Bearer <token>" or ?token= (for EventSource).
function requireSession(req, res, next) {
    const header = req.get('authorization') || '';
    const address = readToken(header.startsWith('Bearer ') ? header.slice(7) : req.query.token);
    if (!address) return res.status(401).json({ success: false, error: 'Please log in as a holder' });
    req.address = address;
    next();
}

module.exports = { issueToken, readToken, requireSession };
