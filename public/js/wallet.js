// Wallet discovery (EIP-6963), with window.ethereum as a fallback.
const wallets = [];

window.addEventListener('eip6963:announceProvider', event => {
    const { info, provider } = event.detail;
    if (wallets.some(w => w.info.uuid === info.uuid)) return;
    wallets.push({ info, provider });
    document.dispatchEvent(new Event('walletschange'));
});
window.dispatchEvent(new Event('eip6963:requestProvider'));

function availableWallets() {
    if (wallets.length) return wallets;
    return window.ethereum ? [{ info: { uuid: 'injected', rdns: 'injected', name: 'Browser wallet', icon: '' }, provider: window.ethereum }] : [];
}

function currentWallet() {
    const list = availableWallets();
    return list.find(w => w.info.rdns === localStorage.getItem('wallet')) || list[0] || null;
}

function useWallet(wallet) {
    if (localStorage.getItem('wallet') === wallet.info.rdns) return;
    localStorage.setItem('wallet', wallet.info.rdns);
    document.dispatchEvent(new Event('walletselect'));
}

function walletProvider() {
    const wallet = currentWallet();
    if (!wallet) throw new Error('No wallet found. Install a browser wallet such as MetaMask, Rabby or Coinbase Wallet.');
    return wallet.provider;
}

// Phone browsers have no wallet extensions, so these open the site inside a wallet app's browser.
const MOBILE_WALLETS = [
    { name: 'MetaMask', url: () => `https://metamask.app.link/dapp/${location.host}${location.pathname}` },
    { name: 'Coinbase Wallet', url: () => `https://go.cb-w.com/dapp?cb_url=${encodeURIComponent(location.href)}` },
    { name: 'Trust Wallet', url: () => `https://link.trustwallet.com/open_url?coin_id=60&url=${encodeURIComponent(location.href)}` },
];
const isMobile = () => /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

async function addBaseSepolia() {
    const provider = walletProvider();
    try {
        await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: BLOCKFUND.chainIdHex }] });
    } catch (err) {
        // 4902: network not added to the wallet yet
        if (err.code !== 4902 && err?.data?.originalError?.code !== 4902) throw err;
        await provider.request({
            method: 'wallet_addEthereumChain',
            params: [{
                chainId: BLOCKFUND.chainIdHex,
                chainName: BLOCKFUND.chainName,
                nativeCurrency: { name: 'Sepolia Ether', symbol: 'ETH', decimals: 18 },
                rpcUrls: [BLOCKFUND.rpcUrl],
                blockExplorerUrls: [BLOCKFUND.explorer],
            }],
        });
    }
}

// Returns true if the wallet accepted the token.
async function watchBF() {
    const provider = walletProvider();
    if (!BLOCKFUND.deployed) throw new Error('The BF token has not been deployed yet.');
    await provider.request({ method: 'eth_requestAccounts' });
    // Wallets look the token up on the current network, so switch to Base Sepolia first.
    await addBaseSepolia();
    return provider.request({
        method: 'wallet_watchAsset',
        params: {
            type: 'ERC20',
            options: { address: BLOCKFUND.bfToken, symbol: 'BF', decimals: BLOCKFUND.decimals, image: `${location.origin}/assets/apple-touch-icon.png` },
        },
    });
}
