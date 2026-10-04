# SeekerTag pitch deck outline

Maximum: **7 slides**. Keep each slide visual, with one main idea and minimal text.

## Slide 1 — SeekerTag

**Headline:** Wallet-verified ownership for the things people carry every day.

**Subhead:** SeekerTag turns physical items into wallet-verified ownership records and rewards people who return lost items.

**Visual:** SeekerTag mark, AirPods Pro, QR label, and two phones.

## Slide 2 — Problem

- Printed contact details expose personal information.
- Centralized lost-and-found accounts do not prove wallet control.
- Finders have little incentive and no transparent reward trail.
- Owners and finders lack one trusted return workflow.

**Visual:** “Lost item” journey with privacy, trust, and incentive gaps.

## Slide 3 — Product and user flow

1. Owner connects an MWA wallet.
2. Owner creates an item and displays its QR.
3. Owner activates Lost Mode and names a reward.
4. Finder scans, verifies their wallet, and reports the item.
5. Owner approves the reward after return.
6. Backend verifies the Solana transaction and closes the case.

**Visual:** One horizontal owner → QR → finder → reward flow.

## Slide 4 — Why Solana Mobile

- Android-native wallet discovery and authorization through Mobile Wallet Adapter.
- SIWS when supported, with a `signMessages` fallback in the same association.
- Wallet-held keys; SeekerTag never requests a seed phrase.
- Fast, low-cost SPL-token rewards with an Explorer-verifiable transaction.
- Mobile-first camera, QR, wallet, and transaction experience.

**Accuracy note:** Android chooses the compatible wallet handler; SeekerTag does not force a named wallet.

## Slide 5 — Reward and SKR utility

**Today:** DEV REWARD, a developer-controlled legacy SPL test token on Solana devnet.

**Utility:** Owners advertise a reward, then transfer it directly to a verified finder after the physical return. The server confirms the exact mint, amount, owner debit, and finder credit before closing the report.

**SKR path:** The reward layer is token-configurable and includes explicit official-SKR/mainnet guards. Official SKR is a future deployment step and is not used or claimed in the submission APK.

## Slide 6 — Architecture and security

**Mobile:** Expo/React Native, QR camera, MWA, transaction preparation.

**Solana:** Wallet signatures, SPL-token reward transfer, confirmed transaction evidence.

**Supabase:** Item workflow, RLS, single-use auth challenges, verified-wallet bindings, finder reports, and idempotent reward state.

**Security callouts:**

- Exact Ed25519 message verification server-side
- Session/domain/chain-bound expiring nonces
- Protected mutations through narrow SQL functions
- Integer token math and cluster genesis checks
- No service-role key or private wallet material in the app

## Slide 7 — Vision and roadmap

**Vision:** A reusable ownership and return layer for personal electronics, luggage, bikes, event equipment, and community property.

**Next:**

- Complete and publish the two-device physical compatibility matrix.
- Add recipient acceptance to ownership transfers.
- Add reliable production RPC infrastructure and monitoring.
- Evaluate official SKR on mainnet only after an explicit security and physical-verification phase.
- Explore optional on-chain ownership attestations without exposing private item data.

**Close:** Scan it. Verify it. Return it. Reward it.
