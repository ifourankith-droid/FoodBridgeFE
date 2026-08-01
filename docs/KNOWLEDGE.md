# FoodBridge Frontend — Knowledge / Work Log

A running log of notable frontend changes, the problem each solved, and where it lives.
Product-flow reference lives in [`foodbridge-app-flow.md`](./foodbridge-app-flow.md);
backend changes are logged in `../../FoodBridgeBE/KNOWLEDGE.md`.

---

## Leaderboard: rebuilt on the shared listing layout

**Done by me on 2026-08-01**

### Problem
The Leaderboard used a bare `PageWrapper` with a full-width "your standing" card,
a podium, and a single ranking list — it didn't share the listing pages' layout.

### Change
Rebuilt it on `ListingLayout`, so it reads as the same family as My Donations /
Nearby / My Deliveries.

- **`src/app/features/volunteer/leaderboard/leaderboard.ts`**
  - Renders through `ListingLayout` (two-column split + sticky right aside +
    skeleton loading + empty state), with `SummaryHeader` using the
    `fa-solid fa-ranking-star` icon (the sidebar/route icon) — heading shows the
    ranked count, subtitle shows board totals (points · deliveries).
  - **Left column**: one **user card** per ranked volunteer (rank pill / medal,
    avatar, name, delivery count, a share-of-leader rail and the points), the
    caller's own card highlighted (`is-me`). Grid `md:grid-cols-2`.
  - **Right sticky aside**: "Your standing" (rank tile + points + gap-to-next),
    "Top volunteers" (top-3 mini list), and "Board totals" (volunteers / points /
    deliveries, using the shared `fb-impact-num`).
  - Dropped `PageWrapper`/`EmptyState` imports (the layout supplies both); board
    totals added as `boardPoints()` / `boardDeliveries()` computeds.

---

## Verification page: match the listing pages' layout

**Done by me on 2026-08-01**

### Problem
The volunteer's Account Verification screen used a bare `PageWrapper` with a
custom status banner, so it looked nothing like the listing pages (My Donations,
Nearby, My Deliveries) and had a broken two-column layout.

### Change
Rebuilt it on the shared `ListingLayout`, so it reads as the same family as the
listing pages.

- **`src/app/features/volunteer/verification/verification.ts`**
  - Renders through `ListingLayout` (two-column split, sticky right aside,
    skeleton loading + empty state — all inherited).
  - **Summary strip** uses the shared `SummaryHeader` with the `fa-solid fa-id-card`
    icon (same as the sidebar/route entry for Verification). The heading and
    subheading are state-driven (`statusTitle()` / `statusDetail()`), coloured
    per account status (green / orange / primary).
  - **Left column** keeps the document checklist (upload / replace rows) in the
    grid slot, with the privacy note below it.
  - **Right sticky aside** (same card family as the listing pages):
    1. a progress donut (`fb-ring`, submitted vs required documents),
    2. a "Documents" card of per-document status rows (`fb-cat-row`),
    3. a "How it works" card with the current stage highlighted.

### Gotcha (the "breaking UI")
`ListingLayout` projects named `ng-content` slots (`summary`, `aside`,
`belowGrid`, default). Wrapping **all** the slot elements inside a single
`@if (state(); as v) { … }` broke projection — no working page does that.
Fix: keep every slot element an **unconditional direct child** of
`<app-listing-layout>` (as My Donations / Nearby / Deliveries do) and guard only
the content *inside* each slot. `[hasAside]="true"` is constant so the columns
always mount; the `SummaryHeader` takes `[loading]` for the loading state.

---

## Toasts render above modal dialogs (top-layer promotion)

**Done by me on 2026-08-01**

### Problem
A toast fired while a dialog was open appeared **behind** the modal. The dialogs
are native `<dialog>` elements opened with `showModal()` (see
`shared/ui/dialog/dialog-frame.ts`), which puts them in the browser's **top
layer** — that sits above every normal stacking context, so the toast's
`z-index: 2000` could never win.

### Change
Promoted the toast stack into the top layer too, via the Popover API — the only
way to out-stack a modal `<dialog>`.

- **`src/app/shared/toast/toast.ts`**
  - The `.fb-toast-stack` container now has `popover="manual"` + a `#stack` ref.
  - An `effect` watches `toast.toasts()`: when toasts exist it calls
    `showPopover()` (hiding first if already open, so a toast fired *while a modal
    is open* re-promotes above it — the top layer stacks by promotion order);
    when the list empties it calls `hidePopover()`. Feature-detected
    (`typeof el.showPopover`), so unsupported browsers fall back to the z-index.
  - A `:popover-open` style rule resets the popover UA chrome
    (inset/margin/border/background) back to the fixed top-right stack.

---

## Related backend changes (affect frontend behaviour)

Logged in `../../FoodBridgeBE/KNOWLEDGE.md`; noted here because they change what
the UI can do:

- **Listing food-photo upload now accepts WebP & AVIF.** The New Donation form's
  `<app-image-picker>` already accepts `image/jpeg,image/png,image/webp,image/avif`;
  the backend was widened to match, so a WebP/AVIF photo no longer saves the
  listing while silently dropping the photo. No frontend change was required.
- **`GET /listings/deliveries` now includes each delivery's `timeline`.** The
  `ApiListing` model already declares `timeline`, so it is received automatically.
  The delivery detail dialog still uses the standalone `GET /listings/{id}/timeline`
  endpoint for now, because that one resolves actor **names** (the embedded
  timeline entries carry only `actorUserId`).
