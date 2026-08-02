# Mintea iOS and Android Delivery Plan

**Status:** Phases 0–3 complete on both platforms, except where an external account is required  
**Verified:** 2026-08-02 (re-verified after implementation — see §7)  
**Targets:** iOS, Android, and the existing Supabase project `izrgorgsoxkamebddlon`

> §2 records the state this plan was written against. §7 records what was
> measured after the work landed. Where they disagree, §7 is current.

## 1. Decision

Mintea does not need to be ported or rewritten. `apps/mintea` is already an Expo and
React Native application, and `packages/core` is already platform-independent. The
mobile apps should reuse the same UI, domain logic, database, authentication system,
and Supabase Edge Functions as the web app.

The accurate architecture description is:

> Mintea has one universal client codebase and a Supabase-managed serverless backend.

```text
Web / iOS / Android
        |
        +-- Supabase Auth
        +-- PostgREST -> Postgres, authorized by RLS
        +-- Supabase Edge Functions
                         +-- Plaid
                         +-- RentCast
```

No new custom API server is required. The existing Supabase project remains the
backend for all three clients.

## 2. Verified current state

### 2.1 Repository and JavaScript bundles

| Check | Result | Evidence or implication |
|---|---|---|
| TypeScript | **Pass** | Both npm workspaces pass `npm run typecheck`. |
| Automated tests | **Pass** | 48 tests pass. |
| Web export | **Pass** | Expo produced a 2.6 MB JS bundle and 20 KB CSS bundle. |
| iOS JS export | **Pass** | Expo bundled 2,223 modules into a 5.7 MB Hermes bundle. |
| Android JS export | **Pass** | Expo bundled 2,299 modules into a 5.8 MB Hermes bundle. |
| Expo Doctor | **Fail: 4 categories** | App config, Metro config, dependency compatibility, and Plaid New Architecture metadata need attention. |
| EAS configuration | **Missing** | No `eas.json` exists and EAS CLI is not installed globally. |
| Mobile CI | **Missing** | GitHub Actions verifies and deploys web/backend only. |

Expo Doctor reported these concrete issues:

1. `newArchEnabled` is not accepted by the installed Expo app-config schema.
2. The custom Metro `watchFolders` and `disableHierarchicalLookup` values differ from
   Expo SDK 57 defaults.
3. `@react-native-async-storage/async-storage` 3.1.1 and
   `react-native-gesture-handler` 3.1.0 are major-version mismatches for Expo SDK 57.
4. Six additional Expo/React Native packages have minor or patch mismatches.
5. React Native Directory metadata marks `react-native-plaid-link-sdk` as untested on
   New Architecture. This is a compatibility warning, not proof of failure; native
   builds and device tests are the deciding checks.

The current app also asks for automatic system appearance without installing
`expo-system-ui`; Expo prebuild warns that the package is required for this behavior.

### 2.2 Android

| Check | Result |
|---|---|
| Android SDK and ADB | Installed |
| Java | OpenJDK 17.0.15 |
| Connected emulator/device | None at verification time |
| Expo prebuild | **Pass** |
| Generated SDK levels | compile/target 36, minimum 24 |
| Gradle debug APK | **Fail** |

The Android compile reaches native dependency compilation and then fails because
Plaid Android SDK 6.1.0 requires Android API 26 while the generated Mintea app declares
API 24:

```text
uses-sdk:minSdkVersion 24 cannot be smaller than version 26 declared in
com.plaid.link:sdk-core:6.1.0
```

This is a deterministic configuration blocker. Set Mintea's Android minimum SDK to 26
using Expo configuration rather than editing generated Gradle files. Plaid's current
React Native documentation also requires Android 8.0/API 26, compile SDK 36, and a
registered Android package name for OAuth institutions.

### 2.3 iOS

| Check | Result |
|---|---|
| Xcode | 16.2, Swift tools 6.0 |
| CocoaPods | 1.16.2 |
| Simulator | iPhone 16 Pro on iOS 18.3.1, available and booted |
| Expo prebuild | **Pass** |
| `pod install` | **Pass**, 103 pods installed |
| Simulator compile | **Fail** |

The compile fails in ExpoModulesJSI before the Mintea application is linked:

```text
package 'apple' is using Swift tools version 6.2.0 but the installed version is 6.0.0
```

The local iOS toolchain must be upgraded to Xcode 26 or newer for the currently
installed Expo SDK 57 dependency graph. The generated pods raised the effective iOS
deployment target to 16.4, so that should be treated as the current baseline unless a
dependency alignment pass proves a lower target works.

### 2.4 Existing Supabase backend

| Check | Result |
|---|---|
| Linked project | `izrgorgsoxkamebddlon` / Mintea |
| Project health | **ACTIVE_HEALTHY**, Postgres 17, `us-west-1` |
| App environment | Points to the linked Mintea project; public anon key configured |
| Live database | Confirmed; the database contains accounts, Plaid Items, balances, and thousands of transactions |
| Auth health | HTTP 200 |
| Hosted signup | Enabled; email confirmation required |
| Hosted providers | Email and Google enabled |
| Edge Functions | All seven expected functions are **ACTIVE** and answer HTTP preflight |
| Function secrets | Plaid, RentCast, URL, anon, and service-role secret names are present |
| Anonymous data access | Zero visible rows for all 15 tested public tables, including `plaid_item_secrets` |
| Migration parity | **Fail**; hosted database has two migrations missing from the working tree |

The active functions are:

- `plaid-link-token`
- `plaid-exchange`
- `plaid-sync`
- `plaid-webhook`
- `plaid-remove`
- `property-value`
- `address-search`

Remote migration history contains `20260728001000` and `20260729001100`, but those
migration files are currently deleted in the working tree. Migration history is
append-only: if the related feature is intentionally being removed, preserve the old
migrations and add a new forward migration. Never delete migrations that have already
run in the hosted project.

Hosted Auth also differs from `supabase/config.toml`: hosted email confirmation is on,
while the local file says `enable_confirmations = false`. Hosted behavior is the
release behavior and the two configurations must be reconciled.

### 2.5 What was not fully verifiable

The following require credentials, dashboard state, a compatible toolchain, test users,
or intentional writes and were not claimed as passing:

- authenticated cross-household RLS tests with two independent users;
- cold-start and warm-start email confirmation/password recovery on physical devices;
- a complete Plaid Sandbox link, exchange, sync, update-mode, and disconnect cycle;
- Plaid Dashboard OAuth registration and iOS universal-link configuration;
- exact local-versus-deployed Edge Function source parity;
- Android runtime behavior on an emulator or physical device;
- iOS runtime behavior, because the installed Xcode cannot compile the project;
- signing, EAS cloud builds, TestFlight, Play internal testing, or store submission;
- hosted Auth redirect allow-list contents;
- Deno type-checking or a local Supabase stack, because Deno and Docker are not
  currently available on this Mac.

## 3. Release blockers

### P0: must be resolved before mobile beta

Status as of the 2026-08-01 implementation pass. "Done" means verified by the
evidence in §7; "code done" means implemented and unit-tested but not yet
exercised against the real external service.

1. ~~Restore an append-only migration history~~ — **Done.** Local and hosted
   histories already matched exactly; a CI guard now prevents regression.
2. ~~Align all Expo SDK 57 dependencies and make Expo Doctor pass~~ — **Done.**
   18/18 from `apps/mintea`; see §7.1 for the one documented exclusion.
3. ~~Remove the invalid `newArchEnabled` field~~ — **Done**, along with the
   top-level `splash`, which SDK 57 also rejects.
4. ~~Reduce Metro customization~~ — **Done.** `metro.config.js` is now
   `getDefaultConfig` plus NativeWind, and `@mintea/core` still resolves.
5. ~~Set Android `minSdkVersion` to 26 and obtain a successful debug APK~~ —
   **Done.** `expo-build-properties` sets 26/36/36; `assembleDebug` succeeds and
   the APK installs and launches on an API 36 emulator.
6. ~~Upgrade to Xcode 26+ and obtain a successful iOS simulator build~~ —
   **Done.** Xcode 26.6; `BUILD SUCCEEDED` from a clean prebuild, and the app
   runs on an iOS 26.5 simulator. An **archive** build still needs signing
   credentials, so that half remains open.
7. ~~Implement native Supabase Auth deep-link/session handling~~ — **Done**, and
   verified on an emulator for the error and wrong-host paths. A real
   confirmation or recovery link still needs a mailbox; see §7.5.
8. ~~Add the Android package name to native Plaid link-token creation~~ — **Code
   done.** Dashboard registration is not done and cannot be verified from here.
9. Configure iOS Plaid OAuth return handling/universal links — **Partial.** The
   backend accepts a per-platform iOS redirect URI; the associated-domains entry
   and Dashboard registration remain.
10. ~~Store native Supabase sessions in SecureStore~~ — **Done**, chunked, with a
    one-time migration off AsyncStorage.
11. ~~Add in-app account deletion and its privileged backend operation~~ —
    **Code done.** `delete-account` plus a Settings flow; see §7.8. Not executed
    against a real account, because doing so would delete real data.
12. Add EAS build profiles, signing, environment configuration, and mobile CI —
    **Partial.** `eas.json` has three profiles and CI now runs Expo Doctor and
    both native exports. Still missing: an EAS project, credentials, and cloud
    builds — all of which need an Expo account.

### P1: required before public store release

1. Complete physical-device and accessibility testing.
2. Add explicit offline, reconnect, expired-session, and partial-sync states.
3. Add privacy policy, support, data-deletion, and terms surfaces.
4. Complete Apple privacy and Google Play Data safety declarations for Supabase, Plaid,
   RentCast, authentication data, financial data, identifiers, and diagnostics.
5. Prepare store metadata, screenshots, reviewer instructions, and a safe review
   account or Plaid Sandbox path.
6. Add production monitoring for Edge Function failures, Plaid webhook failures, and
   mobile crashes.

## 4. Implementation plan

### Phase 0 — Establish the backend and repository source of truth

1. Resolve or commit the current large working-tree change set before changing native
   dependencies. Do not mix feature deletion, dependency alignment, and mobile release
   work in one change.
2. Restore the already-applied migration files:
   `20260728001000_transaction_tags.sql` and
   `20260729001100_category_group_management.sql`.
3. If tags/category groups are intentionally being removed, create a new dated forward
   migration that removes or transforms them safely.
4. Compare generated database types with the hosted schema and regenerate only after
   migration parity is restored.
5. Reconcile hosted and local Auth settings, especially email confirmation, Site URL,
   and redirect allow-list.
6. Record the intended environments: one development/staging Supabase project for beta
   testing and a separate production project before public launch. Do not use real
   financial data for automated mobile tests.
7. Pin Supabase CLI and Node 22 in CI. Node 23 works for the current tests but differs
   from the repository's Node 22 CI runtime.

**Exit criteria**

- Local and hosted migration histories match exactly.
- Generated types match the hosted schema.
- A two-user RLS test proves each household cannot read or mutate the other household.
- `plaid_item_secrets` remains unreadable to both anon and signed-in client roles.
- Auth settings are documented and identical across config and the intended backend.

### Phase 1 — Repair the Expo and native build baseline

1. Run `npx expo install --check`, then install the Expo-recommended versions rather
   than editing the lockfile manually.
2. Remove the invalid `newArchEnabled` field. Use the Expo SDK default unless a supported
   replacement is explicitly required.
3. Simplify `metro.config.js` to `getDefaultConfig` plus NativeWind. Add back only the
   smallest monorepo override that a failing resolution test proves necessary.
4. Install `expo-system-ui` or stop declaring automatic native system appearance.
5. Add `expo-build-properties` and configure Android minimum SDK 26. Keep compile/target
   SDK 36 or the later Plaid/Play-required value selected by the aligned Expo SDK.
6. Upgrade the developer Mac to Xcode 26+ and verify the selected command-line tools.
7. Decide and explicitly record the supported OS floor. Initial verified assumptions:
   Android 8.0/API 26+ and iOS 16.4+.
8. Add `eas.json` with `development`, `preview`, and `production` profiles. Use remote
   app-version management and production auto-increment.
9. Confirm ownership of `com.mintea.app`; change it before the first store build if it
   is not the permanent identifier.

**Exit criteria**

- Expo Doctor passes all applicable checks without broad warning exclusions.
- Web, iOS, and Android Expo exports pass.
- `./gradlew assembleDebug` passes from a clean prebuild.
- An iOS simulator build passes from a clean prebuild.
- Development builds install and launch on an Android emulator and iOS simulator.
- Plaid native module loads without a missing-module or New Architecture crash.

### Phase 2 — Make authentication production-safe on mobile

The app registers the `mintea` URL scheme and generates redirect URLs, but it does not
currently consume an incoming native URL and exchange its PKCE code/session tokens.
`detectSessionInUrl` is deliberately off on native, so password recovery and confirmed
signup links cannot be considered implemented until this handler exists.

1. Add one native auth-link handler at the application root.
2. Handle both cold start (`getInitialURL`) and a link received while the app is open.
3. Validate the URL host/path, parse the PKCE code or token payload, and call the
   appropriate Supabase session exchange method.
4. Preserve the `PASSWORD_RECOVERY` distinction and route recovery links to the reset
   form before the normal signed-in redirect.
5. Add `mintea://**` to the hosted Supabase Auth redirect allow-list for development.
6. For production, prefer verified HTTPS universal/app links so email clients and OAuth
   providers can return reliably. Retain the custom scheme as a controlled fallback.
7. Replace native AsyncStorage session persistence with a SecureStore-backed adapter;
   retain browser storage for web.
8. Decide whether Google sign-in is a released feature. The provider is enabled in
   hosted Supabase but the application currently exposes only email/password UI.
9. Add account deletion in Settings and a JWT-protected Edge Function that deletes or
   anonymizes the user's household data and then deletes the Auth user using the service
   role. Define behavior for multi-member households before implementing it.

**Exit criteria**

- Signup confirmation, sign-in, refresh, sign-out, password reset, and account deletion
  pass on both platforms.
- Every flow passes from terminated, backgrounded, and foreground app states.
- Invalid, expired, replayed, and wrong-host links fail safely.
- Session material is not stored in plain AsyncStorage on native.

### Phase 3 — Complete native Plaid behavior

1. Extend the link-token request contract with platform metadata controlled by the
   trusted app/backend contract.
2. For Android Link sessions, send `android_package_name: "com.mintea.app"` from the
   Edge Function and register the same package in Plaid Dashboard.
3. Configure Plaid iOS OAuth/universal links and associated domains. Register the final
   iOS bundle identifier and redirect configuration in Plaid Dashboard.
4. Keep `PLAID_SECRET` and Item access tokens exclusively in Edge Functions and
   `plaid_item_secrets`; never add them to EAS or `EXPO_PUBLIC_*` variables.
5. Verify the deployed Plaid environment intentionally. Do not infer sandbox versus
   production from the existence of a secret name.
6. Run the full matrix for new Item, OAuth institution, returning-user phone profile,
   duplicate Item, update mode, transaction sync, webhook sync, throttled balance
   refresh, and disconnect.
7. Capture and monitor `onEvent`/`onExit` metadata without logging credentials, account
   numbers, access tokens, or other sensitive bank data.

**Exit criteria**

- Plaid Sandbox works end to end on one physical Android and one physical iPhone.
- At least one OAuth institution returns correctly on each platform.
- Web behavior remains unchanged.
- Webhook signature validation and per-user Item authorization tests pass.

### Phase 4 — Mobile UX, resilience, and device QA

1. Test dashboard, accounts, transactions, categories, rules, properties, charts, and
   settings on small and current phone sizes.
2. Verify safe areas, keyboard avoidance, modal dismissal, back gestures, Android system
   back, orientation policy, dark mode, and large system text.
3. Test slow network, no network, reconnect, background/foreground, expired JWT, Edge
   Function error, partial Plaid sync, and webhook delay.
4. Define the first release's offline promise. At minimum, preserve the last successful
   read state and provide an explicit offline indicator; do not imply edits are saved
   until the backend accepts them.
5. Add accessibility labels/roles, focus behavior, sufficient contrast, reduced-motion
   behavior, and screen-reader smoke tests.
6. Test performance with the existing live-scale transaction count and a larger
   synthetic dataset without copying real financial records to fixtures.

**Minimum device matrix**

| Platform | Simulator/emulator | Physical |
|---|---|---|
| iOS | Current iPhone Pro plus a small supported iPhone | One current supported iPhone |
| Android | Current Pixel plus an API 26 emulator | One mid-range Android device |

### Phase 5 — Build, signing, and CI/CD

1. Create or confirm Apple Developer, App Store Connect, Google Play Console, and Expo
   organization ownership.
2. Configure EAS project identity and credentials without committing signing secrets.
3. Put only public Supabase URL/key values in EAS client build environments. Supabase
   backend secrets stay in the Supabase hosted secret store.
4. Produce development builds for engineers, preview builds for internal QA, and signed
   production builds for stores.
5. Add GitHub checks for Expo Doctor, iOS/Android JS exports, and EAS preview builds.
6. Keep backend deployment ahead of client publication whenever a client requires a new
   migration or Edge Function contract.
7. Add a release checklist that records the app commit, migration head, deployed
   function versions, EAS build IDs, and Supabase project ref.

Suggested commands after Phase 1 is complete:

```bash
npm ci
npm run typecheck
npm test
npx expo-doctor
npx expo export --platform ios
npx expo export --platform android
eas build --platform all --profile preview
eas build --platform all --profile production
eas submit --platform ios
eas submit --platform android
```

**Exit criteria**

- Preview builds install through internal distribution.
- Production `.ipa` and `.aab` artifacts build reproducibly.
- TestFlight and Play internal-track installs pass the release smoke suite.
- Version codes/build numbers increment automatically and cannot be reused.

### Phase 6 — Privacy, compliance, and store launch

1. Publish a privacy policy and expose it inside Settings as well as store metadata.
2. Document collection and processing of identity/contact data, linked-account and
   transaction data, property addresses, device identifiers, and operational logs.
3. Include third-party behavior from Supabase, Plaid, RentCast, Expo, and any future
   crash/analytics SDK in Apple and Google disclosures.
4. Complete App Store privacy details and Google Play Data safety accurately.
5. Provide an in-app account-deletion path and the required web deletion/request path.
6. Add support URL/contact, terms, age rating, category, encryption/export-compliance
   answers, screenshots, and review notes.
7. Give reviewers a deterministic demo path that does not expose a real user's bank
   data. Prefer a dedicated test backend/user and Plaid Sandbox institutions.
8. Roll out in stages, monitor auth/Plaid/webhook/crash signals, and define rollback
   criteria before increasing availability.

**Public-release gate**

- No open P0 blocker.
- Clean install, upgrade, deep-link, Plaid, and account-deletion suites pass.
- Backend migration/function versions match the mobile release manifest.
- Privacy disclosures match observed network and SDK behavior.
- Support and incident-response ownership is active.

## 5. Recommended delivery order

```text
Backend/source parity
    -> Expo dependency and config repair
    -> Android and iOS clean native builds
    -> Auth deep links and secure session storage
    -> Native Plaid OAuth
    -> Device/resilience QA
    -> EAS preview builds
    -> Privacy and store preparation
    -> TestFlight / Play internal testing
    -> Staged production release
```

Do not start store submission before Phases 0–3 pass. Store work can proceed in
parallel with device QA only after identifiers, data practices, and account deletion
behavior are stable.

## 7. Verification record — implementation pass, 2026-08-01/02

Everything below was run from a clean `npm ci` on branch
`feat/ios-android-release`. Anything not listed here was not run, and nothing
here is inferred from a related result.

### 7.1 Expo Doctor — §2 was right, and it is now fixed

An earlier draft of this section claimed Expo Doctor passed and that §2.1's
four failing categories were not reproducible. **That was wrong**, and it was
wrong for an embarrassing reason: `npx expo-doctor` was being run from the
repository root, where there is no Expo app, so the dependency and config
checks had nothing to compare against and passed vacuously. Run from
`apps/mintea`, all four categories fail exactly as §2.1 describes. CI caught
this, because the job added in this branch runs it in the right directory.

All four are now resolved:

| Check | Cause | Fix |
|---|---|---|
| App config schema | SDK 57 accepts neither `newArchEnabled` (New Architecture is the default) nor a top-level `splash` | Removed the former; the latter moved into an `expo-splash-screen` plugin entry, same images and colours |
| Metro config | `watchFolders` and `disableHierarchicalLookup` disagreed with the SDK 57 defaults, which already handle workspaces | Reduced `metro.config.js` to `getDefaultConfig` plus NativeWind. All three exports still resolve `@mintea/core` |
| SDK version alignment | 8 packages out of date, 2 by a major version | `expo install --fix`, then a clean reinstall to dedupe — with one exception below |
| React Native Directory | `react-native-plaid-link-sdk` is marked untested on New Architecture | Excluded, with justification: this is metadata, not a test result, and the module now demonstrably loads and runs on both platforms (§7.3) |

**The version-alignment exception is worth knowing about.** Expo's expected
versions for SDK 57 name `react-native-gesture-handler@~2.32.0` and
`react-native-safe-area-context@~5.7.0`, but `expo-router@57.0.9` — an Expo
package — itself depends on `3.1.0` and `5.8.0`. Pinning Expo's numbers
installs both, and two copies of a native module is a worse problem than a
version table that disagrees with itself. Those two therefore stay on what
`expo-router` requires and are listed in `expo.install.exclude`. Everything
else moved to the expected version, including a deliberate downgrade of
`@react-native-async-storage/async-storage` from 3.1.1 to 2.2.0.

**The native JS exports were broken, not passing.** §2.1 records iOS and
Android exports as passing. At `origin/main` both fail:

```text
TypeError: Cannot read properties of undefined (reading '0')
    at parseAspectRatio (node_modules/react-native-css-interop/dist/css-to-rn/parseDeclaration.js:1764:30)
```

The cause is a missing `break` in that library: `case "box-shadow"` falls
through into `case "aspect-ratio"`, which then reads `.ratio[0]` of a shadow
value. Any literal `box-shadow` in a file NativeWind compiles for native
triggers it, and the landing page added 21 of them to `global.css`. Fixed by
moving the web-only landing styles to `apps/mintea/landing.css`, imported by
`LandingPage.web.tsx`, so the native bundler never sees them. Web still loads
them as a separate stylesheet; the rendered page and its computed aspect
ratios are unchanged.

### 7.2 Backend — passing

| Check | Evidence |
|---|---|
| Migration parity | `supabase migration list --linked`: all 13 local files present remotely, no remote-only versions |
| Types vs hosted schema | All 15 remote tables and 19 functions accounted for; the 14 client tables match column for column. `plaid_item_secrets`, `is_valid_reporting_timezone` and `seed_default_categories` are absent from the client types deliberately |
| Two-user RLS | `tests/householdIsolationMigration.test.mjs` — the real migrations in PGlite, signed in as `authenticated`, across 11 tables, the household RPCs, and cross-household writes |
| `plaid_item_secrets` | Unreadable to anon and to a signed-in user in that test; a live anon probe against the hosted project returns `[]` |
| Hosted Auth settings | `GET /auth/v1/settings`: email + Google enabled, `disable_signup: false`, `mailer_autoconfirm: false`. `config.toml` now matches |

The RLS test models hosted Supabase's default table grants on purpose, so RLS
is the only boundary under test. Disabling RLS on `transactions` makes it fail,
which is what makes it worth having.

### 7.3 Android and iOS — both passing

| Check | Result |
|---|---|
| `expo prebuild --platform android --clean` | Pass; `android.minSdkVersion=26`, compile/target 36 |
| `./gradlew assembleDebug` | **BUILD SUCCESSFUL in 11m 55s**; `app-debug.apk` produced, merged manifest `minSdkVersion="26"` |
| Install + launch on emulator (API 36) | Pass; `com.mintea.app/.MainActivity` resumed, 2,491 modules bundled, sign-in screen renders, no crash |
| Plaid native module | Loads without a missing-module or New Architecture crash |
| `expo prebuild --platform ios --clean` | Pass |
| `pod install` | Pass, 277 pods — **but only with a UTF-8 locale.** Without `LANG`, CocoaPods 1.16.2 on Ruby 3.4 dies with `Unicode Normalization not appropriate for ASCII-8BIT` |
| iOS simulator build | **BUILD SUCCEEDED** on Xcode 26.6; 137 MB `Mintea.app` |
| Launch on iPhone 17 Pro (iOS 26.5) | Pass; 2,413 modules bundled, sign-in screen renders, safe areas clear the Dynamic Island |

The Swift toolchain failure that blocked this is gone: Xcode 26.6 carries Swift
6.2, which is what `expo-modules-jsi` asks for, and the
`Build ExpoModulesJSI xcframework` phase now completes.

**Three things the upgrade needed beyond installing Xcode**, each of which
fails in a way that does not name the real cause:

1. **The licence.** Until `sudo xcodebuild -license accept` runs, every
   `xcodebuild` and `xcrun` call is refused, including `simctl`. The system
   still records the *previous* Xcode's version as the agreed one, so this is
   easy to mistake for a broken install.
2. **The iOS platform.** Xcode 26 ships no simulator runtime, and the leftover
   iOS 18.3 runtime is not an eligible destination for it, so
   `xcodebuild -showdestinations` lists nothing buildable at all and a build
   reports `iOS 26.5 is not installed` against a placeholder "Any iOS Device"
   even when a simulator was named explicitly. Fixed by
   `xcodebuild -downloadPlatform iOS` (8.52 GB).
3. **The locale**, as above — unchanged, but now on the critical path because
   the clean prebuild runs `pod install` itself.

Not done: an **archive** build. It needs signing credentials from an Apple
Developer account.

### 7.4 Bundles and tests — passing

| Check | Result |
|---|---|
| `npm run typecheck` | Pass, both workspaces |
| `npm test` | Pass — 218 tests |
| `expo export --platform web` | Pass — 1,502 modules |
| `expo export --platform ios` | Pass — 2,253 modules |
| `expo export --platform android` | Pass — 2,329 modules |
| Landing page render | Verified in a browser against the built export; both stylesheets load, no console errors |

### 7.5 Auth deep links — verified on both platforms

Fired as real `android.intent.action.VIEW` intents and, on iOS, through
`simctl openurl`, at the running app:

| Link | Result |
|---|---|
| `mintea:///?error=access_denied` | Sign-in screen shows "That link has expired or was already used." |
| `mintea:///?error=server_error&error_description=…` | Shows the provider's description |
| `mintea://attacker.example/?code=…&type=recovery` | No session, no error, no recovery redirect — refused, as intended |

On iOS the wrong-host link was fired while a distinct error banner was showing,
so "refused" is visible rather than inferred: the banner was still the earlier
one afterwards, and the app was still on the sign-in screen.

The wrong-host case exposed a second defect: the auth handler ignored the link
but expo-router still navigated to it and left the user on "Page could not be
found" with no way back. Any installed app can send that link. `+not-found`
now redirects to the entry point; re-verified on the emulator.

Cold start was checked separately on both platforms: with the app force-stopped
(Android) or terminated (iOS), the same link launched it and the error still
reached the sign-in screen, so `getInitialURL` delivery works and not just the
warm listener.

One iOS-only behaviour worth knowing when testing: the first `mintea://` link
of a session raises an "Open in Mintea?" system prompt that must be accepted
before the app sees the URL. Later links in the same session arrive directly.

The secure-storage adapter was exercised against a real device keystore on both
platforms through a temporary dev screen (since removed), because app startup
alone only ever reads an empty session:

| Case | Android keystore | iOS Keychain |
|---|---|---|
| 3,733-byte session written and read back | Exact | Exact |
| Overwrite with a much smaller value | Exact — no orphaned chunk stitched in | Exact |
| `removeItem` then read | `null` | `null` |
| 900 emoji (4-byte code points) | Exact — no code point split across a chunk | Exact |

Chunking is only strictly required on Android, whose entries cap at 2,048
bytes, but running the same path on both keeps one implementation rather than
two.

Not verified, and not claimable without the missing piece: a real confirmation
or password-recovery link end to end. That needs a mailbox and a hosted
redirect allow-list entry for `mintea://**`, which cannot be read or set from
here.

### 7.6 Account deletion

`delete-account` revokes every Plaid Item at Plaid before deleting anything
locally, and fails the whole operation if Plaid refuses for any reason other
than "already gone" — a failed delete can be retried, a bank connection that
outlives the account cannot be revoked at all.

What deletion means depends on the household, and that decision is unit-tested
in `tests/accountDeletion.test.mjs`:

| Household | Outcome |
|---|---|
| Caller is the only member | Household deleted; everything cascades; Auth user removed |
| Others remain, another owner exists | Caller leaves; the household's data stays |
| Others remain, caller is the last owner | Refused — see below |

The refusal is deliberate. Deleting would destroy records belonging to the
remaining members, and promoting one of them in the caller's absence would grant
write access they never agreed to. Neither is the app's decision to make. The
state cannot arise today because there is no invite flow; when sharing ships it
brings an ownership transfer, and the error message already points there.

The cascade the sole-member path relies on is proven, not assumed: dropping a
household leaves zero rows in all eleven scoped tables, and no Plaid access
token outlives its Item.

Not verified: the flow has never been run against a real account, because the
only accounts available are real ones holding live financial data. It needs a
staging project and a throwaway user.

### 7.7 Not attempted

Plaid Sandbox end to end; any OAuth institution; physical devices; EAS builds,
signing, TestFlight or Play; Plaid Dashboard registration; the hosted Auth
redirect allow-list; Edge Function source parity against what is deployed;
Deno type-checking and `supabase db dump`, both of which need Docker or Deno —
neither is installed on this Mac.

The `plaid-link-token` change is deployed by CI on merge to `main`. It has not
run against Plaid, and `PLAID_IOS_REDIRECT_URI` / `PLAID_ANDROID_PACKAGE_NAME`
are not yet set as hosted function secrets.

### 7.8 Next

Everything left needs a credential or an account that is the owner's to
provide. None of it is blocked on code, and none of it is blocked on tooling
any more.

1. **A staging Supabase project.** It unblocks the most: signup confirmation,
   password recovery, and running account deletion end to end without touching
   the database that holds live financial data.
2. **An Apple Developer account**, for signing and therefore for an archive
   build, TestFlight, and a physical-device run.
3. **An Expo account and EAS credentials**, then preview builds on both
   platforms and a Play internal track.
4. **Plaid Dashboard**: register `com.mintea.app` and the iOS redirect, set
   `PLAID_ANDROID_PACKAGE_NAME` and `PLAID_IOS_REDIRECT_URI` as function
   secrets, then run the Sandbox matrix.
5. **Hosted Auth redirect allow-list**: add `mintea://**`, which `config.toml`
   already declares but which cannot be pushed from here.
6. Store metadata, privacy disclosures and review notes (Phase 6), once the
   identifiers above are final.

## 8. Official references

- [Expo EAS Build](https://docs.expo.dev/build/introduction/)
- [Expo app version management](https://docs.expo.dev/build-reference/app-versions/)
- [Expo store submission](https://docs.expo.dev/deploy/submit-to-app-stores/)
- [Supabase native mobile deep linking](https://supabase.com/docs/guides/auth/native-mobile-deep-linking)
- [Supabase Auth with React Native](https://supabase.com/docs/guides/auth/quickstarts/react-native)
- [Plaid Link for React Native](https://plaid.com/docs/link/react-native/)
- [Plaid Link for Android](https://plaid.com/docs/link/android/)
- [Plaid Link for iOS](https://plaid.com/docs/link/ios/)
- [Apple App Privacy Details](https://developer.apple.com/app-store/app-privacy-details/)
- [Google Play Data safety](https://support.google.com/googleplay/android-developer/answer/10787469)
