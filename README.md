# ClipVault, clip bounties in escrow on QIE

ClipVault is a clip bounty escrow dApp on **QIE Mainnet** (chain ID 1990), built for
**QIE Hackathon 3.0** (Commerce & Real World track, deadline 30 Nov 2026 23:59 CET).

A brand posts a bounty and **locks QUSDC in a smart contract vault**. Creators submit
clips (public link plus content hash). When the brand accepts a clip, the vault pays the
creator automatically. No accepted clip by the deadline? The brand gets a full refund.

## Live demo

- **App:** https://michaelgiton.github.io/clipvault/
- **Escrow contract (QIE Mainnet):**
  [`0x729C77e8d721be33371491CD6F0f502D31187e05`](https://mainnet.qie.digital/address/0x729C77e8d721be33371491CD6F0f502D31187e05)
- **QUSDC token:**
  [`0x3F43DA82eC9A4f5285F10FaF1F26EcA7319E5DA5`](https://mainnet.qie.digital/address/0x3F43DA82eC9A4f5285F10FaF1F26EcA7319E5DA5)

Browsing bounties is read only and works with no wallet. Posting, submitting and
accepting need an injected wallet on QIE Mainnet.

## How the escrow works

1. **Lock.** The brand calls `createBounty(title, description, amount, deadline)`.
   The contract pulls `amount` QUSDC from the brand via `transferFrom` (the brand
   approves the vault first). The money is visibly locked before anyone starts work.
2. **Submit.** Any creator calls `submitClip(bountyId, clipUrl, contentHash)` with a
   link to their clip (YouTube, TikTok, and so on) and the content hash of the video
   file (`sha256sum clip.mp4`). Any number of clips per bounty. The brand cannot
   submit to its own bounty.
3. **Accept.** The brand calls `acceptSubmission(bountyId, submissionId)` before the
   deadline. The vault pays the creator **98%** of the locked amount and sends a **2%
   platform fee** to the fee recipient fixed at deploy time. The bounty is marked Paid.
4. **Refund.** After the deadline, if no clip was accepted, the brand calls
   `refundBounty(bountyId)` and gets the full locked amount back. If a bounty has no
   submissions at all, the brand can `cancelBounty(bountyId)` early for a full refund.

States: `Open` then `Paid` or `Refunded`. No custody beyond escrow, no owner, no
upgradeability, no fees beyond the 2% platform fee on payout. Reentrancy guarded.

## Contracts

- `contracts/src/ClipVaultEscrow.sol`, the escrow (Solidity 0.8.24, OpenZeppelin
  `SafeERC20` plus `ReentrancyGuard`).
- `contracts/test/ClipVaultEscrow.t.sol`, 23 tests, all passing.
- `contracts/test/mocks/MockQUSDC.sol`, mintable 6 decimal QUSDC stand in for tests.
- `contracts/script/Deploy.s.sol`, the deploy script used for the mainnet deployment.

QUSDC (already deployed, never deploy your own):
`0x3F43DA82eC9A4f5285F10FaF1F26EcA7319E5DA5`, ERC-20, 6 decimals, verified live
(`decimals()` = 6, `symbol()` = QUSDC) against `https://rpc1mainnet.qie.digital`.

The deployed escrow was verified on chain after deployment: `token()` returns the
QUSDC address above, `feeRecipient()` returns the platform wallet fixed at deploy
time, `FEE_BPS()` returns 200, and `bountyCount()` starts at 0.

## Run locally

### Contracts

```bash
cd contracts
forge test            # 23 tests
forge build
```

### Frontend

```bash
cd app
npm install
npm run dev           # http://localhost:5173
npm run build         # production bundle in app/dist
```

The app is Vite plus React 19 plus TypeScript plus viem, hash routed so it works on
any static host (GitHub Pages included). The deployed escrow address is the default
in `app/src/config.ts`; override it at build time with `VITE_VAULT_ADDRESS` to test
against another deployment.

## Deployment record

ClipVaultEscrow is deployed on QIE Mainnet at
`0x729C77e8d721be33371491CD6F0f502D31187e05` (deploy transaction
`0x5bb18c55fd1c1663231ae68e1d51929353020b391a426d689c471578ef1a40fb`, block
12189482). The deploy cost about 0.0016 QIE in gas. To redeploy (deployer key
required, supplied at deploy time and never committed):

```bash
cd contracts
forge script script/Deploy.s.sol --rpc-url https://rpc1mainnet.qie.digital \
  --broadcast --private-key $PRIVATE_KEY
```

The fee recipient is set with `FEE_RECIPIENT=0x...` and is fixed at deploy time. It
receives the 2% platform fee on every accepted clip.

## Fee model

- Creating a bounty: free, the brand only locks the bounty amount.
- Submitting a clip: free, creators pay only network gas.
- Accepting a clip: the creator receives 98% of the locked amount, the platform
  fee recipient receives 2%. The fee is taken from the bounty, never added on top.
- Refund or cancel: the brand receives 100% of the locked amount back.

## Tech stack

- Solidity 0.8.24, Foundry, OpenZeppelin
- React 19, TypeScript, Vite 6, viem 2
- QIE Mainnet (chain 1990), QUSDC (6 decimals)

## Documentation

Full documentation lives in [`docs/`](docs/README.md): architecture, the escrow
flow step by step, contract reference, and a local development guide.

## Links

- Live demo: https://michaelgiton.github.io/clipvault/
- QIE Hackathon 3.0: https://hackathon.qie.digital
- QIE Mainnet explorer: https://mainnet.qie.digital
- QIE RPC: https://rpc1mainnet.qie.digital
- QIE docs: https://www.qie.digital/developers
