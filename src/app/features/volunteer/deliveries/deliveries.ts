import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, Injector, signal } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, EMPTY, map, Observable, of, tap } from 'rxjs';
import { APP_ROUTES } from '@core/config/app-routes';
import { ApiListing, toListingStatus } from '@core/models/listing-api.model';
import { ListingStatus } from '@core/models/listing.model';
import { AuthService } from '@core/services/auth.service';
import { DialogService } from '@core/services/dialog.service';
import { GeolocationService } from '@core/services/geolocation.service';
import { ToastService } from '@core/services/toast.service';
import { UserService } from '@core/services/user.service';
import { VolunteerDeliveriesStore } from '@core/services/volunteer-deliveries.store';
import { FbButton } from '@shared/ui/button/button';
import { openRaiseDisputeDialog } from '@shared/ui/dispute-dialog/dispute-dialog';
import { ListingCard, ListingCardData } from '@shared/ui/listing-card/listing-card';
import { ListingLayout } from '@shared/ui/listing-layout/listing-layout';
import { ListingFilters, statusOptionsFrom } from '@shared/ui/listing-filters/listing-filters';
import { SummaryHeader } from '@shared/ui/summary-header/summary-header';
import { openPhotoDialog } from '@shared/ui/image-picker/photo-dialog';
import { openDeliveryDialog } from '@shared/ui/delivery-dialog/delivery-dialog';
import { DeliveryDetailDialog } from './delivery-detail-dialog';
import { FbLatLng } from '@shared/ui/map/fb-map.model';
import { openRouteDialog, RouteContact, RouteStop } from '@shared/ui/route-dialog/route-dialog';
import { appDateTime } from '@shared/util/timezone';
import { environment } from '@env/environment';

/** Which leg of the journey a delivery is on. `all` is the unfiltered view. */
type Stage = 'all' | 'pickup' | 'transit' | 'done';
type LiveStage = Exclude<Stage, 'all'>;

interface StageFilter {
  key: Stage;
  label: string;
  icon: string;
}

const STAGES: readonly StageFilter[] = [
  { key: 'all', label: 'All', icon: 'fa-solid fa-layer-group' },
  { key: 'pickup', label: 'To pick up', icon: 'fa-solid fa-hand' },
  { key: 'transit', label: 'In transit', icon: 'fa-solid fa-truck-fast' },
  { key: 'done', label: 'Delivered', icon: 'fa-solid fa-circle-check' },
];

/** Sort order of the stages — the most urgent work first. */
const STAGE_RANK: Record<LiveStage, number> = { pickup: 0, transit: 1, done: 2 };

/** The only statuses a claimed delivery moves through — the Status filter's options. */
const DELIVERY_STATUSES: readonly ListingStatus[] = [
  'claimed',
  'pickedup',
  'delivered',
  'confirmed',
];

/** The place the volunteer should head to next, when its coordinates are known. */
interface NextStop {
  role: string;
  /** Short name for inline text, e.g. "pickup" / "drop-off". */
  short: string;
  address: string;
  at: FbLatLng;
  color: string;
}

/** A claimed listing paired with the card shape it renders as. */
interface DeliveryRow {
  id: string;
  source: ApiListing;
  card: ListingCardData;
  stage: LiveStage;
  /** Where to go next — null once delivered, or while in transit to a matched recipient. */
  next: NextStop | null;
}

/** Which source the route origin came from, for the "You" stop's label. */
type OriginSource = 'gps' | 'profile' | 'default';

// Stop colours, kept literal because they are baked into the map's SVG pins.
const COLOR_ME = '#2258c7';
const COLOR_PICKUP = '#d97706';
const COLOR_DROP = '#1e9e5c';

/** Last-resort route origin when GPS is refused and the profile has no coordinates. */
const DEFAULT_ORIGIN: FbLatLng = {
  lat: environment.mapDefaultCenter.lat,
  lng: environment.mapDefaultCenter.lng,
};

@Component({
  selector: 'app-deliveries',
  imports: [DatePipe, FbButton, ListingCard, ListingLayout, ListingFilters, SummaryHeader],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-listing-layout
      [title]="'My Deliveries'"
      description="Everything you've claimed — confirm each step to keep the chain moving."
      [hasActions]="true"
      [hasAside]="true"
      [loading]="store.loading()"
      [empty]="!rows().length"
      gridClass="md:grid-cols-2"
      emptyIcon="fa-solid fa-truck-fast"
      [emptyText]="emptyText()"
    >
      <ng-container pageActions>
        <app-button
          variant="outline"
          icon="fa-solid fa-rotate"
          [loading]="store.loading()"
          (clicked)="store.load()"
        >
          Refresh
        </app-button>
        <app-button icon="fa-solid fa-map-location-dot" (clicked)="goToNearby()">
          Find listings
        </app-button>
      </ng-container>

      <app-summary-header
        summary
        icon="fa-solid fa-truck-fast"
        [loading]="store.loading()"
        loadingText="Loading your deliveries…"
      >
        <span heading>
          <span class="text-primary-deep text-2xl">{{ counts().pickup + counts().transit }}</span>
          active {{ counts().pickup + counts().transit === 1 ? 'delivery' : 'deliveries' }}
          @if (store.mealsInTransit()) {
            <span class="text-muted text-sm font-normal">
              · {{ store.mealsInTransit() }} meals in your hands
            </span>
          }
        </span>
        <span subtitle class="text-muted">
          {{ counts().pickup }} to pick up · {{ counts().transit }} in transit ·
          {{ counts().done }} delivered
        </span>
      </app-summary-header>

      <app-listing-filters
        filters
        [showStatus]="true"
        [showDiet]="true"
        [showMeal]="true"
        [statusOptions]="statusOptions"
        [status]="statusSel()"
        (statusChange)="statusSel.set($event)"
        [diet]="dietSel()"
        (dietChange)="dietSel.set($event)"
        [meal]="mealSel()"
        (mealChange)="mealSel.set($event)"
      />

      @for (row of rows(); track row.id) {
          <app-listing-card
            [listing]="row.card"
            [icon]="row.stage === 'transit' ? 'fa-solid fa-truck-fast' : 'fa-solid fa-utensils'"
            [iconBg]="iconBg(row)"
            [hasMeta]="true"
            [hasFooter]="true"
          >
            <div cardMeta>
              <!-- Where + when -->
              <div class="meta-line">
                <i class="fa-solid fa-location-dot"></i>
                <span class="truncate">{{ row.source.pickupAddress }}</span>
              </div>
              <div class="meta-line">
                <i class="fa-regular fa-clock"></i>
                <span>Pick up by {{ row.source.pickupDeadlineUtc | date: 'MMM d, h:mm a' }}</span>
              </div>
              @if (row.next; as next) {
                <div class="meta-line">
                  <i class="fa-solid fa-flag-checkered"></i>
                  <span class="truncate">Next stop: {{ next.role }}</span>
                </div>
              }
              @if (row.source.estimatedPickupAtUtc; as eta) {
                <div class="meta-line text-success-deep font-semibold">
                  <i class="fa-solid fa-stopwatch"></i>
                  <span>Your ETA: {{ eta | date: 'MMM d, h:mm a' }}</span>
                </div>
              }
              @if (row.source.preparedAtUtc; as prepared) {
                <div class="meta-line">
                  <i class="fa-solid fa-fire-burner"></i>
                  <span>Prepared {{ prepared | date: 'MMM d, h:mm a' }}</span>
                </div>
              }

              <!-- Who: contacts are only returned to this listing's own parties -->
              @if (row.source.donorName) {
                <div class="meta-line">
                  <i class="fa-solid fa-store"></i>
                  <span class="truncate">
                    Donor: <strong>{{ row.source.donorName }}</strong>
                  </span>
                  @if (row.source.donorMobile; as mobile) {
                    <a class="fb-link ml-auto whitespace-nowrap" [href]="'tel:' + mobile">
                      <i class="fa-solid fa-phone mr-1"></i>Call
                    </a>
                  }
                </div>
              }
              @if (row.source.recipientName) {
                <div class="meta-line">
                  <i class="fa-solid fa-hand-holding-heart"></i>
                  <span class="truncate">
                    Recipient: <strong>{{ row.source.recipientName }}</strong>
                  </span>
                  @if (row.source.recipientMobile; as mobile) {
                    <a class="fb-link ml-auto whitespace-nowrap" [href]="'tel:' + mobile">
                      <i class="fa-solid fa-phone mr-1"></i>Call
                    </a>
                  }
                </div>
              }

              @if (row.source.suggestedDropOffLocation; as drop) {
                <div class="dropoff-banner">
                  <span class="dropoff-icon"><i class="fa-solid fa-location-dot"></i></span>
                  <div class="min-w-0">
                    <div class="dropoff-title">
                      @if (row.stage === 'done') {
                        Drop-off point
                      } @else {
                        Deliver the food here
                      }
                    </div>
                    <div class="dropoff-addr truncate">{{ drop.name }} · {{ drop.address }}</div>
                  </div>
                </div>
              }

              @if (row.stage === 'transit' && !row.next) {
                <div class="meta-note">
                  <i class="fa-solid fa-circle-info mr-1"></i>
                  No route to draw — the API returns the recipient's name and number but not
                  their coordinates. Call them to arrange the hand-over.
                </div>
              }
            </div>

            <div cardFooter>
              @if (row.stage === 'done') {
                <div class="done-note">
                  <i class="fa-solid fa-circle-check mr-1.5"></i>{{ doneLabel(row.source) }}
                </div>
                <app-button
                  variant="ghost"
                  size="sm"
                  icon="fa-solid fa-xmark"
                  [block]="true"
                  (clicked)="clear(row)"
                >
                  Remove from list
                </app-button>
              } @else {
                <div class="action-row">
                  @if (row.stage === 'pickup') {
                    <app-button
                      class="a-70"
                      size="sm"
                      icon="fa-solid fa-hand"
                      [block]="true"
                      (clicked)="start(row, 'pickup')"
                    >
                      Confirm pickup
                    </app-button>
                  } @else {
                    <app-button
                      size="sm"
                      class="a-70"
                      icon="fa-solid fa-box-open"
                      [block]="true"
                      (clicked)="start(row, 'delivery')"
                    >
                      Confirm delivery
                    </app-button>
                  }
                  <app-button
                    class="a-30"
                    variant="outline"
                    size="sm"
                    icon="fa-solid fa-diamond-turn-right"
                    [block]="true"
                    [disabled]="!row.next"
                    [loading]="routeBusyId() === row.id"
                    (clicked)="openRoute(row)"
                  >
                    Navigate
                  </app-button>
                </div>

                <p class="photo-note">
                  <i class="fa-solid fa-camera mr-1"></i>A photo is required to confirm this step.
                </p>

                @if (row.stage === 'pickup') {
                  <app-button
                    variant="ghost"
                    size="sm"
                    icon="fa-solid fa-rotate-left"
                    [block]="true"
                    [loading]="releasingId() === row.id"
                    (clicked)="release(row)"
                  >
                    Release claim
                  </app-button>
                }
              }

              <!-- Secondary actions, side by side (wrap on a narrow card): the full
                   timeline/photos detail, and reporting a problem (open at any stage). -->
              <div class="foot-links">
                <button type="button" class="foot-link" (click)="openDetail(row)">
                  <i class="fa-solid fa-list-check"></i><span>Timeline &amp; photos</span>
                </button>
                <button type="button" class="foot-link danger" (click)="reportIssue(row)">
                  <i class="fa-solid fa-triangle-exclamation"></i><span>Report an issue</span>
                </button>
              </div>
            </div>
          </app-listing-card>
        }

      <!-- Sticky stats aside — progress across the pickup → transit → delivered chain. -->
      <ng-container aside>
        <div class="card-fb p-5">
          <div class="font-bold text-sm mb-4">Delivery status</div>
          <div class="flex items-center gap-4">
            <div class="fb-ring" [style.background]="donutBackground()">
              <div class="fb-ring-inner">
                <span class="fb-ring-num">{{ activeCount() }}</span>
                <span class="fb-ring-cap">active</span>
              </div>
            </div>
            <div class="min-w-0">
              <div class="text-muted text-xs">Delivered</div>
              <div class="font-bold text-xl text-success-deep">{{ counts().done }}</div>
              @if (store.mealsInTransit()) {
                <div class="text-primary-deep text-xs font-semibold mt-1">
                  {{ store.mealsInTransit() }} meals in transit
                </div>
              }
            </div>
          </div>
        </div>

        <!-- By stage — each row toggles that stage's statuses in the filter. -->
        <div class="card-fb p-5">
          <div class="flex items-center justify-between mb-3">
            <div class="font-bold text-sm">By stage</div>
            @if (statusSel().length) {
              <button type="button" class="fb-link text-xs" (click)="statusSel.set([])">Clear</button>
            }
          </div>
          @if (counts().all) {
            <div class="flex flex-col gap-1">
              @for (s of stageStats(); track s.id) {
                <button
                  type="button"
                  class="fb-cat-row"
                  [class.is-active]="isStageActive(s.id)"
                  [attr.aria-pressed]="isStageActive(s.id)"
                  (click)="toggleStage(s.id)"
                >
                  <span class="fb-cat-icon" [style.color]="s.color">
                    <i [class]="s.icon" aria-hidden="true"></i>
                  </span>
                  <span class="fb-cat-label">{{ s.label }}</span>
                  <span class="fb-cat-count">{{ s.count }}</span>
                  <span class="fb-cat-bar" aria-hidden="true">
                    <span class="fb-cat-fill" [style.width.%]="s.pct" [style.background]="s.color"></span>
                  </span>
                </button>
              }
            </div>
          } @else {
            <p class="text-muted text-xs m-0">Claim a nearby listing to start delivering.</p>
          }
        </div>

        <div class="card-fb p-5">
          <div class="font-bold text-sm mb-3">Your impact</div>
          <div class="grid grid-cols-2 gap-3 text-center">
            <div>
              <div class="fb-impact-num">{{ counts().done }}</div>
              <div class="text-muted text-[11px]">Delivered</div>
            </div>
            <div>
              <div class="fb-impact-num">{{ store.mealsInTransit() }}</div>
              <div class="text-muted text-[11px]">Meals in transit</div>
            </div>
          </div>
        </div>
      </ng-container>
    </app-listing-layout>
  `,
  styles: `
    /* Card actions share the row evenly — neither confirming nor navigating is
       the lesser action once a claim is in hand. */
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

    /* Meta lines share the card's muted 12px type; the icon column keeps them aligned. */
    .meta-line {
      display: flex;
      align-items: center;
      gap: 6px;
      min-width: 0;
    }
    .meta-line > i {
      width: 13px;
      flex-shrink: 0;
      text-align: center;
    }
    .meta-note {
      margin-top: 2px;
      line-height: 1.5;
      color: var(--fb-muted);
    }

    /* Drop-off destination — a clean neutral card with a green pin chip, not a
       heavy orange banner. */
    .dropoff-banner {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-top: 6px;
      padding: 10px 12px;
      border-radius: 12px;
      background: var(--fb-bg);
      border: 1px solid var(--fb-line);
    }
    .dropoff-icon {
      flex: none;
      width: 34px;
      height: 34px;
      border-radius: 10px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 14px;
      color: #fff;
      background: linear-gradient(135deg, var(--fb-success), var(--fb-success-deep));
    }
    .dropoff-title {
      font-weight: 700;
      font-size: 12.5px;
      color: var(--fb-ink);
    }
    .dropoff-addr {
      font-size: 12px;
      color: var(--fb-muted);
      line-height: 1.4;
    }

    .photo-note {
      margin: 8px 0 0;
      font-size: 11.5px;
      color: var(--fb-muted);
    }
    .photo-note + app-button {
      margin-top: 8px;
    }

    /* Secondary actions as quiet chips — side by side, wrapping when the card is
       too narrow to hold both. */
    .foot-links {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-top: 10px;
    }
    .foot-link {
      flex: 1 1 auto;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      padding: 7px 10px;
      border: 1px solid var(--fb-line);
      border-radius: 10px;
      background: transparent;
      font-size: 12px;
      font-weight: 600;
      color: var(--fb-muted);
      white-space: nowrap;
      cursor: pointer;
      transition:
        border-color 0.15s ease,
        color 0.15s ease,
        background 0.15s ease;
    }
    .foot-link:hover {
      border-color: var(--fb-primary);
      color: var(--fb-primary-deep);
      background: var(--fb-primary-soft);
    }
    .foot-link.danger:hover {
      border-color: #dc2626;
      color: #dc2626;
      background: rgba(220, 38, 38, 0.06);
    }

    .done-note {
      display: flex;
      align-items: center;
      padding: 9px 11px;
      margin-bottom: 8px;
      border-radius: 10px;
      font-size: 12px;
      font-weight: 600;
      color: var(--fb-success-deep);
      background: var(--fb-success-soft, rgba(30, 158, 92, 0.12));
      border: 1px solid rgba(30, 158, 92, 0.3);
    }
  `,
})
export class Deliveries {
  protected readonly store = inject(VolunteerDeliveriesStore);
  private readonly users = inject(UserService);
  private readonly auth = inject(AuthService);
  private readonly geo = inject(GeolocationService);
  private readonly dialog = inject(DialogService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);
  private readonly injector = inject(Injector);

  /** Status/diet/meal filters (multi-select, empty = no filter), applied client-side
      over the tracked claims. Options for the Status dropdown are the delivery span. */
  protected readonly statusOptions = statusOptionsFrom(DELIVERY_STATUSES);
  // Default to the still-active stages (Claimed + Picked up) so a volunteer lands on
  // the work in progress; they can clear it to see delivered/confirmed too.
  protected readonly statusSel = signal<string[]>(['claimed', 'pickedup']);
  protected readonly dietSel = signal<string[]>([]);
  protected readonly mealSel = signal<string[]>([]);

  protected readonly releasingId = signal<string | null>(null);

  /**
   * The route origin. Deliberately NOT resolved on load: this page's data comes from
   * the claims themselves, so nothing here needs the device location. It is looked up
   * the first time a volunteer asks for directions, then cached for the session.
   */
  private readonly origin = signal<FbLatLng | null>(null);
  private readonly originSource = signal<OriginSource>('default');
  /** Row whose origin lookup is in flight, so its Navigate button can spin. */
  protected readonly routeBusyId = signal<string | null>(null);

  protected readonly counts = computed<Record<Stage, number>>(() => ({
    all: this.store.all().length,
    pickup: this.store.awaitingPickup().length,
    transit: this.store.inTransit().length,
    done: this.store.completed().length,
  }));

  /** Accent per live stage — shared by the aside donut segments and breakdown rows. */
  private readonly STAGE_COLOR: Record<LiveStage, string> = {
    pickup: '#d97706',
    transit: '#4f46e5',
    done: '#059669',
  };

  /** Pickup + transit = work still in the volunteer's hands (the donut centre). */
  protected readonly activeCount = computed(() => this.counts().pickup + this.counts().transit);

  /** Per-stage counts with colour/icon + share-of-total, non-empty stages only. */
  protected readonly stageStats = computed(() => {
    const c = this.counts();
    const total = c.all || 1;
    return STAGES.filter((s) => s.key !== 'all')
      .map((s) => ({
        id: s.key as LiveStage,
        label: s.label,
        icon: s.icon,
        color: this.STAGE_COLOR[s.key as LiveStage],
        count: c[s.key],
        pct: Math.round((c[s.key] / total) * 100),
      }))
      .filter((row) => row.count > 0);
  });

  /** Multi-segment conic gradient for the stage donut. */
  protected readonly donutBackground = computed(() => {
    const total = this.counts().all;
    if (!total) {
      return 'conic-gradient(var(--fb-line) 0 100%)';
    }
    let acc = 0;
    const segments = this.stageStats().map((s) => {
      const start = (acc / total) * 100;
      acc += s.count;
      const end = (acc / total) * 100;
      return `${s.color} ${start}% ${end}%`;
    });
    return `conic-gradient(${segments.join(', ')})`;
  });

  /** The statuses that make up each stage — the breakdown rows drive the Status filter. */
  private readonly STAGE_STATUSES: Record<LiveStage, ListingStatus[]> = {
    pickup: ['claimed'],
    transit: ['pickedup'],
    done: ['delivered', 'confirmed'],
  };

  /** A stage row is "on" when all of its statuses are currently selected. */
  protected isStageActive(stage: LiveStage): boolean {
    const sel = new Set(this.statusSel());
    return this.STAGE_STATUSES[stage].every((s) => sel.has(s));
  }

  /** Toggle a stage's statuses in the Status filter from a breakdown row. */
  protected toggleStage(stage: LiveStage): void {
    const wanted = this.STAGE_STATUSES[stage];
    const sel = new Set(this.statusSel());
    if (wanted.every((s) => sel.has(s))) {
      wanted.forEach((s) => sel.delete(s));
    } else {
      wanted.forEach((s) => sel.add(s));
    }
    this.statusSel.set([...sel]);
  }

  /** Tracked claims as card view-models, narrowed by the filters and sorted by urgency. */
  protected readonly rows = computed<DeliveryRow[]>(() => {
    const statuses = new Set(this.statusSel());
    const diets = new Set(this.dietSel());
    const meals = new Set(this.mealSel());
    return this.store
      .all()
      .map((l) => this.toRow(l))
      .filter((r) => {
        const l = r.source;
        if (statuses.size && !statuses.has(toListingStatus(l.status))) {
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
      .sort(
        (a, b) =>
          STAGE_RANK[a.stage] - STAGE_RANK[b.stage] ||
          Date.parse(a.source.pickupDeadlineUtc) - Date.parse(b.source.pickupDeadlineUtc),
      );
  });

  protected readonly emptyText = computed(() =>
    this.counts().all
      ? 'Nothing matches these filters — clear them to see your other deliveries'
      : "You haven't claimed anything yet — claim a nearby listing to get started",
  );

  protected readonly locationLabel = computed(() => {
    switch (this.originSource()) {
      case 'gps':
        return 'Your current location';
      case 'profile':
        return 'Your saved location';
      default:
        return 'Default area';
    }
  });

  // ---- Route origin (resolved on demand, never on load) ----

  /**
   * Where the volunteer is starting from: live GPS, else their saved profile location,
   * else the map default. Emits once and never errors — a refused permission just falls
   * through to the next source.
   */
  private resolveOrigin(): Observable<{ at: FbLatLng; source: OriginSource; }> {
    return this.geo.current().pipe(
      map((at) => ({ at, source: 'gps' as OriginSource })),
      catchError(() => this.profileOrigin()),
    );
  }

  private profileOrigin(): Observable<{ at: FbLatLng; source: OriginSource; }> {
    const fallback = { at: DEFAULT_ORIGIN, source: 'default' as OriginSource };
    const id = this.auth.currentUser()?.id;
    if (!id) {
      return of(fallback);
    }
    return this.users.getProfile(id).pipe(
      map((p) =>
        p.latitude != null && p.longitude != null
          ? { at: { lat: p.latitude, lng: p.longitude }, source: 'profile' as OriginSource }
          : fallback,
      ),
      catchError(() => of(fallback)),
    );
  }

  // ---- View helpers ----
  protected iconBg(row: DeliveryRow): string {
    switch (row.stage) {
      case 'pickup':
        return 'linear-gradient(135deg,var(--fb-accent),var(--fb-accent-deep))';
      case 'transit':
        return 'linear-gradient(135deg,var(--fb-primary),var(--fb-primary-deep))';
      default:
        return 'linear-gradient(135deg,var(--fb-success),var(--fb-success-deep))';
    }
  }

  /**
   * A donation completes one of two ways, so the finished label has to say which:
   * with a matched recipient the volunteer's part ends at Delivered and the recipient
   * confirms; with none it went to a drop-off point and confirming the delivery
   * completed the donation outright.
   */
  protected doneLabel(l: ApiListing): string {
    switch (l.status) {
      case 'Delivered':
        return 'Delivered — waiting for the recipient to confirm';
      case 'Confirmed':
        return l.recipientName
          ? 'Confirmed by the recipient — thank you!'
          : 'Delivered and confirmed — points awarded, thank you!';
      default:
        return `This listing is now ${l.status.toLowerCase()}`;
    }
  }

  protected goToNearby(): void {
    this.router.navigate([APP_ROUTES.appView('nearby')]);
  }

  // ---- Confirmations ----

  /**
   * Both confirmations need photographic proof, so both collect it the same way
   * the donor's form does — the shared picker, in a modal. The upload is handed
   * to the dialog rather than run after it closes: on a failed request the
   * dialog stays open with the photo intact, so a retry doesn't mean walking
   * back to re-shoot it.
   */
  protected start(row: DeliveryRow, action: 'pickup' | 'delivery'): void {
    const id = row.id;

    if (action === 'delivery') {
      // Delivery gets its own dialog: alongside the photo the backend now requires *where*
      // the food went, which pickup has no equivalent of.
      openDeliveryDialog(
        this.dialog,
        {
          latitude: row.source.latitude,
          longitude: row.source.longitude,
          suggestedLocationId: row.source.suggestedDropOffLocation?.id ?? null,
          // Without a matched recipient this confirmation is the last step — nobody is left
          // to confirm receipt afterward, so the photo is the delivery record itself.
          completesDonation: !row.source.recipientName,
          // When a recipient is matched, offer them as the pre-selected drop-off.
          recipientName: row.source.recipientName ?? null,
        },
        (photo, dropOff) => this.submitStep(this.store.confirmDelivery(id, photo, dropOff)),
      );
      return;
    }

    openPhotoDialog(this.dialog, {
      title: 'Confirm pickup',
      subtitle: 'A photo is required to confirm this step.',
      icon: 'fa-solid fa-hand',
      confirmLabel: 'Confirm pickup',
      hint: 'Photograph the food as you collect it.',
      submit: (photo) => this.submitStep(this.store.confirmPickup(id, photo)),
    });
  }

  /**
   * Shared tail for both confirmations: announce the outcome, and on failure toast and
   * swallow so the dialog stays open with the photo (and chosen spot) intact for a retry.
   */
  private submitStep(request: Observable<ApiListing>): Observable<ApiListing> {
    return request.pipe(
      tap((l) => this.announceConfirmed(l)),
      catchError((err: Error) => {
        this.toast.show(
          'fa-solid fa-triangle-exclamation',
          err.message || 'Could not confirm this step',
        );
        return EMPTY;
      }),
    );
  }

  /** Says what happens next, which differs by whether a recipient was matched. */
  private announceConfirmed(listing: ApiListing): void {
    if (listing.status === 'PickedUp') {
      const drop = listing.suggestedDropOffLocation;
      this.toast.show(
        'fa-solid fa-circle-check',
        drop
          ? `Pickup confirmed — take it to ${drop.name}`
          : 'Pickup confirmed — deliver to the matched recipient',
      );
      return;
    }
    // Confirmed straight from the delivery confirmation means there was no recipient to
    // wait on — the donation is finished and the points are already awarded.
    this.toast.show(
      'fa-solid fa-circle-check',
      listing.status === 'Confirmed'
        ? 'Delivery confirmed — donation complete, points awarded!'
        : 'Delivery confirmed — thank you!',
    );
  }

  /** Hand a claim back (Claimed → Pending) so another volunteer can take it. */
  protected async release(row: DeliveryRow): Promise<void> {
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
    this.store.release(row.id).subscribe({
      next: () => {
        this.releasingId.set(null);
        this.toast.show('fa-solid fa-rotate-left', 'Claim released — back in the open feed');
      },
      error: (err: Error) => {
        this.releasingId.set(null);
        this.toast.show(
          'fa-solid fa-triangle-exclamation',
          err.message || 'Could not release this claim',
        );
      },
    });
  }

  /** Drop a finished delivery from this list — it stays on the History page. */
  protected clear(row: DeliveryRow): void {
    this.store.drop(row.id);
  }

  /** Raise a dispute on this delivery (`POST /disputes`; open to any party on it). */
  protected reportIssue(row: DeliveryRow): void {
    openRaiseDisputeDialog(this.dialog, this.injector, {
      listingId: row.id,
      listingTitle: row.source.title,
    });
  }

  /** Show the full detail: food photo, attributes, and the step-by-step timeline. */
  protected openDetail(row: DeliveryRow): void {
    const l = row.source;
    this.dialog.open<ApiListing, void, DeliveryDetailDialog>({
      header: {
        title: l.title,
        subtitle: `${l.foodType} · Pickup by ${appDateTime(l.pickupDeadlineUtc)}`,
        icon: 'fa-solid fa-utensils',
      },
      content: DeliveryDetailDialog,
      data: l,
      size: 'lg',
      actions: [{ id: 'close', label: 'Close', variant: 'ghost', close: true }],
    });
  }

  // ---- Route preview ----

  /**
   * Open the route preview for a row. While claimed it draws you → pickup (plus the
   * onward pickup → drop-off leg once that fallback point is known); once picked up it
   * draws you → drop-off directly.
   *
   * A matched recipient only ever comes back as a name + mobile — `ListingResponse` has
   * no recipient latitude/longitude — so their details are listed beside the map but
   * cannot be drawn as a leg. The button is disabled when there is nothing to draw.
   */
  protected openRoute(row: DeliveryRow): void {
    if (!row.next) {
      return;
    }
    const known = this.origin();
    if (known) {
      this.showRoute(row, known);
      return;
    }
    // First directions of the session — find the starting point, then draw.
    this.routeBusyId.set(row.id);
    this.resolveOrigin().subscribe(({ at, source }) => {
      this.routeBusyId.set(null);
      this.origin.set(at);
      this.originSource.set(source);
      this.showRoute(row, at);
    });
  }

  private showRoute(row: DeliveryRow, from: FbLatLng): void {
    const next = row.next;
    if (!next) {
      return;
    }

    const stops: RouteStop[] = [
      { role: 'You', address: this.locationLabel(), at: from, color: COLOR_ME },
      { role: next.role, address: next.address, at: next.at, color: next.color },
    ];

    // Still heading to the donor, but the fallback drop-off is already known — show both legs.
    const drop = row.source.suggestedDropOffLocation;
    if (row.stage === 'pickup' && drop) {
      stops.push({
        role: `Drop-off · ${drop.name}`,
        address: drop.address,
        at: { lat: drop.latitude, lng: drop.longitude },
        color: COLOR_DROP,
      });
    }

    openRouteDialog(this.dialog, {
      heading: row.stage === 'transit' ? 'Route to drop-off' : 'Route to pickup',
      subheading: row.source.title,
      stops,
      contacts: this.contactsFor(row.source),
      note: this.routeNote(row, stops.length > 2),
      // `ListingResponse` carries no distance, so a straight line from the
      // resolved origin is the only fallback available here.
      originIsUserLocation: this.originSource() !== 'default',
    });
  }

  /** Donor and recipient, whichever the API returned for this listing's own parties. */
  private contactsFor(l: ApiListing): RouteContact[] {
    const contacts: RouteContact[] = [];
    if (l.donorName) {
      contacts.push({
        label: 'Donor',
        icon: 'fa-solid fa-store',
        name: l.donorName,
        mobile: l.donorMobile,
      });
    }
    if (l.recipientName) {
      contacts.push({
        label: 'Recipient',
        icon: 'fa-solid fa-hand-holding-heart',
        name: l.recipientName,
        mobile: l.recipientMobile,
      });
    }
    return contacts;
  }

  /** Explain, when relevant, why the onward leg isn't on the map. */
  private routeNote(row: DeliveryRow, hasOnwardLeg: boolean): string {
    if (hasOnwardLeg || row.stage === 'transit') {
      return '';
    }
    if (row.source.recipientName) {
      return "The delivery leg is not drawn — the API returns the recipient's name and number but not their coordinates.";
    }
    return 'The delivery leg appears once this listing is matched to a drop-off point, which happens when you confirm pickup.';
  }

  // ---- Row mapping ----

  private toRow(l: ApiListing): DeliveryRow {
    const stage = this.stageOf(l);
    return {
      id: l.id,
      source: l,
      stage,
      next: this.nextStop(l, stage),
      card: {
        title: l.title,
        foodType: l.foodType,
        dietType: l.dietType,
        mealType: l.mealType,
        quantityMeals: l.quantityMeals,
        freshnessTag: l.freshnessTag,
        pickupDeadlineUtc: l.pickupDeadlineUtc,
        status: l.status,
        createdAtUtc: l.createdAtUtc,
        imageUrl: l.images?.[0]?.imageUrl ?? null,
      },
    };
  }

  private stageOf(l: ApiListing): LiveStage {
    switch (l.status) {
      case 'Claimed':
        return 'pickup';
      case 'PickedUp':
        return 'transit';
      default:
        return 'done';
    }
  }

  private nextStop(l: ApiListing, stage: LiveStage): NextStop | null {
    if (stage === 'pickup') {
      return {
        role: 'Pickup',
        short: 'pickup',
        address: l.pickupAddress,
        at: { lat: l.latitude, lng: l.longitude },
        color: COLOR_PICKUP,
      };
    }
    const drop = stage === 'transit' ? l.suggestedDropOffLocation : null;
    return drop
      ? {
        role: `Drop-off · ${drop.name}`,
        short: 'drop-off',
        address: drop.address,
        at: { lat: drop.latitude, lng: drop.longitude },
        color: COLOR_DROP,
      }
      : null;
  }
}
