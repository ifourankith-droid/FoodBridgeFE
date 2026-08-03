import { DatePipe, DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, EMPTY, tap } from 'rxjs';
import { APP_ROUTES } from '@core/config/app-routes';
import { AvailabilityService } from '@core/services/availability.service';
import { ApiListing, ApiNearbyListing, MealType } from '@core/models/listing-api.model';
import { AuthService } from '@core/services/auth.service';
import { DialogService } from '@core/services/dialog.service';
import { GeolocationService } from '@core/services/geolocation.service';
import { ListingService } from '@core/services/listing.service';
import { ToastService } from '@core/services/toast.service';
import { UserService } from '@core/services/user.service';
import { VolunteerDeliveriesStore } from '@core/services/volunteer-deliveries.store';
import { InfiniteScroll } from '@shared/directives/infinite-scroll.directive';
import { AvailabilityToggle } from '@shared/ui/availability-toggle/availability-toggle';
import { FbButton } from '@shared/ui/button/button';
import { ListingCard, ListingCardData } from '@shared/ui/listing-card/listing-card';
import { ListingLayout } from '@shared/ui/listing-layout/listing-layout';
import { ListingFilters } from '@shared/ui/listing-filters/listing-filters';
import { SummaryHeader } from '@shared/ui/summary-header/summary-header';
import { FbLatLng } from '@shared/ui/map/fb-map.model';
import { openRouteDialog, RouteContact, RouteStop } from '@shared/ui/route-dialog/route-dialog';
import { appNow, isExpired } from '@shared/util/timezone';
import { environment } from '@env/environment';
import { ClaimDialog, ClaimDialogData } from './claim-dialog';

/** The listing status the nearby feed asks the backend for — "Posted" (i.e. Pending). */
const NEARBY_STATUS = 'Posted';

const RADIUS_KM = 10;
const PAGE_SIZE = 12;
/** How often the feed silently re-fetches while the volunteer is online. */
const AUTO_REFRESH_MS = 30_000;

const MEALS: readonly MealType[] = ['Breakfast', 'Lunch', 'Dinner', 'Snacks'];

/** Icon + accent per meal — shared by the aside donut and its breakdown rows. */
const MEAL_META: Record<MealType, { icon: string; color: string; }> = {
  Breakfast: { icon: 'fa-solid fa-mug-saucer', color: '#ea580c' },
  Lunch: { icon: 'fa-solid fa-bowl-food', color: '#059669' },
  Dinner: { icon: 'fa-solid fa-utensils', color: '#4f46e5' },
  Snacks: { icon: 'fa-solid fa-cookie-bite', color: '#d97706' },
};

/**
 * A nearby listing paired with the card shape it renders as, plus the full listing
 * returned by a claim made in this session (the feed itself only ever returns Pending).
 */
interface NearbyRow {
  id: string;
  source: ApiNearbyListing;
  card: ListingCardData;
  claimed: ApiListing | null;
}

// Stop colours, kept literal because they are baked into the map's SVG pins.
const COLOR_ME = '#2258c7';
const COLOR_PICKUP = '#d97706';
const COLOR_DROP = '#1e9e5c';

@Component({
  selector: 'app-nearby',
  imports: [
    DecimalPipe,
    DatePipe,
    InfiniteScroll,
    AvailabilityToggle,
    FbButton,
    ListingCard,
    ListingLayout,
    ListingFilters,
    SummaryHeader,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-listing-layout
      [title]="'Nearby Listings'"
      description="Sorted by distance — claim what you can deliver."
      [hasActions]="!offline()"
      [hasAside]="!offline()"
      [bodyHidden]="offline()"
      [loading]="loading()"
      [empty]="!rows().length"
      gridClass="md:grid-cols-2"
      emptyIcon="fa-solid fa-map-location-dot"
      [emptyTitle]="hasFilters() ? 'No listings match these filters' : 'No open listings nearby'"
      [emptyText]="
        hasFilters()
          ? 'Clear the diet or meal filter to see everything open near you.'
          : 'Check back soon — donations are posted throughout the day.'
      "
      [emptyActionLabel]="hasFilters() ? 'Clear filters' : ''"
      emptyActionIcon="fa-solid fa-filter-circle-xmark"
      emptyActionVariant="outline"
      (emptyAction)="clearFilters()"
    >
      <ng-container pageActions>
        <app-button
          variant="outline"
          icon="fa-solid fa-location-crosshairs"
          [loading]="locating()"
          (clicked)="locateAndLoad()"
        >
          Use current location
        </app-button>
        <app-button icon="fa-solid fa-rotate" [loading]="loading()" (clicked)="reload()">
          Refresh
        </app-button>
      </ng-container>

      @if (offline()) {
        <!-- Offline volunteers never hit the nearby API — they can't take work
             while hidden from matching, so prompt them to go Available instead. -->
        <div banner class="card-fb p-8 text-center">
          <div class="offline-badge"><i class="fa-solid fa-bolt-lightning"></i></div>
          <h3 class="text-lg font-bold mb-1">You're offline</h3>
          <p class="text-muted text-sm mb-5">
            Turn on your availability to load food donations you can pick up nearby. While
            you're offline we don't fetch listings or match you to anything.
          </p>
          <div class="max-w-xl mx-auto">
            <app-availability-toggle variant="row" />
          </div>
        </div>
      }

      <app-summary-header
        summary
        icon="fa-solid fa-map-location-dot"
        [loading]="locating()"
        loadingText="Finding your location…"
      >
        <span heading>
          <span class="text-primary-deep text-2xl">{{ rows().length }}</span> open listings within {{ radiusKm }} km
        </span>
        <span
          subtitle
          class="flex items-center gap-1"
          [class.text-success-deep]="locationSource() === 'gps'"
          [class.text-muted]="locationSource() !== 'gps'"
        >
          <i class="fa-solid" [class]="locationSource() === 'gps' ? 'fa-location-crosshairs' : 'fa-location-dot'"></i>
          <span>{{ locationLabel() }}</span>
        </span>
      </app-summary-header>

      <app-listing-filters
        filters
        [showDiet]="true"
        [showMeal]="true"
        [diet]="dietSel()"
        (dietChange)="dietSel.set($event)"
        [meal]="mealSel()"
        (mealChange)="mealSel.set($event)"
      />

      @for (row of rows(); track row.id) {
        <app-listing-card [listing]="row.card" [hasMeta]="true" [hasFooter]="true">
          <div cardMeta>
            <div class="truncate">
              <i class="fa-solid fa-location-dot mr-1"></i>{{ row.source.pickupAddress }}
            </div>
            <div>
              <i class="fa-solid fa-route mr-1"></i>{{ row.source.distanceKm | number: '1.0-1' }} km away ·
              pickup by {{ row.source.pickupDeadlineUtc | date: 'MMM d, h:mm a' }}
            </div>
            @if (row.claimed?.estimatedPickupAtUtc; as eta) {
              <div class="text-success-deep font-semibold">
                <i class="fa-regular fa-clock mr-1"></i>Your ETA: {{ eta | date: 'MMM d, h:mm a' }}
              </div>
            }
          </div>

          <div cardFooter>
            <!-- Primary action 70% / route 30%. -->
            <div class="action-row">
              @if (row.claimed) {
                <app-button class="a-70" variant="success" size="sm" icon="fa-solid fa-truck" [block]="true" (clicked)="goToDeliveries()">
                  Go to delivery
                </app-button>
              } @else {
                <app-button class="a-70" size="sm" icon="fa-solid fa-hand" [block]="true" (clicked)="openClaim(row)">
                  Claim
                </app-button>
              }
              <app-button
                class="a-30"
                variant="outline"
                size="sm"
                icon="fa-solid fa-diamond-turn-right"
                [block]="true"
                (clicked)="openRoute(row)"
              >Route</app-button>
            </div>

            @if (row.claimed) {
              <app-button
                variant="ghost"
                size="sm"
                icon="fa-solid fa-rotate-left"
                [block]="true"
                [loading]="releasingId() === row.id"
                (clicked)="release(row)"
              >Release claim</app-button>
            }
          </div>
        </app-listing-card>
      }

      @if (!loading()) {
        <div
          belowGrid
          appInfiniteScroll
          [appInfiniteScrollDisabled]="loadingMore() || done()"
          (scrolled)="loadMore()"
          class="py-5 text-center text-muted text-sm"
        >
          @if (loadingMore()) {
            <i class="fa-solid fa-spinner fa-spin mr-2"></i>Loading more…
          } @else if (done() && rows().length) {
            <span class="opacity-70">You've reached the end</span>
          }
        </div>
      }

      <!-- Sticky stats aside — what's in range right now + this session's claims. -->
      <ng-container aside>
        <div class="card-fb p-5">
          <div class="font-bold text-sm mb-4">Open nearby</div>
          <div class="flex items-center gap-4">
            <div class="fb-ring" [style.background]="donutBackground()">
              <div class="fb-ring-inner">
                <span class="fb-ring-num">{{ rows().length }}</span>
                <span class="fb-ring-cap">listings</span>
              </div>
            </div>
            <div class="min-w-0">
              <div class="text-muted text-xs">Within</div>
              <div class="font-bold text-xl text-primary-deep">{{ radiusKm }} km</div>
              <div class="text-muted text-[11px] mt-1 truncate">{{ locationLabel() }}</div>
            </div>
          </div>
        </div>

        <!-- By meal — each row toggles that meal in the feed filter. -->
        <div class="card-fb p-5">
          <div class="flex items-center justify-between mb-3">
            <div class="font-bold text-sm">By meal</div>
            @if (mealSel().length) {
              <button type="button" class="fb-link text-xs" (click)="mealSel.set([])">Clear</button>
            }
          </div>
          @if (rows().length) {
            <div class="flex flex-col gap-1">
              @for (m of mealStats(); track m.id) {
                <button
                  type="button"
                  class="fb-cat-row"
                  [class.is-active]="mealSel().includes(m.id)"
                  [attr.aria-pressed]="mealSel().includes(m.id)"
                  (click)="toggleMeal(m.id)"
                >
                  <span class="fb-cat-icon" [style.color]="m.color">
                    <i [class]="m.icon" aria-hidden="true"></i>
                  </span>
                  <span class="fb-cat-label">{{ m.label }}</span>
                  <span class="fb-cat-count">{{ m.count }}</span>
                  <span class="fb-cat-bar" aria-hidden="true">
                    <span class="fb-cat-fill" [style.width.%]="m.pct" [style.background]="m.color"></span>
                  </span>
                </button>
              }
            </div>
          } @else {
            <p class="text-muted text-xs m-0">No open listings in range right now.</p>
          }
        </div>

        <!-- This session: live from the volunteer store — claimed (awaiting pickup) and
             already picked up, so the volunteer sees their in-progress work at a glance. -->
        <div class="card-fb p-5">
          <div class="font-bold text-sm mb-3">This session</div>

          <div class="flex items-center gap-3">
            <div class="stat-icon !mb-0" style="background:linear-gradient(135deg,var(--fb-success),var(--fb-success-deep))">
              <i class="fa-solid fa-hand "></i>
            </div>
            <div class="min-w-0">
              <div class="font-bold">
                <span class="text-success-deep text-2xl">{{ claimedCount() }}</span>
                {{ claimedCount() === 1 ? 'claim' : 'claims' }}
              </div>
              <div class="text-muted text-xs mt-0.5">Now tracked in My Deliveries</div>
            </div>
          </div>

          <div class="flex items-center gap-3 mt-3">
            <div class="stat-icon !mb-0" style="background:linear-gradient(135deg,var(--fb-accent),var(--fb-accent-deep))">
              <i class="fa-solid fa-box"></i>
            </div>
            <div class="min-w-0">
              <div class="font-bold">
                <span class="text-primary-deep text-2xl">{{ pickedUpCount() }}</span>
                picked up
              </div>
              <div class="text-muted text-xs mt-0.5">In transit to drop-off</div>
            </div>
          </div>

          @if (claimedCount() + pickedUpCount()) {
            <app-button
              class="mt-3 block"
              variant="outline"
              size="sm"
              icon="fa-solid fa-truck"
              [block]="true"
              (clicked)="goToDeliveries()"
            >
              Go to deliveries
            </app-button>
          }
        </div>
      </ng-container>
    </app-listing-layout>
  `,
  styles: `
    /* Offline prompt badge. */
    .offline-badge {
      width: 56px;
      height: 56px;
      margin: 0 auto 14px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 16px;
      font-size: 22px;
      color: var(--fb-muted);
      background: var(--fb-bg);
      border: 1px solid var(--fb-line);
    }

    /* Card actions: primary 70% / route 30%. */
    .action-row {
      display: flex;
      gap: 8px;
    }
    .action-row .a-70 {
      flex: 0 0 calc(70% - 4px);
      min-width: 0;
    }
    .action-row .a-30 {
      flex: 0 0 calc(30% - 4px);
      min-width: 0;
    }
    .action-row + app-button {
      margin-top: 8px;
    }
  `,
})
export class Nearby {
  private readonly listingService = inject(ListingService);
  private readonly users = inject(UserService);
  private readonly auth = inject(AuthService);
  private readonly geo = inject(GeolocationService);
  private readonly deliveries = inject(VolunteerDeliveriesStore);
  private readonly availability = inject(AvailabilityService);
  private readonly dialog = inject(DialogService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);

  protected readonly radiusKm = RADIUS_KM;

  protected readonly listings = signal<ApiNearbyListing[]>([]);
  /** Listings claimed in this session, keyed by id — they stay in the feed so the
      volunteer can still release them or jump to the delivery. */
  private readonly claimedById = signal<Record<string, ApiListing>>({});

  protected readonly loading = signal(true);
  protected readonly loadingMore = signal(false);
  protected readonly done = signal(false);
  protected readonly releasingId = signal<string | null>(null);
  /** Where the feed is currently centred, so the volunteer knows what "nearby" means. */
  protected readonly locating = signal(true);
  protected readonly locationSource = signal<'gps' | 'profile' | 'default'>('default');

  // Diet + meal filters (multi-select, empty = no filter). Applied client-side
  // over the loaded feed — the nearby endpoint only takes a single value each, so
  // multi-select can't be pushed server-side.
  protected readonly dietSel = signal<string[]>([]);
  protected readonly mealSel = signal<string[]>([]);

  /** Whether anything is narrowing the feed — decides which empty message shows. */
  protected readonly hasFilters = computed(
    () => !!(this.dietSel().length || this.mealSel().length),
  );

  /** Drop every filter — the empty state's way back to the full feed. */
  protected clearFilters(): void {
    this.dietSel.set([]);
    this.mealSel.set([]);
  }

  /** Volunteer is Offline → we don't hit the nearby API; the page prompts them to go Available. */
  protected readonly offline = computed(() => !this.availability.isActive());

  /** Signal, not a field — the route dialog draws its first leg from here. */
  private readonly center = signal<FbLatLng>({
    lat: environment.mapDefaultCenter.lat,
    lng: environment.mapDefaultCenter.lng,
  });
  private page = 1;

  /**
   * The feed as card view-models, narrowed by the diet/meal multi-selects
   * (client-side), so card inputs keep a stable identity between checks.
   */
  protected readonly rows = computed<NearbyRow[]>(() => {
    const claimed = this.claimedById();
    const diets = new Set(this.dietSel());
    const meals = new Set(this.mealSel());
    const now = appNow();
    return this.listings()
      .filter((l) => {
        if (!claimed[l.id] && isExpired(l.pickupDeadlineUtc, now)) {
          return false;
        }
        if (diets.size && (!l.dietType || !diets.has(l.dietType))) {
          return false;
        }
        if (meals.size && (!l.mealType || !meals.has(l.mealType))) {
          return false;
        }
        return true;
      })
      .map((l) => {
        const mine = claimed[l.id] ?? null;
        return {
          id: l.id,
          source: l,
          claimed: mine,
          card: {
            title: l.title,
            foodType: l.foodType,
            dietType: l.dietType,
            mealType: l.mealType,
            quantityMeals: l.quantityMeals,
            freshnessTag: l.freshnessTag,
            pickupDeadlineUtc: l.pickupDeadlineUtc,
            status: mine ? mine.status : 'Pending',
            imageUrl: l.imageUrl,
          },
        };
      });
  });

  /** "This session" tallies, live from the volunteer store: claimed (awaiting pickup)
      and already picked up (in transit). */
  protected readonly claimedCount = computed(() => this.deliveries.awaitingPickup().length);
  protected readonly pickedUpCount = computed(() => this.deliveries.inTransit().length);

  /** Composition of the current feed by meal type, for the aside donut + rows. */
  protected readonly mealStats = computed(() => {
    const rows = this.listings();
    const total = rows.length || 1;
    const counts = {} as Record<MealType, number>;
    for (const l of rows) {
      if (l.mealType) {
        counts[l.mealType] = (counts[l.mealType] ?? 0) + 1;
      }
    }
    return MEALS.map((m) => ({
      id: m,
      label: m,
      icon: MEAL_META[m].icon,
      color: MEAL_META[m].color,
      count: counts[m] ?? 0,
      pct: Math.round(((counts[m] ?? 0) / total) * 100),
    })).filter((row) => row.count > 0);
  });

  /** Multi-segment conic gradient for the meal donut. */
  protected readonly donutBackground = computed(() => {
    const total = this.listings().length;
    if (!total) {
      return 'conic-gradient(var(--fb-line) 0 100%)';
    }
    let acc = 0;
    const segments = this.mealStats().map((m) => {
      const start = (acc / total) * 100;
      acc += m.count;
      const end = (acc / total) * 100;
      return `${m.color} ${start}% ${end}%`;
    });
    return `conic-gradient(${segments.join(', ')})`;
  });

  /** Toggle a meal from a breakdown row — same selection the Meal dropdown drives. */
  protected toggleMeal(m: MealType): void {
    const set = new Set(this.mealSel());
    if (set.has(m)) {
      set.delete(m);
    } else {
      set.add(m);
    }
    this.mealSel.set([...set]);
  }

  constructor() {
    // Availability gates the whole page. Offline volunteers can't take work while
    // hidden from matching, so we don't call the nearby API at all — we clear the
    // feed and show the "go Available" prompt. Going Available loads the feed and
    // starts live polling; going Offline stops the timer and clears it again. The
    // effect re-runs on every availability flip.
    effect((onCleanup) => {
      if (!this.availability.isActive()) {
        this.listings.set([]);
        this.done.set(false);
        this.loading.set(false);
        this.locating.set(false);
        return;
      }
      this.locateAndLoad();
      const handle = setInterval(() => this.autoRefresh(), AUTO_REFRESH_MS);
      onCleanup(() => clearInterval(handle));
    });
  }

  /**
   * Background poll used by the auto-refresh timer: re-fetch the first page in
   * place, without the full-grid skeleton or error toasts, so the feed stays
   * current for an online volunteer without flashing or nagging. Skips while any
   * other load (initial, locate, load-more) is already in flight.
   */
  private autoRefresh(): void {
    if (this.loading() || this.loadingMore() || this.locating()) {
      return;
    }
    this.fetch(1).subscribe({
      next: (rows) => {
        this.listings.set(rows);
        this.page = 2;
        this.done.set(rows.length < PAGE_SIZE);
      },
      error: () => undefined,
    });
  }

  /**
   * Centre the feed on where the volunteer actually is: try live GPS first, then their
   * saved profile location, then the map default — reloading listings once resolved.
   */
  protected locateAndLoad(): void {
    this.locating.set(true);
    this.loading.set(true);
    this.geo.current().subscribe({
      next: (loc) => {
        this.center.set({ lat: loc.lat, lng: loc.lng });
        this.locationSource.set('gps');
        this.locating.set(false);
        this.reload();
      },
      error: () => this.fallbackLocate(),
    });
  }

  /** GPS unavailable/denied → use the saved profile location, else the map default. */
  private fallbackLocate(): void {
    const id = this.auth.currentUser()?.id;
    if (!id) {
      this.locationSource.set('default');
      this.locating.set(false);
      this.reload();
      return;
    }
    this.users.getProfile(id).subscribe({
      next: (p) => {
        if (p.latitude != null && p.longitude != null) {
          this.center.set({ lat: p.latitude, lng: p.longitude });
          this.locationSource.set('profile');
        } else {
          this.locationSource.set('default');
        }
        this.locating.set(false);
        this.reload();
      },
      error: () => {
        this.locationSource.set('default');
        this.locating.set(false);
        this.reload();
      },
    });
  }

  protected readonly locationLabel = computed(() => {
    switch (this.locationSource()) {
      case 'gps':
        return 'Using your current location';
      case 'profile':
        return 'Using your saved location';
      default:
        return 'Using the default area';
    }
  });

  protected reload(): void {
    this.page = 1;
    this.done.set(false);
    this.loading.set(true);
    this.fetch(this.page).subscribe({
      next: (rows) => {
        this.listings.set(rows);
        this.page++;
        this.done.set(rows.length < PAGE_SIZE);
        this.loading.set(false);
      },
      error: (err: Error) => {
        this.loading.set(false);
        this.toast.show('fa-solid fa-triangle-exclamation', err.message || 'Could not load nearby listings');
      },
    });
  }

  protected loadMore(): void {
    if (this.loading() || this.loadingMore() || this.done()) {
      return;
    }
    this.loadingMore.set(true);
    this.fetch(this.page).subscribe({
      next: (rows) => {
        this.listings.update((cur) => [...cur, ...rows]);
        this.page++;
        this.done.set(rows.length < PAGE_SIZE);
        this.loadingMore.set(false);
      },
      error: () => this.loadingMore.set(false),
    });
  }

  /**
   * Claim, via a dialog that lets the volunteer (optionally) commit to a pickup ETA.
   *
   * The confirm action returns the claim request, so the button spins until the server
   * answers and the dialog stays open on failure — a rejected ETA (422) or a lost race
   * (409) can be adjusted and retried instead of losing what was typed.
   */
  protected openClaim(row: NearbyRow): void {
    const ref = this.dialog.open<ClaimDialogData, ApiListing, ClaimDialog>({
      header: {
        title: 'Claim this pickup',
        subtitle: `${row.source.title} · ${row.source.quantityMeals} meals`,
        icon: 'fa-solid fa-hand-holding-heart',
      },
      content: ClaimDialog,
      data: { pickupDeadlineUtc: row.source.pickupDeadlineUtc },
      // allowOverflow so the select's panel isn't clipped by the dialog body.
      size: 'md',
      allowOverflow: true,
      actions: [
        { id: 'cancel', label: 'Cancel', variant: 'ghost', close: true },
        {
          id: 'claim',
          label: 'Confirm claim',
          icon: 'fa-solid fa-hand',
          handler: (r) =>
            this.listingService.claim(row.id, r.body()?.etaIso()).pipe(
              tap((listing) => r.close(listing)),
              catchError((err: Error) => {
                this.toast.show(
                  'fa-solid fa-triangle-exclamation',
                  err.message || 'Could not claim this listing',
                );
                return EMPTY;
              }),
            ),
        },
      ],
    });

    ref.closed.subscribe((listing) => {
      if (!listing) {
        return;
      }
      this.deliveries.track(listing);
      this.claimedById.update((map) => ({ ...map, [listing.id]: listing }));
      this.toast.show('fa-solid fa-circle-check', 'Claimed — it is now in My Deliveries');
    });
  }

  /**
   * Hand a claim back (Claimed → Pending) so another volunteer can take it. Goes through
   * the deliveries store so the release also drops it from My Deliveries.
   */
  protected async release(row: NearbyRow): Promise<void> {
    const confirmed = await this.dialog.confirm({
      title: 'Release this claim?',
      message: `"${row.source.title}" goes back to the open feed and another volunteer can take it. You can claim it again only if nobody else does first.`,
      confirmLabel: 'Release claim',
      confirmVariant: 'danger',
      icon: 'fa-solid fa-rotate-left',
    });
    if (!confirmed) {
      return;
    }

    this.releasingId.set(row.id);
    this.deliveries.release(row.id).subscribe({
      next: () => {
        this.releasingId.set(null);
        this.claimedById.update((map) => {
          const { [row.id]: _dropped, ...rest } = map;
          return rest;
        });
        this.toast.show('fa-solid fa-rotate-left', 'Claim released — back in the open feed');
      },
      error: (err: Error) => {
        this.releasingId.set(null);
        this.toast.show('fa-solid fa-triangle-exclamation', err.message || 'Could not release this claim');
      },
    });
  }

  protected goToDeliveries(): void {
    this.router.navigate([APP_ROUTES.appView('deliveries')]);
  }

  /**
   * Open the route preview. It always draws you → pickup; the onward pickup → delivery
   * leg is added whenever the claimed listing carries a drop-off point with coordinates.
   *
   * A matched recipient only ever comes back as a name + mobile — `ListingResponse` has
   * no recipient latitude/longitude — so their details are listed beside the map but
   * cannot be drawn as a leg on their own.
   */
  protected openRoute(row: NearbyRow): void {
    const stops: RouteStop[] = [
      {
        role: 'You',
        address: this.locationLabel(),
        at: this.center(),
        color: COLOR_ME,
      },
      {
        role: 'Pickup',
        address: row.source.pickupAddress,
        at: { lat: row.source.latitude, lng: row.source.longitude },
        color: COLOR_PICKUP,
      },
    ];

    const claimed = row.claimed;
    const drop = claimed?.suggestedDropOffLocation ?? null;
    if (drop) {
      stops.push({
        role: `Delivery · ${drop.name}`,
        address: drop.address,
        at: { lat: drop.latitude, lng: drop.longitude },
        color: COLOR_DROP,
      });
    }

    const recipientName = claimed?.recipientName ?? '';
    const contacts: RouteContact[] = recipientName
      ? [
        {
          label: 'Recipient',
          icon: 'fa-solid fa-hand-holding-heart',
          name: recipientName,
          mobile: claimed?.recipientMobile,
        },
      ]
      : [];

    openRouteDialog(this.dialog, {
      heading: stops.length > 2 ? 'Full delivery route' : 'Route to pickup',
      subheading: row.source.title,
      stops,
      contacts,
      note: this.routeNote(stops.length > 2, !!recipientName),
      // Fallbacks for when Google can't return directions: measure from the
      // volunteer if we know where they are, else use the distance the feed
      // already returned for this listing.
      originIsUserLocation: this.locationSource() !== 'default',
      serverDistanceKm: row.source.distanceKm,
    });
  }

  /** Explain, when relevant, why the delivery leg isn't on the map. */
  private routeNote(hasDropLeg: boolean, hasRecipient: boolean): string {
    if (hasDropLeg) {
      return '';
    }
    if (hasRecipient) {
      return 'The delivery leg is not drawn — the API returns the recipient’s name and number but not their coordinates.';
    }
    return 'The delivery leg appears once this listing is matched to a drop-off point, which happens when you confirm pickup.';
  }

  private fetch(page: number) {
    const { lat, lng } = this.center();
    // Ask the backend for Posted (Pending) listings only. Diet/meal are applied
    // client-side in `rows()` — the endpoint takes a single value each and can't
    // do multi-select — as is the expiry guard.
    return this.listingService.nearby(lat, lng, RADIUS_KM, page, PAGE_SIZE, { status: NEARBY_STATUS });
  }
}
