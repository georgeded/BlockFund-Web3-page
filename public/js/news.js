const FETCH_INTERVAL = 60000;
const ARTICLES_PER_PAGE = 12;

let currentPage = 1;
let articles = [];

const escapeHtml = s => String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

async function fetchCryptoNews() {
    try {
        const data = await (await fetch('/api/news')).json();
        if (!data.success) throw new Error(data.error);
        articles = data.articles;
        displayPage(currentPage, false);
    } catch (error) {
        console.error('Error fetching news:', error);
        if (!articles.length) {
            document.getElementById('news-container').innerHTML =
                `<p class="muted">News is unavailable right now. ${escapeHtml(error.message)}</p>`;
        }
    }
}

function displayPage(pageNumber, scroll = true) {
    currentPage = pageNumber;
    const start = (pageNumber - 1) * ARTICLES_PER_PAGE;
    document.getElementById('news-container').innerHTML = articles.slice(start, start + ARTICLES_PER_PAGE).map(a => `
        <a class="card news-card" href="${escapeHtml(a.url)}" target="_blank" rel="noopener">
            <div class="thumb${a.image ? '' : ' no-image'}">${a.image ? `<img src="${escapeHtml(a.image)}" alt="" loading="lazy" onerror="this.parentNode.classList.add('no-image');this.remove()">` : ''}</div>
            <div class="body">
                <h3>${escapeHtml(a.title)}</h3>
                <p>${escapeHtml(a.summary)}</p>
                <div class="meta"><span>${escapeHtml(a.source)}</span><span>${new Date(a.publishedAt).toLocaleDateString()}</span></div>
            </div>
        </a>`).join('');
    updatePagination();
    if (scroll) document.querySelector('main').scrollIntoView({ behavior: 'smooth' });
}

function updatePagination() {
    const pagination = document.getElementById('pagination');
    pagination.innerHTML = '';
    const totalPages = Math.ceil(articles.length / ARTICLES_PER_PAGE);
    for (let i = 1; i <= totalPages && totalPages > 1; i++) {
        const button = document.createElement('button');
        button.textContent = i;
        button.disabled = i === currentPage;
        button.addEventListener('click', () => displayPage(i));
        pagination.appendChild(button);
    }
}

fetchCryptoNews();
setInterval(fetchCryptoNews, FETCH_INTERVAL);
