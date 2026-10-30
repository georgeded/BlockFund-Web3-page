const cssVar = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
let bfChart = null;
let bfSeries = null;
let bfData = null;
// Coins in the price charts, the same top 10 as the table once it loads.
let chartCoins = ['BTC', 'ETH', 'USDT', 'XRP', 'BNB', 'SOL', 'USDC', 'DOGE', 'TRX', 'ADA'].map(s => [s, `CRYPTO:${s}USD`]);

async function fetchTransferHistory() {
    if (!BLOCKFUND.deployed) return [];
    const data = await (await fetch('/api/transfers')).json();
    if (!data.success) throw new Error(data.error);
    return data.daily;
}

function chartOptions() {
    return {
        autoSize: true,
        layout: { background: { color: 'transparent' }, textColor: cssVar('--text-3'), fontFamily: cssVar('--font') },
        grid: { vertLines: { color: cssVar('--border') }, horzLines: { color: cssVar('--border') } },
        rightPriceScale: { borderColor: cssVar('--border') },
        timeScale: { borderColor: cssVar('--border'), fixLeftEdge: true, fixRightEdge: true },
        crosshair: { mode: LightweightCharts.CrosshairMode.Normal },
    };
}

function seriesOptions() {
    const accent = cssVar('--accent');
    return { lineColor: accent, topColor: accent + '55', bottomColor: accent + '00', lineWidth: 2, priceLineVisible: false };
}

async function renderBfChart() {
    const box = document.getElementById('tvchart');
    if (!bfChart) {
        try {
            bfData = await fetchTransferHistory();
        } catch (err) {
            console.error('Error fetching BF transfers:', err);
            bfData = null;
        }
        if (!bfData || !bfData.length) {
            box.innerHTML = `<div class="empty-state">${!BLOCKFUND.deployed ? 'BF transfer history will appear here once the token is deployed.'
                : bfData ? 'No BF transfers yet.' : 'Could not load BF transfers.'}</div>`;
            return;
        }
        bfChart = LightweightCharts.createChart(box, chartOptions());
        bfSeries = bfChart.addAreaSeries(seriesOptions());
        bfSeries.setData(bfData);
        bfChart.timeScale().fitContent();
        return;
    }
    bfChart.applyOptions(chartOptions());
    bfSeries.applyOptions(seriesOptions());
}

async function fetchCryptoData() {
    const tbody = document.querySelector('#crypto-table tbody');
    const usd = (n, max) => '$' + Number(n).toLocaleString('en-US', { maximumFractionDigits: max, minimumFractionDigits: Math.min(2, max) });
    try {
        const data = await (await fetch('/api/markets')).json();
        if (!data.success) throw new Error(data.error);
        const coins = data.coins;
        tbody.replaceChildren(...coins.map((c, i) => {
            const row = document.createElement('tr');
            row.innerHTML = `<td class="muted">${i + 1}</td><td><div class="coin"><img alt=""><span></span></div></td>
                <td class="num">${usd(c.price, c.price < 1 ? 6 : 2)}</td><td class="num">${usd(c.volume, 0)}</td>`;
            const img = row.querySelector('img');
            img.onerror = () => { img.onerror = null; img.src = '/assets/logo.png'; };
            img.src = c.image || '/assets/logo.png';
            row.querySelector('.coin span').innerHTML = `${c.name.replace(/</g, '&lt;')}<small>${c.symbol.replace(/</g, '&lt;')}</small>`;
            return row;
        }));
        const listed = coins.filter(c => c.tvSymbol).map(c => [c.name, c.tvSymbol]);
        if (listed.length) chartCoins = listed;
    } catch (error) {
        console.error('Error fetching cryptocurrency data:', error);
        tbody.innerHTML = '<tr><td colspan="4" class="muted">Market data is unavailable right now.</td></tr>';
    }
    drawPriceCharts();
}

// Rebuilds the widget only when the set of coins or the theme changes, since each build reloads it.
let drawnKey = null;
function drawPriceCharts() {
    const dark = document.documentElement.dataset.theme === 'dark';
    const key = JSON.stringify([chartCoins.map(c => c[1]).sort(), dark]);
    if (key === drawnKey) return;
    drawnKey = key;
    createTradingViewWidget(dark);
}

function createTradingViewWidget(isDarkMode) {
    const container = document.getElementById('tradingview-widget');
    container.innerHTML = '<div class="tradingview-widget-container__widget"></div>';
    const script = document.createElement('script');
    script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-symbol-overview.js';
    script.async = true;
    script.innerHTML = JSON.stringify({
        symbols: chartCoins.map(([name, symbol]) => [name, `${symbol}|12M`]),
        chartOnly: false,
        width: '100%',
        height: '100%',
        locale: 'en',
        colorTheme: isDarkMode ? 'dark' : 'light',
        autosize: true,
        showVolume: false,
        changeMode: 'price-and-percent',
        chartType: 'area',
        backgroundColor: cssVar('--surface'),
        lineColor: cssVar('--accent'),
        topColor: cssVar('--accent') + '44',
        bottomColor: cssVar('--accent') + '00',
        lineWidth: 2,
        dateRanges: ['1d|1', '1m|30', '3m|60', '12m|1D', '60m|1W', 'all|1M'],
    });
    container.appendChild(script);
}

function applyTheme() {
    renderBfChart();
    if (drawnKey) drawPriceCharts();
}

document.addEventListener('themechange', applyTheme);
applyTheme();
fetchCryptoData();
setInterval(fetchCryptoData, 60000);
