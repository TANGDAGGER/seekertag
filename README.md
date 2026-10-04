# SeekerTag

**SeekerTag turns physical items into wallet-verified ownership records and rewards people who return lost items.**

SeekerTag is an Android-first Solana Mobile hackathon project. An owner connects a compatible wallet, creates an item profile, shares its QR code, activates Lost Mode, receives a finder report, and can send a token reward after the item is returned.

> **Current submission environment:** Solana **devnet** with the developer-controlled **DEV REWARD** legacy SPL test token. This build does not use mainnet or official SKR.

## Problem

Physical-item labels usually expose personal contact details, are difficult to update, and give a finder little incentive to help. A centralized lost-and-found account also does not prove that the person changing an item's status controls the wallet recorded as its owner.

## Solution

SeekerTag gives each item a public, privacy-conscious QR profile backed by a wallet-authenticated owner record. Mutable workflow data lives in Supabase, while Solana wallets provide identity proofs and authorize reward transfers. A finder can report an item without receiving the owner's private contact details, and the owner can reward the finder with an independently verifiable SPL-token transaction.

## Key features

- Generic Android Mobile Wallet Adapter connection with the actual authorized wallet identity shown when available.
- Server-verified wallet authentication using a short-lived, single-use challenge.
- Item registration and wallet-verified ownership records.
- Safe QR profiles that never trigger a transaction merely by being scanned.
- Lost Mode with a visible reward amount.
- Finder reports tied to the finder's verified wallet.
- Idempotent reward submission and server-side Solana transaction verification.
- Preview-build diagnostics that identify the exact wallet-authentication stage without exposing tokens, nonces, or signatures.

## Solana Mobile and MWA integration

SeekerTag uses the official Android Mobile Wallet Adapter flow. The primary action is **Connect MWA Wallet**: Android chooses among compatible handlers installed on the device or opens its remembered default handler. Named wallets are informational only; SeekerTag does not claim it can force Android to launch a particular wallet.

Within one wallet association, SeekerTag authorizes an account and prefers Sign In With Solana when the wallet advertises that capability. Otherwise it falls back to `signMessages` using the same pre-issued challenge. Transaction signing uses the wallet's `signAndSendTransactions` capability. Phantom remains labeled as unavailable for native connection in this build rather than being presented as supported.

## Wallet authentication

An anonymous Supabase Auth session is a transport identity for RLS, not proof of wallet ownership. The application:

1. establishes the anonymous app session;
2. requests a five-minute, unpredictable, single-use challenge before opening MWA;
3. binds the challenge to the app session, domain, URI, issue time, expiry, statement, and `solana:devnet` chain;
4. asks the wallet to sign through SIWS or `signMessages`;
5. checks that the signed account exactly matches the authorized MWA account;
6. sends the proof to the Edge Function only after the wallet association closes;
7. verifies the exact message and Ed25519 signature server-side; and
8. atomically consumes the nonce and creates a 24-hour verified-wallet binding.

Changing wallets revokes the server binding, deauthorizes where supported, clears SeekerTag's versioned local wallet metadata, and signs out the Supabase session before starting a fresh generic MWA authorization.

## QR workflow

The owner creates an item and displays its SeekerTag QR code. A finder scans it to load a constrained public item view. Scanning does not connect a wallet, navigate to arbitrary URLs, or submit a transaction. Malformed and non-SeekerTag payloads are rejected.

## Lost Mode

Only the server-verified current owner can mark an item lost or set its reward. A finder with a different verified wallet can submit one report for that lost item. Contact and physical return arrangements remain outside the application; SeekerTag intentionally avoids publishing private contact details.

## DEV REWARD and SKR architecture

The submission APK uses:

- Cluster: `devnet`
- RPC: `https://api.devnet.solana.com`
- Token: `DEV REWARD` test SPL token
- Mint: `4wTRxhcRrPhe5cPdQPYnhKnyQoPnQX3Sh7mjWmaZ5yVc`
- Decimals: `6`

DEV REWARD is not official SKR. The reward layer is token-configurable and contains guarded mainnet/SKR configuration, but official SKR and mainnet behavior have not been physically verified and are outside this submission build. The app rejects the official SKR mint on devnet and refuses to label a devnet token as `SKR`.

## Security model

- The mobile app contains only the client-safe Supabase publishable/anon key; the service-role key stays inside hosted Edge Functions.
- Protected tables are not directly writable by the client. Narrow SQL functions derive the acting wallet from the verified server binding.
- Ownership events are append-only from the client perspective.
- Ownership transfer locks the item, verifies the current owner, updates the owner, and appends history atomically.
- Reward amounts use integer base units and `bigint`, with SPL Token `u64` bounds.
- Before wallet approval, reward preparation checks the cluster genesis hash, mint, token program, decimals, balances, fee reserve, recipient, and associated token accounts.
- Reward state progresses through `none -> submitting -> submitted -> confirmed`; retries reconcile an existing signature instead of sending a second transfer.
- The `confirm-reward` Edge Function independently checks the confirmed transaction, mint, amount, owner debit, and finder credit before updating database state.
- Preview diagnostics never expose auth tokens, nonce contents, signatures, JWTs, service keys, or private keys.

## On-chain vs. off-chain data

| Data or proof                                                    | Location                                                    |
| ---------------------------------------------------------------- | ----------------------------------------------------------- |
| Wallet authorization and signatures                              | User's MWA-compatible wallet                                |
| Confirmed reward transfer and transaction signature              | Solana                                                      |
| Item profile, owner wallet record, Lost Mode, and finder reports | Supabase                                                    |
| Wallet challenges and short-lived verified-wallet bindings       | Supabase / Edge Function                                    |
| Ownership history                                                | Append-only database records, authenticated by wallet proof |

SeekerTag does not claim that item metadata is an NFT or an on-chain ownership registry. The MVP uses the existing SPL Token program rather than a custom Solana program.

## Android installation

Expo Go is not supported because MWA requires native Android modules. Install the signed EAS preview APK directly:

- [Release-candidate build details](https://expo.dev/accounts/seekertag/projects/seekertag/builds/fe57c1ef-f157-4e04-ad45-c3d13c3a45b2)
- [Download the Android APK](https://expo.dev/artifacts/eas/tPXDl48zX6o4laRH4NT4QVB1PUbtmmdKNBKp5faR0P0.apk)
- Android package: `com.seekertag.app`

Android may require permission to install an APK from the browser or file manager used to download it. The artifact is an internal preview build and expires on October 17, 2026.

## Demo flow

1. Connect and verify Device A's MWA wallet.
2. Create **AirPods Pro** and claim ownership.
3. Show its public QR profile.
4. Activate Lost Mode with a `100 DEV REWARD` reward.
5. Scan the QR on Device B and submit a finder report.
6. Return to Device A and select **Reward Finder**.
7. Review and approve the devnet SPL-token transaction.
8. Show the confirmed state and devnet Solana Explorer transaction.

Use [docs/DEMO_SCRIPT.md](docs/DEMO_SCRIPT.md) for the 90–120 second narration and [docs/DEMO_CHECKLIST.md](docs/DEMO_CHECKLIST.md) for the full two-device verification run.

## Verification status

- **Static verified:** TypeScript, lint, unit/security tests, dependency compatibility, preview configuration, and Android package structure.
- **Remote verified:** Development Supabase project, deployed migrations and Edge Functions, prior authentication/RLS rejection tests, devnet mint, and EAS APK creation. The latest wallet-auth data-plane smoke test could not be rerun from this host because TLS connections to the Supabase data endpoint were reset.
- **Physical verified:** On 2026-10-04, the release-candidate APK passed Device A wallet verification and the complete two-device flow: item creation, QR scan, Lost Mode, finder report, DEV REWARD transfer, and Solana devnet transaction confirmation.
- **Not yet recorded in the repository:** The exact SIWS-versus-`signMessages` branch, final transaction signature/Explorer URL, and the broader negative-test matrix.

See [docs/E2E_RESULTS.md](docs/E2E_RESULTS.md) for the evidence ledger. Static review or a successful cloud build must never be promoted to physical verification.

## Local setup and checks

Requirements: Node.js 20.19+, pnpm, an Expo account for EAS builds, a Supabase development project with anonymous sign-ins enabled, and an MWA-compatible Android wallet.

```powershell
pnpm install
Copy-Item .env.example .env
pnpm typecheck
pnpm lint
pnpm test
pnpm exec expo install --check
```

Set `EXPO_PUBLIC_DEMO_MODE=false` for the live devnet flow. Missing live configuration is a visible startup error; the app never silently substitutes demo data.

## Known limitations

- The complete two-device devnet demo passed once on the release-candidate APK, but broader wallet compatibility and negative/failure-path testing remains incomplete.
- Wallet choice is controlled by Android's compatible-handler/default-app resolution, not by SeekerTag.
- Phantom has no native connection path in this build.
- Item and ownership workflow data is off-chain; only reward transactions are verified on Solana.
- Ownership transfer does not require recipient acceptance in this MVP; the recipient must previously have verified that wallet.
- Public item photos and profile fields are intentionally public and must not contain sensitive information.
- The public devnet RPC is suitable for development but can be rate-limited during a live demo.

## Future roadmap

- Complete the two-device physical verification matrix and expand tested MWA wallet coverage.
- Add recipient acceptance for ownership transfers.
- Add production RPC redundancy and operational monitoring.
- Move from DEV REWARD to official SKR only after a separate, explicitly approved mainnet verification phase.
- Explore optional on-chain attestations for ownership events after security review, without moving private item data on-chain.

## Submission resources

- [Submission checklist](docs/SUBMISSION_CHECKLIST.md)
- [90–120 second demo script](docs/DEMO_SCRIPT.md)
- [Seven-slide pitch outline](docs/PITCH_DECK_OUTLINE.md)
- [Deployment guide](docs/BEGINNER_DEPLOY.md)
- [Physical demo checklist](docs/DEMO_CHECKLIST.md)
- [Verification evidence](docs/E2E_RESULTS.md)
