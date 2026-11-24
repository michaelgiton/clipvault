# ClipVault — clip bounties in escrow on QIE

ClipVault is a clip-bounty escrow dApp on **QIE Mainnet** (chain ID 1990), built for
**QIE Hackathon 3.0** (Commerce & Real World track, deadline 30 Nov 2026 23:59 CET).

A brand posts a bounty and **locks QUSDC in a smart-contract vault**. Creators submit
clips (public link + content hash). When the brand accepts a clip, the vault pays the
creator automatically. No accepted clip by the deadline? The brand gets a full refund.

## How the escrow works

1. **Lock** — the brand calls `createBounty(title, description, amount, deadline)`.
   The contract pulls `amount` QUSDC from the brand via `transferFrom` (the brand
   approves the vault first). The money is visibly locked before anyone starts work.
2. **Submit** — any creator calls `submitClip(bountyId, clipUrl, contentHash)` with a
   link to their clip (YouTube, TikTok, …) and the content hash of the video file
   (`sha256sum clip.mp4`). Any number of clips per bounty. The brand cannot submit
   to its own bounty.
3. **Accept** — the brand calls `acceptSubmission(bountyId, submissionId)` before the
   deadline. The vault pays the creator **98%** of the locked amount and sends a **2%
   platform fee** to the fee recipient fixed at deploy time. The bounty is marked Paid.
4. **Refund** — after the deadline, if no clip was accepted, the brand calls
   `refundBounty(bountyId)` and gets the full locked amount back. If a bounty has no
   submissions at all, the brand can `cancelBounty(bountyId)` early for a full refund.

States: `Open` → `Paid` or `Refunded`. No custody beyond escrow, no owner, no
upgradeability, no fees beyond the 2% platform fee on payout. Reentrancy-guarded.

## Contracts

- `contracts/src/ClipVaultEscrow.sol` — the escrow (Solidity 0.8.24, OpenZeppelin
  `SafeERC20` + `ReentrancyGuard`).
- `contracts/test/ClipVaultEscrow.t.sol` — 23 tests, all passing.
- `contracts/test/mocks/MockQUSDC.sol` — mintable 6-decimal QUSDC stand-in for tests.
- `contracts/script/Deploy.s.sol` — deploy script (dry-run validated, nothing broadcast).

QUSDC (already deployed, never deploy your own):
`0x3F43DA82eC9A4f5285F10FaF1F26EcA7319E5DA5` — ERC-20, 6 decimals, verified live
(`decimals()` = 6, `symbol()` = QUSDC) against `https://rpc1mainnet.qie.digital`.

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

The app is Vite + React 19 + TypeScript + viem, hash-routed so it works on any
static host (GitHub Pages included). Browsing bounties is read-only and works with
no wallet; posting, submitting and accepting need an injected wallet on QIE Mainnet.

## Deploy

Nothing is deployed yet. To deploy (deployer key required, supplied at deploy time
and never committed):

```bash
cd contracts
forge script script/Deploy.s.sol --rpc-url https://rpc1mainnet.qie.digital \
  --broadcast --private-key $PRIVATE_KEY
```

The deployer must hold QIE for gas (dry-run estimate: ~1.87M gas, ~0.0037 QIE at
~2 gwei). The fee recipient is set with `FEE_RECIPIENT=0x...` — it is fixed at
deploy time and receives the 2% platform fee.

Dry-run (no broadcast, no key) — already validated:

```bash
FEE_RECIPIENT=0x1111111111111111111111111111111111111111 \
  forge script script/Deploy.s.sol --rpc-url https://rpc1mainnet.qie.digital
```

After deploy, rebuild the app with the vault address and verify the contract on the
explorer so judges can read it:

```bash
cd app
VITE_VAULT_ADDRESS=0x... npm run build
forge verify-contract <address> src/ClipVaultEscrow.sol:ClipVaultEscrow \
  --chain 1990 --verifier blockscout --verifier-url https://mainnet.qie.digital/api/
```

## Tech stack

- Solidity 0.8.24, Foundry, OpenZeppelin
- React 19, TypeScript, Vite 6, viem 2
- QIE Mainnet (chain 1990), QUSDC (6 decimals)

## Links

- QIE Hackathon 3.0: https://hackathon.qie.digital
- QIE Mainnet explorer: https://mainnet.qie.digital
- QIE RPC: https://rpc1mainnet.qie.digital
- QIE docs: https://www.qie.digital/developers
