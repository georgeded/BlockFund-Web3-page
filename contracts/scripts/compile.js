// Compiles src/*.sol into build/<Name>.json ({ abi, bytecode }).
const fs = require('fs');
const path = require('path');
const solc = require('solc');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'build');
const files = ['BlockFund.sol', 'BlockFundSwap.sol'];

const input = {
    language: 'Solidity',
    sources: Object.fromEntries(files.map(f => [f, { content: fs.readFileSync(path.join(ROOT, 'src', f), 'utf8') }])),
    settings: {
        optimizer: { enabled: true, runs: 200 },
        evmVersion: 'paris',
        outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object'] } },
    },
};

const output = JSON.parse(solc.compile(JSON.stringify(input)));
const errors = (output.errors || []).filter(e => e.severity === 'error');
(output.errors || []).forEach(e => console[e.severity === 'error' ? 'error' : 'warn'](e.formattedMessage));
if (errors.length) process.exit(1);

fs.mkdirSync(OUT, { recursive: true });
for (const file of files) {
    for (const [name, c] of Object.entries(output.contracts[file])) {
        fs.writeFileSync(
            path.join(OUT, `${name}.json`),
            JSON.stringify({ abi: c.abi, bytecode: '0x' + c.evm.bytecode.object }, null, 2)
        );
        console.log(`compiled ${name}`);
    }
}
