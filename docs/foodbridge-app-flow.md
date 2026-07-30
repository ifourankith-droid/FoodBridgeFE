# FoodBridge — Complete Application Flow (Knowledge Base)

> Source of truth: `FoodBridge_Bootstrap_Prototype.html` (Bootstrap 5 + vanilla JS single-file prototype).
> This document describes the **intended product flow** so the Angular app can be built to match it.
> Tagline: **"Rescue Food, Restore Hope."**

---

## 1. What the app does

FoodBridge is a **surplus-food coordination platform**. It connects three primary actors so that
leftover/surplus food is rescued instead of wasted, plus an admin who oversees the platform.
It is explicitly a **coordination platform, not a food supplier**.

### 1.1 Roles

| Role | Who they are | Core job |
|------|--------------|----------|
| **Donor** | Restaurants, hotels, bakeries, halls, marts | Post surplus food listings |
| **Volunteer** | Individuals with a vehicle | Claim listings, pick up, deliver to recipients |
| **Recipient** | NGOs / community kitchens / shelters, or individuals/households | Accept & confirm receipt of food |
| **Admin** | Platform operator | Verify accounts, resolve disputes, view platform reports |

### 1.2 Demo login credentials (prototype)

| Mobile | Role | Name | OTP |
|--------|------|------|-----|
| `9999999991` | Donor | Grand Plaza Hotel | `123456` |
| `9999999992` | Volunteer | Priya Sharma | `123456` |
| `9999999993` | Recipient | Hope Community Kitchen | `123456` |
| `9999999994` | Admin | Platform Admin | `123456` |
| any other 10-digit | → new-user registration | — | `123456` |

---

## 2. Screen system & navigation model

The prototype is a **single-page screen switcher**. Only one top-level `.screen` is `active` at a time.

Top-level screens:
1. `screen-splash` (commented out in prototype, but part of intended flow — brand + loader, ~1.9s)
2. `screen-login`
3. `screen-otp`
4. `screen-register` (4-step wizard)
5. `screen-app` (the authenticated shell containing the sidebar, topbar, and a swappable `pageBody`)

Inside `screen-app`, navigation is **view-based**: `navTo(view)` swaps the content of `#pageBody`
by calling a per-view render function. The sidebar items are injected per role.

> **Angular mapping:** top-level screens → routes (`/login`, `/otp`, `/register`, `/app`).
> In-app views → lazy-loaded child routes under `/app` (e.g. `/app/dashboard`, `/app/listings`).
> `currentUser.role` drives which child routes/sidebar items exist (route guards + role config).

---

## 3. Core data models

### 3.1 User (`currentUser`)
```
{ mobile, role: 'donor'|'volunteer'|'recipient'|'admin', name, city,
  recipientType?: 'Individual'|'Organization',   // recipients only
  capacity?: string }                            // recipients only
```

### 3.2 Listing (`LISTINGS[]`) — the central entity
```
{ id, donor, foodType: 'Veg'|'Non-Veg', mealType: 'Breakfast'|'Lunch'|'Dinner'|'Snacks',
  quantity, freshness: 'Just Cooked'|'2 Hours Old'|'Packed Food',
  pickupTime, address,
  status,                     // see lifecycle below
  volunteer: string|null,     // assigned when claimed
  recipient: string|null,     // matched on pickup / accepted by recipient
  notes }
```

### 3.3 Account (`ACCOUNTS[]`) — admin verification queue
```
{ id, name, type: 'Volunteer'|'Organization', city,
  status: 'verified'|'pending'|'suspended', joined }
```

### 3.4 Dispute (`DISPUTES[]`) — admin dispute queue
```
{ id, listing, raisedBy, reason, priority: 'high'|'medium'|'low',
  status: 'open'|'resolved' }
```

### 3.5 Notification (`notifSeed[]`)
```
{ icon, text, time }
```

### 3.6 Supporting reference lists
- `NGO_LIST` — recipient org names used for matching.
- `VOLUNTEER_NAMES` — used for the leaderboard.
- `NEARBY_RECEIVERS` — `{ name, dist, active }` receivers near a volunteer (live availability).

---

## 4. Listing status lifecycle (the heart of the app)

This is the central state machine every role interacts with:

```
pending ──claim(volunteer)──► claimed ──confirmPickup──► pickedup ──confirmDelivery──► delivered ──confirmReceipt──► confirmed
   │                                                                                                                    │
   └── expired (time window passed, never claimed)                                                    └── certificate issued to donor
```

| Status | Meaning | Set by | Timeline label |
|--------|---------|--------|----------------|
| `pending` | Posted, awaiting a volunteer | Donor (create) | Posted |
| `claimed` | A volunteer committed to it | Volunteer (`claimListing`) | Claimed |
| `pickedup` | Food collected, en route; recipient matched | Volunteer (`confirmPickup`) | Picked Up |
| `delivered` | Dropped at recipient, awaiting their confirmation | Volunteer (`confirmDeliveryDone`) | Delivered |
| `confirmed` | Recipient confirmed receipt → donor certificate generated | Recipient (`confirmReceipt`) | Confirmed |
| `expired` | Window passed with no claim | System | Expired |

Timeline order used in UI: `[pending, claimed, pickedup, delivered, confirmed]` with icons
`[clipboard-check, hand, box, truck, circle-check]`. Progress width = `(curIdx / 4) * 88%`.

Status badge colors: pending=orange, claimed=amber, pickedup=blue, delivered/confirmed=green, expired=grey.

---

## 5. Authentication & onboarding flow (step by step)

### 5.1 Splash → Login
1. App boots on splash (brand logo pulse + dots), then after ~1.9s shows `screen-login`.

### 5.2 Login (mobile + OTP)
1. User enters a 10-digit mobile number (`+91` prefix fixed).
2. Validation: must be exactly 10 digits, numeric — else toast error.
3. `sendOtp()` → sets `pendingMobile`, `otpContext='login'`, navigates to `screen-otp`, toasts "OTP sent — use 123456".
4. Alternatively, "Create an account" → `goToRegister()` (carries over a typed valid number).

### 5.3 OTP verification
1. Six single-char inputs; auto-advance focus on input.
2. `verifyOtp()` requires code === `123456`, else toast error.
3. Branching on success:
   - **`otpContext === 'register'`** (verifying mobile mid-wizard): set `mobileVerified=true`, return to `screen-register` at **step 4** (finish).
   - **Existing demo user** (`DUMMY_USERS` match): set `currentUser`, toast "Welcome back", `enterApp()`.
   - **New number**: set `mobileVerified=true`, toast "New number — let's set up your account", go to `screen-register` step 1 (prefill mobile).
4. "Change number" (`otpBack()`): register-context → back to wizard step 2; else → back to login.

### 5.4 Registration wizard (`screen-register`, 4 steps)
A 4-dot step indicator tracks progress.

- **Step 1 — Choose role**: three `role-card`s (Donor / Volunteer / Recipient). Must pick one (`selectRole`) before continuing; else toast.
- **Step 2 — Personal info**: photo upload (demo), full name/org name, mobile (+91), address, city, state, pincode.
  - **Recipient-only extra**: radio Individual/Household vs Organization/NGO; capacity field whose placeholder changes ("Household size" vs "Daily serving capacity").
- **Step 3 — Location**: map placeholder + "Use current GPS location" (demo toast). `proceedFromLocation()`:
  - Validates mobile is 10 digits (else back to step 2).
  - If `mobileVerified && mobile === pendingMobile` → skip to step 4.
  - Otherwise `startRegisterOtp(mobile)` → OTP screen with `otpContext='register'`.
- **Step 4 — Finish**: success check, shows chosen role. `finishRegistration()` builds `currentUser`
  (adds recipientType/capacity for recipients), pushes to `DUMMY_USERS`, toasts, `enterApp()`.

### 5.5 Logout
`logout()` clears `currentUser`, returns to `screen-login`, clears the mobile input.

---

## 6. Authenticated app shell (`screen-app`)

`enterApp()` sets up: role tag, avatar initial, sidebar (`buildSidebar`), notifications, availability
toggle (`setupActiveToggle`), then `navTo('dashboard')`.

### 6.1 Sidebar (role-specific nav)
`NAV[role]` defines items; every role also gets **Settings** and **Logout** appended.

| Role | Sidebar items |
|------|---------------|
| **Donor** | Dashboard · Create Listing · My Listings · Certificates · Profile |
| **Volunteer** | Dashboard · Nearby Listings · My Deliveries · History · Leaderboard · Profile |
| **Recipient** | Dashboard · Incoming Food · Track Delivery · Distribution History · Reports · Profile |
| **Admin** | Dashboard · All Listings · Verifications · Disputes · Reports · Profile |

`navTo(view)` maps a view id to its render function (dispatch table in the prototype) and highlights
the active nav item. On mobile, sidebar is a slide-in drawer (`.show` toggled by the hamburger).

### 6.2 Topbar
- Search box (listings/NGOs/volunteers — demo).
- **Availability toggle** (`active-toggle`) — visible only for Volunteer & Recipient (see 6.3).
- **Dark mode** toggle (`toggleDark()` toggles `body.dark`).
- **Notifications** dropdown (badge count = `notifSeed.length`).
- **Profile** dropdown → Profile / Settings / Help / Logout.

### 6.3 Availability toggle (Volunteer & Recipient only)
- Defaults to **on** at login.
- Volunteer label: "Available" / "Offline". Recipient label: "Accepting" / "Offline".
- **Recipient behavior:** while active, they receive food-offer notifications; going active simulates
  a fresh matched-offer notification after ~4s. While offline, no offers arrive and the Incoming Food
  page shows an "You're offline" prompt to go active.
- Toggling re-renders the current view so availability-dependent states update.

### 6.4 Cross-cutting UI helpers
- **Toast** (`flashToast(icon, msg)`) — transient bottom-right message (~2.8s).
- **Notifications** (`pushNotification`, `renderNotifications`) — prepends to `notifSeed`, updates badge.
- **Modals**: Certificate, Pickup, Delivery, Listing Detail.
- **Charts** via Chart.js (`drawChart` — line/doughnut; admin uses bar + doughnut).
- Empty states, skeletons, status badges, timeline component, map component (see below).

---

## 7. DONOR flow (step by step)

1. **Dashboard** (`renderDonorDashboard`): greeting; stat cards (Meals Donated, Today's Donation,
   Total Donations, Certificates); monthly-donations line chart; Nearby NGOs list; Recent Activity feed.
2. **Create Listing** (`renderCreateListing` → `submitListing`):
   - Fields: food type (Veg/Non-Veg), meal type, quantity, freshness, pickup time, pickup address,
     notes, image upload (demo).
   - Validation: quantity + pickup time + address required.
   - On submit: prepend a new listing with `status='pending'`, toast "nearby volunteers notified",
     push notification, go to My Listings.
   - **Edit mode**: `editListing(id)` reuses this form pre-filled; `submitListing` updates in place
     (only allowed while `pending`).
3. **My Listings** (`renderMyListings`): tabs All/Pending/Claimed/Delivered/Expired; cards open a
   **Listing Detail** modal (`openListingDetail`) showing the rescue timeline, volunteer, recipient,
   notes, and donor actions:
   - **Edit** — only when `pending`.
   - **Cancel** — when `pending` or `claimed` (`cancelListing` removes it).
4. **Certificates** (`renderCertificates`): one per `confirmed` listing; view in a modal
   (`openCertificate`: donor, item, delivered-via volunteer, received-by recipient, date) + Download PDF
   (demo) + Export CSR Report (demo).
5. **Profile / Settings** — shared (see §11).

---

## 8. VOLUNTEER flow (step by step)

1. **Dashboard** (`renderVolunteerDashboard`): greeting; stats (Total Deliveries, Points,
   Leaderboard Rank, Meals Helped); performance line chart; badges earned; "Open Listings Near You".
2. **Nearby Listings** (`renderNearby`):
   - Toggle **Card view** / **Map view**.
   - "Receivers active nearby" banner (count from `NEARBY_RECEIVERS.active`, within 5km, live).
   - Open listings (`status='pending'`) each with distance/ETA and a **Claim** button.
   - Route map (`locationMapHtml`) with A=you, B=pickup, C=drop, embedded Google Maps + "Open in Google Maps".
3. **Claim** (`claimListing`): sets `status='claimed'`, `volunteer=currentUser`, toast, notification,
   then shows **turn-by-turn navigation** (`renderNavigation`): map + next-step banner +
   distance/ETA/stops + turn list + "I've arrived at pickup" → opens Pickup modal.
4. **My Deliveries** (`renderDeliveries`): lists the volunteer's `claimed`/`pickedup` listings.
   - `claimed` → **Start Pickup** (`openPickup`): donor contact, food details, pickup photo (demo),
     **Confirm Pickup** (`confirmPickup`) → `status='pickedup'`, **matched to a random NGO recipient**,
     toast/notification.
   - `pickedup` → **Go to Delivery** (`openDelivery`): recipient info, directions preview, delivery
     photo (demo), **Confirm Delivery** (`confirmDeliveryDone`) → `status='delivered'`, awaiting
     recipient confirmation.
5. **History** (`renderHistory`): completed (`delivered`/`confirmed`) deliveries as donor→recipient rows.
6. **Leaderboard** (`renderLeaderboard`): ranked volunteers by points; current user tagged "(you)".
7. **Profile / Settings** — shared.

---

## 9. RECIPIENT flow (step by step)

1. **Dashboard** (`renderRecipientDashboard`): greeting; stats (Today's Meals, Upcoming Deliveries,
   Pending Deliveries, Storage Capacity); NGO distribution doughnut; storage capacity bar; track a
   volunteer widget; Incoming Food preview.
2. **Incoming Food** (`renderIncoming`):
   - **Availability banner** (`recipientStatusBanner`): if active → "accepting food intake" + count of
     available offers; if offline → prompt to go active.
   - Incoming items (`status='pickedup'`) with **Accept** (`acceptIncoming` — sets recipient=you) or
     **Reject** (`rejectIncoming` — reassigns to another NGO).
   - **Awaiting Your Confirmation**: `delivered` items matched to you → **Confirm Receipt**
     (`confirmReceipt`) → `status='confirmed'`, toast "donor certificate issued", notification.
3. **Track Delivery** (`renderTrackDelivery`): live tracking of your `pickedup`/`delivered` listings —
   status timeline, live map, **live ETA ticker** (counts down every 2s for en-route items), volunteer
   contact, and Confirm Receipt when delivered.
4. **Distribution History** (`renderHistory`, recipient branch): confirmed meals received; org
   recipients can Export Delivery Log (individuals cannot).
5. **Reports** (`renderReports`): stats (Meals This Month, Deliveries Received, Partner Donors) +
   meals-over-time chart + Export Report (demo).
6. **Profile / Settings** — shared.

---

## 10. ADMIN flow (step by step)

1. **Dashboard** (`renderAdminDashboard`): stats (Total Listings, Pending Verifications, Open Disputes,
   Meals Rescued); **Listings by Status** bar chart; **Accounts** doughnut (verified/pending/suspended).
2. **All Listings** (`renderAdminListings`): status filter buttons + table (Donor, Food, Volunteer,
   Recipient, Status, Trail→opens listing detail modal). Full live status trail across the platform.
3. **Verifications** (`renderVerifications`): accounts sorted pending-first.
   - `pending` → **Verify** (`verifyAccount`) / **Reject** (`suspendAccount`).
   - `verified` → **Suspend**.
   - `suspended` → **Reinstate** (`verifyAccount`).
   - Note: **individuals self-register** — only Volunteers and Organizations need verification.
4. **Disputes** (`renderDisputes`): open disputes (priority-colored left border) with **Mark Resolved**
   (`resolveDispute`) + contact both parties (demo); resolved list shown below.
5. **Reports** (`renderAdminReports`): platform-wide CSR stats (Meals Rescued, Active Volunteers,
   Partner Orgs, CO₂ Avoided) + meals-over-time chart + Export CSR Report (demo).
6. **Profile / Settings** — shared.

---

## 11. Shared views

- **Profile** (`renderProfile`): avatar, name/role/city, mobile (disabled), city, full name; recipients
  also see recipient type + capacity/household size; Save Changes (demo toast).
- **Settings** (`renderSettings`): Dark Mode toggle, Push Notifications toggle, Email Updates toggle.

---

## 12. Signature UI components (reusable in Angular)

| Component | Prototype source | Purpose |
|-----------|------------------|---------|
| Rescue timeline | `.rescue-timeline` / `tl-step` | 5-stage status progress with done/current states |
| Status badge | `statusBadge()` / `.badge-*` | Color-coded status pill |
| Stat card | `statCard()` | Icon + value + label KPI card |
| Route map | `locationMapHtml()` | Embedded map with A/B/C pins, ETA, legend |
| Availability toggle | `.active-toggle` | Volunteer/recipient online status |
| Toast | `flashToast()` | Transient notifications |
| Notification dropdown | `renderNotifications()` | Bell + badge + list |
| Modals | cert / pickup / delivery / listing detail | Contextual actions |
| Charts | `drawChart()` + Chart.js | Line / doughnut / bar analytics |
| Role card | `.role-card` | Registration role picker |
| Step indicator | `.step-indicator` | Wizard progress dots |
| Empty state / skeleton | `emptyState()` / `.skeleton` | Loading & empty UX |

### Design tokens (from `:root`)
- Primary `rgb(216,119,87)` / deep `#b65c3f` / bright `#e2906c` / soft `#fdf0e7`
- Success `#1e9e5c` deep `#146c43`; Orange `#ff7a3d`; Cream bg `#faf8f6`; Ink `#241e1a`; Muted `#7a6f65`
- Radius `20px`; Font **Poppins**; Icons **Font Awesome 6**; full **dark mode** variant.

---

## 13. Suggested Angular architecture (to mirror this flow)

- **Routes**: `/login`, `/otp`, `/register`, and lazy `/app` shell with role-guarded child routes.
- **Auth**: `AuthService` (signals) holding `currentUser`; guards per role; OTP + registration flows.
- **State**: signal-based stores for `listings`, `accounts`, `disputes`, `notifications`, `availability`.
  Central `ListingService` owns the status lifecycle transitions (claim → pickup → deliver → confirm).
- **Feature modules** (standalone, lazy): `donor/`, `volunteer/`, `recipient/`, `admin/`, plus shared
  `dashboard`, `profile`, `settings`.
- **Shared UI library**: timeline, status-badge, stat-card, route-map, availability-toggle, toast,
  notification-dropdown, role-card, step-indicator, empty-state (all `OnPush`, `input()`/`output()`).
- **Reactive forms** for create-listing and the registration wizard.
- Replace demo dummy data with real API services; keep the same domain models (§3) and lifecycle (§4).

---

## 14. Project rules & conventions (MUST follow)

These are hard rules for this codebase. Follow them exactly when adding or changing anything.

### 14.1 Styling
- **Tailwind CSS only — NEVER use Bootstrap classes.** Bootstrap is not installed or loaded.
  Do not use `d-flex`, `d-none`, `row`, `col-*`, `g-*`, `me-*`/`ms-*`, `form-control`, `form-select`,
  `input-group`, `btn-group`, `btn-sm`, `nav-pills`, `fw-*`, `fs-*`, `text-muted-2`, `flex-fill`,
  `list-unstyled`, etc. Use Tailwind equivalents (`flex`, `hidden`, `grid grid-cols-*`, `col-span-*`,
  `mr-*`/`ml-*`, `gap-*`, …).
- **Tailwind version is v3.4** — the important modifier is a **prefix** (`!items-start`), NOT a suffix
  (`items-start!` is v4 syntax and will not work).
- **Always use colors from the configuration — never hard-code hex.** In templates use Tailwind color
  utilities (`bg-primary`, `text-primary-deep`, `text-muted`, `border-line`, `bg-primary-soft`,
  `text-success`, …). In plain CSS (component `styles` blocks / non-`@apply` declarations) use the
  **`var(--fb-*)` design tokens** defined in `src/styles.scss` — these are sourced straight from
  `tailwind.config.js` via `theme()`:
  - Brand: `--fb-primary`, `--fb-primary-deep`, `--fb-primary-bright`, `--fb-primary-soft`,
    `--fb-success`(+`-deep`/`-soft`), `--fb-orange`(+`-soft`).
  - Semantic (auto-flip in dark mode): `--fb-surface`, `--fb-bg`, `--fb-ink`, `--fb-muted`, `--fb-line`.
  - Effects: `--fb-shadow`, `--fb-shadow-lg`, `--fb-ring` (focus ring), `--fb-radius`.
  - Tailwind helpers still valid: `rounded-fb`/`rounded-fb-btn`, `shadow-fb`/`shadow-fb-lg`,
    `bg-gradient-primary`/`bg-gradient-orange`, `font-sans`/`font-display` (Poppins).
- **Reuse the shared component classes** in `src/styles.scss` (`@layer components`) — build new reusable
  classes there with `@apply`/tokens, don't duplicate long utility strings across templates:
  - Layout/page: `.page-title`, `.page-subtitle`, `.section-title`, `.page-header`.
  - Controls: `.btn-fb`, `.btn-fb-outline`, `.btn-ghost`, `.fb-link`, `.fb-input`, `.fb-phone`,
    `.otp-input`, `.small-label`, `.fb-field-label`, `.fb-help`.
  - Surfaces: `.card-fb`, `.btn-icon`, `.avatar-circle`, `.stat-card`/`.stat-icon`/`.stat-value`/
    `.stat-label`, `.badge-fb` + `.badge-*`, `.map-placeholder`.
  - Wizard/auth: `.role-card`, `.step-dot`/`.step-line`, `.auth-eyebrow`/`.auth-title`/`.auth-subtitle`/
    `.auth-fineprint`, `.fb-or`, `.fb-demo-hint`.
- **Dark mode** is class-based (`body.dark`, toggled by `ThemeService`) and mostly **automatic**: the
  `--fb-*` semantic tokens are redefined under `body.dark`, and CSS custom properties inherit through
  component boundaries — so using the tokens means you rarely need explicit dark overrides. Only add a
  `body.dark …` / `:host-context(body.dark) …` rule for the few cases tokens can't express.
- Structural/layout CSS in component `styles` blocks uses **plain CSS properties** (`align-items`,
  `justify-content`, …) — that is standard CSS, not Bootstrap, and is fine.
- Icons: **Font Awesome 6** (`fa-solid …`). Font: **Poppins**. Both loaded in `index.html`.
- **Always use dynamic viewport units** for full-height layouts: `100dvh` / `min-h-dvh` (or `svh`/`lvh`
  as needed) — never `100vh` / `min-h-screen`. `dvh` accounts for mobile browser chrome so nothing
  gets cut off or forces an unwanted scroll.

### 14.2 Angular
- **Standalone components only** (no NgModules). Do **not** set `standalone: true` (it's the default).
- **`ChangeDetectionStrategy.OnPush`** on every component.
- **Signals** for state (`signal`, `computed`, `effect`); never `mutate` — use `set`/`update`.
- **`input()` / `output()`** functions, not the `@Input`/`@Output` decorators.
- **`inject()`** for DI, not constructor injection.
- **Native control flow** (`@if`, `@for`, `@switch`), not `*ngIf`/`*ngFor`/`*ngSwitch`.
- **Class/style bindings** (`[class.x]`, `[style.x]`), never `ngClass`/`ngStyle`.
- **Reactive forms**, not template-driven.
- Host bindings go in the `host` object — never `@HostBinding`/`@HostListener`.
- **Lazy-load** feature routes via `loadComponent`.
- File naming follows Angular 20 convention (no `.component` suffix): `login.ts`, `shell.ts`, etc.
- **Use the tsconfig path aliases** for cross-layer imports, not deep relative paths:
  `@core/*` → `src/app/core/*`, `@features/*`, `@shared/*`, `@app/*`, `@env/*` → `src/environments/*`.
  e.g. `import { AuthService } from '@core/services/auth.service'` (not `../../../core/...`).

### 14.3 Services & HTTP
- All HTTP goes through the layer in `core/http/`: **`ApiService`** (typed `get/post/put/patch/delete`,
  owns base URL + params) and the generic **`BaseCrudService<T>`**. Feature services **extend
  `BaseCrudService`** and declare a `resource` — never call `HttpClient` directly in a component.
- Services are **`providedIn: 'root'`**, single-responsibility.
- Config lives in `src/environments/environment.ts` (+ `.prod.ts` via `fileReplacements`):
  `apiUrl`, and `useMockAuth` (true → flows resolve locally without a backend).

### 14.4 Auth, session & layout
- **`AuthService`** (signals) is the source of truth for `currentUser` and the OTP/registration flow.
- **Session persists in `localStorage`** via `StorageService` (key `foodbridge.currentUser`): hydrated
  on startup, synced by an `effect`, cleared on logout.
- **Auth-flow state persists in `sessionStorage`** (key `foodbridge.authFlow`: `pendingMobile`,
  `otpContext`, `mobileVerified`, `registrationDraft`) so refreshing mid-flow (e.g. on the OTP or
  register screen) keeps the user in place instead of restarting from the mobile-number step. It's
  tab-scoped (cleared when the tab closes) and reset on logout. `StorageService` exposes both
  `getItem/setItem` (local) and `getSessionItem/setSessionItem` (session).
- **`authGuard`** protects `/app`.
- Auth screens render inside **`AuthLayout`** (left gradient brand panel + right form panel); each auth
  page renders only its form content (no full-screen wrapper of its own).
- Authenticated screens render inside **`Shell`** (fixed sidebar + sticky topbar + `<router-outlet>`);
  sidebar nav comes from `core/config/nav.config.ts` per role.

### 14.5 Domain
- Preserve the domain models (§3) and the listing **status lifecycle** (§4) exactly:
  `pending → claimed → pickedup → delivered → confirmed` (+ `expired`). Status colors use `badge-*`.
- Demo OTP is `123456`; demo users per §1.2.

---

## 15. API endpoints, routes & path aliases (configuration)

### 15.1 API endpoints — `core/config/api-endpoints.ts`
Single source of truth for the backend API surface. Paths are **relative** (ApiService prefixes
`environment.apiUrl`). Never inline endpoint strings — add them here.
```ts
API_ENDPOINTS.auth.sendOtp | verifyOtp | logout | refresh | me
API_ENDPOINTS.users.base | register | byId(id) | byMobile(mobile)
API_ENDPOINTS.listings.base | byId(id) | claim(id) | pickup(id) | deliver(id) | confirm(id)
API_ENDPOINTS.accounts.base | verify(id) | suspend(id)
API_ENDPOINTS.disputes.base | resolve(id)
API_ENDPOINTS.certificates.base ; API_ENDPOINTS.notifications.base
```
Services consume these: `UserService`/`ListingService` set `resource = API_ENDPOINTS.*.base`;
`AuthApiService` wraps `API_ENDPOINTS.auth.*`.

### 15.2 Client routes — `core/config/app-routes.ts`
Absolute paths for navigation. Use these constants for `router.navigate([...])` / `routerLink`,
never hard-coded strings.
```ts
APP_ROUTES.login | otp | register | app | dashboard ; APP_ROUTES.appView(view) → '/app/<view>'
```
The route **table** stays in `app.routes.ts`; `APP_ROUTES` mirrors its paths for type-safe navigation.

### 15.3 Auth flow wiring (service + endpoints)
- **`AuthApiService`** (`core/services/auth-api.service.ts`) — `sendOtp` / `verifyOtp` / `logout` over
  `ApiService` using `API_ENDPOINTS.auth`.
- **`AuthService`** orchestrates: `sendOtp(mobile, context)` and `verifyOtp(code)` return **Observables**
  (components subscribe). With `environment.useMockAuth = true` they resolve locally (demo OTP `123456`,
  `DEMO_USERS`); with it `false` they call `AuthApiService`/`UserService` against the real API — no
  component changes needed. Login/OTP/Register subscribe and route via `APP_ROUTES`.

### 15.4 Path aliases — `tsconfig.json`
`baseUrl: "."` + `paths`: `@core/*`, `@features/*`, `@shared/*`, `@app/*`, `@env/*`
(→ `src/environments/*`). Use aliases for cross-layer imports instead of `../../../…`.

---

## 16. In-app views, permissions, data & shared UI

### 16.1 Config-driven views + permissions — `core/config/routes.config.ts`
`APP_VIEWS` is the single source of truth for authenticated views. Each entry:
`{ id, title, icon, roles, load }` (lazy `loadComponent`). It drives **both**:
- the router children (`app.routes.ts` maps `APP_VIEWS` → routes, each `canActivate: [roleGuard]`,
  `data: { roles }`), and
- the sidebar nav (`viewsForRole(role)`), so a role only sees/opens its permitted views.
`roleGuard` (`core/guards/role.guard.ts`) redirects to `/login` if signed out, or to the dashboard if
the role isn't in `view.roles`. To add a view: add one `APP_VIEWS` entry — routing + nav + permission
are handled. `nav.config.ts` is superseded by this.

### 16.2 Data & state
- `core/data/mock-data.ts` — seed data (`INITIAL_LISTINGS`, `NGO_LIST`, `VOLUNTEER_NAMES`,
  `NEARBY_RECEIVERS`, `ACCOUNTS`, `DISPUTES`).
- `core/services/listing-store.service.ts` — **`ListingStore`**: signal store owning the listing
  lifecycle (`add/update/cancel/claim/confirmPickup/confirmDelivery/accept/reject/confirmReceipt`) with
  toasts + notifications. Pages read/act through it. Swap mutations for `ListingService` HTTP later.
- `core/models/listing.model.ts` — `Listing`, `ListingStatus`, `STATUS_LABELS`, `TIMELINE_STEPS`.

### 16.3 Shared UI — `shared/ui/*`
`app-status-badge`, `app-rescue-timeline` (5-stage progress), `app-empty-state`, and
`app-route-map` (embedded Google-Maps route with A/B/C pins, ETA + legend; used on Nearby, Track).
All standalone + `OnPush`, styled with tokens.

### 16.4 Pages (all built, per role)
Donor: `create-listing`, `my-listings` (tabs + detail modal + timeline), `certificates`.
Volunteer: `nearby` (card/map + claim), `deliveries` (pickup→deliver), `leaderboard`.
Recipient: `incoming` (accept/reject/confirm + availability banner), `track` (map + live timeline),
`reports`. Shared: `dashboard` (role-aware), `history` (volunteer/recipient), `profile`, `settings`.
Admin: `all-listings` (filter + table), `verifications`, `disputes`, `admin-reports`.

### 16.5 Theme (global + persistent)
`ThemeService` hydrates dark mode from localStorage (`foodbridge.theme.dark`), applies `body.dark`, and
persists via an `effect`. It's instantiated at startup (injected in `App`) so the saved theme applies
app-wide (including auth screens), and `Settings` toggles it.

### 16.6 Responsiveness
Shell sidebar is a fixed rail ≥ `lg` and a slide-in drawer below `lg` (hamburger in topbar, backdrop).
Page grids collapse (`grid-cols-1 sm/md/lg:*`), tables use `overflow-x-auto`, page-body padding is
smaller on mobile. Full-height uses `dvh` (§14.1).
