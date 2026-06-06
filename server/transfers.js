// BF transfer history from Blockscout, cached so visitors don't hit its rate limit.
const { BLOCKFUND } = require('./chain');

const CACHE_MS = 60 * 1000;
let cache = { at: 0, data: null };
let failedAt = 0;

async function getTransfers() {
    if (cache.data && Date.now() - cache.at < CACHE_MS) return cache.data;
    if (!BLOCKFUND.deployed) return { count: 0, daily: [] };
    // After a failure (usually Blockscout's rate limit), wait before asking again.
    if (Date.now() - failedAt < CACHE_MS) {
        if (cache.data) return cache.data;
        throw new Error('Blockscout is unavailable, retrying shortly');
    }

    const url = `${BLOCKFUND.blockscout}/api?module=account&action=tokentx&contractaddress=${BLOCKFUND.bfToken}&sort=asc`;
    let body;
    try {
        const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
        body = await res.json();
        if (!Array.isArray(body.result)) throw new Error(`Blockscout: ${body.message || res.status}`);
    } catch (error) {
        failedAt = Date.now();
        if (cache.data) return cache.data;
        throw error;
    }

    // Cumulative transfers per day, for the activity chart.
    const perDay = {};
    body.result.forEach(tx => {
        const day = new Date(tx.timeStamp * 1000).toISOString().slice(0, 10);
        perDay[day] = (perDay[day] || 0) + 1;
    });
    let total = 0;
    const daily = Object.keys(perDay).sort().map(day => ({ time: day, value: (total += perDay[day]) }));

    cache = { at: Date.now(), data: { count: body.result.length, daily } };
    return cache.data;
}

module.exports = { getTransfers };
