// Merges public crypto RSS feeds, newest first, cached for a few minutes.

const FEEDS = [
    { source: 'CoinDesk', url: 'https://www.coindesk.com/arc/outboundfeeds/rss/' },
    { source: 'Cointelegraph', url: 'https://cointelegraph.com/rss' },
    { source: 'Decrypt', url: 'https://decrypt.co/feed' },
    { source: 'The Block', url: 'https://www.theblock.co/rss.xml' },
];
const CACHE_MS = 5 * 60 * 1000;
const MAX_ARTICLES = 60;
const SUMMARY_CHARS = 220;

let cache = { at: 0, articles: [] };

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
function decodeEntities(text) {
    return text.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e) => {
        if (e[0] === '#') return String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : Number(e.slice(1)));
        return ENTITIES[e.toLowerCase()] ?? m;
    });
}

// Text of the first <name> element, CDATA unwrapped.
function tag(xml, name) {
    const m = xml.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i'));
    return m ? m[1].replace(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/, '$1').trim() : '';
}

const attr = (xml, pattern) => xml.match(pattern)?.[1] || '';
const stripHtml = html => decodeEntities(html.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

function truncate(text, max) {
    if (text.length <= max) return text;
    return text.slice(0, text.lastIndexOf(' ', max)) + '...';
}

const toIso = date => (Number.isNaN(Date.parse(date)) ? new Date(0) : new Date(date)).toISOString();

function parseFeed(xml, source) {
    return [...xml.matchAll(/<item\b[\s\S]*?<\/item>/gi)].map(([item]) => {
        const description = tag(item, 'description') || tag(item, 'content:encoded');
        const image =
            attr(item, /<media:content[^>]*\burl="([^"]+)"/i) ||
            attr(item, /<media:thumbnail[^>]*\burl="([^"]+)"/i) ||
            attr(item, /<enclosure[^>]*\burl="([^"]+)"[^>]*type="image/i) ||
            attr(description, /<img[^>]*\bsrc="([^"]+)"/i);
        return {
            title: stripHtml(tag(item, 'title')),
            url: decodeEntities(tag(item, 'link')),
            summary: truncate(stripHtml(description), SUMMARY_CHARS),
            image: decodeEntities(image),
            source,
            publishedAt: toIso(tag(item, 'pubDate')),
        };
    }).filter(a => a.title && /^https?:\/\//.test(a.url));
}

async function fetchFeed({ source, url }) {
    const res = await fetch(url, {
        headers: { 'user-agent': 'BlockFund news reader (+https://blockfund.onrender.com)' },
        signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) throw new Error(`${source}: HTTP ${res.status}`);
    return parseFeed(await res.text(), source);
}

async function getNews() {
    if (Date.now() - cache.at < CACHE_MS && cache.articles.length) return cache.articles;

    const results = await Promise.allSettled(FEEDS.map(fetchFeed));
    results.filter(r => r.status === 'rejected').forEach(r => console.error('News feed failed:', r.reason.message));
    const articles = results
        .flatMap(r => (r.status === 'fulfilled' ? r.value : []))
        .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
        .slice(0, MAX_ARTICLES);

    // Keep the last good result if every feed fails.
    if (articles.length) cache = { at: Date.now(), articles };
    return cache.articles;
}

module.exports = { getNews };
