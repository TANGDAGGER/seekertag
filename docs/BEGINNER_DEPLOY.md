# SeekerTag Devnet deployment and APK guide

This is the only deployment path for the current test: **hosted Supabase + Solana devnet + an EAS preview APK**. Do not enter the official SKR mint and do not select mainnet. Text in angle brackets such as `<PROJECT_REF>` is a label, not a command; the commands below use prompts so you cannot accidentally deploy a placeholder.

Open Windows PowerShell in the SeekerTag project folder before running commands. Each grey block can be copied as one block.

## STEP 1 — Create / open Supabase project

1. Go to [database.new](https://database.new/) and sign in.
2. Create a new project specifically for SeekerTag development, or open the existing **development** project. Do not use a production project.
3. In **Authentication → Sign In / Providers**, enable **Anonymous Sign-Ins**. SeekerTag creates an anonymous Supabase app session before it verifies the Solana wallet.
4. In **Project Settings → General**, copy the **Reference ID**. Keep this tab open.

## STEP 2 — Get project URL and publishable/anon key

In **Project Settings → API** copy:

- **Project URL**, which looks like `https://abcdefgh.supabase.co`.
- A client-safe key: the current **Publishable key**, or the legacy **anon public** key. Never copy a secret key or `service_role` key.

The app calls the key `EXPO_PUBLIC_SUPABASE_ANON_KEY` for backwards compatibility; a publishable key is still placed in that variable. `EXPO_PUBLIC_*` values are visible inside the APK, so database safety must come from RLS. The migrations in this repository configure that RLS.

## STEP 3 — Install/login to Supabase CLI

Install [Node.js 20 or newer](https://nodejs.org/) if `node --version` fails. The Supabase CLI is run through `npx`, so no Docker or global Supabase installation is required for this hosted deployment path.

```powershell
node --version
npx supabase@latest --version
npx supabase@latest login
```

The final command opens a browser or asks for an access token. This token belongs only in the CLI; do not put it in `.env`, EAS, or the app.

## STEP 4 — Link the project

Copy the Reference ID from STEP 1 when prompted:

```powershell
$DEV_PROJECT_REF = Read-Host "Paste the Supabase DEVELOPMENT project Reference ID"
npx supabase@latest link --project-ref $DEV_PROJECT_REF
```

If asked for the database password, use the password chosen when the Supabase project was created. Confirm the correct project before continuing:

```powershell
npx supabase@latest projects list
```

The linked marker must be beside the intended development project.

## STEP 5 — Push migrations

First preview, then apply the two tracked migrations:

```powershell
npx supabase@latest db push --dry-run
npx supabase@latest db push
```

Do not run `db reset --linked`; that command is destructive. The push route talks to hosted Supabase and does not require Docker.

## STEP 6 — Deploy wallet-auth

```powershell
npx supabase@latest functions deploy wallet-auth
```

## STEP 7 — Deploy confirm-reward

```powershell
npx supabase@latest functions deploy confirm-reward
```

## STEP 8 — Set Edge Function secrets

Create the devnet test token first using the instructions under **Create the DEV REWARD token** below. Then paste its mint and decimals when PowerShell asks:

```powershell
$DEV_REWARD_MINT = Read-Host "Paste the DEV REWARD mint address"
$DEV_REWARD_DECIMALS = Read-Host "Paste its decimals (normally 6)"
npx supabase@latest secrets set SOLANA_CLUSTER=devnet SOLANA_RPC_URL=https://api.devnet.solana.com REWARD_TOKEN_MINT=$DEV_REWARD_MINT REWARD_TOKEN_DECIMALS=$DEV_REWARD_DECIMALS
```

Those are the only custom server variables used by the current functions. Hosted Supabase supplies `SUPABASE_URL` and the legacy `SUPABASE_SERVICE_ROLE_KEY` automatically. Never copy the service-role/secret key into EAS or React Native.

## STEP 9 — Verify functions are live

```powershell
npx supabase@latest functions list
npx supabase@latest secrets list
```

Both `wallet-auth` and `confirm-reward` must be listed. The secret names from STEP 8 must be listed; Supabase intentionally does not reveal their values.

Both functions have `verify_jwt = false` at the gateway for compatibility with current publishable keys and legacy anon keys. This does **not** make them anonymous: each function requires `Authorization: Bearer <user access token>` and validates that token with `auth.getUser()` before doing work. This matches the app flow, which calls `signInAnonymously()` first. The smoke test below proves missing/invalid sessions are rejected.

### Run the live Edge Function smoke test

Use Device A's public wallet address. The project reference must match the hostname in the URL. These inputs are not wallet secrets.

```powershell
$env:SEEKERTAG_SMOKE_PROJECT = "development"
$env:SEEKERTAG_DEV_PROJECT_REF = Read-Host "Paste the development Supabase Reference ID"
$env:EXPO_PUBLIC_SUPABASE_URL = Read-Host "Paste the development Supabase Project URL"
$env:EXPO_PUBLIC_SUPABASE_ANON_KEY = Read-Host "Paste the publishable/anon public key"
$env:SMOKE_WALLET_ADDRESS = Read-Host "Paste Device A wallet PUBLIC address"
pnpm smoke:functions
```

This checks reachability, a real challenge response, rejection of missing authentication, rejection of malformed signatures/retries, and rejection of a nonexistent reward transaction. It never pretends to have a valid wallet signature.

### Run the database security smoke test

Keep the same PowerShell window and variables:

```powershell
pnpm smoke:security
```

The script hard-fails unless `SEEKERTAG_SMOKE_PROJECT=development` and the URL exactly matches `SEEKERTAG_DEV_PROJECT_REF`. It targets random UUIDs and accepts only authorization/RLS failures as success. It verifies that a public-key client cannot create ownership history, change ownership/Lost Mode, mark a report rewarded, or forge a reward signature.

## Create the DEV REWARD token

This development utility creates a normal legacy SPL Token mint on **devnet only**, mints 1,000 units by default to Device A's public address, and discards its in-memory fee payer/mint authority. It never requests, stores, or prints a wallet seed or private key.

```powershell
$OWNER_WALLET = Read-Host "Paste Device A wallet PUBLIC address"
pnpm devnet:create-token -- --owner $OWNER_WALLET --decimals 6 --amount 1000
```

The script first compares the RPC genesis hash to Solana devnet and refuses every other network. Save the printed mint address and decimals. The asset is **worthless DEV REWARD**, not SKR.

If the public devnet faucet rate-limits the generated fee payer, no mint is created and no key is saved. Wait and rerun, or use a devnet RPC provider that supports `requestAirdrop`. Advanced manual fallback, using a separate devnet-only Solana CLI keypair you control:

On a rate-limited Windows host, the repository utility can temporarily keep a DEVNET-only fallback key under ignored `work/`:

```powershell
pnpm devnet:create-token -- --owner $OWNER_WALLET --decimals 6 --amount 1000 --fee-payer-file work/devnet-fee-payer.json
```

If the faucet still fails, copy only the printed **public** fee-payer address into [faucet.solana.com](https://faucet.solana.com/) and request at least 0.02 devnet SOL. Rerun the exact command. After a successful mint, the utility deletes the temporary key file automatically. Never paste or share the contents of that file.

Alternatively, use a separate devnet-only Solana CLI keypair you control:

```powershell
solana config set --url devnet
solana genesis-hash
solana airdrop 2
spl-token create-token --decimals 6
spl-token create-account DEVNET_MINT_FROM_PREVIOUS_COMMAND
spl-token mint DEVNET_MINT_FROM_PREVIOUS_COMMAND 1000 OWNER_WALLET_PUBLIC_ADDRESS
```

Replace the two uppercase labels before running the last three commands. The genesis hash must be `EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG`. This fallback is advanced and is not required when the repository utility succeeds.

## Configure Expo/EAS once

Install the EAS CLI, sign in, and check the account:

```powershell
npm install --global eas-cli
eas login
eas whoami
```

Check whether this folder is already linked:

```powershell
eas project:info
```

- If it prints a matching Expo project, do not initialize again.
- If it says the project is not configured, run `eas build:configure`, choose **Android**, and let EAS create/link the project. Do not replace the existing `eas.json`; it already contains the required profiles.

After linking, `app.json` normally contains `expo.extra.eas.projectId`. Run `eas project:info` once more and confirm it says **SeekerTag**. The Android application ID is already fixed as `com.seekertag.app`.

## Set the EAS preview environment

First collect the four values that vary. The prompts prevent placeholder text from being uploaded:

```powershell
$SUPABASE_URL = Read-Host "Paste the development Supabase Project URL"
$SUPABASE_PUBLIC_KEY = Read-Host "Paste the publishable/anon public key"
$DEV_REWARD_MINT = Read-Host "Paste the DEV REWARD devnet mint"
$DEV_REWARD_DECIMALS = Read-Host "Paste its decimals (normally 6)"
```

Now set all eight preview variables:

```powershell
eas env:set --environment preview --name EXPO_PUBLIC_DEMO_MODE --value false --visibility plaintext --non-interactive
eas env:set --environment preview --name EXPO_PUBLIC_SUPABASE_URL --value $SUPABASE_URL --visibility plaintext --non-interactive
eas env:set --environment preview --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value $SUPABASE_PUBLIC_KEY --visibility plaintext --non-interactive
eas env:set --environment preview --name EXPO_PUBLIC_SOLANA_CLUSTER --value devnet --visibility plaintext --non-interactive
eas env:set --environment preview --name EXPO_PUBLIC_SOLANA_RPC_URL --value https://api.devnet.solana.com --visibility plaintext --non-interactive
eas env:set --environment preview --name EXPO_PUBLIC_REWARD_TOKEN_MINT --value $DEV_REWARD_MINT --visibility plaintext --non-interactive
eas env:set --environment preview --name EXPO_PUBLIC_REWARD_TOKEN_DECIMALS --value $DEV_REWARD_DECIMALS --visibility plaintext --non-interactive
eas env:set --environment preview --name EXPO_PUBLIC_REWARD_TOKEN_SYMBOL --value "DEV REWARD" --visibility plaintext --non-interactive
eas env:list --environment preview
```

Confirm the list says `false`, `devnet`, the devnet RPC, the same mint/decimals as Supabase, and `DEV REWARD`. There must be no official SKR mint in this environment. These values are client-visible by design.

## Build and install the APK

```powershell
eas build --platform android --profile preview
```

The `preview` profile has `distribution: internal` and `android.buildType: apk`, so the artifact is directly installable and does not need Google Play or Metro. EAS CLI prints a build-details link. Keep PowerShell open until the build reports **Finished**, then open that link and use its **Install** button or QR code.

### Device A

1. Open the EAS build link on Device A.
2. Download the APK. Android may ask to allow installs from that browser; enable it only for this installation.
3. Install and open SeekerTag.
4. Install an MWA-compatible Android wallet on **Device A itself**. Current Solana Mobile development documentation lists Solflare and Jupiter Mobile; a Seeker can also use Seed Vault Wallet. Verify current wallet support before the rehearsal.
5. Switch the wallet to devnet, fund Device A with devnet SOL, and confirm it holds the DEV REWARD token created above.

### Device B

1. Open the same EAS build link on Device B and install the same APK.
2. Install an MWA-compatible Android wallet on **Device B itself**.
3. Switch that wallet to devnet and fund it with a small amount of devnet SOL if the wallet needs network fees.

MWA connects Android apps locally; a wallet installed only on Device A cannot approve requests from SeekerTag on Device B. Do not use Expo Go for this test.

## What is not automated

Supabase and Expo logins, hosted deployment, EAS signing/building, APK installation, wallet approvals, QR/camera behavior, transfers, and two-device observations require a human. Record each result and screenshot/transaction link in `docs/E2E_RESULTS.md`. Only an observed physical-device result may change a physical row to PASS.

After every devnet row passes, the later mainnet micro-transaction phase can be planned separately. Real SKR is outside this run.
