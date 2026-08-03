import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  Injector,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiAvailableNearbyListing, ApiListingSummary } from '@core/models/listing-api.model';
import { AuthService } from '@core/services/auth.service';
import { AvailabilityService } from '@core/services/availability.service';
import { DialogService } from '@core/services/dialog.service';
import { GeolocationService } from '@core/services/geolocation.service';
import { RecipientService } from '@core/services/recipient.service';
import { RecipientStore } from '@core/services/recipient-store.service';
import { ToastService } from '@core/services/toast.service';
import { UserService } from '@core/services/user.service';
import { FbButton } from '@shared/ui/button/button';
import { openRaiseDisputeDialog } from '@shared/ui/dispute-dialog/dispute-dialog';
import { ListingCard } from '@shared/ui/listing-card/listing-card';
import { ListingGrid } from '@shared/ui/listing-grid/listing-grid';
import { FbLatLng } from '@shared/ui/map/fb-map.model';
import { PageWrapper } from '@shared/ui/page-wrapper/page-wrapper';
import { FbSelectOption } from '@shared/ui/input/input';
import { FbSelect } from '@shared/ui/select/select';

@Component({
  selector: 'app-incoming',
  imports: [FormsModule, FbButton, FbSelect, ListingCard, ListingGrid, PageWrapper],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-wrapper
      [title]="'Incoming Food'"
      description="Accept to confirm you'll receive it, or reject to free it up for another NGO."
    >
      @if (blocker(); as b) {
        <div class="blocker">
          <i [class]="b.icon" aria-hidden="true"></i>
          <div class="min-w-0">
            <div class="font-semibold text-sm">{{ b.title }}</div>
            <div class="text-muted text-xs mt-0.5">{{ b.text }}</div>
          </div>
        </div>
      }

      <app-listing-grid
        [loading]="loading()"
        [empty]="!incoming().length"
        emptyIcon="fa-solid fa-box-open"
        emptyTitle="Nothing incoming right now"
        [emptyText]="emptyText()"
      >
        @for (l of incoming(); track l.id) {
          <app-listing-card [listing]="l" icon="fa-solid fa-truck" iconBg="var(--fb-orange)" [hasFooter]="true">
            <div cardFooter>
              <div class="flex gap-2.5">
                <button class="btn-fb-outline flex-1 !py-2 !text-sm !text-red-600" [disabled]="busyId() === l.id" (click)="reject(l)">
                  <i class="fa-solid fa-xmark mr-1"></i>Reject
                </button>
                <button class="btn-fb flex-1 !py-2 !text-sm" [disabled]="busyId() === l.id" (click)="accept(l)">
                  <i class="fa-solid fa-check mr-1"></i>Accept
                </button>
              </div>
              <!-- Rejecting reassigns the food; a dispute is for when something was
                   actually wrong with it. Kept quiet so it doesn't invite misuse. -->
              <button type="button" class="report-link" (click)="reportIssue(l.id, l.title)">
                <i class="fa-solid fa-triangle-exclamation mr-1.5"></i>Report an issue
              </button>
            </div>
          </app-listing-card>
        }
      </app-listing-grid>

      <!-- Available near you: the pull side of matching. Without this an NGO can
           only wait to be assigned, which looks identical to "nothing is happening". -->
      <div class="near-head mt-8">
        <div class="min-w-0">
          <h6 class="section-title !mb-1">Available near you</h6>
          <p class="text-muted text-xs !mb-0">
            @if (locating()) {
              <i class="fa-solid fa-spinner fa-spin mr-1"></i>Finding your location…
            } @else {
              <i class="fa-solid fa-location-dot mr-1"></i>{{ locationLabel() }} · request one and
              the volunteer will bring it here.
            }
          </p>
        </div>
        <div class="flex items-end gap-2.5 shrink-0">
          <app-select
            class="w-[135px]"
            label="Within"
            [options]="radiusOptions"
            [searchable]="false"
            [ngModel]="radiusKm()"
            [ngModelOptions]="{ standalone: true }"
            (ngModelChange)="onRadiusChange($event)"
          />
          <app-button
            variant="outline"
            icon="fa-solid fa-location-crosshairs"
            [loading]="locating() || nearbyLoading()"
            (clicked)="locateAndLoadNearby()"
          >
            Refresh
          </app-button>
        </div>
      </div>

      <app-listing-grid
        [loading]="nearbyLoading()"
        [empty]="!nearby().length"
        emptyIcon="fa-solid fa-map-location-dot"
        emptyTitle="No donations available within {{ radiusKm() }} km"
        emptyText="Try a wider radius, or check back later — new donations are posted throughout the day."
      >
        @for (l of nearby(); track l.id) {
          <app-listing-card
            [listing]="l"
            icon="fa-solid fa-map-location-dot"
            [iconBg]="l.isRequestedByMe ? 'var(--fb-success)' : 'var(--fb-primary)'"
            [hasMeta]="true"
            [hasFooter]="true"
          >
            <div cardMeta class="text-muted text-xs flex items-center gap-3 flex-wrap">
              <span><i class="fa-solid fa-route mr-1"></i>{{ l.distanceKm }} km away</span>
              <span>
                <i class="fa-solid fa-truck mr-1"></i>
                {{ l.status === 'Claimed' ? 'Volunteer on the way' : 'Awaiting a volunteer' }}
              </span>
            </div>
            <div cardFooter>
              @if (l.isRequestedByMe) {
                <button
                  class="btn-fb-outline w-full !py-2 !text-sm"
                  [disabled]="requestingId() === l.id"
                  (click)="withdraw(l)"
                >
                  <i class="fa-solid fa-circle-check mr-1 text-success"></i>
                  {{ requestingId() === l.id ? 'Withdrawing…' : 'Requested — tap to withdraw' }}
                </button>
              } @else {
                <button
                  class="btn-fb w-full !py-2 !text-sm"
                  [disabled]="requestingId() === l.id"
                  (click)="request(l)"
                >
                  <i class="fa-solid fa-hand mr-1"></i>
                  {{ requestingId() === l.id ? 'Requesting…' : 'Request this donation' }}
                </button>
              }
            </div>
          </app-listing-card>
        }
      </app-listing-grid>

      @if (store.accepted().length) {
        <h6 class="section-title mt-8">Awaiting Your Confirmation</h6>
        <p class="text-muted text-xs mb-3">Confirm receipt once the volunteer has delivered the food.</p>
        <app-listing-grid [loading]="false" [empty]="false">
          @for (l of store.accepted(); track l.id) {
            <app-listing-card
              [listing]="l"
              icon="fa-solid fa-box-open"
              iconBg="linear-gradient(135deg, var(--fb-success), var(--fb-success-deep))"
              [hasFooter]="true"
            >
              <div cardFooter>
                <button class="btn-fb w-full !py-2 !text-sm" [disabled]="busyId() === l.id" (click)="confirmReceipt(l.id)">
                  <i class="fa-solid fa-check-double mr-1"></i>{{ busyId() === l.id ? 'Confirming…' : 'Confirm Receipt' }}
                </button>
                <button type="button" class="report-link" (click)="reportIssue(l.id, l.title)">
                  <i class="fa-solid fa-triangle-exclamation mr-1.5"></i>Report an issue
                </button>
              </div>
            </app-listing-card>
          }
        </app-listing-grid>
      }
    </app-page-wrapper>
  `,
  styles: `
    /* Deliberately quiet: always available, never competing with accept/reject. */
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
    .blocker {
      display: flex;
      align-items: flex-start;
      gap: 12px;
      padding: 13px 15px;
      margin-bottom: 18px;
      border-radius: 14px;
      background: var(--fb-orange-soft);
      border: 1px solid var(--fb-orange);
    }
    .blocker > i {
      margin-top: 2px;
      color: var(--fb-orange);
    }
    .near-head {
      display: flex;
      align-items: flex-end;
      justify-content: space-between;
      gap: 14px;
      flex-wrap: wrap;
      margin-bottom: 14px;
    }
  `,
})
export class Incoming {
  private readonly recipientService = inject(RecipientService);
  protected readonly store = inject(RecipientStore);
  private readonly availability = inject(AvailabilityService);
  private readonly geo = inject(GeolocationService);
  private readonly auth = inject(AuthService);
  private readonly users = inject(UserService);
  private readonly toast = inject(ToastService);
  private readonly dialog = inject(DialogService);
  private readonly injector = inject(Injector);

  protected readonly incoming = signal<ApiListingSummary[]>([]);
  protected readonly loading = signal(true);
  protected readonly busyId = signal<string | null>(null);

  // ---- "Available near you" browse feed ----
  protected readonly nearby = signal<ApiAvailableNearbyListing[]>([]);
  protected readonly nearbyLoading = signal(true);
  protected readonly locating = signal(true);
  protected readonly requestingId = signal<string | null>(null);
  protected readonly radiusKm = signal(10);
  private readonly center = signal<FbLatLng | null>(null);
  private readonly locationSource = signal<'gps' | 'profile' | 'none'>('none');

  protected readonly radiusOptions: FbSelectOption[] = [
    { value: 2, label: '2 km' },
    { value: 5, label: '5 km' },
    { value: 10, label: '10 km' },
    { value: 25, label: '25 km' },
    { value: 50, label: '50 km' },
  ];

  protected readonly locationLabel = computed(() => {
    switch (this.locationSource()) {
      case 'gps':
        return 'Searching around your current location';
      case 'profile':
        return 'Searching around your saved address';
      default:
        return 'Turn on location to see donations near you';
    }
  });

  /**
   * Why this feed would stay empty no matter how long you wait. The backend
   * matcher only considers recipients that are `Verified` AND `IsAvailable`
   * with a saved location, so without these an empty list is not "no food
   * today" — it's "you were never in the running".
   */
  protected readonly blocker = computed(() => {
    if (this.availability.accountStatus() === 'Pending') {
      return {
        icon: 'fa-solid fa-hourglass-half',
        title: 'Your account is awaiting verification',
        text: "An admin has to verify your organization before donations can be matched to you. You won't receive anything until then.",
      };
    }
    if (this.availability.accountStatus() === 'Suspended') {
      return {
        icon: 'fa-solid fa-ban',
        title: 'Your account is suspended',
        text: 'Suspended organizations are excluded from matching. Contact an admin to restore access.',
      };
    }
    if (!this.availability.isActive()) {
      return {
        icon: 'fa-solid fa-moon',
        title: "You're offline",
        text: 'Switch on "Accepting" in the top bar so we can match nearby deliveries to you. Going online also saves your current location, which is what the match is based on.',
      };
    }
    return null;
  });

  /**
   * Explains the flow rather than just saying "nothing" — donations land here
   * only once a volunteer has physically collected one and the matcher picked
   * this organization.
   */
  protected readonly emptyText = computed(() =>
    this.blocker()
      ? 'Resolve the note above and nearby deliveries will start arriving here.'
      : "You're online and verified. A donation appears here as soon as a volunteer collects one nearby and it's matched to you.",
  );

  constructor() {
    this.load();
    this.locateAndLoadNearby();
  }

  protected accept(l: ApiListingSummary): void {
    this.busyId.set(l.id);
    this.recipientService.accept(l.id).subscribe({
      next: (listing) => {
        this.busyId.set(null);
        this.store.track(listing);
        this.incoming.update((rows) => rows.filter((r) => r.id !== l.id));
        this.toast.show('fa-solid fa-circle-check', "Accepted — you're expecting this delivery");
      },
      error: (err: Error) => {
        this.busyId.set(null);
        this.toast.show('fa-solid fa-triangle-exclamation', err.message || 'Could not accept');
      },
    });
  }

  protected reject(l: ApiListingSummary): void {
    this.busyId.set(l.id);
    this.recipientService.reject(l.id).subscribe({
      next: (listing) => {
        this.busyId.set(null);
        this.incoming.update((rows) => rows.filter((r) => r.id !== l.id));
        const note = listing.timeline?.[listing.timeline.length - 1]?.note ?? 'Reassigned to another recipient.';
        this.toast.show('fa-solid fa-rotate', note);
      },
      error: (err: Error) => {
        this.busyId.set(null);
        this.toast.show('fa-solid fa-triangle-exclamation', err.message || 'Could not reject');
      },
    });
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
        this.toast.show('fa-solid fa-triangle-exclamation', err.message || 'Could not confirm receipt');
      },
    });
  }

  /**
   * Raise a dispute on this listing (`POST /disputes`). Distinct from Reject: that
   * frees the food for another NGO, this flags that something was wrong with it.
   */
  protected reportIssue(listingId: string, listingTitle: string): void {
    openRaiseDisputeDialog(this.dialog, this.injector, { listingId, listingTitle });
  }

  private load(): void {
    this.loading.set(true);
    this.recipientService.incoming().subscribe({
      next: (rows) => {
        this.incoming.set(rows);
        this.loading.set(false);
      },
      error: (err: Error) => {
        this.loading.set(false);
        this.toast.show('fa-solid fa-triangle-exclamation', err.message || 'Could not load incoming donations');
      },
    });
  }

  // ---- Available near you -------------------------------------------------

  /** Reserve a nearby donation so the volunteer delivers it here. */
  protected request(l: ApiAvailableNearbyListing): void {
    this.requestingId.set(l.id);
    this.recipientService.request(l.id).subscribe({
      next: () => {
        this.requestingId.set(null);
        this.markRequested(l.id, true);
        this.toast.show('fa-solid fa-circle-check', `Requested — '${l.title}' is reserved for you`);
      },
      error: (err: Error) => {
        this.requestingId.set(null);
        this.toast.show('fa-solid fa-triangle-exclamation', err.message || 'Could not request this donation');
        // A 409 means someone else took it — the row is stale either way.
        this.loadNearby();
      },
    });
  }

  protected withdraw(l: ApiAvailableNearbyListing): void {
    this.requestingId.set(l.id);
    this.recipientService.withdrawRequest(l.id).subscribe({
      next: () => {
        this.requestingId.set(null);
        this.markRequested(l.id, false);
        this.toast.show('fa-solid fa-rotate', 'Request withdrawn');
      },
      error: (err: Error) => {
        this.requestingId.set(null);
        this.toast.show('fa-solid fa-triangle-exclamation', err.message || 'Could not withdraw the request');
        this.loadNearby();
      },
    });
  }

  /**
   * Centre the feed where the NGO actually is: live GPS first, then the saved
   * profile location. Mirrors the volunteer's nearby page.
   */
  protected locateAndLoadNearby(): void {
    this.locating.set(true);
    this.nearbyLoading.set(true);
    this.geo.current().subscribe({
      next: (loc) => {
        this.center.set(loc);
        this.locationSource.set('gps');
        this.locating.set(false);
        this.loadNearby();
      },
      error: () => this.fallbackLocate(),
    });
  }

  /** GPS denied or unavailable → fall back to the location saved on the profile. */
  private fallbackLocate(): void {
    const id = this.auth.currentUser()?.id;
    if (!id) {
      this.finishLocating(null);
      return;
    }
    this.users.getProfile(id).subscribe({
      next: (p) =>
        this.finishLocating(
          p.latitude != null && p.longitude != null ? { lat: p.latitude, lng: p.longitude } : null,
        ),
      error: () => this.finishLocating(null),
    });
  }

  private finishLocating(loc: FbLatLng | null): void {
    this.locating.set(false);
    if (loc) {
      this.center.set(loc);
      this.locationSource.set('profile');
      this.loadNearby();
      return;
    }
    // Nothing to search around — say so rather than showing a misleading empty list.
    this.locationSource.set('none');
    this.nearbyLoading.set(false);
    this.nearby.set([]);
  }

  /** Explicit set-then-reload, so the fetch can't race the radius write. */
  protected onRadiusChange(km: number): void {
    this.radiusKm.set(Number(km));
    this.loadNearby();
  }

  protected loadNearby(): void {
    const at = this.center();
    if (!at) {
      return;
    }
    this.nearbyLoading.set(true);
    this.recipientService.availableNearby(at.lat, at.lng, this.radiusKm()).subscribe({
      next: (rows) => {
        this.nearby.set(rows);
        this.nearbyLoading.set(false);
      },
      error: (err: Error) => {
        this.nearbyLoading.set(false);
        this.toast.show('fa-solid fa-triangle-exclamation', err.message || 'Could not load nearby donations');
      },
    });
  }

  private markRequested(id: string, isRequestedByMe: boolean): void {
    this.nearby.update((rows) => rows.map((r) => (r.id === id ? { ...r, isRequestedByMe } : r)));
  }
}
