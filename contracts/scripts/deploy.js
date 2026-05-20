// Usage: PRIVATE_KEY=0x... npm run deploy
// Optional: RPC_URL, BF_ADDRESS (reuse an existing token), RESERVE_BF (default 900000).
const fs = require('fs');
const path = require('path');
const { ethers } = require('ethers');

const RPC_URL = process.env.RPC_URL || 'https://sepolia.base.org';
const RESERVE_BF = process.env.RESERVE_BF || '900000';

// Base Sepolia pay tokens. bfPerToken = BF received per 1 whole token.
const PAY_TOKENS = [
    { symbol: 'WETH', address: '0x4200000000000000000000000000000000000006', decimals: 18, bfPerToken: '10000' },
    { symbol: 'USDC', address: '0x036CbD53842c5426634e7929541eC2318f3dCF7e', decimals: 6, bfPerToken: '5' },
];
const BF_PER_ETH = '10000';
const FAUCET_BF = '25';
const FAUCET_COOLDOWN = 24 * 60 * 60;

const artifact = name => JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'build', `${name}.json`), 'utf8'));

// Contract rate: BF (18 decimals) per 1e18 base units of the pay token.
function toRate(bfPerToken, decimals) {
    return (ethers.parseUnits(bfPerToken, 18) * 10n ** 18n) / 10n ** BigInt(decimals);
}

async function main() {
    if (!process.env.PRIVATE_KEY) throw new Error('Set PRIVATE_KEY (a testnet-only key with some test ETH)');
    const provider = new ethers.JsonRpcProvider(RPC_URL);
    const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
    const { chainId } = await provider.getNetwork();
    console.log(`Deployer ${wallet.address} on chain ${chainId}`);

    let bfAddress = process.env.BF_ADDRESS;
    if (!bfAddress) {
        const { abi, bytecode } = artifact('BlockFund');
        const bf = await new ethers.ContractFactory(abi, bytecode, wallet).deploy(1_000_000);
        await bf.waitForDeployment();
        bfAddress = await bf.getAddress();
        console.log(`BlockFund deployed: ${bfAddress}`);
    }

    const { abi, bytecode } = artifact('BlockFundSwap');
    const swap = await new ethers.ContractFactory(abi, bytecode, wallet).deploy(
        bfAddress,
        toRate(BF_PER_ETH, 18),
        ethers.parseUnits(FAUCET_BF, 18),
        FAUCET_COOLDOWN
    );
    await swap.waitForDeployment();
    const swapAddress = await swap.getAddress();
    console.log(`BlockFundSwap deployed: ${swapAddress}`);

    if (chainId === 84532n) {
        for (const t of PAY_TOKENS) {
            await (await swap.setRate(t.address, toRate(t.bfPerToken, t.decimals))).wait();
            console.log(`Listed ${t.symbol} at ${t.bfPerToken} BF`);
        }
    }

    const bf = new ethers.Contract(bfAddress, artifact('BlockFund').abi, wallet);
    await (await bf.transfer(swapAddress, ethers.parseUnits(RESERVE_BF, 18))).wait();
    console.log(`Funded swap with ${RESERVE_BF} BF`);

    console.log('\nPaste into public/js/config.js:');
    console.log(`  bfToken: '${bfAddress}',`);
    console.log(`  swap: '${swapAddress}',`);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
