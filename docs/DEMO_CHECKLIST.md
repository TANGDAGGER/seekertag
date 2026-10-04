# SeekerTag devnet two-device checklist

Use only the EAS `preview` APK, one development Supabase project, Solana **devnet**, and the clearly labeled **DEV REWARD** token. Do not use mainnet or real SKR in this run. Put screenshots, wallet receipts, and devnet Explorer links in `docs/E2E_RESULTS.md`.

Release-candidate build: [`fe57c1ef-f157-4e04-ad45-c3d13c3a45b2`](https://expo.dev/accounts/seekertag/projects/seekertag/builds/fe57c1ef-f157-4e04-ad45-c3d13c3a45b2) — [download APK](https://expo.dev/artifacts/eas/tPXDl48zX6o4laRH4NT4QVB1PUbtmmdKNBKp5faR0P0.apk). Both devices must use this exact build.

## Before testing

- [ ] Both migrations and both Edge Functions are deployed to the intended development Supabase project.
- [ ] Anonymous Sign-Ins are enabled in Supabase Auth.
- [ ] The function secrets say devnet and match the DEV REWARD mint/decimals used by EAS preview.
- [ ] `pnpm smoke:functions` passes against that development project.
- [ ] `pnpm smoke:security` passes against that development project.
- [ ] The `preview` EAS build completed and its artifact is an APK.
- [ ] Both devices installed the exact same APK.
- [ ] Each device has its own MWA-compatible wallet app installed on that same device. Phantom is not a native MWA option in this build.

## Wallet compatibility cases

Run these separately; never infer one wallet's result from another. One fully validated MWA wallet is enough for the hackathon primary demo; the informational examples do not all need to pass first.

- [x] **Built-in Seeker / Seed Vault Wallet — authorize: PASS on Device A; prior flow failed during the in-wallet network challenge request; sign message was never reached and remains NOT TESTED; sign transaction: NOT TESTED.**
- [ ] **Solflare — authorize: NOT TESTED; sign message: NOT TESTED; sign transaction: NOT TESTED.**
- [ ] **Backpack — authorize: NOT TESTED; sign message: NOT TESTED; sign transaction: NOT TESTED.**
- [ ] **Jupiter Mobile — authorize: NOT TESTED; sign message: NOT TESTED; sign transaction: NOT TESTED.**
- [ ] **Espresso Cash — authorize: NOT TESTED; sign message: NOT TESTED; sign transaction: NOT TESTED.**
- [ ] **Phantom — NOT SUPPORTED:** confirm the app shows the native-connection explanation and offers MWA-compatible alternatives; it must not launch Phantom as if it were an MWA wallet.

## PHASE A — Wallet authentication

### Device A

- [ ] Launch SeekerTag.
- [ ] Verify the screen says **DEMO MODE OFF**.
- [ ] Open **Pre-demo health**.
- [ ] Verify Supabase is reachable, Solana RPC is reachable, and the cluster says **devnet**.
- [ ] Tap **Connect & verify wallet** and confirm the **Choose Wallet** sheet appears.
- [ ] Tap **Connect & verify wallet**. Confirm SeekerTag does not claim it can target any named wallet.
- [ ] Let Android open or offer a compatible installed wallet. If Android silently opens an old default, clear that wallet's default under Android Settings → Apps → Set as default, then retry.
- [ ] In Device A's wallet, approve the connection and sign the authentication message. Confirm it says this is not a transaction.
- [ ] Return to SeekerTag and verify Device A's wallet appears **connected · verified**.
- [ ] Tap **Change wallet**. Confirm the old address disappears and the wallet chooser returns.
- [ ] Tap **Connect & verify wallet**, select a different handler/account if Android offers one, and complete authentication. Confirm the old wallet's items are not visible while the new wallet is unverified and never reappear under the new verified identity.

### Device B

- [ ] Repeat every Device A step on Device B using Device B's own installed wallet.
- [ ] Confirm the displayed wallet address differs from Device A's address.

## PHASE B — Ownership and persistence

### Device A

- [ ] Create an item named exactly **AirPods Pro**.
- [ ] Take/upload a photo if the device flow supports it.
- [ ] Sign the ownership claim when prompted.
- [ ] Confirm AirPods Pro appears in the item list.
- [ ] Confirm the wording accurately says ownership is wallet-verified; it must not claim an NFT/onchain registry if none exists.
- [ ] Open the item's QR screen.
- [ ] Fully close and restart SeekerTag.
- [ ] Confirm AirPods Pro is still present after restart, proving data came back from Supabase rather than local fake data.

## PHASE C — QR safety

### Device B

- [ ] Open the scanner and grant camera permission.
- [ ] Scan Device A's AirPods Pro QR.
- [ ] Confirm the correct item and owner wallet are shown.
- [ ] Confirm scanning performs no transaction automatically.
- [ ] Scan a malformed QR or ordinary website URL.
- [ ] Confirm safe rejection, no crash, and no arbitrary URL navigation.

## PHASE D — Lost Mode authorization

### Device A

- [ ] Open AirPods Pro and mark it lost.
- [ ] Set the reward to exactly **100 DEV REWARD**.
- [ ] Confirm the server accepts the change for Device A's verified owner wallet.

### Device B

- [ ] Refresh/rescan and confirm the item now says **Lost** with **100 DEV REWARD**.

### Security evidence

- [ ] Confirm `pnpm smoke:security` rejected a non-owner Lost Mode mutation.

## PHASE E — Finder report

### Device B

- [ ] Scan the lost item.
- [ ] Press **I Found This**.
- [ ] Authenticate/sign if requested.
- [ ] Submit a finder report.

### Device A

- [ ] Refresh/open AirPods Pro reports.
- [ ] Confirm the report shows Device B's wallet address.
- [ ] Confirm the app never offered a field that could substitute an arbitrary finder wallet identity.

## PHASE F — Reward transfer and backend verification

### Before pressing Reward Finder

- [ ] Device A wallet has enough devnet SOL for fees and possible recipient ATA creation.
- [ ] Device A wallet has at least 100 DEV REWARD.
- [ ] Device B wallet address is valid and is the finder in the report.

### Device A

- [ ] Press **Reward Finder** once.
- [ ] Confirm the button becomes disabled during submission.
- [ ] Confirm the wallet opens on Device A.
- [ ] Review recipient, mint, amount, and devnet transaction details.
- [ ] Approve the transaction.
- [ ] Wait for network confirmation without pressing again.
- [ ] Confirm the backend independently verifies the transfer.
- [ ] Confirm the database/UI moves to confirmed/returned.
- [ ] Confirm the success UI appears only after verification.
- [ ] Open the Explorer link and confirm it is the devnet transaction.
- [ ] Press **Reward Finder** again (if still visible) and confirm there is no second transfer.

### Device B

- [ ] Confirm exactly 100 DEV REWARD arrived.

## PHASE G — Receiver ATA creation

Use a fresh Device B finder wallet that has never held DEV REWARD if practical.

- [ ] Before the reward, confirm no DEV REWARD associated token account exists for Device B.
- [ ] Complete one fresh finder/reward flow.
- [ ] Confirm the recipient ATA was created.
- [ ] Confirm the reward arrived and the transaction confirmed.
- [ ] Confirm backend verification succeeded.

## PHASE H — Failure tests

Use a fresh item/report when a test could affect reward state. Never edit a submitted transaction signature.

- [ ] Reject wallet connection: app returns safely, no authenticated state.
- [ ] Reject authentication message signature: wallet is not marked verified.
- [ ] Reject reward transaction: no success or confirmed database state.
- [ ] Insufficient DEV REWARD balance: preflight/app blocks or wallet fails, no confirmed reward.
- [ ] Malformed/non-SeekerTag QR: safe error, no crash, no URL navigation.
- [ ] Wrong RPC/network: health/config validation reports mismatch and reward does not proceed.
- [ ] Server unavailable: app shows failure and does not invent success.
- [ ] Duplicate reward request: no second token transfer.

## Rehearsal reset rule

Blockchain transfers cannot be undone. Never reuse a finder report with a submitted or confirmed signature. Register a new item such as **AirPods Pro — Rehearsal 2**, set a deliberate reward, and create a new finder report. If a report is stuck in `submitting`, inspect Device A wallet history first. Only a report with no signature and no matching wallet transaction may be reset using the narrowly targeted recovery procedure already documented in the project README.
