// TradingView symbols for coin tickers, checked against TradingView's symbol search.
// The coin list itself comes from CoinGecko in the browser, since CoinGecko blocks many cloud servers.

const SEARCH_URL = 'https://symbol-search.tradingview.com/symbol_search/v3/';
const SYMBOL_MS = 24 * 60 * 60 * 1000;
const MAX_SYMBOLS = 20;
const TICKER = /^[A-Z0-9]{1,15}$/;

// TradingView's aggregated USD price first, then the largest exchange pairs.
const candidates = s => [['CRYPTO', `${s}USD`], ['BINANCE', `${s}USDT`], ['COINBASE', `${s}USD`]];

const symbols = new Map();

async function symbolExists(exchange, text) {
    const url = `${SEARCH_URL}?text=${encodeURIComponent(text)}&exchange=${exchange}&search_type=crypto`;
    const res = await fetch(url, {
        headers: { origin: 'https://www.tradingview.com', referer: 'https://www.tradingview.com/' },
        signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw new Error(`TradingView search returned ${res.status}`);
    const { symbols: found = [] } = await res.json();
    const plain = s => String(s).replace(/<[^>]+>/g, '').toUpperCase();
    return found.some(f => plain(f.symbol) === text && plain(f.exchange) === exchange);
}

async function tradingViewSymbol(s) {
    const hit = symbols.get(s);
    if (hit && Date.now() - hit.at < SYMBOL_MS) return hit.value;
    let value = null;
    for (const [exchange, text] of candidates(s)) {
        if (await symbolExists(exchange, text)) {
            value = `${exchange}:${text}`;
            break;
        }
    }
    symbols.set(s, { at: Date.now(), value });
    return value;
}

// Maps each ticker to a TradingView symbol, or null when none was found or the search failed.
async function chartSymbols(tickers) {
    const list = [...new Set(tickers.map(t => String(t).toUpperCase()))].filter(t => TICKER.test(t)).slice(0, MAX_SYMBOLS);
    const pairs = await Promise.all(list.map(async s => [s, await tradingViewSymbol(s).catch(error => {
        console.error(`TradingView lookup for ${s} failed:`, error.message);
        return null;
    })]));
    return Object.fromEntries(pairs);
}

module.exports = { chartSymbols };
