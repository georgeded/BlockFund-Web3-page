// Contract tests on an in-process ganache chain.
const fs = require('fs');
const path = require('path');
const assert = require('assert/strict');
const ganache = require('ganache');
const { ethers } = require('ethers');

const artifact = name => JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'build', `${name}.json`), 'utf8'));
const BF = ethers.parseUnits;
const NATIVE = ethers.ZeroAddress;

// Uses staticCall because ganache's estimateGas drops revert reasons.
async function expectRevert(promise, reason) {
    await assert.rejects(promise, err => String(err.message || err).includes(reason), `expected revert: ${reason}`);
}

async function main() {
    const chain = ganache.provider({ logging: { quiet: true }, wallet: { totalAccounts: 3, defaultBalance: 100 } });
    const provider = new ethers.BrowserProvider(chain);
    const [owner, alice, bob] = await Promise.all([0, 1, 2].map(i => provider.getSigner(i)));

    const deploy = async (name, signer, ...args) => {
        const { abi, bytecode } = artifact(name);
        const c = await new ethers.ContractFactory(abi, bytecode, signer).deploy(...args);
        await c.waitForDeployment();
        return c;
    };

    const bf = await deploy('BlockFund', owner, 1_000_000);
    // Second token instance stands in for WETH
    const weth = await deploy('BlockFund', owner, 1_000);
    const swap = await deploy('BlockFundSwap', owner, await bf.getAddress(), BF('10000', 18) , BF('25', 18), 86400);
    const swapAddr = await swap.getAddress();

    assert.equal(await bf.totalSupply(), BF('1000000', 18));
    await (await bf.transfer(swapAddr, BF('900000', 18))).wait();

    // Buy with ETH
    const ethIn = BF('0.5', 18);
    assert.equal(await swap.quoteBuy(NATIVE, ethIn), BF('5000', 18));
    await (await swap.connect(alice).buy(NATIVE, ethIn, BF('5000', 18), { value: ethIn })).wait();
    assert.equal(await bf.balanceOf(alice.address), BF('5000', 18));
    assert.equal(await provider.getBalance(swapAddr), ethIn);
    console.log('ok: buy with ETH');

    await expectRevert(swap.connect(alice).buy.staticCall(NATIVE, ethIn, 0, { value: 1n }), 'value mismatch');
    await expectRevert(swap.connect(alice).buy.staticCall(NATIVE, ethIn, BF('5001', 18), { value: ethIn }), 'slippage');
    console.log('ok: value / slippage guards');

    // Unlisted token rejected, listing requires a contract
    await expectRevert(swap.quoteBuy(await weth.getAddress(), 1n), 'not supported');
    await expectRevert(swap.setRate.staticCall(bob.address, 1n), 'not a contract');
    await expectRevert(swap.connect(alice).setRate.staticCall(await weth.getAddress(), 1n), 'not owner');
    await expectRevert(swap.setRate.staticCall(await bf.getAddress(), 1n), 'BF cannot');

    // List WETH at 10000 BF / token and buy with it
    const wethAddr = await weth.getAddress();
    await (await swap.setRate(wethAddr, BF('10000', 18))).wait();
    await (await weth.transfer(bob.address, BF('2', 18))).wait();
    await (await weth.connect(bob).approve(swapAddr, BF('1', 18))).wait();
    await (await swap.connect(bob).buy(wethAddr, BF('1', 18), 0)).wait();
    assert.equal(await bf.balanceOf(bob.address), BF('10000', 18));
    await expectRevert(swap.connect(bob).buy.staticCall(wethAddr, BF('1', 18), 0, { value: 1n }), 'unexpected ETH');
    console.log('ok: buy with ERC-20');

    const [tokens, rates] = await swap.supportedTokens();
    assert.deepEqual([...tokens], [NATIVE, wethAddr]);
    assert.equal(rates[1], BF('10000', 18));

    // Sell BF back for ETH
    await (await bf.connect(alice).approve(swapAddr, BF('1000', 18))).wait();
    const before = await provider.getBalance(alice.address);
    const tx = await swap.connect(alice).sell(NATIVE, BF('1000', 18), BF('0.1', 18));
    const rc = await tx.wait();
    const gas = rc.gasUsed * rc.gasPrice;
    assert.equal(await provider.getBalance(alice.address), before + BF('0.1', 18) - gas);
    assert.equal(await bf.balanceOf(alice.address), BF('4000', 18));
    console.log('ok: sell BF for ETH');

    // 0.4 ETH left in reserve; Bob's 10000 BF would need 1 ETH
    await (await bf.connect(bob).approve(swapAddr, BF('10000', 18))).wait();
    await expectRevert(swap.connect(bob).sell.staticCall(NATIVE, BF('10000', 18), 0), 'reserve too low');
    console.log('ok: sell limited by reserve');

    // Faucet + cooldown
    await (await swap.connect(bob).claim()).wait();
    assert.equal(await bf.balanceOf(bob.address), BF('10025', 18));
    await expectRevert(swap.connect(bob).claim.staticCall(), 'cooldown');
    await chain.request({ method: 'evm_increaseTime', params: [86400] });
    await chain.request({ method: 'evm_mine', params: [] });
    await (await swap.connect(bob).claim()).wait();
    assert.equal(await bf.balanceOf(bob.address), BF('10050', 18));
    console.log('ok: faucet + cooldown');

    // Disabling a token, owner withdraw
    await (await swap.setRate(wethAddr, 0)).wait();
    await expectRevert(swap.quoteBuy(wethAddr, 1n), 'not supported');
    await (await swap.withdraw(wethAddr, BF('1', 18), owner.address)).wait();
    assert.equal(await weth.balanceOf(swapAddr), 0n);
    await expectRevert(swap.connect(bob).withdraw.staticCall(NATIVE, 1n, bob.address), 'not owner');
    console.log('ok: owner controls');

    console.log('\nAll contract tests passed');
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
