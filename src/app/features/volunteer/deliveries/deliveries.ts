import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, Injector, signal } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, EMPTY, map, Observable, of, tap } from 'rxjs';
import { APP_ROUTES } from '@core/config/app-routes';
import { ApiListing } from '@core/models/listing-api.model';
import { AuthService } from '@core/services/auth.service';
import { DialogService } from '@core/services/dialog.service';
import { GeolocationService } from '@core/services/geolocation.service';
import { ToastService } from '@core/services/toast.service';
import { UserService } from '@core/services/user.service';
import { VolunteerDeliveriesStore } from '@core/services/volunteer-deliveries.store';
import { FbButton } from '@shared/ui/button/button';
import { openRaiseDisputeDialog } from '@shared/ui/dispute-dialog/dispute-dialog';
import { ListingCard, ListingCardData } from '@shared/ui/listing-card/listing-card';
import { ListingGrid } from '@shared/ui/listing-grid/listing-grid';
import { openPhotoDialog } from '@shared/ui/image-picker/photo-dialog';
import { openDeliveryDialog } from './delivery-dialog';
import { FbLatLng } from '@shared/ui/map/fb-map.model';
import { openRouteDialog, RouteContact, RouteStop } from '@shared/ui/route-dialog/route-dialog';
import { environment } from '@env/environment';
import { PageWrapper } from '@shared/ui/page-wrapper/page-wrapper';

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
  imports: [DatePipe, FbButton, ListingCard, ListingGrid, PageWrapper],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-wrapper
      title="My Deliveries"
      description="Everything you've claimed — confirm each step to keep the chain moving."
      [hasActions]="true"
    >
      <div pageActions>
        <app-button icon="fa-solid fa-map-location-dot" (clicked)="goToNearby()">
          Find listings
        </app-button>
      </div>

      <div class="card-fb p-4 mb-4">
        <div class="flex items-center gap-3">
          <div
            class="stat-icon !mb-0"
            style="background:linear-gradient(135deg,var(--fb-accent),var(--fb-accent-deep))"
          >
            <i class="fa-solid fa-truck-fast"></i>
          </div>
          <div class="min-w-0">
            <div class="font-bold">
              <span class="text-primary-deep text-2xl">{{ counts().pickup + counts().transit }}</span>
              active {{ counts().pickup + counts().transit === 1 ? 'delivery' : 'deliveries' }}
              @if (store.mealsInTransit()) {
                <span class="text-muted text-sm font-normal">
                  · {{ store.mealsInTransit() }} meals in your hands
                </span>
              }
            </div>
            <div class="text-muted text-xs mt-0.5">
              {{ counts().pickup }} to pick up · {{ counts().transit }} in transit ·
              {{ counts().done }} delivered
            </div>
          </div>
        </div>

        <div class="filter-bar">
          <span class="filter-label">Stage</span>
          @for (s of stages; track s.key) {
            <button type="button" [class]="chipClass(stage() === s.key)" (click)="stage.set(s.key)">
              <i [class]="s.icon" class="mr-1.5 text-[11px]"></i>{{ s.label }}
              <span class="chip-count">{{ counts()[s.key] }}</span>
            </button>
          }
        </div>
      </div>

      <app-listing-grid
        [empty]="!rows().length"
        gridClass="md:grid-cols-2 xl:grid-cols-3"
        emptyIcon="fa-solid fa-truck-fast"
        [emptyText]="emptyText()"
      >
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
                  <i class="fa-solid fa-map-pin mt-0.5"></i>
                  <div class="min-w-0">
                    <div class="font-bold">
                      @if (row.stage === 'done') {
                        Drop-off point
                      } @else {
                        Deliver the food here
                      }
                    </div>
                    <div>{{ drop.name }} · {{ drop.address }}</div>
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
                      variant="success"
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
                      icon="fa-solid fa-box-open"
                      [block]="true"
                      (clicked)="start(row, 'delivery')"
                    >
                      Confirm delivery
                    </app-button>
                  }
                  <app-button
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

              <!-- Open to any party on the listing, at any stage: the problem worth
                   reporting (missing food, nobody at the door) usually surfaces here. -->
              <button type="button" class="report-link" (click)="reportIssue(row)">
                <i class="fa-solid fa-triangle-exclamation mr-1.5"></i>Report an issue
              </button>
            </div>
          </app-listing-card>
        }
      </app-listing-grid>

    </app-page-wrapper>
  `,
  styles: `
    /* Card actions share the row evenly — neither confirming nor navigating is
       the lesser action once a claim is in hand. */
    .action-row {
      display: flex;
      gap: 8px;
    }
    .action-row > * {
      flex: 1 1 0;
      min-width: 0;
    }

    .filter-bar {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 6px;
      margin-top: 14px;
      padding-top: 14px;
      border-top: 1px solid var(--fb-line);
    }
    .filter-label {
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      color: var(--fb-muted);
      margin-right: 2px;
    }
    .chip {
      display: inline-flex;
      align-items: center;
      padding: 5px 13px;
      font-size: 12.5px;
      font-weight: 600;
      border-radius: 999px;
      border: 1.5px solid var(--fb-line);
      background: transparent;
      color: var(--fb-muted);
      cursor: pointer;
      transition:
        background 0.15s ease,
        color 0.15s ease,
        border-color 0.15s ease;
    }
    .chip:hover {
      border-color: var(--fb-primary);
      color: var(--fb-primary-deep);
    }
    .chip.active {
      background: var(--fb-primary);
      border-color: var(--fb-primary);
      color: #fff;
    }
    .chip-count {
      margin-left: 7px;
      padding: 1px 7px;
      border-radius: 999px;
      font-size: 11px;
      font-weight: 800;
      background: var(--fb-line);
      color: var(--fb-muted);
    }
    .chip.active .chip-count {
      background: rgba(255, 255, 255, 0.28);
      color: #fff;
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

    .dropoff-banner {
      display: flex;
      gap: 8px;
      margin-top: 4px;
      padding: 9px 11px;
      border-radius: 10px;
      color: #b45309;
      background: rgba(217, 119, 6, 0.12);
      border: 1px solid rgba(217, 119, 6, 0.3);
    }
    body.dark .dropoff-banner {
      color: #fbbf24;
    }

    .photo-note {
      margin: 8px 0 0;
      font-size: 11.5px;
      color: var(--fb-muted);
    }
    .photo-note + app-button {
      margin-top: 8px;
    }
    /* Deliberately quiet: always available, never competing with the stage action. */
    .report-link {
      display: block;
      width: 100%;
      margin-top: 8px;
      padding: 4px 0 0;
      border: 0;
      background: none;
      font-size: 11.5px;
      color: var(--fb-muted);
      cursor: pointer;
      transition: color 0.15s ease;
    }
    .report-link:hover {
      color: #dc2626;
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

  protected readonly stages = STAGES;
  protected readonly stage = signal<Stage>('all');

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

  /** Tracked claims as card view-models, filtered to the selected stage and sorted by urgency. */
  protected readonly rows = computed<DeliveryRow[]>(() => {
    const stage = this.stage();
    return this.store
      .all()
      .map((l) => this.toRow(l))
      .filter((r) => stage === 'all' || r.stage === stage)
      .sort(
        (a, b) =>
          STAGE_RANK[a.stage] - STAGE_RANK[b.stage] ||
          Date.parse(a.source.pickupDeadlineUtc) - Date.parse(b.source.pickupDeadlineUtc),
      );
  });

  protected readonly emptyText = computed(() =>
    this.counts().all
      ? 'Nothing at this stage — switch the filter to see your other deliveries'
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
  private resolveOrigin(): Observable<{ at: FbLatLng; source: OriginSource }> {
    return this.geo.current().pipe(
      map((at) => ({ at, source: 'gps' as OriginSource })),
      catchError(() => this.profileOrigin()),
    );
  }

  private profileOrigin(): Observable<{ at: FbLatLng; source: OriginSource }> {
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

  protected chipClass(active: boolean): string {
    return active ? 'chip active' : 'chip';
  }

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
