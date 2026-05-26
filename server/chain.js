// Reads network settings from the site's config.js so both sides use the same addresses.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { JsonRpcProvider, Contract, formatUnits } = require('ethers');

const configSource = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'config.js'), 'utf8');
const BLOCKFUND = vm.runInNewContext(`${configSource}\nBLOCKFUND;`, {});

const provider = new JsonRpcProvider(BLOCKFUND.rpcUrl, BLOCKFUND.chainId, { staticNetwork: true });
const token = BLOCKFUND.deployed
    ? new Contract(BLOCKFUND.bfToken, ['function balanceOf(address) view returns (uint256)'], provider)
    : null;

// BF balance in whole tokens.
async function bfBalanceOf(address) {
    if (!token) throw new Error('The BF token is not deployed yet');
    return Number(formatUnits(await token.balanceOf(address), BLOCKFUND.decimals));
}

module.exports = { BLOCKFUND, bfBalanceOf };
