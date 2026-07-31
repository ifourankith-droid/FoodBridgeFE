import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { AdminAccount } from '@core/models/admin.model';
import { AdminService } from '@core/services/admin.service';
import { DialogService } from '@core/services/dialog.service';
import { ToastService } from '@core/services/toast.service';
import { UserService } from '@core/services/user.service';
import { FbButton } from '@shared/ui/button/button';
import { EmptyState } from '@shared/ui/empty-state/empty-state';
import { PageWrapper } from '@shared/ui/page-wrapper/page-wrapper';
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
  imports: [FbButton, EmptyState, PageWrapper],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-wrapper
      title="Verifications"
      description="Approve or suspend volunteers and organizations. A recipient receives no food until verified."
      [hasActions]="true"
    >
      <div pageActions>
        <app-button variant="outline" icon="fa-solid fa-rotate" [loading]="loading()" (clicked)="load()">
          Refresh
        </app-button>
      </div>

      <div class="flex flex-wrap items-center gap-2 mb-2">
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
      <div class="flex flex-wrap items-center gap-2 mb-4">
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
                    <button
                      class="btn-fb-outline flex-1 !py-2 !text-sm !text-red-600"
                      [disabled]="busyId() === a.id"
                      (click)="suspend(a)"
                    >
                      <i class="fa-solid mr-1" [class]="spinOr(a.id, 'fa-ban')"></i>Suspend
                    </button>
                  }
                  @case ('Pending') {
                    <button
                      class="btn-fb flex-1 !py-2 !text-sm"
                      [disabled]="busyId() === a.id"
                      (click)="verify(a)"
                    >
                      <i class="fa-solid mr-1" [class]="spinOr(a.id, 'fa-check')"></i>Verify
                    </button>
                    <button
                      class="btn-fb-outline flex-1 !py-2 !text-sm !text-red-600"
                      [disabled]="busyId() === a.id"
                      (click)="suspend(a)"
                    >
                      Reject
                    </button>
                  }
                  @default {
                    <button
                      class="btn-fb flex-1 !py-2 !text-sm"
                      [disabled]="busyId() === a.id"
                      (click)="verify(a)"
                    >
                      <i class="fa-solid mr-1" [class]="spinOr(a.id, 'fa-rotate-left')"></i>Reinstate
                    </button>
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
    </app-page-wrapper>
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
        window.open(doc.fileUrl, '_blank', 'noopener');
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

  protected spinOr(id: string, icon: string): string {
    return this.busyId() === id ? 'fa-spinner fa-spin' : icon;
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
