// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IERC20 {
    function balanceOf(address account) external view returns (uint256);
    function transfer(address to, uint256 value) external returns (bool);
    function transferFrom(address from, address to, uint256 value) external returns (bool);
}

/// @title BlockFundSwap
/// @notice Buys and sells BF at fixed rates from a reserve, plus a daily BF faucet.
/// @dev rate[token] is BF (18 decimals) per 1e18 base units of token, so
///      bfOut = amountIn * rate / 1e18 for any token decimals. address(0) is ETH.
contract BlockFundSwap {
    address public constant NATIVE = address(0);

    IERC20 public immutable bf;
    address public owner;

    mapping(address => uint256) public rate;
    address[] private listed;
    mapping(address => bool) private isListed;

    uint256 public faucetAmount;
    uint256 public faucetCooldown;
    mapping(address => uint256) public lastClaim;

    uint256 private locked = 1;

    event Bought(address indexed user, address indexed tokenIn, uint256 amountIn, uint256 bfOut);
    event Sold(address indexed user, address indexed tokenOut, uint256 bfIn, uint256 amountOut);
    event Claimed(address indexed user, uint256 amount);
    event RateSet(address indexed token, uint256 rate);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    modifier onlyOwner() {
        require(msg.sender == owner, "Swap: not owner");
        _;
    }

    modifier nonReentrant() {
        require(locked == 1, "Swap: reentrant");
        locked = 2;
        _;
        locked = 1;
    }

    constructor(address bfToken, uint256 nativeRate, uint256 faucetAmount_, uint256 faucetCooldown_) {
        bf = IERC20(bfToken);
        owner = msg.sender;
        faucetAmount = faucetAmount_;
        faucetCooldown = faucetCooldown_;
        _setRate(NATIVE, nativeRate);
        emit OwnershipTransferred(address(0), msg.sender);
    }

    // Views
    function supportedTokens() external view returns (address[] memory tokens, uint256[] memory rates) {
        uint256 n;
        for (uint256 i; i < listed.length; i++) if (rate[listed[i]] > 0) n++;
        tokens = new address[](n);
        rates = new uint256[](n);
        uint256 j;
        for (uint256 i; i < listed.length; i++) {
            address t = listed[i];
            if (rate[t] > 0) {
                tokens[j] = t;
                rates[j] = rate[t];
                j++;
            }
        }
    }

    function quoteBuy(address tokenIn, uint256 amountIn) public view returns (uint256) {
        uint256 r = rate[tokenIn];
        require(r > 0, "Swap: token not supported");
        return (amountIn * r) / 1e18;
    }

    function quoteSell(address tokenOut, uint256 bfIn) public view returns (uint256) {
        uint256 r = rate[tokenOut];
        require(r > 0, "Swap: token not supported");
        return (bfIn * 1e18) / r;
    }

    function reserve(address token) public view returns (uint256) {
        return token == NATIVE ? address(this).balance : IERC20(token).balanceOf(address(this));
    }

    function nextClaimAt(address user) external view returns (uint256) {
        uint256 last = lastClaim[user];
        return last == 0 ? 0 : last + faucetCooldown;
    }

    // User actions
    /// @notice Pays amountIn of tokenIn (msg.value for ETH) for at least minBfOut BF.
    function buy(address tokenIn, uint256 amountIn, uint256 minBfOut)
        external
        payable
        nonReentrant
        returns (uint256 bfOut)
    {
        if (tokenIn == NATIVE) {
            require(msg.value == amountIn, "Swap: value mismatch");
        } else {
            require(msg.value == 0, "Swap: unexpected ETH");
        }
        require(amountIn > 0, "Swap: zero amount");

        bfOut = quoteBuy(tokenIn, amountIn);
        require(bfOut >= minBfOut, "Swap: slippage");
        require(bf.balanceOf(address(this)) >= bfOut, "Swap: BF reserve too low");

        if (tokenIn != NATIVE) _safeTransferFrom(tokenIn, msg.sender, address(this), amountIn);
        _safeTransfer(address(bf), msg.sender, bfOut);
        emit Bought(msg.sender, tokenIn, amountIn, bfOut);
    }

    /// @notice Sells bfIn BF (approve first) for at least minOut of tokenOut.
    function sell(address tokenOut, uint256 bfIn, uint256 minOut) external nonReentrant returns (uint256 amountOut) {
        require(bfIn > 0, "Swap: zero amount");
        amountOut = quoteSell(tokenOut, bfIn);
        require(amountOut > 0, "Swap: amount too small");
        require(amountOut >= minOut, "Swap: slippage");
        require(reserve(tokenOut) >= amountOut, "Swap: reserve too low");

        _safeTransferFrom(address(bf), msg.sender, address(this), bfIn);
        if (tokenOut == NATIVE) {
            (bool ok, ) = msg.sender.call{value: amountOut}("");
            require(ok, "Swap: ETH transfer failed");
        } else {
            _safeTransfer(tokenOut, msg.sender, amountOut);
        }
        emit Sold(msg.sender, tokenOut, bfIn, amountOut);
    }

    /// @notice Sends faucetAmount BF, once per faucetCooldown per address.
    function claim() external nonReentrant {
        require(faucetAmount > 0, "Swap: faucet disabled");
        uint256 last = lastClaim[msg.sender];
        require(last == 0 || block.timestamp >= last + faucetCooldown, "Swap: faucet cooldown");
        require(bf.balanceOf(address(this)) >= faucetAmount, "Swap: BF reserve too low");
        lastClaim[msg.sender] = block.timestamp;
        _safeTransfer(address(bf), msg.sender, faucetAmount);
        emit Claimed(msg.sender, faucetAmount);
    }

    // Owner
    /// @notice A rate of 0 delists the token.
    function setRate(address token, uint256 newRate) external onlyOwner {
        require(token != address(bf), "Swap: BF cannot be priced in BF");
        require(token == NATIVE || token.code.length > 0, "Swap: not a contract");
        _setRate(token, newRate);
    }

    function setFaucet(uint256 amount, uint256 cooldown) external onlyOwner {
        faucetAmount = amount;
        faucetCooldown = cooldown;
    }

    function withdraw(address token, uint256 amount, address to) external onlyOwner nonReentrant {
        if (token == NATIVE) {
            (bool ok, ) = to.call{value: amount}("");
            require(ok, "Swap: ETH transfer failed");
        } else {
            _safeTransfer(token, to, amount);
        }
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "Swap: zero address");
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }

    /// @notice Lets the owner top up the ETH reserve.
    receive() external payable {}

    // Internal
    function _setRate(address token, uint256 newRate) internal {
        if (!isListed[token]) {
            isListed[token] = true;
            listed.push(token);
        }
        rate[token] = newRate;
        emit RateSet(token, newRate);
    }

    // Accepts tokens that return nothing as well as bool.
    function _safeTransfer(address token, address to, uint256 value) internal {
        (bool ok, bytes memory data) = token.call(abi.encodeCall(IERC20.transfer, (to, value)));
        require(ok && (data.length == 0 || abi.decode(data, (bool))), "Swap: transfer failed");
    }

    function _safeTransferFrom(address token, address from, address to, uint256 value) internal {
        (bool ok, bytes memory data) = token.call(abi.encodeCall(IERC20.transferFrom, (from, to, value)));
        require(ok && (data.length == 0 || abi.decode(data, (bool))), "Swap: transferFrom failed");
    }
}
