// Sign-in with Ethereum: issue a one-time message, then verify the wallet's signature.
const crypto = require('crypto');
const { verifyMessage, getAddress, isAddress } = require('ethers');
const { HttpError } = require('./http');
const { BLOCKFUND } = require('./chain');

const NONCE_TTL_MS = 5 * 60 * 1000;
const MAX_PENDING = 10000;
const pending = new Map();

function pruneExpired() {
    const now = Date.now();
    for (const [nonce, entry] of pending) {
        if (entry.expires < now) pending.delete(nonce);
    }
}

// Message format follows EIP-4361 so wallets display it as a sign-in request.
function createChallenge(address, host, origin) {
    if (!isAddress(address)) throw new HttpError(400, 'Invalid address');
    pruneExpired();
    if (pending.size >= MAX_PENDING) throw new HttpError(503, 'Too many sign-in requests, please try again in a minute');
    const nonce = crypto.randomBytes(12).toString('hex');
    const message = [
        `${host} wants you to sign in with your Ethereum account:`,
        getAddress(address),
        '',
        'Sign in to BlockFund. This does not send a transaction or cost gas.',
        '',
        `URI: ${origin}`,
        'Version: 1',
        `Chain ID: ${BLOCKFUND.chainId}`,
        `Nonce: ${nonce}`,
        `Issued At: ${new Date().toISOString()}`,
    ].join('\n');
    pending.set(nonce, { address: getAddress(address), message, expires: Date.now() + NONCE_TTL_MS });
    return { nonce, message };
}

// Returns the checksummed address if the signature is valid. Each nonce works once.
function verifyChallenge(nonce, signature) {
    const entry = pending.get(nonce);
    pending.delete(nonce);
    if (!entry || entry.expires < Date.now()) throw new HttpError(401, 'Sign-in request expired, please try again');
    let signer;
    try {
        signer = verifyMessage(entry.message, signature);
    } catch {
        throw new HttpError(400, 'Invalid signature');
    }
    if (signer !== entry.address) throw new HttpError(401, 'Signature does not match the address');
    return signer;
}

module.exports = { createChallenge, verifyChallenge };
