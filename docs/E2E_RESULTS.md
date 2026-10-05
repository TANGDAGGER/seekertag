# SeekerTag verification evidence

- Date started: 2026-09-14
- Last release review: 2026-10-06
- Test environment: development Supabase project + Solana devnet + DEV REWARD test SPL token
- Final preview APK: [0ea1480c-eb78-4a5a-8e55-6bb02f2834e8](https://expo.dev/accounts/seekertag/projects/seekertag/builds/0ea1480c-eb78-4a5a-8e55-6bb02f2834e8) — [download APK](https://expo.dev/artifacts/eas/nYWPuNKi9FDEB_EKwtzf07vA9yGU_IwaoPyE6MpozN8.apk)
- Device A model/Android/wallet: model and Android version not recorded; built-in Seeker / Seed Vault MWA handler
- Device B model/Android/wallet: model, Android version, and wallet app identity not recorded; used as the verified finder in the 2026-10-04 two-device flow

Never promote a physical row based on source review, TypeScript, unit tests, or a cloud build alone. Paste a concise observation and a screenshot filename, Supabase log timestamp, EAS build URL, or devnet Explorer link into Evidence.

## STATIC VERIFIED

| Test                         | Expected                                                                                       | Actual                                                                                            | Status | Evidence                                          |
| ---------------------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ------ | ------------------------------------------------- |
| EAS preview configuration    | Internal Android APK; preview environment                                                      | Required profiles and preview APK fields present                                                  | PASS   | Structural assertion over `eas.json`, 2026-09-17  |
| Expo public config           | Android package and Expo config resolve                                                        | SDK 55 config; Android package `com.seekertag.app`                                                | PASS   | `expo config --type public --json`, 2026-09-14    |
| Preview JavaScript bundle    | Android bundle compiles with devnet vars                                                       | Android bundle exported successfully                                                              | PASS   | `expo export --platform android`, 2026-09-17      |
| Client devnet guard          | Genuine devnet accepted; mainnet/SKR mismatch rejected                                         | Full devnet genesis hash verified against live RPC and covered by tests                           | PASS   | `pnpm test`; live `getGenesisHash`, 2026-09-16    |
| Database hardening migration | Direct protected-table writes revoked                                                          | Static migration security tests passed                                                            | PASS   | `pnpm test`, 59/59 total tests passed, 2026-10-06 |
| Wallet session hardening     | Switching cannot retain an old verified wallet identity                                        | Pre-wallet challenge, SIWS/fallback, exact-account binding, cleanup, and persistence tests passed | PASS   | `pnpm test`, 59/59 total tests passed, 2026-10-06 |
| Finder/reward regressions    | Owner-only reports, numeric reward parsing, cancellation, and duplicate protection remain safe | Final regression suite passed                                                                     | PASS   | `pnpm test`, 59/59 total tests passed, 2026-10-06 |
| Script TypeScript            | All release scripts compile                                                                    | TypeScript emitted all three release scripts without error                                        | PASS   | `pnpm scripts:build`, 2026-09-17                  |

## REMOTE SERVICE VERIFIED

| Test                            | Expected                                                                          | Actual                                                                                                                                                                 | Status                       | Evidence                                                     |
| ------------------------------- | --------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- | ------------------------------------------------------------ |
| Development project target      | Linked project is explicitly development                                          | `seekertag-dev` / `keqjdwmauevtongmtoqb`                                                                                                                               | PASS                         | `supabase projects list`, 2026-09-14                         |
| Migrations deployed             | Schema, hardening, grants, wallet challenge, and owner Finder Report RPCs applied | Remote includes `202610050001_owner_finder_reports.sql` and `202610050002_owner_finder_report_detail.sql`; their RPCs were exercised by the physical list/detail tests | PASS                         | Supabase deployment plus physical RPC results, 2026-10-05    |
| wallet-auth deployment          | Corrected function bundle deploys                                                 | Pre-wallet challenge/SIWS/fallback version deployed successfully                                                                                                       | PASS                         | `supabase functions deploy wallet-auth`, 2026-10-03          |
| confirm-reward deployment       | Function bundle deploys and becomes active                                        | ACTIVE, version 2; corrected full devnet genesis hash                                                                                                                  | PASS                         | `supabase functions list`, updated 2026-09-15 17:08:39 UTC   |
| wallet-auth prior live behavior | Reachable; challenge issued; malformed signature rejected                         | Authenticated challenge issued; malformed and invalid retry rejected                                                                                                   | PASS (prior version)         | Remote Edge Function smoke test, 2026-09-16                  |
| latest wallet-auth data plane   | Re-run authenticated smoke test after corrected deployment                        | Host TLS connection to `*.supabase.co` reset before the first HTTP assertion; no application assertion ran                                                             | BLOCKED BY TEST HOST NETWORK | Attempted 2026-10-03                                         |
| confirm-reward behavior         | Missing auth and nonexistent transaction rejected                                 | Both unauthenticated and authenticated nonexistent requests rejected                                                                                                   | PASS                         | Remote Edge Function smoke test, 2026-09-16                  |
| RLS mutation resistance         | Five unauthorized direct mutations rejected                                       | All five operations rejected with PostgreSQL `42501`                                                                                                                   | PASS                         | Remote security smoke test, 2026-09-16                       |
| DEV REWARD mint                 | Legacy SPL mint exists on devnet and owner funded                                 | Mint `4wTRxhcRrPhe5cPdQPYnhKnyQoPnQX3Sh7mjWmaZ5yVc`; Device A holds 1000                                                                                               | PASS                         | Devnet RPC balance/supply verification, 2026-09-16           |
| EAS preview APK                 | Cloud build finishes and artifact type is APK                                     | Signed internal APK containing the final application logic and configuration for `com.seekertag.app` finished                                                          | PASS                         | EAS build `0ea1480c-eb78-4a5a-8e55-6bb02f2834e8`, 2026-10-05 |

Verified DEV REWARD details:

- Cluster genesis: `EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG` (devnet)
- Mint: `4wTRxhcRrPhe5cPdQPYnhKnyQoPnQX3Sh7mjWmaZ5yVc`
- Decimals: `6`
- Total supply: `1000`
- Device A token account: `9eY3himqQ3CfHhRNaM5FceDiWkr2t59jre1Nce1Z9YSM`
- Device A token balance: `1000`
- Device A SOL balance after mint: `4.97998864` devnet SOL
- Fee-payer SOL balance after mint: `0.01743476` devnet SOL
- Supabase secrets configured: `SOLANA_CLUSTER`, `SOLANA_RPC_URL`, `REWARD_TOKEN_MINT`, `REWARD_TOKEN_DECIMALS`
- The temporary DEVNET-only fee-payer/mint-authority key file was deleted after confirmed minting.

## PHYSICAL DEVICE VERIFIED

### Wallet compatibility matrix

Static compatibility research or a successful cloud build must not promote any MWA wallet to PASS. The results below preserve user-confirmed physical evidence from preview builds. The final APK `0ea1480c-eb78-4a5a-8e55-6bb02f2834e8` completed its final physical reward retest successfully on 2026-10-06.

| Wallet                              | Native transport                                           | Actual                                                                                                                               | Status        | Evidence                                           |
| ----------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ------------- | -------------------------------------------------- |
| Built-in Seeker / Seed Vault Wallet | Generic Android Mobile Wallet Adapter resolution           | Wallet authorization and verification passed; a DEV REWARD transaction was signed and confirmed on devnet                            | PASS          | User-confirmed Device A physical run, 2026-10-04   |
| Solflare                            | Android Mobile Wallet Adapter chooser                      | Not run                                                                                                                              | NOT TESTED    | Separate wallet-specific run required              |
| Backpack                            | Android Mobile Wallet Adapter chooser                      | Not run                                                                                                                              | NOT TESTED    | Separate wallet-specific run required              |
| Jupiter Mobile                      | Android Mobile Wallet Adapter chooser                      | Not run                                                                                                                              | NOT TESTED    | Separate wallet-specific run required              |
| Espresso Cash                       | Android Mobile Wallet Adapter chooser                      | Not run                                                                                                                              | NOT TESTED    | Separate wallet-specific run required              |
| Other compatible MWA wallet         | Android Mobile Wallet Adapter chooser                      | Device B used a compatible MWA wallet during the complete two-device flow; exact wallet identity was not recorded in this repository | PASS FOR DEMO | User-confirmed two-device physical run, 2026-10-04 |
| Phantom                             | No native transport in this build; explanatory screen only | No Phantom-native transport was added                                                                                                | NOT SUPPORTED | Product behavior retained                          |

Required capability evidence (do not promote from static checks):

| Wallet                              | Authorize  | Sign message | Sign transaction |
| ----------------------------------- | ---------- | ------------ | ---------------- |
| Built-in Seeker / Seed Vault Wallet | PASS       | PASS         | PASS             |
| Solflare                            | NOT TESTED | NOT TESTED   | NOT TESTED       |

The exact SIWS-versus-`signMessages` authentication path and the final devnet transaction signature were not added to this repository. The outcomes below therefore record the user-confirmed physical result without inventing missing evidence identifiers.

| Test                           | Expected                                                                                   | Actual                                                                                                                                               | Status                            | Evidence                                           |
| ------------------------------ | ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- | -------------------------------------------------- |
| Final preview Device A install | Preview APK installs and launches                                                          | Final APK installed, launched, and completed the physical demo flow                                                                                  | PASS                              | User-confirmed final physical run, 2026-10-06      |
| Device B APK install           | Same preview APK installs and launches                                                     | Installed and launched                                                                                                                               | PASS                              | User-confirmed two-device physical run, 2026-10-04 |
| Wallet verification A/B        | Valid challenge signed and wallet authenticated                                            | Wallet verification completed in the two-device flow and passed on the final APK                                                                     | PASS                              | User-confirmed final physical run, 2026-10-06      |
| Change wallet                  | Old server binding and local authorization are cleared                                     | Not separately exercised                                                                                                                             | NOT TESTED                        | Separate failure-path run required                 |
| Android chooser/defaults       | Multiple handlers can be chosen; clear-default help works                                  | Not separately exercised                                                                                                                             | NOT TESTED                        | Separate handler-selection run required            |
| Register item                  | AirPods Pro saved for Device A verified wallet                                             | Item creation completed on the final APK                                                                                                             | PASS                              | User-confirmed final physical run, 2026-10-06      |
| Restart persistence            | Item reloads from Supabase after app restart                                               | Not separately recorded                                                                                                                              | NOT TESTED                        | Separate restart run required                      |
| QR generation and scan         | Device A generates the item QR; Device B sees the correct item without an auto transaction | QR generation and scanning completed on the final APK                                                                                                | PASS                              | User-confirmed final physical run, 2026-10-06      |
| Malformed QR                   | Rejected safely; no crash or URL navigation                                                | Not separately exercised                                                                                                                             | NOT TESTED                        | Separate negative test required                    |
| Lost Mode                      | Device A can set 100 DEV REWARD; Device B sees Lost                                        | Lost Mode completed on the final APK                                                                                                                 | PASS                              | User-confirmed final physical run, 2026-10-06      |
| Finder report                  | Device B submits; Device A sees Device B wallet                                            | Finder report workflow completed on the final APK                                                                                                    | PASS                              | User-confirmed final physical run, 2026-10-06      |
| Owner Finder Report list       | Device A sees Device B's existing report under the lost item                               | Report section and Device B report were visible on the final APK                                                                                     | PASS                              | User-confirmed final physical run, 2026-10-06      |
| Owner Finder Report detail     | Device A opens the listed report with correct finder, reward, network, and mint            | Correct report detail opened on the final APK                                                                                                        | PASS                              | User-confirmed final physical run, 2026-10-06      |
| Wallet signing                 | Device A wallet approves and signs the prepared reward transaction                         | Wallet signing completed on the final APK                                                                                                            | PASS                              | User-confirmed final physical run, 2026-10-06      |
| DEV REWARD transfer            | Configured DEV REWARD moves A → B                                                          | Developer-controlled DEV REWARD test SPL-token transfer completed on Solana devnet                                                                   | PASS                              | User-confirmed final physical run, 2026-10-06      |
| Numeric reward normalization   | Numeric RPC reward amount is prepared without `value.trim()` failure                       | Final APK prepared and completed the reward transaction without the prior runtime failure                                                            | PASS                              | User-confirmed final physical run, 2026-10-06      |
| ATA creation                   | Clean Device B recipient ATA is created if needed                                          | Whether an ATA was created was not recorded                                                                                                          | NOT TESTED                        | Transaction evidence required                      |
| Solana confirmation            | Reward transaction confirms on Solana devnet                                               | Final APK reward transaction confirmed on devnet                                                                                                     | PASS                              | User-confirmed final physical run, 2026-10-06      |
| Backend verification           | Confirmed transfer moves database to confirmed                                             | Final physical flow completed with the confirmed reward state                                                                                        | PASS                              | User-confirmed final physical run, 2026-10-06      |
| Explorer link                  | Opens the exact transaction on devnet                                                      | Transaction confirmation passed; exact URL not stored in repo                                                                                        | PASS                              | User-confirmed devnet confirmation, 2026-10-04     |
| Duplicate prevention           | Second press/request makes no second transfer                                              | Guarded reward states, idempotent submission, and server verification remain enabled; a second physical payment attempt was not separately exercised | ENABLED / NOT PHYSICALLY RETESTED | Automated regression coverage, 2026-10-06          |
| Rejected wallet connection     | No false authenticated state                                                               | Not separately exercised                                                                                                                             | NOT TESTED                        | Separate negative test required                    |
| Rejected message signature     | Wallet remains unverified                                                                  | Not separately exercised                                                                                                                             | NOT TESTED                        | Separate negative test required                    |
| Rejected reward transaction    | No false success/confirmed state                                                           | Not separately exercised                                                                                                                             | NOT TESTED                        | Separate negative test required                    |
| Insufficient balance           | Safe failure; no confirmed reward                                                          | Not separately exercised                                                                                                                             | NOT TESTED                        | Separate negative test required                    |
| Wrong RPC/network              | Mismatch shown; transfer blocked                                                           | Not separately exercised                                                                                                                             | NOT TESTED                        | Separate negative test required                    |
| Server unavailable             | Visible failure; no invented success                                                       | Not separately exercised                                                                                                                             | NOT TESTED                        | Separate negative test required                    |

## Sign-off

- Device A wallet verification: **PASS**
- Final preview APK physically tested: **PASS**
- Two-device full demo: **PASS**
- QR generation/scanning: **PASS**
- Lost Mode: **PASS**
- Finder report: **PASS**
- Finder Report list/detail: **PASS**
- Item creation: **PASS**
- Wallet signing: **PASS**
- DEV REWARD transfer: **PASS**
- Solana devnet transaction confirmation: **PASS**
- Duplicate-payment protection: **ENABLED**
- Final APK reward-path retest: **PASS**
- Physical verification date: **2026-10-06**
- Ready for a separate mainnet phase: **NO — mainnet and official SKR remain outside this submission**
