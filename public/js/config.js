// Network and contract settings, shared by the website and the server (server/chain.js).
const BLOCKFUND = {
    chainId: 84532,
    chainIdHex: '0x14a34',
    chainName: 'Base Sepolia',
    rpcUrl: 'https://sepolia.base.org',
    explorer: 'https://sepolia.basescan.org',
    blockscout: 'https://base-sepolia.blockscout.com',

    bfToken: '',
    swap: '',

    decimals: 18,

    faucets: [
        { name: 'Alchemy', url: 'https://www.alchemy.com/faucets/base-sepolia', note: '0.1 ETH / 24h, no account' },
        { name: 'QuickNode', url: 'https://faucet.quicknode.com/base/sepolia', note: 'Free drip, no account' },
        { name: 'Coinbase CDP', url: 'https://portal.cdp.coinbase.com/products/faucet', note: 'Requires a free Coinbase dev login' },
        { name: 'Circle USDC', url: 'https://faucet.circle.com/', note: 'Test USDC, swappable for BF' },
    ],
};

BLOCKFUND.deployed = /^0x[0-9a-fA-F]{40}$/.test(BLOCKFUND.bfToken) && /^0x[0-9a-fA-F]{40}$/.test(BLOCKFUND.swap);

// JSON-RPC call for pages that don't load ethers.js.
async function bfRpc(method, params) {
    const res = await fetch(BLOCKFUND.rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error.message);
    return data.result;
}

// BF balance in whole tokens.
async function bfBalanceOf(address) {
    if (!BLOCKFUND.deployed) throw new Error('BF token not deployed yet');
    const data = '0x70a08231' + address.toLowerCase().replace(/^0x/, '').padStart(64, '0');
    const raw = await bfRpc('eth_call', [{ to: BLOCKFUND.bfToken, data }, 'latest']);
    return Number(BigInt(raw)) / 10 ** BLOCKFUND.decimals;
}