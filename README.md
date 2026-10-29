# BlockFund

BlockFund is a student project exploring Ethereum development end to end. It consists of an ERC-20 token (BF), a fixed-rate exchange contract with a daily faucet, and a website where users can get BF and, as holders, access news, market graphs and a group chat.

The project runs on the Base Sepolia testnet. BF has no monetary value.

Live site: https://blockfund.onrender.com
Documentation: [PDF](public/docs/blockfund-documentation.pdf), also available on the site under Participate.

## Features

- **Swap.** Buy BF with ETH, WETH or test USDC at fixed rates, or sell BF back. Runs against our own contract, not a third-party DEX.
- **Faucet.** Any address can claim 25 BF every 24 hours.
- **Wallet login.** Connect any installed wallet and sign a one-time message (no transaction, no gas). The server checks the BF balance on-chain and issues a session. On phones, the site opens in MetaMask, Coinbase Wallet or Trust Wallet.
- **Holder pages.** Crypto news from public RSS feeds, live market data and BF transfer charts, and a live group chat. Visitors see a blurred preview until they log in.
- **Feedback form.** Built-in form on the Participate page. Submissions are saved to the database and emailed to the team.
- **Interface.** Light and dark themes, responsive down to phone width.

## Tech stack

| Area | Tools |
| --- | --- |
| Contracts | Solidity 0.8.24, solc-js, ganache, ethers.js |
| Frontend | HTML, CSS, JavaScript, ethers.js, Lightweight Charts, EIP-6963 wallet discovery |
| Backend | Node.js, Express, ethers.js, PostgreSQL, Server-Sent Events, Resend |
| Data | Base Sepolia RPC, Blockscout, CoinGecko, RSS (CoinDesk, Cointelegraph, Decrypt, The Block) |
| Hosting | Render |

## Project structure

```
public/          Website, served as static files
  index.html     Home page
  pages/         learn, use, swap, participate, news, graphs, chat
  css/           Styles, with light and dark theme tokens
  js/            Shared scripts (config, layout, site, wallet) and one script per page
  assets/        Logo and icons
  docs/          Project documentation (HTML source and PDF)
server/          Express server: wallet sign-in, sessions, live chat, news, feedback, storage
contracts/
  src/           BlockFund.sol (token), BlockFundSwap.sol (swap and faucet)
  scripts/       compile.js, deploy.js, test.js
```

The [documentation](public/docs/blockfund-documentation.pdf) describes every file.

## Getting started

Requirements: Node.js 20 or later.

```bash
npm run build
npm start
```

The site runs at http://localhost:8080. No API keys are required. Without `DATABASE_URL`, chat and feedback are stored in `server/data/` (local development only).

## Contracts

```bash
cd contracts
npm install
npm test
```

To deploy to Base Sepolia, use a testnet-only key funded with test ETH. This reads the key without echoing it or saving it to your shell history:

```bash
read -s -p "Private key: " PRIVATE_KEY && export PRIVATE_KEY && npm run deploy
```

The script deploys the token and the swap, lists WETH and USDC, and moves 900,000 BF into the swap reserve. Copy the two printed addresses into `public/js/config.js`. Until then, the swap page shows quotes but cannot trade.

## Token

| | |
| --- | --- |
| Name | BlockFund (BF) |
| Network | Base Sepolia (chain ID 84532) |
| Token contract | [`0x89c0452ce2Bd699587Bf3437D9736f4c54966a5D`](https://sepolia.basescan.org/token/0x89c0452ce2Bd699587Bf3437D9736f4c54966a5D) |
| Swap contract | [`0x92D05af6dCaEEEC25c44eb60332DF96857645774`](https://sepolia.basescan.org/address/0x92D05af6dCaEEEC25c44eb60332DF96857645774) |
| Supply | 1,000,000 BF, fixed |
| Rates | 1 ETH = 1 WETH = 10,000 BF; 1 USDC = 5 BF |
| Faucet | 25 BF per address every 24 hours |

## Deployment

On Render, set the build command to `npm run build` and the start command to `npm start`. Then add these environment variables:

| Variable | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | Yes | PostgreSQL connection string for chat and feedback. Render's disk is wiped on every deploy, so without it messages disappear. A free [Neon](https://neon.tech) database works. |
| `SESSION_SECRET` | Yes | Any long random string. Keeps holders logged in across restarts. |
| `RESEND_API_KEY` | For email | Sends feedback to the team via [Resend](https://resend.com). Render's free plan blocks SMTP, so use this there. |
| `FEEDBACK_TO` | No | Feedback recipient, defaults to g.dedebilis@gmail.com. With Resend's test sender this must be your Resend account email. |
| `FEEDBACK_FROM` | No | Sender address, once you verify a domain in Resend. Defaults to Resend's test sender. |
| `SMTP_USER`, `SMTP_PASS` | No | Alternative to Resend on hosts that allow SMTP (Gmail needs an [app password](https://myaccount.google.com/apppasswords)). |

## Authors

- George Dedempilis ([GitHub](https://github.com/georgeded), [LinkedIn](https://www.linkedin.com/in/george-dedempilis/))
- Dean Kok ([GitHub](https://github.com/deank055), [LinkedIn](https://www.linkedin.com/in/dean-kok/))

## Disclaimer

BlockFund is an educational project. It runs on a testnet, and its tokens have no value and should never be bought with real funds.
