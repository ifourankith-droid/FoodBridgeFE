import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { AdminAccount } from '@core/models/admin.model';
import { AdminService } from '@core/services/admin.service';
import { DialogService } from '@core/services/dialog.service';
import { ToastService } from '@core/services/toast.service';
import { UserService } from '@core/services/user.service';
import { FbButton } from '@shared/ui/button/button';
import { EmptyState } from '@shared/ui/empty-state/empty-state';
import { ListingLayout } from '@shared/ui/listing-layout/listing-layout';
import { SummaryHeader } from '@shared/ui/summary-header/summary-header';
import { mediaUrl } from '@shared/util/media-url';
import { APP_LOCALE, APP_TIME_ZONE } from '@shared/util/timezone';

/** Backend `AccountStatus` enum names, plus the "no filter" case. */
type StatusFilter = 'all' | 'Pending' | 'Verified' | 'Suspended';

/** Backend `Role` enum names, plus the "no filter" case. */
type RoleFilter = 'all' | 'Volunteer' | 'Recipient' | 'Donor';

const STATUS_FILTERS: readonly { id: StatusFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'Pending', label: 'Pending' },
  { id: 'Verified', label: 'Verified' },
  { id: 'Suspended', label: 'Suspended' },
];

const ROLE_FILTERS: readonly { id: RoleFilter; label: string }[] = [
  { id: 'all', label: 'Everyone' },
  { id: 'Volunteer', label: 'Volunteers' },
  { id: 'Recipient', label: 'Organizations' },
  { id: 'Donor', label: 'Donors' },
];

/**
 * Account moderation. Both filters are sent to `GET /admin/accounts` as query
 * params rather than applied client-side, so paging stays correct as the platform
 * grows (the envelope interceptor drops `TotalCount`, so a client-side filter over
 * one page would silently under-report).
 *
 * Verifying matters beyond the badge: the backend's `RecipientMatcher` only ever
 * routes food to a recipient whose `AccountStatus` is `Verified`, so a pending NGO
 * receives nothing until it's approved here.
 */
@Component({
  selector: 'app-verifications',
  imports: [FbButton, EmptyState, ListingLayout, SummaryHeader],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-listing-layout
      title="Verifications"
      description="Approve or suspend volunteers and organizations. A recipient receives no food until verified."
      [hasActions]="true"
      [hasAside]="true"
      gridClass=""
    >
      <div pageActions>
        <app-button variant="outline" icon="fa-solid fa-rotate" [loading]="loading()" (clicked)="load()">
          Refresh
        </app-button>
      </div>

      <!-- Summary: how many accounts are in view + how many need the admin now. -->
      <app-summary-header
        summary
        icon="fa-solid fa-user-shield"
        [loading]="loading()"
        loadingText="Loading accounts…"
      >
        <span heading>
          <span class="text-primary-deep text-2xl">{{ totalAccounts() }}</span>
          {{ totalAccounts() === 1 ? 'account' : 'accounts' }} in view
        </span>
        <span subtitle class="text-muted">
          {{ readyCount() }} ready to review · {{ pendingCount() }} pending
        </span>
      </app-summary-header>

      <div filters>
        <div class="flex flex-wrap items-center gap-2 w-full">
          <span class="small-label !mb-0 mr-1">Status</span>
          @for (f of STATUS_FILTERS; track f.id) {
            <button
              [class]="(status() === f.id ? 'btn-fb' : 'btn-fb-outline') + ' !py-1.5 !px-3 !text-sm'"
              (click)="setStatus(f.id)"
            >
              {{ f.label }}
            </button>
          }
        </div>
        <div class="flex flex-wrap items-center gap-2 w-full">
          <span class="small-label !mb-0 mr-1">Role</span>
          @for (f of ROLE_FILTERS; track f.id) {
            <button
              [class]="(role() === f.id ? 'btn-fb' : 'btn-fb-outline') + ' !py-1.5 !px-3 !text-sm'"
              (click)="setRole(f.id)"
            >
              {{ f.label }}
            </button>
          }
        </div>
      </div>

      @if (loading()) {
        <div class="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          @for (s of skeletons; track $index) {
            <div class="card-fb p-4">
              <div class="flex items-center gap-2 mb-3">
                <div class="skeleton !rounded-full w-9 h-9"></div>
                <div class="flex-1">
                  <div class="skeleton h-3.5 w-28 mb-1.5"></div>
                  <div class="skeleton h-3 w-20"></div>
                </div>
              </div>
              <div class="skeleton h-3 w-32 mb-3"></div>
              <div class="skeleton h-8 w-full"></div>
            </div>
          }
        </div>
      } @else if (sorted().length) {
        <div class="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          @for (a of sorted(); track a.id) {
            <div class="card-fb p-4">
              <div class="flex items-center gap-2 mb-2">
                <div class="avatar-circle" [style.background]="tint(a.role)">
                  {{ initial(a.name) }}
                </div>
                <div class="flex-1 min-w-0">
                  <div class="font-semibold text-sm truncate">{{ a.name }}</div>
                  <div class="text-muted text-xs truncate">
                    <i class="fa-solid mr-1" [class]="roleIcon(a.role)"></i>{{ a.role }}
                    @if (a.city) {
                      · {{ a.city }}
                    }
                  </div>
                </div>
                <span class="badge-fb" [class]="badgeClass(a.accountStatus)">
                  {{ a.accountStatus }}
                </span>
              </div>
              <div class="text-muted text-xs mb-3">
                <i class="fa-solid fa-mobile-screen mr-1"></i>{{ a.mobile }} ·
                <i class="fa-solid fa-clock mr-1"></i>Joined {{ joined(a.createdAtUtc) }}
              </div>

              <!-- Evidence, for the roles that need it. Approving without opening these is
                   exactly what this feature exists to prevent, so the links are inline on the
                   card rather than behind another click. -->
              @if (a.requiredDocumentTypes.length > 0) {
                <div class="docs" [class.ready]="a.isReadyForReview">
                  @if (a.isReadyForReview) {
                    <div class="docs-head text-success-deep">
                      <i class="fa-solid fa-folder-open mr-1"></i>Documents ready to review
                    </div>
                  } @else if (a.accountStatus === 'Pending') {
                    <div class="docs-head text-muted">
                      <i class="fa-solid fa-hourglass-half mr-1"></i>
                      Waiting on them — {{ missingCount(a) }} of
                      {{ a.requiredDocumentTypes.length }} still to upload
                    </div>
                  }
                  <div class="flex flex-wrap gap-2 mt-1">
                    @for (type of a.requiredDocumentTypes; track type) {
                      @if (hasDoc(a, type)) {
                        <button type="button" class="doc-link" (click)="openDocument(a, type)">
                          <i class="fa-solid fa-up-right-from-square mr-1"></i>{{ docLabel(type) }}
                        </button>
                      } @else {
                        <span class="doc-missing">
                          <i class="fa-solid fa-xmark mr-1"></i>{{ docLabel(type) }}
                        </span>
                      }
                    }
                  </div>
                </div>
              }
              <div class="flex gap-2">
                @switch (a.accountStatus) {
                  @case ('Verified') {
                    <span class="flex-1">
                      <app-button
                        size="sm"
                        variant="danger"
                        icon="fa-solid fa-ban"
                        [block]="true"
                        [loading]="busyId() === a.id"
                        (clicked)="suspend(a)"
                      >
                        Suspend
                      </app-button>
                    </span>
                  }
                  @case ('Pending') {
                    <span class="flex-1">
                      <app-button
                        size="sm"
                        icon="fa-solid fa-check"
                        [block]="true"
                        [loading]="busyId() === a.id"
                        (clicked)="verify(a)"
                      >
                        Verify
                      </app-button>
                    </span>
                    <span class="flex-1">
                      <app-button
                        size="sm"
                        variant="outline"
                        [block]="true"
                        [disabled]="busyId() === a.id"
                        (clicked)="suspend(a)"
                      >
                        Reject
                      </app-button>
                    </span>
                  }
                  @default {
                    <span class="flex-1">
                      <app-button
                        size="sm"
                        icon="fa-solid fa-rotate-left"
                        [block]="true"
                        [loading]="busyId() === a.id"
                        (clicked)="verify(a)"
                      >
                        Reinstate
                      </app-button>
                    </span>
                  }
                }
              </div>
            </div>
          }
        </div>
      } @else {
        <div class="card-fb">
          <app-empty-state
            icon="fa-solid fa-user-shield"
            title="No accounts match these filters"
            text="Try widening the status or role filter above."
            actionLabel="Clear filters"
            actionIcon="fa-solid fa-filter-circle-xmark"
            (action)="clearFilters()"
          />
        </div>
      }

      <!-- Sticky stats aside — same shape as the donor/volunteer listing pages. -->
      <ng-container aside>
        <!-- Status donut: accounts in view split by status, ready-to-review alongside. -->
        <div class="card-fb p-5">
          <div class="font-bold text-sm mb-4">Account status</div>
          <div class="flex items-center gap-4">
            <div class="fb-ring" [style.background]="donutBackground()">
              <div class="fb-ring-inner">
                <span class="fb-ring-num">{{ totalAccounts() }}</span>
                <span class="fb-ring-cap">in view</span>
              </div>
            </div>
            <div class="min-w-0">
              <div class="text-muted text-xs">Ready to review</div>
              <div class="font-bold text-xl text-primary-deep">{{ readyCount() }}</div>
              @if (pendingCount()) {
                <div class="text-primary-deep text-xs font-semibold mt-1">
                  {{ pendingCount() }} pending
                </div>
              }
            </div>
          </div>
        </div>

        <!-- By account status — each row jumps the status filter. -->
        <div class="card-fb p-5">
          <div class="flex items-center justify-between mb-3">
            <div class="font-bold text-sm">By status</div>
            @if (status() !== 'all') {
              <button type="button" class="fb-link text-xs" (click)="setStatus('all')">Clear</button>
            }
          </div>
          @if (totalAccounts()) {
            <div class="flex flex-col gap-1">
              @for (s of statusCounts(); track s.id) {
                <button
                  type="button"
                  class="fb-cat-row"
                  [class.is-active]="status() === s.id"
                  [attr.aria-pressed]="status() === s.id"
                  (click)="setStatus(s.id)"
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
            <p class="text-muted text-xs m-0">No accounts match these filters.</p>
          }
        </div>

        <!-- By role — each row jumps the role filter. -->
        <div class="card-fb p-5">
          <div class="flex items-center justify-between mb-3">
            <div class="font-bold text-sm">By role</div>
            @if (role() !== 'all') {
              <button type="button" class="fb-link text-xs" (click)="setRole('all')">Clear</button>
            }
          </div>
          @if (totalAccounts()) {
            <div class="flex flex-col gap-1">
              @for (r of roleCounts(); track r.id) {
                <button
                  type="button"
                  class="fb-cat-row"
                  [class.is-active]="role() === r.id"
                  [attr.aria-pressed]="role() === r.id"
                  (click)="setRole(r.id)"
                >
                  <span class="fb-cat-icon" [style.color]="r.color">
                    <i [class]="r.icon" aria-hidden="true"></i>
                  </span>
                  <span class="fb-cat-label">{{ r.label }}</span>
                  <span class="fb-cat-count">{{ r.count }}</span>
                  <span class="fb-cat-bar" aria-hidden="true">
                    <span class="fb-cat-fill" [style.width.%]="r.pct" [style.background]="r.color"></span>
                  </span>
                </button>
              }
            </div>
          } @else {
            <p class="text-muted text-xs m-0">No accounts match these filters.</p>
          }
        </div>
      </ng-container>
    </app-listing-layout>
  `,
  styles: [
    `
      .docs {
        padding: 8px 10px;
        margin-bottom: 12px;
        border: 1px dashed var(--fb-line);
        border-radius: 12px;
      }
      .docs.ready {
        border-style: solid;
        border-color: var(--fb-success);
        background: var(--fb-success-soft);
      }
      .docs-head {
        font-size: 0.72rem;
        font-weight: 700;
      }
      .doc-link,
      .doc-missing {
        font-size: 0.72rem;
        font-weight: 700;
        padding: 2px 9px;
        border-radius: 999px;
      }
      .doc-link {
        background: var(--fb-surface);
        border: 1px solid var(--fb-line);
        color: var(--fb-primary-deep);
      }
      .doc-link:hover {
        border-color: var(--fb-primary);
      }
      .doc-missing {
        background: var(--fb-line);
        color: var(--fb-muted);
      }
    `,
  ],
})
export class Verifications {
  private readonly admin = inject(AdminService);
  private readonly users = inject(UserService);
  private readonly dialog = inject(DialogService);
  private readonly toast = inject(ToastService);

  protected readonly STATUS_FILTERS = STATUS_FILTERS;
  protected readonly ROLE_FILTERS = ROLE_FILTERS;
  protected readonly skeletons = Array.from({ length: 6 });

  protected readonly accounts = signal<AdminAccount[]>([]);
  protected readonly loading = signal(true);
  protected readonly status = signal<StatusFilter>('all');
  protected readonly role = signal<RoleFilter>('all');
  /** Id of the account whose verify/suspend call is in flight. */
  protected readonly busyId = signal<string | null>(null);

  /** Pending first — the queue this page exists to clear. */
  private readonly order: Record<string, number> = { Pending: 0, Verified: 1, Suspended: 2 };
  protected readonly sorted = computed(() =>
    [...this.accounts()].sort(
      (a, b) =>
        (this.order[a.accountStatus] ?? 9) - (this.order[b.accountStatus] ?? 9) ||
        // Within Pending, the accounts the admin can actually act on come before those still
        // waiting on the user — otherwise the top of the queue is full of un-actionable rows.
        Number(b.isReadyForReview) - Number(a.isReadyForReview) ||
        a.name.localeCompare(b.name),
    ),
  );

  // ---- Aside stats (over the currently loaded, server-filtered set) ----
  protected readonly totalAccounts = computed(() => this.accounts().length);
  protected readonly readyCount = computed(
    () => this.accounts().filter((a) => a.isReadyForReview).length,
  );
  protected readonly pendingCount = computed(
    () => this.accounts().filter((a) => a.accountStatus === 'Pending').length,
  );

  private readonly STATUS_META: readonly { id: StatusFilter; label: string; icon: string; color: string }[] = [
    { id: 'Pending', label: 'Pending', icon: 'fa-solid fa-hourglass-half', color: '#d97706' },
    { id: 'Verified', label: 'Verified', icon: 'fa-solid fa-circle-check', color: '#059669' },
    { id: 'Suspended', label: 'Suspended', icon: 'fa-solid fa-ban', color: '#dc2626' },
  ];

  protected readonly statusCounts = computed(() => {
    const rows = this.accounts();
    const total = rows.length || 1;
    return this.STATUS_META.map((d) => {
      const count = rows.filter((a) => a.accountStatus === d.id).length;
      return { ...d, count, pct: Math.round((count / total) * 100) };
    }).filter((r) => r.count > 0);
  });

  /** Multi-segment conic gradient for the status donut. */
  protected readonly donutBackground = computed(() => {
    const total = this.totalAccounts();
    if (!total) {
      return 'conic-gradient(var(--fb-line) 0 100%)';
    }
    let acc = 0;
    const segments = this.statusCounts().map((s) => {
      const start = (acc / total) * 100;
      acc += s.count;
      const end = (acc / total) * 100;
      return `${s.color} ${start}% ${end}%`;
    });
    return `conic-gradient(${segments.join(', ')})`;
  });

  private readonly ROLE_META: readonly { id: RoleFilter; label: string; icon: string; color: string }[] = [
    { id: 'Volunteer', label: 'Volunteers', icon: 'fa-solid fa-hand-holding-heart', color: 'var(--fb-primary)' },
    { id: 'Recipient', label: 'Organizations', icon: 'fa-solid fa-building', color: '#2258c7' },
    { id: 'Donor', label: 'Donors', icon: 'fa-solid fa-user', color: '#7c3aed' },
  ];

  protected readonly roleCounts = computed(() => {
    const rows = this.accounts();
    const total = rows.length || 1;
    return this.ROLE_META.map((d) => {
      const count = rows.filter((a) => a.role === d.id).length;
      return { ...d, count, pct: Math.round((count / total) * 100) };
    }).filter((r) => r.count > 0);
  });

  protected missingCount(a: AdminAccount): number {
    return a.requiredDocumentTypes.filter((t) => !a.submittedDocumentTypes.includes(t)).length;
  }

  protected hasDoc(a: AdminAccount, type: string): boolean {
    return a.submittedDocumentTypes.includes(type);
  }

  protected docLabel(type: string): string {
    return type === 'IdProof' ? 'Photo ID' : type === 'Selfie' ? 'Selfie' : type;
  }

  /**
   * Opens the file in a new tab. The list response only carries document *types*, not URLs, so the
   * per-user verification endpoint is fetched on demand — the admin opens a handful of documents,
   * not every URL on every page load.
   */
  protected openDocument(a: AdminAccount, type: string): void {
    this.users.getVerification(a.id).subscribe({
      next: (v) => {
        const doc = v.documents.find((d) => d.type === type);
        if (!doc) {
          this.toast.error('That document is no longer available.');
          return;
        }
        // Absolutised against the API's origin: `fileUrl` is server-relative (`/uploads/…`), and a
        // new tab opened against the frontend's origin would 404 — leaving an admin unable to see
        // the ID they're being asked to approve.
        const url = mediaUrl(doc.fileUrl);
        if (url) {
          window.open(url, '_blank', 'noopener');
        }
      },
      error: (err: Error) => this.toast.error(err.message || 'Could not open the document'),
    });
  }

  constructor() {
    this.load();
  }

  protected setStatus(f: StatusFilter): void {
    if (this.status() !== f) {
      this.status.set(f);
      this.load();
    }
  }

  protected setRole(f: RoleFilter): void {
    if (this.role() !== f) {
      this.role.set(f);
      this.load();
    }
  }

  protected clearFilters(): void {
    this.status.set('all');
    this.role.set('all');
    this.load();
  }

  protected load(): void {
    this.loading.set(true);
    const role = this.role() === 'all' ? undefined : this.role();
    const status = this.status() === 'all' ? undefined : this.status();
    this.admin.accounts(role, status).subscribe({
      next: (rows) => {
        this.accounts.set(rows);
        this.loading.set(false);
      },
      error: (err: Error) => {
        this.loading.set(false);
        this.toast.error(err.message || 'Could not load accounts');
      },
    });
  }

  protected verify(a: AdminAccount): void {
    this.mutate(a, 'verify');
  }

  /** Suspending cuts an account off, so it asks first. */
  protected async suspend(a: AdminAccount): Promise<void> {
    const ok = await this.dialog.confirm({
      title: `Suspend ${a.name}?`,
      message:
        a.role === 'Recipient'
          ? 'They will stop receiving matched food immediately. You can reinstate them later.'
          : 'They lose access to volunteer actions immediately. You can reinstate them later.',
      confirmLabel: 'Suspend',
      confirmVariant: 'danger',
      icon: 'fa-solid fa-ban',
    });
    if (ok) {
      this.mutate(a, 'suspend');
    }
  }

  private mutate(a: AdminAccount, action: 'verify' | 'suspend'): void {
    if (this.busyId()) {
      return;
    }
    this.busyId.set(a.id);
    const request$ =
      action === 'verify' ? this.admin.verifyAccount(a.id) : this.admin.suspendAccount(a.id);
    request$.subscribe({
      next: (updated) => {
        this.busyId.set(null);
        this.apply(updated);
        this.toast.success(
          `${updated.name} ${action === 'verify' ? 'verified' : 'suspended'}`,
        );
      },
      error: (err: Error) => {
        this.busyId.set(null);
        this.toast.error(err.message || `Could not ${action} this account`);
      },
    });
  }

  /**
   * Swap in the server's row. If a status filter is active the account may no
   * longer belong on screen, so drop it rather than show a row that contradicts
   * the filter.
   */
  private apply(updated: AdminAccount): void {
    const filter = this.status();
    this.accounts.update((list) =>
      filter !== 'all' && updated.accountStatus !== filter
        ? list.filter((a) => a.id !== updated.id)
        : list.map((a) => (a.id === updated.id ? updated : a)),
    );
  }

  protected initial(name: string): string {
    return name.trim().charAt(0).toUpperCase() || '?';
  }

  protected badgeClass(status: string): string {
    switch (status) {
      case 'Verified':
        return 'badge-confirmed';
      case 'Pending':
        return 'badge-pending';
      default:
        return 'badge-expired';
    }
  }

  protected roleIcon(role: string): string {
    switch (role) {
      case 'Recipient':
        return 'fa-building';
      case 'Volunteer':
        return 'fa-hand-holding-heart';
      default:
        return 'fa-user';
    }
  }

  protected tint(role: string): string {
    return role === 'Recipient'
      ? 'linear-gradient(135deg,var(--fb-success),var(--fb-success-deep))'
      : 'linear-gradient(135deg,var(--fb-primary),var(--fb-primary-deep))';
  }

  protected joined(iso: string): string {
    return new Date(iso).toLocaleDateString(APP_LOCALE, {
      timeZone: APP_TIME_ZONE,
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  }
}
