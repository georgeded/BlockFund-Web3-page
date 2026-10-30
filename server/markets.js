// Top coins by 24h volume from CoinGecko, each with a TradingView symbol that exists.

const MARKETS_URL = 'https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=volume_desc&per_page=10&page=1';
const SEARCH_URL = 'https://symbol-search.tradingview.com/symbol_search/v3/';
const MARKETS_MS = 60 * 1000;
const SYMBOL_MS = 24 * 60 * 60 * 1000;

// TradingView's aggregated USD price first, then the largest exchange pairs.
const candidates = s => [['CRYPTO', `${s}USD`], ['BINANCE', `${s}USDT`], ['COINBASE', `${s}USD`]];

let markets = { at: 0, coins: [] };
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

async function tradingViewSymbol(symbol) {
    const s = symbol.toUpperCase();
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

async function getMarkets() {
    if (Date.now() - markets.at < MARKETS_MS) return markets.coins;
    try {
        const res = await fetch(MARKETS_URL, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(10000) });
        const data = await res.json();
        if (!res.ok || !Array.isArray(data)) throw new Error(`CoinGecko returned ${res.status}`);
        const coins = await Promise.all(data.map(async c => ({
            name: c.name,
            symbol: c.symbol.toUpperCase(),
            image: c.image,
            price: c.current_price,
            volume: c.total_volume,
            tvSymbol: await tradingViewSymbol(c.symbol).catch(error => {
                console.error(`TradingView lookup for ${c.symbol} failed:`, error.message);
                return null;
            }),
        })));
        markets = { at: Date.now(), coins };
    } catch (error) {
        // CoinGecko rate limits free use, so a recent list is better than none.
        if (!markets.coins.length) throw error;
        console.error('Market data refresh failed, serving the last list:', error.message);
        markets.at = Date.now();
    }
    return markets.coins;
}

module.exports = { getMarkets };
