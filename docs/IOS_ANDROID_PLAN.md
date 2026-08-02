# Mintea iOS and Android Delivery Plan

**Status:** Draft based on repository and live-environment verification  
**Verified:** 2026-08-01  
**Targets:** iOS, Android, and the existing Supabase project `izrgorgsoxkamebddlon`

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

1. Restore an append-only migration history and reconcile the working tree with the
   hosted schema.
2. Align all Expo SDK 57 dependencies and make Expo Doctor pass.
3. Remove or replace the invalid `newArchEnabled` app-config field.
4. Reduce Metro customization to supported Expo monorepo defaults and prove
   `@mintea/core` still resolves.
5. Set Android `minSdkVersion` to 26 and obtain a successful debug APK/AAB build.
6. Upgrade to Xcode 26+ and obtain a successful iOS simulator and archive build.
7. Implement native Supabase Auth deep-link/session handling.
8. Add the Android package name to native Plaid link-token creation and register the
   package in the Plaid Dashboard.
9. Configure iOS Plaid OAuth return handling/universal links and register them in the
   Plaid Dashboard.
10. Store native Supabase sessions in SecureStore instead of plain AsyncStorage.
11. Add in-app account deletion and its privileged backend operation.
12. Add EAS build profiles, signing, environment configuration, and mobile CI.

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

## 6. Official references

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
