# ClipVault documentation

ClipVault is a bounty escrow for clipping campaigns on QIE Mainnet. Brands lock
QUSDC in a smart contract, creators submit clips against the bounty, and the
contract pays the winning creator automatically when the brand accepts a clip.

Live demo: https://michaelgiton.github.io/clipvault/

## What ClipVault is

Clipping campaigns pay creators for short video clips that promote a product or a
brand. Today those payments usually run on trust: the creator delivers the clip
first and hopes the brand pays, or the brand pays first and hopes the clip arrives.
ClipVault removes the trust step. The money sits in an on chain escrow that
everyone can see before any work starts, and it only moves when the brand accepts a
clip or when the deadline passes with no acceptance.

## How the escrow works, step by step

### 1. The brand creates a bounty and locks QUSDC

The brand picks a title, a description of the clip they want, an amount in QUSDC,
and a deadline. The brand first approves the vault to spend that amount, then calls
`createBounty`. The contract pulls the QUSDC into the vault in the same transaction.
From that moment the bounty is public: anyone can read the amount, the deadline and
the balance locked behind it.

### 2. Creators submit clips

Any creator can call `submitClip` with the bounty id, a public link to their clip
(YouTube, TikTok, or any public host), and the SHA 256 content hash of the video
file. The hash binds the submission to one exact file, so a clip cannot be swapped
after submission. There is no limit on submissions per bounty, and the brand cannot
submit to its own bounty.

### 3. The brand accepts a clip and the vault pays out

Before the deadline the brand reviews the submissions and calls `acceptSubmission`
on the winning one. The vault then splits the locked amount in the same transaction:
98% goes to the creator and 2% goes to the platform fee recipient that was fixed
when the contract was deployed. The bounty is marked Paid and cannot pay out again.

### 4. Refund paths protect the brand

If the deadline passes with no accepted clip, the brand calls `refundBounty` and
receives the full locked amount back. If a bounty never received any submissions,
the brand can call `cancelBounty` at any time for the same full refund. Creator
funds are never at risk because creators never deposit anything; they only spend
network gas to submit.

### Bounty states

Every bounty is in exactly one state: `Open`, `Paid`, or `Refunded`. State changes
are one way and enforced by the contract. The contract has no owner, no admin keys,
no upgrade path, and it is reentrancy guarded on every value moving function.

## Contract addresses (QIE Mainnet, chain ID 1990)

| Contract | Address |
| --- | --- |
| ClipVaultEscrow | `0x729C77e8d721be33371491CD6F0f502D31187e05` |
| QUSDC (6 decimals) | `0x3F43DA82eC9A4f5285F10FaF1F26EcA7319E5DA5` |

Explorer: https://mainnet.qie.digital/address/0x729C77e8d721be33371491CD6F0f502D31187e05

Deploy transaction:
`0x5bb18c55fd1c1663231ae68e1d51929353020b391a426d689c471578ef1a40fb` (block
12189482). The deployment was verified on chain: `token()` returns QUSDC,
`feeRecipient()` returns the platform wallet, `FEE_BPS()` returns 200.

## Fee model

| Action | Cost |
| --- | --- |
| Create a bounty | Free, the brand locks only the bounty amount |
| Submit a clip | Free, creators pay only network gas |
| Accept a clip | Creator receives 98%, platform fee recipient receives 2% |
| Refund or cancel | Brand receives 100% back |

The 2% fee is taken from the bounty amount at payout time. It is never charged on
top, and it is the only fee in the system.

## Run the frontend locally

Requirements: Node.js 18 or newer and npm.

```bash
git clone https://github.com/michaelgiton/clipvault.git
cd clipvault/app
npm install
npm run dev
```

Open http://localhost:5173. Browsing bounties works read only with no wallet. To
create a bounty, submit a clip, or accept a submission, connect an injected wallet
(for example MetaMask) and switch it to QIE Mainnet (chain ID 1990, RPC
https://rpc1mainnet.qie.digital). The app reads the escrow address from
`app/src/config.ts`; set `VITE_VAULT_ADDRESS` at build time to point at a different
deployment.

Production build:

```bash
npm run build
```

The output in `app/dist` is a static bundle with hash routing and relative asset
paths, so it can be hosted on any static host. The public demo is served from
GitHub Pages.

## Run the contract tests

Requirements: Foundry.

```bash
cd clipvault/contracts
forge test
```

The suite has 23 tests covering bounty creation, submissions, acceptance splits,
refund and cancel paths, deadline rules, and access control.

## Project layout

- `contracts/src/ClipVaultEscrow.sol`, the escrow contract (Solidity 0.8.24).
- `contracts/test/`, the Foundry test suite and a mock QUSDC for tests.
- `contracts/script/Deploy.s.sol`, the deployment script.
- `app/`, the Vite plus React plus TypeScript frontend using viem.

## Team

ClipVault is built by Lloyd, founder of NovaTrail Technologies, as a solo project
for QIE Hackathon 3.0 (Commerce & Real World track).
