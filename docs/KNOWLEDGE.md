# FoodBridge Frontend — Knowledge / Work Log

A running log of notable frontend changes, the problem each solved, and where it lives.
Product-flow reference lives in [`foodbridge-app-flow.md`](./foodbridge-app-flow.md);
backend changes are logged in `../../FoodBridgeBE/KNOWLEDGE.md`.

---

## `title="…"` on a component renders a native browser tooltip

**Done by me on 2026-08-03**

### The trap
`title` is both a component input **and** a global HTML attribute. Written as a static
attribute, Angular does two things with it: sets the input *and* leaves it on the host
element in the DOM. The browser then shows its native tooltip on hover over the page
heading — on every page, because every page has a heading.

```html
<app-listing-layout title="Account verification">   <!-- input set AND title attr in DOM -->
<app-listing-layout [title]="'Account verification'"> <!-- input only, no attribute -->
```

A property binding compiles to `ɵɵproperty('title', …)`, which writes the input and
never touches the attribute. That is the whole fix.

Worth remembering: this is what the small floating "Account verification" box in the
first Verification-page screenshot was. It was read as a screenshot annotation at the
time, and the genuine layout gap next to it (the grid-track bug, logged separately)
masked it.

### Scope
Four components declare a `title` input: `PageWrapper`, `ListingLayout`, `EmptyState`,
`Placeholder`. Every static `title="…"` on those — 22 call sites — is now
`[title]="'…'"`, along with the three doc-comment examples so the wrong pattern does
not get copied out of them.

**Native `<button title>` / `<a title>` were deliberately left alone** — those tooltips
are intended (Edit, Remove, Toggle sidebar, …). The distinction is the element, not the
attribute: a dash in the tag name means it is a component.

### Verified in the DOM, not by grep
A grep for the pattern can't see past a `>` inside an earlier attribute value (e.g.
`[searchable]="x > 5"`), so the check was done at runtime instead: across 12 routes,
`document.querySelectorAll('[title]')` filtered to dashed tag names returned **0**,
while 13–58 native tooltips per page were preserved.

---

## Notification dropdown: two scrollbars, a clipped filter, an unreachable footer

**Done by me on 2026-08-03**

### What was wrong
Measured on the real panel (logged-in session + CDP), it had **two nested scrollers** —
`div.pm-popover` and `div.panel-list` — so two scrollbars sat side by side and the
footer could be scrolled out of reach. "View all notifications" is the only route to
the inbox, and it was behind a scroll nobody would think to perform.

Separately, six filter chips need ~460px in a 380px panel. `.chips.is-compact` scrolled
sideways with `scrollbar-width: none`, so the row was scrollable with **no affordance
saying so** — it just showed a permanently half-cut "Donations" and read as broken.
Only 3½ of the 6 filters were reachable in practice.

### Fix
- **`popover-menu.ts`** — new `panelScrolls` input. When set, `.pm-popover` becomes a
  flex column with `overflow: hidden` and stops scrolling itself, letting the projected
  panel own it. Default false, so simple menus are untouched.
- **`notification-bell.ts`** — passes it; header/filters/footer are `flex: none` and
  `.panel-list` takes the leftover height. Dropped the list's own `max-height`: two
  competing height caps is what produced the second bar.
- **`notification-filters.ts`** — the compact row wraps instead of side-scrolling. The
  original reason for scrolling (keeping the panel a fixed height) no longer applies now
  the list is a flex region — the second chip row costs the list height, not the panel.

Verified: nested scrollers `["panel-list", "pm-popover"]` → `["panel-list"]`, and
children escaping the panel box 6 → 0. All six chips visible, footer always on screen.

---

## Profile & Certificates: skeletons instead of a spinner line

**Done by me on 2026-08-03**

`.sk` / `.sk-card` + `fb-shimmer` **moved from `listing-grid.scss` to `styles.scss`**.
They were component-scoped, so the two new pages could not have reused them without a
copy — and a second copy is how two skeletons end up shimmering at different rates on
one screen. `listing-grid.scss` is now a pointer to that.

- **`certificates.ts`** — six placeholder cards tracing the real one (award mark, number,
  meta, download button) in the *same* grid and gap, so nothing shifts when data lands.
- **`profile.ts`** — mirrors the two-card layout: avatar circle, name/meta bars, five
  labelled field rows, save button, plus the pickup-address card for donors.

### The subtle bit
The profile skeleton must know whether to draw one card or two, and `isDonor()` reads
the **fetched** profile — always false while loading. Using it drew one card, then two
once the response arrived: exactly the layout jump a skeleton exists to absorb. Hence
`skeletonIsDonor`, off `AuthService.currentUser()`, which is known before the request.
Caught by counting `.sk-card` in the DOM mid-load (1, should be 2), not by eye.

---

## Profile on mobile: 124px of horizontal scroll, and a crushed address row

**Done by me on 2026-08-03**

### It was not the address row
Reported as "the address section creates horizontal scroll". Measured on the real
page at a 360px viewport (dev session + CDP device emulation), the address rows had
`scrollWidth - clientWidth === 0`. They were not overflowing at all.

The page was: **124px** at 360px, **95px** at 390px — the same ~484px content box
either way, i.e. a fixed floor rather than anything responsive.

The chain located it:

```
div.grid.gap-4.items-start   w=328   gridTemplateColumns: 467.766px   <-- track wider than container
  form.card-fb.p-5           w=468   minW=auto
```

A **grid item defaults to `min-width: auto`**, so the single auto column could not
shrink below the widest unbreakable thing inside the card and dragged the track to
467.77px inside a 328px container. Every card in that grid inherited the width, the
address card included — which is why it looked like the address section's fault.

Confirmed before writing any code by setting `min-width: 0` on the two grid items
live: page overflow 124 → 0, track 467.77px → 328px.

### Both fixes
- **`min-w-0`** on the two grid children (the details `<form>` and the pickup-address
  `<div>`). This is the actual scroll fix.
- **`.addr-row` split into `.addr-main` + `.addr-actions`**, wrapping. Flat, the row
  wrapped one button at a time and squeezed the address to a truncated stub; grouped,
  the whole control block drops to its own line.

### Why the wrap is driven by the breakpoint, not a flex-basis
The first attempt used `flex: 1 1 220px` on `.addr-main` and let the basis trigger the
wrap. At 1280px that made **one row stack and its neighbour not** — rows reading "Set
default" are wider than rows reading "Default", so they crossed the threshold and their
neighbours didn't. Ragged. Now `.addr-main` is `flex: 1 1 auto; min-width: 0` and the
`max-width: 640px` query alone decides, so every row in a card agrees.

Verified on the real page: overflow 0 at 360 / 414 / 640 / 768 / 1280, rows 94px (wrapped)
at ≤640 and 58px (one line) at ≥768, both rows matching at every width.

---

## New Donation: post from your current location

**Done by me on 2026-08-03**

### Problem
A donation's pickup could only be a **saved** address. Two consequences: a donor with
an empty address book was hard-blocked from posting at all (the form offered only
"Add a pickup address on your Profile page"), and a donor at a venue they will never
revisit had to save a throwaway address to get past the form.

### Change
`pickupOptions` gains a final `__current__` entry — the same sentinel-option idiom the
confirm-delivery dialog uses for "Somewhere else — add a new spot". Choosing it
reveals a `LocationPicker` (map + GPS + reverse geocoding) inside the form, and the
listing posts on the freeform `pickupAddress`/`latitude`/`longitude` trio that
`pickupPayload` already supported.

- The option is **always present**, so the address book being empty is no longer a
  dead end; the select is now rendered even with zero saved addresses.
- A map rather than a bare GPS grab: this address is what a volunteer navigates to,
  and a fix taken indoors can land across the block with nothing on screen to reveal it.
- `pickupAddress` falls back to `lat, lng` if geocoding returns nothing — that text is
  how a volunteer finds the place, so it must never be empty.
- The point is **not** saved to the address book. It belongs to this listing only.

### The trap — and it is a quiet one
`pickup.selected()` still holds whatever saved address was last active; choosing
"current location" never clears it. So `pickupPayload`'s existing
`if (serverBacked && saved) return { donorAddressId }` branch would have won, dropping
the marked point and **posting the donation at the donor's saved address**, with
nothing on screen to show it. Hence the explicit `!this.useCurrentLocation()` in that
condition. `create-listing.spec.ts` asserts the emitted body directly, because this
failure is invisible from the UI.

Same shape as the `center` vs `location` split in the delivery dialog: a value the
form is *holding* is not the value the user *chose*.

---

## Login: a real loading state for "Send OTP"

**Done by me on 2026-08-03**

### Problem
`login.html` carried `<app-button loading="" …>`. As a *static attribute* that
assigns the **string** `''` to a `boolean` input — always falsy, so the spinner
could never appear, and nothing else tracked the request either. Pressing Send OTP
left the screen completely inert while the SMS round-trip ran.

That matters more here than on most screens: Enter submits the form, so an
impatient second press sent a **second OTP**. Sends are rate-limited per number
(`OtpRateLimit:MaxSendsPerWindow`), so it was the *retry* that failed — on a screen
that gave no sign the first press had done anything.

### Change
- **`login.ts`** — a `sending` signal, set through `setSending()` so the flag and
  the field move together. Guards re-entry in `sendOtp()` and in `goToRegister()`.
  - The field is disabled **through the form control**, not an input on
    `<app-input>`: that's what reaches `FbInput.setDisabledState`. The number must
    not drift from the one the OTP was actually sent to.
  - On success the busy state is **held across the navigation**
    (`router.navigate(...).finally(...)`) rather than cleared in `next` — clearing
    on the response flashes an idle, pressable button for the frames before the OTP
    screen renders. `finally` still fires if a guard blocks the route, so the form
    can't be left permanently locked.
- **`login.html`** — `[loading]="sending()"`, and the label swaps to "Sending OTP…";
  on a slow network a spinner alone doesn't say whether the press registered. The
  "Create account" link is disabled while in flight.
- **`styles.scss`** — `.fb-link:disabled` styling, placed **after** `.fb-link:hover`:
  same specificity, so source order is what stops a disabled link underlining
  itself under the cursor.
- `login.spec.ts` (new) covers the busy state, the double-submit guard, release on
  failure, and that the state survives until navigation resolves.

---

## "Use current location" on a machine that has no way to locate itself

**Done by me on 2026-08-03**

### What was reported
"Use current location" failed every time with
*"Could not read your location — drop a pin on the map instead."*

### What it actually was
Not a code fault. The dev machine is a **wired desktop with no wireless adapter**
(`Get-NetAdapter` → Ethernet only). Windows location was allowed and `lfsvc` was
running, so nothing was blocked — but Chrome geolocates from nearby Wi-Fi access
points, and with no radio there is nothing to scan and nothing to send to Google's
network-location endpoint. It returns `POSITION_UNAVAILABLE` (code 2, so
`denied: false`) on every attempt. **On that hardware the button cannot ever
succeed**; the map is the only route, which is why it exists.

Worth knowing before chasing this again: the same message on a *laptop* is a
different fault. `denied: false` means "no fix", never "blocked" — a blocked
permission is code 1 and takes the `LocationPermissionService` modal instead.

### What was wrong, and is now fixed
`LocationPicker.captureGps` threw away the reason. `GeolocationService.messageFor`
already distinguishes unavailable / timed-out / blocked, and the catch replaced all
of it with one fixed string — so the message could never say which had happened,
and a permanent hardware limit looked identical to a transient timeout.

- **`src/app/shared/ui/location-picker/location-picker.ts`**
  - The toast now carries `err.message`: *"Your location is currently unavailable —
    set the point on the map instead."*
  - New `gpsError` signal renders the same line **under the button and leaves it
    there**. A toast dismisses itself after ~3s, which on a device that always
    fails just invites another press. Any point set on the map clears it.
- `location-picker.spec.ts` (new) covers both failure codes and the success path.

---

## Confirm delivery: a map for the "add a new spot" branch

**Done by me on 2026-08-03**

### Problem
Adding a new drop-off spot offered only a "Use my location" button and a printed
lat/lng pair. Nothing could be checked or corrected: if GPS was off by a street
the volunteer had no way to see it, and no way to fix it. That spot is then saved
and **suggested to every volunteer delivering nearby**, so a bad coordinate keeps
costing after the delivery it came from.

### Change
- **`src/app/shared/ui/delivery-dialog/delivery-dialog.ts`** — the new-spot branch
  now renders the shared `LocationPicker` (draggable/tappable pin, GPS button with
  the blocked-permission modal, reverse geocoding). Dropped the hand-rolled
  button, `useMyLocation()`, the `locating` signal and the `GeolocationService` /
  `ToastService` injections — the shared component covers all of it.
  - `autoLocate` is on: the volunteer is standing at the drop-off, so the common
    case should be "confirm the pin", not "find yourself on a map".
  - The reverse-geocoded address now fills `DropOffSelection.address`. That field
    was already on the wire contract and already forwarded by
    `ListingService.dropOffForm`, but **nothing ever set it** — new spots were
    saved with a coordinate and no readable address.
- **`src/app/shared/ui/location-picker/location-picker.ts`** — new optional
  `center` input.

### The one trap here
`center` and `location` must stay separate. The picker **always draws its pin**, so
the map needs a starting point (here: the listing's pickup area). Feeding that in
as `location` would make it a *chosen* value — the coordinate line would announce
"Pin set at …" before the user touched anything, and Confirm would accept the
**pickup** address as the drop-off. So `newCoords` stays null until a real
drag/tap/GPS fix, and that alone gates submission. `delivery-dialog.spec.ts` pins
this, plus the stale-address clear when the pin moves.

Note the map only renders where a Google Maps key exists —
`environment.prod.ts` has `googleMapsApiKey: ''`, so in production this degrades
to the "add an API key" placeholder like every other map in the app.

---

## Toast: a successful cancel reported "Something went wrong"

**Done by me on 2026-08-03**

### Problem
Cancelling a listing returned 200 and cancelled it, then popped a red toast
titled **"Something went wrong"**. Nothing failed — the toast was misreporting.

`ToastService.show(icon, message)` infers the toast *type* from a substring of
the Font Awesome class, and `'fa-ban'` matched `includes('ban')` → `error`. Since
`show()` passes no title, it fell back to the error type's default title. So
`show('fa-solid fa-ban', 'Listing cancelled')` rendered as
**Something went wrong / Listing cancelled**, in red.

The inference was the whole bug: `fa-ban` is this app's **cancelled-status** glyph
(`STATUS_ICONS` in `listing.model`), so it describes the *subject* of the message,
not its outcome. No amount of guessing can tell those apart.

### Fix
- **`src/app/core/services/toast.service.ts`**
  - `show()` takes an optional third arg, `type: ToastType`, which wins over the
    guess. The ~100 existing two-arg callers are untouched.
  - Dropped `'ban'` from the error heuristic (`'xmark'` still means error), so an
    icon-only caller can't hit this again.
- **`src/app/features/donor/my-listings/my-listings.ts`** — the cancel
  confirmation now passes `'success'` outright.
- **`toast.service.spec.ts`** (new) pins it: `fa-ban` is never an error, an
  explicit type overrides the icon, and the other inferences still hold.

`ListingStore` (`core/services/listing-store.service.ts`) has the same
`show('fa-solid fa-ban', …)` call, but it's the pre-backend mock store and nothing
injects it — the heuristic change covers it anyway if it's ever revived.

---

## ListingLayout: dead space under the summary card when the aside is tall

**Done by me on 2026-08-03**

### Problem
The Verification page showed ~170px of empty space between the "You're verified"
summary card and the first document row. Not a Verification bug — it's in the
shared layout, and any page whose list is shorter than its aside had it.

From 1280px up `.ll-body--aside` is `'summary aside' / 'grid aside'`, so the aside
spans **both** rows. When it's taller than the summary and grid combined, CSS Grid
splits the surplus **equally between the two auto rows** — half of it lands under
the summary card, where there's nothing to fill it. (Verification: 259px of surplus
→ 129px added to each row, which is exactly the gap that showed.)

### Fix
- **`src/app/shared/ui/listing-layout/listing-layout.ts`** — added
  `grid-template-rows: auto 1fr` inside the `min-width: 1280px` block. Row 1 is
  then pinned to the summary's own height and row 2 absorbs all the flex, so the
  surplus goes *below* the grid where there's nothing to push apart.

Safe for the taller-list pages too: `1fr` floors at `auto`, so when the grid is the
tall one the rows are content-sized exactly as before. Verified in Chrome with a
standalone repro — dead space went 173px → 0px, with the tall-grid case unchanged.

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

- **Every upload path now accepts the whole browser-renderable image set.**
  Previously each screen carried its own hand-written accept list, and the
  narrowest of them (`image/jpeg,image/png`) refused `.jfif` — the file Chrome's
  "Save image as" produces on Windows. `IMAGE_ACCEPT` / `IMAGE_OR_PDF_ACCEPT` in
  `@shared/ui/image-picker/image-picker` are now the only lists, mirrored by
  `ImageFileTypes` on the backend. Two rules matter when touching this:
  - The list carries **extensions as well as MIME types**, because Windows reports
    `.jfif` as `image/pjpeg` and sometimes reports no type at all. `ImagePicker`
    validates on either axis; a type-only check rejects real photos.
  - SVG is excluded deliberately (stored XSS — we serve uploads back), as are
    HEIC/TIFF (upload fine, render as a broken image on most desktop browsers).
- **`GET /listings/deliveries` now includes each delivery's `timeline`.** The
  `ApiListing` model already declares `timeline`, so it is received automatically.
  The delivery detail dialog still uses the standalone `GET /listings/{id}/timeline`
  endpoint for now, because that one resolves actor **names** (the embedded
  timeline entries carry only `actorUserId`).
