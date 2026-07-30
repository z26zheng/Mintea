# Mintea UI/UX Modernization PRD

Status: In progress on `codex/ui-ux-foundation`; not merged or deployed
Owner: Product and frontend
Last updated: July 29, 2026
Target: Web, iOS, and Android
Related: `PRODUCT_ROADMAP.md`, `IMPLEMENTATION_PLAN.md`

## Executive summary

Mintea now has enough real product depth that its interface should stop feeling
like a well-organized engineering prototype and start feeling like a polished,
trustworthy financial product.

This initiative gives Mintea a distinctive visual identity, clearer information
hierarchy, more resilient responsive layouts, and purposeful motion. The desired
experience is calm, premium, and data-forward. It should feel satisfying without
turning money into a game or using animation as decoration.

The first release concentrates on the shared design foundation and the three
most-used surfaces:

1. application shell and navigation;
2. dashboard;
3. transactions;
4. accounts.

Later slices extend the system to reports, detail and editing flows, settings,
authentication, and empty/error/loading states.

This is primarily a frontend initiative. It does not depend on a new financial
data model, new Plaid products, or new reporting calculations.

## Worktree progress — July 29, 2026

The first implementation pass now covers the highest-leverage P0 foundation and
primary surfaces:

- original Mintea mark, wordmark, favicon, app icon, adaptive Android layers,
  splash treatment, and branded sign-in;
- warmer semantic light/dark foundations and matching runtime chart colours;
- shared `PageHeader`, reduced-motion-aware reveal, and layout-matched skeleton
  primitives;
- consistent money sizing, cards, fields, buttons, rows, focus, hover, pressed,
  selected, and accessibility states;
- a responsive dashboard composition with designed sparse-history, line/bar,
  metric, range, loading, review, reports, and recent-activity states;
- a clearer account balance-sheet hierarchy, net-worth hero, duplicate review,
  account metadata, and reversible zero-balance visibility;
- polished transaction search and rows, a mobile filter-overflow cue,
  full-screen phone filters, and anchored desktop multi-select filters.

Verification completed against a disposable copy of the production-shaped
household containing 46 accounts, 96 balance records, 2,501 transactions, and 3
properties. Browser checks covered 390×844, 820×1180, and 1440×900 in light and
dark themes, including sign-in/sign-out, chart interactions, account
visibility, and transaction filter apply/clear behavior. The disposable user
and household were deleted afterward.

The automated suite passes 150 tests, the TypeScript workspace check, whitespace
validation, and the production Expo web export. This is still a partial P0
slice: the 320px, browser zoom, native-device/smoke-build, visual-regression,
secondary-screen, and deployment gates below remain open.

## Why now

Mintea already supports connected and manual accounts, transaction cleanup,
account deduplication, transfer matching, tags, rules, CSV export, connection
health, historical charts, and period reporting. Those capabilities are useful,
but their presentation is still visually conservative and occasionally brittle.

A code and production-browser audit of the July 29, 2026 `main` baseline found:

- a coherent mint-and-ink palette, responsive side/bottom navigation, shared
  primitives, dark-mode styles, and accessible roles already exist;
- the app icon and favicon still use the Expo starter artwork, while sign-in
  relies on a tea emoji instead of a Mintea identity;
- most desktop pages are constrained to the same narrow `max-w-3xl` column,
  leaving large displays underused even on data-heavy screens;
- the interface relies heavily on white cards, grey borders, and nearly
  identical row treatments, so primary, secondary, and supporting information
  compete at similar visual weight;
- typography uses a small set of system-font sizes with no formal display,
  metric, label, or dense-data scale;
- large amounts can wrap digit-by-digit inside mobile summary cards;
- mobile transaction filters continue beyond the viewport without an obvious
  scroll affordance or compact summary;
- category emoji, vector navigation icons, text chevrons, and status dots form
  several different icon languages;
- animation is largely limited to the platform's default modal slide and fade;
  list updates, navigation, chart changes, saved edits, and refreshed values
  have little or no visual continuity;
- loading treatment is mostly a centered spinner, with skeletons present only
  in isolated workflows;
- success and failure feedback varies by screen and can cause content to jump;
- the dark theme follows the operating system but cannot be selected manually;
- visible keyboard focus, reduced-motion behavior, and motion accessibility are
  not yet defined as a system.

The result is usable but not yet memorable. More importantly, visual polish is
now a trust feature: a financial product should make state, hierarchy, and
consequences feel deliberate.

## Product vision

Mintea should feel like a calm financial workspace:

- **Clear:** the most important number and next action are immediately obvious.
- **Trustworthy:** totals do not jump unexpectedly, destructive actions are
  unmistakable, and sync freshness is visible without being alarming.
- **Warm:** mint and tea-inspired details make the product approachable without
  weakening its financial seriousness.
- **Responsive:** phone, tablet, and desktop use compositions designed for each
  form factor rather than merely stretching the same column.
- **Alive:** motion explains where content came from, what changed, and what the
  system is doing.
- **Quietly premium:** strong typography, precise spacing, restrained depth, and
  excellent transitions do more work than gradients, glass, or ornament.

The interface should not resemble a trading terminal, a crypto casino, or a
children's budgeting game.

## Goals

### Product goals

- Give Mintea a recognizable identity independent of Expo and emoji.
- Make dashboard totals, account groups, and transaction activity faster to
  scan.
- Increase perceived quality without reducing information density.
- Make every mutation communicate pending, success, failure, and recovery.
- Make transitions preserve context between lists and detail/editing surfaces.
- Remove avoidable overflow, wrapping, truncation, and layout-shift defects.
- Establish reusable visual and motion primitives so future roadmap features do
  not invent their own presentation.
- Preserve one implementation model across React Native, React Native Web, iOS,
  and Android.

### User goals

- Understand current financial position within a few seconds.
- See which numbers changed and why without hunting.
- Find, filter, and edit a transaction with minimal interruption.
- Distinguish accounts, institutions, categories, merchants, statuses, and tags
  at a glance.
- Feel confident that an action completed and know how to recover if it did not.
- Use the product comfortably with touch, mouse, keyboard, screen reader, dark
  mode, and reduced motion.

### Engineering goals

- Move color, typography, radius, spacing, elevation, and motion values into a
  documented token system.
- Eliminate hand-maintained drift between Tailwind tokens and runtime chart or
  navigation colors.
- Prefer composable primitives over screen-specific style duplication.
- Keep interaction animations smooth on representative mid-range phones.
- Add visual-regression coverage for the core responsive states.

## Non-goals

- Rebuilding the backend or changing financial calculations.
- Adding budgeting, recurring bills, goals, investments, or other product
  roadmap packages as part of this initiative.
- Replacing Expo Router, React Native, NativeWind, or TanStack Query.
- A fully customizable dashboard in the first release.
- Decorative 3D charts, confetti for routine financial actions, parallax-heavy
  pages, or autoplaying illustration.
- Hiding important financial details to create a superficially minimal screen.
- Animating every element.

## Success measures

### Usability and quality

- At least 90% of test participants can identify net worth, available cash,
  recent spending, and the path to transactions within 30 seconds.
- At least 90% can apply and clear a transaction filter without assistance.
- No currency value breaks between digits at supported viewport widths.
- No primary action, filter, status, or account identity is hidden only because
  a label is long.
- All core flows work at 320, 390, 768, 1024, and 1440 CSS pixels wide.
- All interactive controls have a visible keyboard focus state.
- All required text and controls meet WCAG 2.2 AA contrast.
- All tap targets are at least 44 by 44 points, except tightly grouped desktop
  controls with an equivalent accessible hit area.
- Reduced-motion mode removes nonessential movement and replaces spatial
  transitions with short fades or instant state changes.

### Performance

- Routine transitions target 60 frames per second on a representative mid-range
  iOS and Android device.
- No standard transition lasts longer than 320 milliseconds.
- Loading placeholders reserve their final layout and avoid cumulative layout
  shift.
- Long transaction and account lists remain virtualized and responsive.
- Decorative assets do not delay first meaningful financial content.

### Product signals

Measure changes against the four weeks before release:

- dashboard-to-transaction and dashboard-to-report click-through;
- successful filter use and filter-clear rate;
- transaction edit completion and abandonment;
- account refresh completion and retry rate;
- frequency of immediate back-navigation from detail screens;
- user-reported visual or responsive defects;
- qualitative trust and polish rating in usability interviews.

Analytics must never contain raw transaction descriptions, amounts, account
masks, email addresses, or other financial content.

## Experience principles

### 1. Data is the hero

Every screen gets one primary focal point. Decoration must support that focal
point rather than compete with it.

### 2. Calm confidence

Mint is an accent, not wallpaper. Red is reserved for errors, destructive
actions, and genuinely unfavorable states. Normal spending remains neutral.

### 3. Motion explains

Animation should answer at least one question:

- Where did this surface come from?
- What changed?
- Is the product still working?
- Can I undo what happened?

If motion does not answer one of those questions, it should probably be removed.

### 4. Responsive composition, not responsive shrinking

Phone uses stacked cards, bottom navigation, sheets, and thumb-reachable
actions. Desktop uses a wider content canvas, stable sidebar, denser rows,
anchored menus, and contextual panels. Tablet gets an intentional intermediate
composition.

### 5. Financial truth over visual drama

Charts keep honest scales, labels, and units. Count-up animations never imply
precision that does not exist. Positive green and negative red are not the only
way to communicate direction.

### 6. Familiar controls, distinctive finish

Navigation, filtering, forms, confirmation, and selection should behave as users
expect. Mintea's identity comes from type, color, illustration, depth, and
microinteraction—not surprising control behavior.

## Visual identity

### Brand concept

The design direction is **calm financial clarity**. The visual metaphor is not a
literal cup of tea on every screen. It is the feeling of stepping back, seeing
the whole financial picture, and making one measured decision.

### Required identity work

- Create an original Mintea app icon, favicon, wordmark, and monochrome mark.
- Replace the Expo starter assets on web, iOS, Android, splash, and adaptive
  icon surfaces.
- Replace the sign-in tea emoji with the Mintea mark and a small branded
  composition.
- Define a compact brand guide covering clear space, minimum size, background
  use, and light/dark variants.
- Validate icon recognition at 16, 32, 64, 180, 512, and 1024 pixels.

### Color

Keep mint as the core accent, but formalize the palette into semantic roles:

- canvas;
- elevated canvas;
- surface;
- raised surface;
- border subtle;
- border strong;
- text primary;
- text secondary;
- text tertiary;
- accent;
- accent hover/pressed;
- accent soft;
- positive;
- warning;
- critical;
- information;
- chart series colors.

Large areas should use neutral or very lightly tinted surfaces. Gradients may
appear in the brand mark, chart area fills, or one dashboard hero surface, but
not as a default card treatment.

Color must never be the only indicator of income/spending, selected state,
connection health, validation, or chart series.

### Typography

Define and implement a cross-platform type ramp:

- display metric;
- page title;
- section title;
- card title;
- body;
- dense body;
- label;
- metadata;
- microcopy.

Requirements:

- financial amounts use tabular numerals;
- metric components support responsive sizes and a deliberate compact fallback;
- amounts never wrap between digits or between a currency sign and its value;
- long merchant, account, and institution names truncate predictably with the
  full value available to assistive technology and, on desktop, hover/focus;
- line height, weight, and letter spacing are tokenized;
- evaluate a distinctive but highly readable typeface such as Inter, Geist, or
  Manrope, including loading behavior and native packaging, before replacing
  system fonts.

### Iconography and imagery

- Use one vector icon family for navigation, actions, status, and utility
  controls.
- Replace text chevrons with vector icons.
- Replace category emoji in dense financial lists with a coherent icon-badge
  system. Existing emoji can remain as user-selectable category personality,
  but the default set must feel intentional.
- Show institution logos only when sourced reliably and with a monogram fallback.
- Show merchant logos only when they improve recognition and have a stable
  fallback; never leave broken or visually inconsistent image holes.
- Avoid stock photography inside the signed-in product.

### Shape, border, and depth

- Use no more than three primary radius tokens.
- Reduce the number of visible borders by using spacing, background contrast,
  and restrained elevation to define groups.
- Use a subtle shadow/elevation scale for floating menus, sheets, sticky bars,
  and selected cards.
- Avoid nested cards when a section, divider, or background change communicates
  the same hierarchy.

## Layout and navigation

### Responsive ranges

Use these product ranges even if implementation breakpoints differ slightly:

| Range | Width | Composition |
|---|---:|---|
| Small phone | 320–374 | Single column, compact type, horizontal overflow resolved |
| Phone | 375–767 | Single column, bottom navigation, sheets |
| Tablet | 768–1023 | Sidebar or rail, wider cards, selective two-column layout |
| Desktop | 1024–1439 | Full sidebar, 12-column content canvas, contextual panels |
| Large desktop | 1440+ | Maximum readable canvas around 1200px, denser data regions |

The 768-pixel content cap may remain for forms and prose, but it must not be the
global maximum for dashboards, transaction exploration, accounts, or reports.

### Application shell

Desktop:

- show the Mintea mark and wordmark at the top of the sidebar;
- use a compact active-nav treatment with clear focus and hover states;
- reserve a footer region for profile, theme, sync state, and Settings;
- allow the primary content canvas to expand independently of the sidebar;
- keep page headers aligned across routes;
- support a persistent contextual panel for transaction/account details at
  large widths.

Mobile:

- keep a maximum of five primary destinations in bottom navigation;
- respect safe-area insets and keyboard visibility;
- use a small top app bar only where a screen needs context or actions;
- prevent content and snackbars from sitting behind the bottom bar.

Information architecture should be reviewed after Reports stabilizes. A likely
target is Dashboard, Accounts, Transactions, and Reports as primary destinations,
with Settings under the profile entry. The first visual slice may preserve the
existing destinations to avoid mixing a navigation migration into foundational
styling.

### Page header

Create one responsive `PageHeader` pattern with:

- title and optional supporting text;
- optional primary action;
- optional secondary actions or overflow menu;
- optional status or last-updated context;
- sticky behavior only on dense list screens;
- consistent spacing at every breakpoint.

Icon-only actions require a tooltip on desktop and an accessible label everywhere.

## Motion system

### Motion tokens

| Token | Duration | Typical use |
|---|---:|---|
| Instant | 80–100ms | Press feedback, hover color |
| Fast | 140–180ms | Chip selection, toggle, tooltip |
| Standard | 200–240ms | Menu, toast, small state transition |
| Emphasized | 280–320ms | Sheet, contextual panel, first chart reveal |

Use a standard ease-out curve for entrances, ease-in for exits, and a restrained
spring only for direct-manipulation or selection feedback. Bouncy financial
totals and elastic navigation are out of scope.

### Required transitions

- Page content fades or translates subtly when changing primary destinations;
  the navigation shell stays stable.
- Desktop transaction/account details open in a side panel from the selected
  row; phone details rise as a sheet or navigate with a platform-native push.
- Filter menus scale/fade from their anchor on desktop and rise from the bottom
  on mobile.
- Selected chips animate background, border, and check state without changing
  surrounding layout.
- Charts crossfade or interpolate when metric, range, or chart type changes.
- Newly refreshed values highlight briefly, then settle; unchanged values do
  not animate.
- Bulk-selection bars enter from the nearest edge and keep the list anchored.
- Rows removed from a filtered result collapse smoothly when motion is enabled.
- Toasts enter without moving page content.
- Skeletons crossfade into real content.

### Reduced motion

When the operating system requests reduced motion:

- remove parallax, count-up, path drawing, spring, and spatial travel;
- replace navigation and sheet movement with a short fade or immediate update;
- keep progress indicators and focus movement understandable;
- never make task completion depend on seeing an animation.

## Interaction feedback

### Global feedback pattern

Introduce a cross-platform notice system:

- non-blocking toast/snackbar for success and reversible actions;
- inline notice for errors tied to a particular field or section;
- banner for persistent account/sync conditions;
- modal confirmation only for consequential or destructive actions.

Examples:

- “Transaction updated” with Undo when reversal is safe.
- “3 transactions tagged” with View.
- “Accounts refreshed” with a concise freshness detail.
- “Connection needs attention” as a persistent banner, not a disappearing toast.

Notices must avoid exposing sensitive financial content on a locked device.

### Loading

- Use layout-matched skeletons for dashboard cards, account groups, transaction
  rows, report tiles, and detail panels.
- Use a spinner only for a local action whose surrounding content can remain
  visible.
- Preserve the previous valid view during background refresh.
- Distinguish initial load, background refresh, pagination, and mutation states.
- Disable only the control affected by a mutation unless the entire surface is
  genuinely unsafe to use.

### Optimistic and destructive actions

- Optimistically update low-risk edits when rollback is reliable.
- Use Undo for reversible hiding, review state, category/tag changes, and other
  safe mutations.
- Keep explicit confirmation for account disconnection, permanent removal,
  merge, tag deletion with usage, and other consequential actions.
- Confirmation copy states exactly what is removed, preserved, or reversible.

## Screen requirements

### Authentication and first-run

- Replace emoji-first branding with the Mintea mark and wordmark.
- Give desktop auth a balanced split composition or branded background detail
  while keeping the form narrow and focused.
- Maintain a simple single-column form on phone.
- Animate sign-in/sign-up mode changes without moving entered values
  unexpectedly.
- Show password visibility and clear validation states.
- Design confirmation-email, password-reset, offline, and configuration-missing
  states as part of the same system.
- Keep financial promises factual; do not imply bank-grade guarantees Mintea
  has not independently established.

### Dashboard

The dashboard should answer three questions in order:

1. Where do I stand?
2. What changed?
3. What needs my attention?

Requirements:

- Use a responsive hero region for the selected metric, period change, chart,
  range, and metric controls.
- Preserve tabular digits and keep the primary amount on one line where
  possible; use a tested compact formatter only when space truly requires it.
- Replace the current two equal summary cards with an adaptive stat grid that
  can include cash, assets, debt, and cash flow without awkward wrapping.
- Make review, sync, and duplicate-account alerts visually distinct by severity
  and actionability.
- Give recent activity a stronger relationship to the transaction list.
- Use chart animation only when data has at least two meaningful points.
- Give single-point and empty chart states a compact, designed composition
  instead of leaving a large visually empty plot.
- On desktop, use the wider canvas for a two-column composition when data
  supports it; do not stretch the chart solely to fill space.
- On phone, ensure all range controls fit or scroll with an explicit affordance.

### Accounts

Requirements:

- Treat net worth and refresh state as a unified summary header.
- Show account-group totals in a sticky or easily scannable group header.
- Use a consistent account avatar: institution mark or monogram plus account
  type indicator.
- Keep account name, institution, mask, Plaid profile, health, and balance in a
  stable hierarchy.
- De-emphasize repeated “Plaid phone not recorded” metadata; expose it as
  connection context without letting it dominate every row.
- Persist the user's hide-zero-balance preference.
- Animate hiding/showing zero-balance rows while preserving the scroll position.
- Give duplicate-account and connection-health banners distinct semantics and
  visual treatments.
- On desktop, support compact and comfortable density only after the default
  layout is stable.
- Group connect/add actions into one clear action menu or action card rather
  than four equal buttons at the end of a long list.

### Transactions

Requirements:

- Keep search and active filters accessible while scanning a long list.
- On phone, show the most important filter chips and a “Filters” summary control;
  horizontal overflow must have a fade, partial next chip, or equivalent cue.
- On desktop, use anchored multi-select menus and a denser list/table
  composition; never open the mobile bottom sheet.
- Make active filters visually obvious and clearable individually.
- Preserve date-group totals but reduce their competition with transaction
  amounts.
- Use a coherent merchant/category visual badge instead of unstyled emoji.
- Clarify pending, needs-review, transfer, split, hidden, and tagged states
  without relying on tiny dots.
- Give row hover, focus, pressed, and selected states separate treatments.
- Keep amount alignment stable regardless of merchant-name length.
- Show selection count and bulk actions in a sticky contextual toolbar.
- Open detail in a desktop contextual panel and a mobile route/sheet while
  preserving list position and filters.
- Animate edits back into the row so the user can see what changed.
- Provide loading skeletons that match date headers and transaction rows.

### Reports

Requirements:

- Elevate report summaries from plain tiles into a consistent metric-card
  system with period comparison.
- Add a chart-ready presentation pattern even before every planned chart ships.
- Use accessible chart colors and direct labels.
- Keep drilldown visually obvious for interactive rows and absent for
  non-interactive group rows.
- Make period and grouping controls responsive without crowding the title.
- Keep explanatory methodology available without permanently consuming primary
  space.

### Detail and editing surfaces

Requirements:

- Desktop uses a bounded side panel or dialog; mobile uses a full-height sheet
  or route with native-feeling navigation.
- Header, amount, merchant/account identity, editable fields, and dangerous
  actions follow a consistent hierarchy.
- Keep Save visible when a long form is dirty.
- Indicate unsaved changes and confirm before discarding them.
- Use inline pickers on desktop and searchable sheets on mobile.
- Show mutation progress locally and preserve entered values on failure.
- Move secondary metadata and rare actions into progressive disclosure.

### Settings

Requirements:

- On desktop, use a settings sub-navigation or two-column master/detail layout
  once sections no longer fit comfortably in one scan.
- On mobile, retain grouped cards with clearer icons and section hierarchy.
- Consolidate connection identity, health, freshness, phone context, reconnect,
  and disconnect into a repeatable connection card.
- Separate safe preferences from security and destructive account actions.
- Add a theme preference with System, Light, and Dark.
- Ensure long time-zone, institution, and email values never collide with labels.
- Keep version and diagnostic information visually quiet but copyable where
  useful.

### Empty, error, offline, and partial states

Every core surface must specify:

- first-use empty state;
- filtered empty state;
- loading state;
- recoverable error;
- partial/stale data;
- offline state;
- permission or authentication failure;
- success after retry.

Illustration may add warmth to first-use empty states. Operational failures use
clear iconography and actionable copy, not playful artwork.

## Design-system requirements

### Token architecture

Create one source of truth for:

- semantic colors;
- type styles;
- spacing;
- radius;
- border width;
- elevation/shadow;
- opacity;
- icon sizes;
- content widths;
- breakpoints;
- motion duration and easing;
- z-index/layer order.

Generate or map both NativeWind classes and runtime values from that source so
charts, status bars, native navigation, and components cannot silently drift.

### Foundation components

The first slice should deliver or revise:

- `AppShell`
- `Sidebar` and `BottomNavigation`
- `PageHeader`
- `Surface` / `Card`
- `Metric` and `StatCard`
- `MoneyText`
- `Button` and `IconButton`
- `Field`, `SelectField`, and form message
- `Chip` and `FilterChip`
- `Badge` and `StatusBadge`
- `AccountAvatar` / `MerchantAvatar`
- `DataRow`
- `ActionBanner`
- `ToastProvider`
- `Skeleton`
- `EmptyState`
- `ErrorState`
- `Dialog`, `Sheet`, `Popover`, and `ContextPanel`
- `SegmentedControl`
- `Tooltip`

Each component documents:

- supported variants;
- interaction states;
- keyboard and screen-reader behavior;
- reduced-motion behavior;
- responsive behavior;
- light and dark examples;
- content limits and truncation rules.

### State coverage

Every interactive primitive must define:

- default;
- hover where applicable;
- focus-visible;
- pressed;
- selected;
- disabled;
- loading;
- error;
- success where applicable.

## Accessibility requirements

- Meet WCAG 2.2 AA for the web experience.
- Preserve logical reading and focus order across responsive rearrangements.
- Trap focus in dialogs, restore it to the invoking control, and close with
  Escape on desktop.
- Give popovers and sheets correct names and roles.
- Announce mutation success and failure through a polite live region.
- Expose chart summaries and data-point values to screen readers.
- Support Dynamic Type/font scaling without clipping critical controls.
- Never rely only on color, animation, or position to communicate state.
- Respect reduced motion and increased-contrast preferences where the platform
  exposes them.
- Test keyboard-only operation for all desktop primary flows.

## Performance and implementation guardrails

- Stay within React Native-compatible APIs for shared surfaces.
- Use platform-specific files only when interaction conventions genuinely differ.
- Prefer transforms and opacity for animation; avoid animating layout properties
  across large trees.
- Choose the lightest Expo-compatible motion approach that satisfies the
  requirements. Add a library such as Reanimated only after validating web
  export, native builds, bundle cost, and reduced-motion support.
- Avoid one animation controller per transaction row in long lists.
- Keep list virtualization and pagination intact.
- Lazy-load noncritical logos and illustrations with stable placeholders.
- Avoid expensive blur on scrolling surfaces and low-end Android devices.
- Do not block rendering on custom-font download; package native fonts and use a
  metric-compatible web fallback.
- Keep charts readable without animation and without pointer interaction.

## Delivery plan

### P0 — Foundation and critical responsive polish

Purpose: remove visible quality defects and create the system future slices use.

Scope:

- original icon, favicon, splash treatment, mark, and wordmark;
- semantic design tokens and documented type scale;
- responsive `MoneyText` with nonbreaking financial values;
- consistent focus, hover, pressed, disabled, loading, and selected states;
- reduced-motion support;
- global toast/snackbar and live-region foundation;
- layout-matched skeleton primitives;
- revised app shell and page header;
- wider desktop canvas rules;
- mobile transaction-filter overflow treatment;
- removal of default text chevrons and starter artwork;
- visual-regression harness and viewport matrix.

Exit criteria:

- all core screens render correctly at every required viewport in light and dark;
- the mobile dashboard does not break large currency values;
- filters are discoverable and usable at 320 pixels;
- keyboard focus is visible across primary navigation and shared controls;
- no Expo starter identity remains in production.

### P1 — Dashboard and transaction experience

Purpose: apply the foundation to the highest-frequency financial workflows.

Scope:

- dashboard hero, metric grid, alert hierarchy, chart transitions, and designed
  sparse-history state;
- transaction search/filter bar, active filters, mobile Filters summary,
  desktop density, row states, merchant/category badges, and bulk toolbar;
- contextual detail panel on desktop and polished sheet/route transitions on
  mobile;
- optimistic edit feedback and Undo where safe;
- skeleton, empty, partial, error, and offline states for both screens.

Exit criteria:

- the dashboard hierarchy answers position, change, and attention in that order;
- transaction selection, filtering, editing, and return-to-list preserve context;
- animation remains smooth with at least 2,500 transactions in the test household;
- every key flow passes keyboard, touch, screen-reader, reduced-motion, light,
  and dark checks.

### P2 — Accounts, reports, settings, and forms

Purpose: make the remainder of the signed-in product feel like one system.

Scope:

- account summary, group headers, avatars, metadata hierarchy, zero-balance
  transition, connection/duplicate banners, and add-account action;
- report metric cards, breakdown rows, control hierarchy, and chart-ready
  composition;
- detail/editing panels and shared dirty-form behavior;
- settings organization, connection cards, and manual theme preference;
- category, tag, rule, export, duplicate, and property flows.

Exit criteria:

- no screen uses a one-off modal, card, button, picker, loading, or error
  treatment without an explicit documented reason;
- long names, large amounts, and dense connection sets remain usable at all
  supported widths;
- all signed-in routes pass the visual and accessibility regression matrix.

### P3 — Delight and refinement

Purpose: add memorable polish only after the core system is stable.

Candidate scope:

- restrained number-change animation;
- refined chart interpolation and touch exploration;
- merchant and institution identity enhancements;
- optional compact density on desktop;
- polished first-run illustration;
- subtle seasonal or brand moments that never obscure financial content.

P3 items ship individually only when they preserve accessibility and performance.

## First implementation slice

Start with **P0 foundation plus the dashboard**. It has the highest visual
leverage and exposes the hardest primitives: large money, responsive composition,
charts, segmented controls, alerts, skeletons, navigation, and sparse-data states.

The slice is complete when:

1. the icon, favicon, splash, sign-in mark, and sidebar mark are original Mintea
   assets;
2. design tokens power NativeWind and runtime chart/navigation colors from one
   source;
3. the dashboard uses the new shell, header, type scale, surfaces, metric cards,
   and motion tokens;
4. `$4,924,418.94` and comparably large supported values never break between
   digits at 320–1440 pixels;
5. one-point, empty, loading, error, and populated chart states are intentionally
   designed;
6. light, dark, and reduced-motion modes work;
7. browser testing covers 320×568, 390×844, 768×1024, 1024×768, and 1440×900;
8. iOS and Android smoke builds succeed;
9. automated tests, TypeScript checks, production web build, accessibility
   checks, and visual regression pass;
10. the deployed production dashboard is verified without modifying real
    financial data.

## Verification strategy

### Automated

- Unit tests for formatting, compact-money fallback, token selection, and
  reduced-motion decisions.
- Component tests for interaction states and accessible names.
- Screenshot/visual regression for shared primitives and core screens.
- TypeScript checks and production web export.
- Native smoke builds after any font, icon, or motion dependency change.
- Accessibility automation for color contrast, roles, names, focus traps, and
  common keyboard paths.

### Browser and device matrix

| Surface | Required configurations |
|---|---|
| Web phone | 320×568 and 390×844 |
| Web tablet | 768×1024 and 820×1180 |
| Web desktop | 1024×768 and 1440×900 |
| iOS | Current supported iPhone size plus one small device |
| Android | Current supported Pixel size plus one mid-range physical/emulated device |

Run each core flow in:

- light;
- dark;
- reduced motion;
- keyboard-only on desktop;
- 200% browser zoom where applicable;
- large system text on native.

### Data scenarios

- no accounts;
- one account and one chart point;
- many institutions and at least 46 accounts;
- at least 2,500 transactions;
- zero, negative, eight-digit, and foreign-currency amounts;
- long merchant, category, account, institution, address, tag, and time-zone
  labels;
- healthy, stale, expiring, and broken connections;
- empty, loading, error, partial, and offline query states;
- selected, pending, hidden, split, transferred, tagged, and needs-review
  transactions.

### Critical flow checklist

- sign in, sign up, confirmation, and reset;
- switch dashboard metric/range/chart and inspect a point;
- refresh accounts and understand cooldown feedback;
- hide/show zero-balance accounts;
- review duplicate-account and connection-health banners;
- search, filter, clear, select, bulk-edit, and open a transaction;
- edit and save transaction details, then return without losing list context;
- open reports and drill into a category;
- manage categories, tags, rules, export, and connection phone context;
- use every core flow with keyboard and reduced motion.

## Rollout

- Ship behind a frontend feature flag if old and new shells need to coexist.
- Dogfood with the cloned production household before using the real household.
- Release P0/P1 to a small cohort first if product analytics and feature flags
  exist; otherwise stage and run the full regression matrix before production.
- Monitor client errors, slow frames, navigation abandonment, and responsive
  bug reports.
- Keep a rollback path that changes presentation without rolling back database
  migrations or financial feature work.

## Open decisions

- Final mark/wordmark direction and whether “Mintea” is visually one word or
  emphasizes “mint” and “tea”.
- Typeface choice after native/web performance evaluation.
- Whether Reports becomes a primary navigation destination in the first shell
  redesign or after its next product slice.
- Whether desktop launches with one density or offers compact/comfortable modes.
- Whether merchant and institution logos are reliable enough for default use.
- Whether manual theme selection belongs in P0 or P2.
- Whether desktop details use a persistent right panel or a centered dialog at
  tablet widths.

These decisions should be resolved with small visual prototypes before
implementation. They do not block token architecture, critical responsive fixes,
or the original brand assets.
