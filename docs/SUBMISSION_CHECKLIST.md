# CLOCK IN submission checklist

Use this as the final copy-and-upload sheet. Replace every `TODO` before submission.

## Submission fields

| Field                   | Final value                                                                                                                                                                                                                                                                                                 |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Project name            | SeekerTag                                                                                                                                                                                                                                                                                                   |
| One-line pitch          | SeekerTag turns physical items into wallet-verified ownership records and rewards people who return lost items.                                                                                                                                                                                             |
| Short description       | SeekerTag is an Android-first Solana Mobile lost-and-found application. Owners authenticate with a compatible MWA wallet, create QR-linked item records, activate Lost Mode, receive wallet-bound finder reports, and reward successful returns with an SPL-token transaction that is verified server-side. |
| GitHub URL              | https://github.com/TANGDAGGER/seekertag                                                                                                                                                                                                                                                                     |
| APK URL                 | https://expo.dev/artifacts/eas/nYWPuNKi9FDEB_EKwtzf07vA9yGU_IwaoPyE6MpozN8.apk                                                                                                                                                                                                                              |
| Build details           | https://expo.dev/accounts/seekertag/projects/seekertag/builds/0ea1480c-eb78-4a5a-8e55-6bb02f2834e8                                                                                                                                                                                                          |
| Android package         | `com.seekertag.app`                                                                                                                                                                                                                                                                                         |
| Demo video URL          | TODO — upload the final 90–120 second video                                                                                                                                                                                                                                                                 |
| Pitch deck URL          | TODO — upload the final seven-slide deck                                                                                                                                                                                                                                                                    |
| Team/contact            | TODO — add the public-facing team name and preferred contact                                                                                                                                                                                                                                                |
| Final verification date | 2026-10-06 — final static/release validation; latest complete two-device physical pass was 2026-10-04; final APK reward retest remains pending                                                                                                                                                              |

## Solana Mobile integration

SeekerTag uses Android Mobile Wallet Adapter for generic wallet discovery, authorization, SIWS when advertised, `signMessages` fallback, and reward transaction signing. Android chooses a compatible installed handler or its remembered default. SeekerTag displays the wallet identity returned by MWA when available and does not claim to target a named wallet.

## SKR integration explanation

The submitted build runs on Solana **devnet** with a developer-controlled legacy SPL test token named **DEV REWARD** (`4wTRxhcRrPhe5cPdQPYnhKnyQoPnQX3Sh7mjWmaZ5yVc`, 6 decimals). It is not official SKR. The token-configurable reward architecture includes explicit mainnet/SKR guards, but official SKR must only be enabled and described after a separate approved mainnet verification phase.

## Release verification

- [x] `pnpm typecheck`
- [x] `pnpm lint`
- [x] `pnpm test`
- [x] Expo dependency compatibility check
- [x] Preview environment names and non-secret values validated
- [x] Package ID is `com.seekertag.app`
- [x] Existing Expo project and EAS-managed keystore preserved
- [x] APK build status is `FINISHED`
- [x] Secret/key/path scan completed; no embedded secret values or local absolute paths found
- [x] `.gitignore` covers local environments, keypairs, keystores, build output, Supabase temp files, and generated work files
- [x] Corrected wallet authentication passes a Device A physical retest
- [x] Device B installs the same APK
- [x] Full two-device QR, finder report, and devnet reward flow passes
- [ ] Final APK `0ea1480c-eb78-4a5a-8e55-6bb02f2834e8` completes the reward-path physical retest
- [ ] Explorer transaction shown in the demo is the exact devnet reward transaction
- [x] GitHub repository is public and ready for the initial push
- [ ] Demo video link is publicly viewable
- [ ] Pitch deck link is publicly viewable
- [ ] CLOCK IN form has no claim that DEV REWARD is official SKR

## Upload package

- [ ] GitHub repository URL
- [ ] APK URL above, tested once in a private/incognito browser
- [ ] 90–120 second demo video URL
- [ ] Seven-slide pitch deck URL or exported PDF
- [ ] Project name, pitch, description, team/contact, and Solana Mobile explanation
- [ ] Optional supporting devnet Explorer transaction URL from the final physical rehearsal
