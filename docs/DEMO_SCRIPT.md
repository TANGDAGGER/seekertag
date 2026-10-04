# SeekerTag demo script

Target length: **90–120 seconds**. Record on the exact release-candidate APK and keep both Android devices, the QR code, and the devnet Explorer tab ready before recording.

## 0:00–0:12 — Problem

**Visual:** A pair of AirPods Pro and an ordinary luggage/item tag.

**Narration:** “When a physical item is lost, a printed phone number exposes personal information, ownership is hard to prove, and the finder has little incentive to help. SeekerTag replaces that fragile process with a wallet-verified return flow.”

## 0:12–0:27 — Connect wallet

**Visual:** Device A, SeekerTag home, then **Connect MWA Wallet** and the compatible Android wallet.

**Narration:** “SeekerTag uses Solana Mobile Wallet Adapter. Android opens a compatible wallet, and the owner proves wallet control with a single-use sign-in challenge. The private key never leaves the wallet, and this authentication is not a transaction.”

## 0:27–0:40 — Create and claim AirPods Pro

**Visual:** Create **AirPods Pro**, approve the ownership statement, then show its item detail page.

**Narration:** “I create an AirPods Pro record and claim it with my verified wallet. The mutable item profile stays in Supabase; wallet signatures protect ownership actions.”

## 0:40–0:51 — Show QR

**Visual:** Open the item's QR screen.

**Narration:** “Every item gets a safe public QR profile. Scanning identifies the item but never triggers a transaction or reveals private wallet credentials.”

## 0:51–1:03 — Activate Lost Mode

**Visual:** Device A activates Lost Mode and sets **100 DEV REWARD**.

**Narration:** “If the item is lost, only the verified owner can activate Lost Mode and publish a reward. This submission uses DEV REWARD, a test SPL token on Solana devnet—not official SKR.”

## 1:03–1:17 — Finder scans and reports

**Visual:** Device B scans the QR, sees **Lost**, taps **I Found This**, and submits the report.

**Narration:** “The finder scans the same QR, connects their own wallet, and submits a wallet-bound report without needing the owner's private contact details.”

## 1:17–1:35 — Reward the finder

**Visual:** Device A opens the report, taps **Reward Finder**, reviews the wallet transaction, and approves it.

**Narration:** “After the physical return, the owner approves an exact SPL-token transfer. SeekerTag checks the network, mint, amount, balances, recipient, and token accounts before asking the wallet to sign.”

## 1:35–1:48 — Show verification

**Visual:** Confirmed/returned state, Device B's DEV REWARD balance, then the exact transaction in Solana Explorer with `cluster=devnet` visible.

**Narration:** “The backend independently verifies the confirmed Solana transaction before marking the item returned. The transaction is public and auditable on devnet, and duplicate reward attempts are blocked.”

## 1:48–1:58 — Vision

**Visual:** SeekerTag logo plus the owner, finder, and QR screens.

**Narration:** “SeekerTag makes returning everyday objects safer and more rewarding: wallet-verified ownership, privacy-conscious QR discovery, and transparent incentives powered by Solana Mobile.”

## Recording rules

- Use the exact APK and two-device flow recorded in `docs/E2E_RESULTS.md`.
- Say **DEV REWARD test token on devnet**, never “official SKR.”
- Show the wallet's real confirmation UI; do not cut around a failed or unapproved step.
- Show the actual devnet Explorer transaction from the recorded reward.
- If the corrected wallet flow has not passed the final physical rehearsal, do not record or submit a staged success claim.
- Keep seed phrases, private keys, auth tokens, notification contents, and personal contact details out of frame.
