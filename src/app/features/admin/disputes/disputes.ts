import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { catchError, EMPTY, tap } from 'rxjs';
import { Dispute } from '@core/models/dispute.model';
import { DialogService } from '@core/services/dialog.service';
import { DisputeService } from '@core/services/dispute.service';
import { ToastService } from '@core/services/toast.service';
import { FbButton } from '@shared/ui/button/button';
import { DialogRef } from '@shared/ui/dialog/dialog-ref';
import { EmptyState } from '@shared/ui/empty-state/empty-state';
import { ListingLayout } from '@shared/ui/listing-layout/listing-layout';
import { SummaryHeader } from '@shared/ui/summary-header/summary-header';
import { APP_LOCALE, APP_TIME_ZONE } from '@shared/util/timezone';
import { ResolveDisputeDialog } from './resolve-dispute-dialog';

/**
 * Dispute queue, from `GET /disputes` (admin-only).
 *
 * Open and resolved are fetched as **two server-filtered calls** rather than one
 * unfiltered page split client-side: with paging, a local split would hide open
 * disputes behind a page boundary — exactly the ones this page must not miss.
 *
 * `DisputeResponse` carries ids, not names — no listing title, no raiser name — so
 * rows lead with the reason (the part a human wrote) and expose the ids for
 * cross-referencing rather than inventing labels.
 */
@Component({
  selector: 'app-disputes',
  imports: [FbButton, EmptyState, ListingLayout, SummaryHeader],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-listing-layout
      [title]="'Dispute Resolution'"
      description="Investigate and resolve issues raised on deliveries."
      [hasActions]="true"
      [hasAside]="true"
      [hasFilters]="false"
      gridClass=""
    >
      <div pageActions>
        <app-button variant="outline" icon="fa-solid fa-rotate" [loading]="loading()" (clicked)="load()">
          Refresh
        </app-button>
      </div>

      <!-- Summary: the open queue is the number that matters; resolved is context. -->
      <app-summary-header
        summary
        icon="fa-solid fa-gavel"
        [loading]="loading()"
        loadingText="Loading disputes…"
      >
        <span heading>
          <span class="text-primary-deep text-2xl">{{ open().length }}</span>
          open {{ open().length === 1 ? 'dispute' : 'disputes' }}
        </span>
        <span subtitle class="text-muted">
          {{ resolved().length }} resolved · {{ resolvedPct() }}% resolution rate
        </span>
      </app-summary-header>

      <h6 class="section-title">
        Open
        @if (!loading()) {
          <span class="badge-fb badge-pending ml-1">{{ open().length }}</span>
        }
      </h6>

      @if (loading()) {
        <div class="grid gap-3 lg:grid-cols-2 mb-6">
          @for (s of skeletons; track $index) {
            <div class="card-fb p-4">
              <div class="skeleton h-3.5 w-32 mb-2"></div>
              <div class="skeleton h-3 w-full mb-1.5"></div>
              <div class="skeleton h-3 w-2/3 mb-4"></div>
              <div class="skeleton h-8 w-full"></div>
            </div>
          }
        </div>
      } @else {
        <div class="grid gap-3 lg:grid-cols-2 mb-6">
          @for (d of open(); track d.id) {
            <div class="card-fb p-4 dispute-card">
              <div class="flex justify-between items-start gap-2 mb-2">
                <div class="small-label !mb-0">
                  <i class="fa-solid fa-clock mr-1"></i>Raised {{ when(d.createdAtUtc) }}
                </div>
                <span class="badge-fb badge-pending">Open</span>
              </div>
              <div class="text-sm mb-3 reason">“{{ d.reason }}”</div>
              <dl class="ids mb-3">
                <dt>Listing</dt>
                <dd [title]="d.listingId">{{ shortId(d.listingId) }}</dd>
                <dt>Raised by</dt>
                <dd [title]="d.raisedByUserId">{{ shortId(d.raisedByUserId) }}</dd>
              </dl>
              <button
                class="btn-fb w-full !py-2 !text-sm"
                [disabled]="busyId() === d.id"
                (click)="resolve(d)"
              >
                <i
                  class="fa-solid mr-1"
                  [class]="busyId() === d.id ? 'fa-spinner fa-spin' : 'fa-check'"
                ></i>Resolve
              </button>
            </div>
          } @empty {
            <div class="lg:col-span-2">
              <app-empty-state
                tone="positive"
                icon="fa-solid fa-circle-check"
                [title]="'No open disputes'"
                text="Everything is clear. New reports appear here as soon as they are raised."
              />
            </div>
          }
        </div>

        @if (resolved().length) {
          <h6 class="section-title">Resolved</h6>
          <div class="grid gap-3 lg:grid-cols-2">
            @for (d of resolved(); track d.id) {
              <div class="card-fb p-4 opacity-75">
                <div class="flex justify-between items-start gap-2">
                  <div class="small-label !mb-0" [title]="d.listingId">
                    Listing {{ shortId(d.listingId) }}
                  </div>
                  <span class="badge-fb badge-confirmed">Resolved</span>
                </div>
                <div class="text-muted text-xs mt-1.5 reason">“{{ d.reason }}”</div>
                @if (d.resolutionNote) {
                  <div class="note">
                    <i class="fa-solid fa-reply mr-1.5"></i>{{ d.resolutionNote }}
                  </div>
                }
              </div>
            }
          </div>
        }
      }

      <!-- Sticky stats aside — same shape as the donor/volunteer listing pages. -->
      <ng-container aside>
        <!-- Resolution: total raised in the ring, open highlighted alongside. -->
        <div class="card-fb p-5">
          <div class="font-bold text-sm mb-4">Resolution</div>
          <div class="flex items-center gap-4">
            <div class="fb-ring" [style.background]="resolvedRing()">
              <div class="fb-ring-inner">
                <span class="fb-ring-num">{{ totalDisputes() }}</span>
                <span class="fb-ring-cap">raised</span>
              </div>
            </div>
            <div class="min-w-0">
              <div class="text-muted text-xs">Open</div>
              <div class="font-bold text-xl text-orange-600">{{ open().length }}</div>
              @if (totalDisputes()) {
                <div class="text-success-deep text-xs font-semibold mt-1">
                  {{ resolvedPct() }}% resolved
                </div>
              }
            </div>
          </div>
        </div>

        <!-- Breakdown: open vs resolved share. -->
        <div class="card-fb p-5">
          <div class="font-bold text-sm mb-3">Breakdown</div>
          @if (totalDisputes()) {
            <div class="flex flex-col gap-1">
              @for (b of breakdown(); track b.label) {
                <div class="fb-cat-row">
                  <span class="fb-cat-icon" [style.color]="b.color">
                    <i [class]="b.icon" aria-hidden="true"></i>
                  </span>
                  <span class="fb-cat-label">{{ b.label }}</span>
                  <span class="fb-cat-count">{{ b.count }}</span>
                  <span class="fb-cat-bar" aria-hidden="true">
                    <span class="fb-cat-fill" [style.width.%]="b.pct" [style.background]="b.color"></span>
                  </span>
                </div>
              }
            </div>
          } @else {
            <p class="text-muted text-xs m-0">No disputes have been raised.</p>
          }
        </div>
      </ng-container>
    </app-listing-layout>
  `,
  styles: `
    .dispute-card {
      border-left: 4px solid var(--fb-orange);
    }
    .reason {
      line-height: 1.6;
    }
    .ids {
      display: grid;
      grid-template-columns: auto 1fr;
      gap: 2px 10px;
      margin: 0;
      font-size: 11.5px;
    }
    .ids dt {
      color: var(--fb-muted);
    }
    .ids dd {
      margin: 0;
      font-weight: 600;
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      cursor: help;
    }
    .note {
      margin-top: 9px;
      padding-top: 9px;
      border-top: 1px solid var(--fb-line);
      font-size: 11.5px;
      line-height: 1.6;
      color: var(--fb-muted);
    }
  `,
})
export class Disputes {
  private readonly disputeService = inject(DisputeService);
  private readonly dialog = inject(DialogService);
  private readonly toast = inject(ToastService);

  protected readonly skeletons = Array.from({ length: 2 });

  protected readonly open = signal<Dispute[]>([]);
  protected readonly resolved = signal<Dispute[]>([]);
  protected readonly loading = signal(true);
  /** Id of the dispute whose resolve call is in flight. */
  protected readonly busyId = signal<string | null>(null);

  // ---- Aside stats ----
  protected readonly totalDisputes = computed(() => this.open().length + this.resolved().length);

  protected readonly resolvedPct = computed(() => {
    const total = this.totalDisputes();
    return total ? Math.round((this.resolved().length / total) * 100) : 0;
  });

  /** Resolved (success) then open (orange) share, for the ring background. */
  protected readonly resolvedRing = computed(() => {
    const total = this.totalDisputes();
    if (!total) {
      return 'conic-gradient(var(--fb-line) 0 100%)';
    }
    const pct = this.resolvedPct();
    return `conic-gradient(var(--fb-success) 0 ${pct}%, var(--fb-orange) ${pct}% 100%)`;
  });

  protected readonly breakdown = computed(() => {
    const total = this.totalDisputes() || 1;
    return [
      {
        label: 'Open',
        icon: 'fa-solid fa-circle-exclamation',
        color: '#ea580c',
        count: this.open().length,
        pct: Math.round((this.open().length / total) * 100),
      },
      {
        label: 'Resolved',
        icon: 'fa-solid fa-circle-check',
        color: '#059669',
        count: this.resolved().length,
        pct: Math.round((this.resolved().length / total) * 100),
      },
    ].filter((b) => b.count > 0);
  });

  constructor() {
    this.load();
  }

  protected load(): void {
    this.loading.set(true);
    let pending = 2;
    const settle = () => {
      if (--pending === 0) {
        this.loading.set(false);
      }
    };

    // Two filtered calls, not forkJoin: the open queue is what matters, so it
    // renders as soon as it lands even if the resolved history is slower or fails.
    this.disputeService.list('Open').subscribe({
      next: (rows) => {
        this.open.set(rows);
        settle();
      },
      error: (err: Error) => {
        settle();
        this.toast.error(err.message || 'Could not load open disputes');
      },
    });

    this.disputeService.list('Resolved').subscribe({
      next: (rows) => {
        this.resolved.set(rows);
        settle();
      },
      error: () => settle(),
    });
  }

  /** Resolving needs a note, so it goes through a dialog rather than a bare click. */
  protected resolve(d: Dispute): void {
    const ref: DialogRef<Dispute | undefined, ResolveDisputeDialog> = this.dialog.open<
      Dispute,
      Dispute | undefined,
      ResolveDisputeDialog
    >({
      header: {
        title: 'Resolve dispute',
        subtitle: `Raised ${this.when(d.createdAtUtc)}`,
        icon: 'fa-solid fa-gavel',
      },
      content: ResolveDisputeDialog,
      data: d,
      size: 'md',
      actions: [
        { id: 'cancel', label: 'Cancel', variant: 'ghost', close: true },
        {
          id: 'resolve',
          label: 'Mark resolved',
          icon: 'fa-solid fa-check',
          disabled: () => !ref.body()?.valid(),
          handler: (r) =>
            this.disputeService.resolve(d.id, r.body()!.note()).pipe(
              tap((updated) => r.close(updated)),
              // An expected 4xx (already resolved, note too long) must not reach the
              // global handler — keep the dialog open with the note intact.
              catchError((err: Error) => {
                this.toast.error(err.message || 'Could not resolve this dispute');
                return EMPTY;
              }),
            ),
        },
      ],
    });

    ref.closed.subscribe((updated) => {
      if (!updated) {
        return;
      }
      this.open.update((list) => list.filter((x) => x.id !== updated.id));
      this.resolved.update((list) => [updated, ...list]);
      this.toast.success('Dispute marked resolved');
    });
  }

  protected shortId(id: string): string {
    return id.slice(0, 8);
  }

  protected when(iso: string): string {
    return new Date(iso).toLocaleString(APP_LOCALE, {
      timeZone: APP_TIME_ZONE,
      day: 'numeric',
      month: 'short',
      hour: 'numeric',
      minute: '2-digit',
    });
  }
}
