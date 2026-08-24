async function loadStats() {
    const transfers = document.getElementById('statTransfers');
    const reserve = document.getElementById('statReserve');
    if (!BLOCKFUND.deployed) {
        transfers.textContent = reserve.textContent = '-';
        return;
    }
    try {
        const data = await (await fetch('/api/transfers')).json();
        if (!data.success) throw new Error(data.error);
        transfers.textContent = data.count.toLocaleString('en-US');
    } catch (err) {
        console.error('Error fetching transfer count:', err);
        transfers.textContent = 'N/A';
    }
    try {
        reserve.textContent = Math.round(await bfBalanceOf(BLOCKFUND.swap)).toLocaleString('en-US');
    } catch (err) {
        console.error('Error fetching swap reserve:', err);
        reserve.textContent = 'N/A';
    }
}
loadStats();
