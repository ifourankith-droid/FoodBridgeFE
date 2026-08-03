import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TrackingHubService } from '@core/realtime/tracking-hub.service';
import { ApiListing, ApiListingSummary, toListingStatus } from '@core/models/listing-api.model';
import { ListingStatus } from '@core/models/listing.model';
import { TrackingSnapshot } from '@core/models/tracking.model';
import { ClockService } from '@core/services/clock.service';
import { RecipientService } from '@core/services/recipient.service';
import { RecipientStore } from '@core/services/recipient-store.service';
import { ToastService } from '@core/services/toast.service';
import { TrackingService } from '@core/services/tracking.service';
import { FbButton } from '@shared/ui/button/button';
import { EmptyState } from '@shared/ui/empty-state/empty-state';
import { FbMap } from '@shared/ui/map/fb-map';
import { FbLatLng, FbMapConfig } from '@shared/ui/map/fb-map.model';
import { PageWrapper } from '@shared/ui/page-wrapper/page-wrapper';
import { RescueTimeline } from '@shared/ui/rescue-timeline/rescue-timeline';
import { StatusBadge } from '@shared/ui/status-badge/status-badge';

/**
 * One trackable delivery. `pickup` is only known for listings the recipient
 * accepted in this session (the accept response is a full `ApiListing`); rows read
 * back from `GET /listings/incoming` are summaries with no coordinates.
 */
interface TrackRow {
  id: string;
  title: string;
  quantityMeals: number;
  status: ListingStatus;
  /** Donor pickup point, when the full listing is on hand. */
  pickup: FbLatLng | null;
  volunteerName: string | null;
  volunteerMobile: string | null;
  /** True once delivered — the confirm-receipt action becomes available. */
  awaitingConfirmation: boolean;
}

/**
 * Live delivery tracking for a recipient.
 *
 * Two data paths, because one alone is not enough:
 *  - `GET /listings/{id}/track` gives the **last known** position on load. It returns
 *    null until the volunteer's app has reported at least once, which is the normal
 *    state for a fresh pickup — hence the explicit "not sharing yet" copy rather than
 *    an empty map.
 *  - `TrackingHub` then streams `LocationUpdated` for the same listing, so the pin
 *    moves without polling. The subscription is per-row and torn down with the page.
 *
 * A recipient cannot call `GET /listings/{id}` (that endpoint is DonorOnly), so this
 * page never has more detail than `incoming` + the accept response gave it. That is
 * why the volunteer is shown by name only when known, and never by location history.
 */
@Component({
  selector: 'app-track',
  imports: [
    FbButton,
    EmptyState,
    FbMap,
    PageWrapper,
    RescueTimeline,
    StatusBadge,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-wrapper
      [title]="'Track Delivery'"
      description="Follow your incoming food in real time — from pickup to your doorstep."
      [hasActions]="true"
    >
      <div pageActions>
        <app-button variant="outline" icon="fa-solid fa-rotate" [loading]="loading()" (clicked)="load()">
          Refresh
        </app-button>
      </div>

      @if (loading()) {
        <div class="card-fb p-5">
          <div class="skeleton h-4 w-56 mb-3"></div>
          <div class="skeleton h-3 w-40 mb-5"></div>
          <div class="skeleton h-72 w-full"></div>
        </div>
      } @else {
        @for (row of rows(); track row.id) {
          <div class="card-fb p-5 mb-4">
            <div class="flex justify-between items-start mb-3 flex-wrap gap-2">
              <div class="min-w-0">
                <div class="font-bold">{{ row.title }}</div>
                <div class="text-muted text-xs">{{ row.quantityMeals }} meals</div>
              </div>
              <div class="flex items-center gap-2">
                @if (isLive(row.id)) {
                  <span class="badge-fb badge-delivered inline-flex items-center gap-1.5">
                    <span class="live-dot"></span>Live
                  </span>
                }
                <app-status-badge [status]="row.status" />
              </div>
            </div>

            <app-rescue-timeline [status]="row.status" />

            <div class="grid gap-4 lg:grid-cols-2 mt-3 items-start">
              <app-fb-map [config]="mapFor(row)" />

              <div>
                <div class="card-fb p-3 mb-3 border-0" style="background:var(--fb-primary-soft)">
                  <div class="small-label mb-1">Volunteer location</div>
                  @if (positionOf(row.id); as p) {
                    <div class="text-base font-bold text-primary-deep">
                      Updated {{ ago(p.reportedAtUtc) }}
                    </div>
                    <div class="text-muted text-xs mt-1">
                      {{ p.latitude.toFixed(4) }}, {{ p.longitude.toFixed(4) }}
                    </div>
                  } @else {
                    <div class="text-base font-bold text-primary-deep">Not sharing yet</div>
                    <div class="text-muted text-xs mt-1">
                      The pin appears once the volunteer's app starts reporting.
                    </div>
                  }
                </div>

                <div class="small-label mb-2">Volunteer</div>
                <div class="flex items-center gap-2 mb-3">
                  <div class="avatar-circle !w-9 !h-9 !text-[13px]">
                    {{ (row.volunteerName || 'V').charAt(0) }}
                  </div>
                  <div class="min-w-0">
                    <div class="text-sm font-semibold truncate">
                      {{ row.volunteerName || 'Assigned volunteer' }}
                    </div>
                    @if (row.volunteerMobile) {
                      <a class="text-xs text-primary-deep" [href]="'tel:' + row.volunteerMobile">
                        <i class="fa-solid fa-phone mr-1"></i>{{ row.volunteerMobile }}
                      </a>
                    }
                  </div>
                </div>

                @if (row.awaitingConfirmation) {
                  <app-button
                    icon="fa-solid fa-check-double"
                    [block]="true"
                    [loading]="busyId() === row.id"
                    (clicked)="confirmReceipt(row.id)"
                  >
                    Confirm receipt
                  </app-button>
                }
              </div>
            </div>
          </div>
        } @empty {
          <div class="card-fb">
            <app-empty-state
              icon="fa-solid fa-location-crosshairs"
              [title]="'Nothing in transit'"
              text="Once you accept an incoming donation it appears here with a live map."
            />
          </div>
        }
      }
    </app-page-wrapper>
  `,
  styles: `
    .live-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--fb-success);
      animation: live-pulse 1.6s ease-in-out infinite;
    }
    @keyframes live-pulse {
      0%,
      100% {
        opacity: 1;
      }
      50% {
        opacity: 0.35;
      }
    }
    @media (prefers-reduced-motion: reduce) {
      .live-dot {
        animation: none;
      }
    }
  `,
})
export class Track {
  private readonly recipientService = inject(RecipientService);
  private readonly store = inject(RecipientStore);
  private readonly tracking = inject(TrackingService);
  private readonly hub = inject(TrackingHubService);
  private readonly toast = inject(ToastService);
  private readonly clock = inject(ClockService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly loading = signal(true);
  protected readonly busyId = signal<string | null>(null);

  /** PickedUp rows from the server (summaries — no coordinates). */
  private readonly incoming = signal<ApiListingSummary[]>([]);
  /** Last known position per listing, from REST then kept fresh by the hub. */
  private readonly positions = signal<Record<string, TrackingSnapshot>>({});
  /** Listings a live update has actually arrived for this session. */
  private readonly liveIds = signal<ReadonlySet<string>>(new Set());
  /** Listings already wired to the hub, so re-renders don't re-subscribe. */
  private readonly watched = new Set<string>();

  /**
   * Everything worth tracking: accepted listings (full detail, may be Delivered and
   * awaiting confirmation) plus the server's PickedUp feed, de-duplicated by id with
   * the richer accepted row winning.
   */
  protected readonly rows = computed<TrackRow[]>(() => {
    const accepted = this.store.accepted();
    const acceptedIds = new Set(accepted.map((l) => l.id));
    return [
      ...accepted.map((l) => this.fromListing(l)),
      ...this.incoming()
        .filter((l) => !acceptedIds.has(l.id))
        .map((l) => this.fromSummary(l)),
    ];
  });

  constructor() {
    // Watches follow `rows()` rather than the fetch: accepting a donation elsewhere
    // updates `RecipientStore.accepted`, and that row must start tracking too.
    effect(() => this.syncWatches());
    this.load();
  }

  protected load(): void {
    this.loading.set(true);
    this.recipientService.incoming().subscribe({
      next: (rows) => {
        this.incoming.set(rows);
        this.loading.set(false);
      },
      error: (err: Error) => {
        this.loading.set(false);
        // Accepted rows are client-held, so the page still works without this.
        this.toast.error(err.message || 'Could not load your deliveries');
      },
    });
  }

  /**
   * For every trackable row: fetch the last known position once, then subscribe to
   * live updates. Idempotent — `watched` keeps a second call from double-subscribing.
   */
  private syncWatches(): void {
    for (const row of this.rows()) {
      if (this.watched.has(row.id)) {
        continue;
      }
      this.watched.add(row.id);

      this.tracking.snapshot(row.id).subscribe({
        // Null is the normal "volunteer hasn't reported yet" case, not an error.
        next: (snapshot) => snapshot && this.applyPosition(snapshot, false),
        error: () => undefined,
      });

      this.hub
        .watch(row.id)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: (snapshot) => this.applyPosition(snapshot, true),
          // Falling back to the REST snapshot is a silent degradation by design.
          error: () => undefined,
        });
    }
  }

  private applyPosition(snapshot: TrackingSnapshot, live: boolean): void {
    this.positions.update((map) => ({ ...map, [snapshot.listingId]: snapshot }));
    if (live) {
      this.liveIds.update((set) => new Set(set).add(snapshot.listingId));
    }
  }

  protected positionOf(listingId: string): TrackingSnapshot | undefined {
    return this.positions()[listingId];
  }

  protected isLive(listingId: string): boolean {
    return this.liveIds().has(listingId);
  }

  /**
   * Volunteer pin, plus the donor pickup pin when we have it. Falls back to a
   * placeholder-centred map until the first position lands.
   */
  protected mapFor(row: TrackRow): FbMapConfig {
    const position = this.positionOf(row.id);
    const volunteer = position
      ? { lat: Number(position.latitude), lng: Number(position.longitude) }
      : null;

    return {
      mode: 'markers',
      height: 320,
      zoom: volunteer ? 14 : 12,
      center: volunteer ?? row.pickup ?? undefined,
      markers: [
        ...(volunteer
          ? [
              {
                position: volunteer,
                label: 'V',
                title: row.volunteerName ?? 'Volunteer',
                color: 'var(--fb-orange)',
              },
            ]
          : []),
        ...(row.pickup
          ? [
              {
                position: row.pickup,
                label: 'P',
                title: 'Pickup point',
                color: 'var(--fb-primary)',
              },
            ]
          : []),
      ],
      showLegend: !!volunteer && !!row.pickup,
      legend: [
        { color: 'var(--fb-orange)', text: 'Volunteer' },
        { color: 'var(--fb-primary)', text: 'Pickup' },
      ],
      placeholderText: volunteer ? 'Volunteer en route' : 'Waiting for the first position',
    };
  }

  protected confirmReceipt(id: string): void {
    this.busyId.set(id);
    this.store.confirmReceipt(id).subscribe({
      next: (res) => {
        this.busyId.set(null);
        this.toast.show(
          'fa-solid fa-award',
          `Receipt confirmed — certificate ${res.certificateNumber} issued, ${res.pointsAwarded} pts awarded`,
        );
      },
      error: (err: Error) => {
        this.busyId.set(null);
        this.toast.error(err.message || 'Could not confirm receipt');
      },
    });
  }

  /** Ticked by the app-wide clock (epoch ms) so "Updated 2 min ago" stays honest. */
  protected ago(iso: string): string {
    const seconds = Math.max(0, Math.round((this.clock.now() - new Date(iso).getTime()) / 1000));
    if (seconds < 45) {
      return 'just now';
    }
    const minutes = Math.round(seconds / 60);
    if (minutes < 60) {
      return `${minutes} min ago`;
    }
    const hours = Math.round(minutes / 60);
    return hours === 1 ? 'an hour ago' : `${hours} hours ago`;
  }

  private fromListing(l: ApiListing): TrackRow {
    const status = toListingStatus(l.status);
    return {
      id: l.id,
      title: l.title,
      quantityMeals: l.quantityMeals,
      status,
      pickup: { lat: l.latitude, lng: l.longitude },
      volunteerName: l.volunteerName ?? null,
      volunteerMobile: l.volunteerMobile ?? null,
      awaitingConfirmation: status === 'delivered',
    };
  }

  private fromSummary(l: ApiListingSummary): TrackRow {
    const status = toListingStatus(l.status);
    return {
      id: l.id,
      title: l.title,
      quantityMeals: l.quantityMeals,
      status,
      pickup: null,
      volunteerName: null,
      volunteerMobile: null,
      awaitingConfirmation: status === 'delivered',
    };
  }
}
