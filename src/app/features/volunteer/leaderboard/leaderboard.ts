import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { LeaderboardEntry } from '@core/models/leaderboard.model';
import { AuthService } from '@core/services/auth.service';
import { ToastService } from '@core/services/toast.service';
import { VolunteerService } from '@core/services/volunteer.service';
import { Avatar } from '@shared/ui/avatar/avatar';
import { FbButton } from '@shared/ui/button/button';
import { ListingLayout } from '@shared/ui/listing-layout/listing-layout';
import { SummaryHeader } from '@shared/ui/summary-header/summary-header';

/** A ranked row decorated with everything the list needs to render it. */
interface RankRow {
  entry: LeaderboardEntry;
  isMe: boolean;
  /** Medal styling for the top three; empty for everyone else. */
  medal: 'gold' | 'silver' | 'bronze' | '';
  /** Share of the leader's points, for the row's progress rail. */
  pct: number;
}

const MEDALS = ['gold', 'silver', 'bronze'] as const;

@Component({
  selector: 'app-leaderboard',
  imports: [DecimalPipe, Avatar, FbButton, ListingLayout, SummaryHeader],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-listing-layout
      title="Leaderboard"
      description="Top volunteers by rescue points — one point per meal delivered and confirmed."
      [hasActions]="true"
      [hasAside]="true"
      [hasFilters]="false"
      [loading]="loading()"
      [empty]="!rows().length"
      gridClass="md:grid-cols-2"
      emptyIcon="fa-solid fa-ranking-star"
      emptyTitle="No ranked volunteers yet"
      emptyText="Points are awarded when a recipient confirms a delivery. The first confirmed drop-off starts the board."
    >
      <div pageActions>
        <app-button
          variant="outline"
          icon="fa-solid fa-rotate"
          [loading]="loading()"
          (clicked)="load()"
        >
          Refresh
        </app-button>
      </div>

      <!-- Summary: how many are ranked + the board totals — same shape as the listing pages. -->
      <app-summary-header
        summary
        icon="fa-solid fa-ranking-star"
        [loading]="loading()"
        loadingText="Loading the leaderboard…"
      >
        <span heading>
          <span class="text-primary-deep text-2xl">{{ rows().length }}</span>
          ranked {{ rows().length === 1 ? 'volunteer' : 'volunteers' }}
        </span>
        <span subtitle class="text-muted">
          {{ boardPoints() | number }} points · {{ boardDeliveries() | number }} deliveries rescued
        </span>
      </app-summary-header>

      <!-- Left column: one user card per ranked volunteer. -->
      @for (row of rows(); track row.entry.volunteerId) {
        <div class="user-card card-fb" [class.is-me]="row.isMe">
          <div class="uc-head">
            <div class="rank-pill" [class]="row.medal ? 'medal-' + row.medal : ''">
              #{{ row.entry.rank }}
            </div>
            <app-avatar [name]="row.entry.name" [size]="44" />
            <div class="min-w-0 flex-1">
              <div class="uc-name">
                {{ row.entry.name }}@if (row.isMe) {<span class="text-muted"> (you)</span>}
              </div>
              <div class="text-muted text-xs">
                {{ row.entry.totalDeliveries }}
                {{ row.entry.totalDeliveries === 1 ? 'delivery' : 'deliveries' }}
              </div>
            </div>
            @if (row.medal) {
              <i class="fa-solid fa-medal uc-medal" [class]="'medal-' + row.medal" aria-hidden="true"></i>
            }
          </div>

          <div class="uc-foot">
            <!-- Share of the leader's total: a comparison you can read at a glance. -->
            <span class="rank-rail" aria-hidden="true">
              <span class="rank-fill" [style.width.%]="row.pct"></span>
            </span>
            <span class="uc-points">
              {{ row.entry.totalPoints | number }}<span class="uc-points-cap">pts</span>
            </span>
          </div>
        </div>
      }

      <!-- Sticky aside: your standing, the top three, and board totals. -->
      <ng-container aside>
        <div class="card-fb p-5">
          <div class="font-bold text-sm mb-4">Your standing</div>
          <div class="flex items-center gap-4">
            <div class="me-rank">
              @if (me(); as m) {
                <span class="me-rank-num">#{{ m.rank }}</span>
                <span class="me-rank-cap">your rank</span>
              } @else {
                <span class="me-rank-num">—</span>
                <span class="me-rank-cap">unranked</span>
              }
            </div>
            <div class="min-w-0">
              <div class="text-muted text-xs">Points</div>
              <div class="font-bold text-xl text-primary-deep">{{ me()?.totalPoints ?? 0 | number }}</div>
              <div class="text-muted text-[11px] mt-1 truncate">{{ myName() }}</div>
            </div>
          </div>

          @if (me(); as m) {
            @if (gapToNext(); as gap) {
              <div class="text-primary-deep text-xs font-semibold mt-3">
                <i class="fa-solid fa-arrow-trend-up mr-1"></i>{{ gap.points | number }} more
                {{ gap.points === 1 ? 'point' : 'points' }} to pass {{ gap.name }} at #{{ gap.rank }}
              </div>
            } @else {
              <div class="text-success-deep text-xs font-semibold mt-3">
                <i class="fa-solid fa-crown mr-1"></i>You're leading the board — nice work.
              </div>
            }
          } @else {
            <div class="text-muted text-xs mt-3">
              Deliver a listing and you'll appear here once the recipient confirms it.
            </div>
          }
        </div>

        @if (podium().length) {
          <div class="card-fb p-5">
            <div class="font-bold text-sm mb-3">Top volunteers</div>
            <div class="flex flex-col gap-1">
              @for (row of podium(); track row.entry.volunteerId) {
                <div class="top-row" [class.is-me]="row.isMe">
                  <div class="rank-pill" [class]="row.medal ? 'medal-' + row.medal : ''">
                    #{{ row.entry.rank }}
                  </div>
                  <app-avatar [name]="row.entry.name" [size]="30" />
                  <div class="min-w-0 flex-1">
                    <div class="top-name">
                      {{ row.entry.name }}@if (row.isMe) {<span class="text-muted"> (you)</span>}
                    </div>
                  </div>
                  <div class="top-pts">{{ row.entry.totalPoints | number }}</div>
                </div>
              }
            </div>
          </div>
        }

        <div class="card-fb p-5">
          <div class="font-bold text-sm mb-3">Board totals</div>
          <div class="grid grid-cols-3 gap-3 text-center">
            <div>
              <div class="fb-impact-num">{{ rows().length }}</div>
              <div class="text-muted text-[11px]">Volunteers</div>
            </div>
            <div>
              <div class="fb-impact-num">{{ boardPoints() | number }}</div>
              <div class="text-muted text-[11px]">Points</div>
            </div>
            <div>
              <div class="fb-impact-num">{{ boardDeliveries() | number }}</div>
              <div class="text-muted text-[11px]">Deliveries</div>
            </div>
          </div>
        </div>
      </ng-container>
    </app-listing-layout>
  `,
  styles: `
    /* ---- User card (one ranked volunteer) ---- */
    .user-card {
      display: flex;
      flex-direction: column;
      gap: 12px;
      padding: 16px;
    }
    .user-card.is-me {
      box-shadow:
        inset 3px 0 0 var(--fb-primary),
        var(--fb-shadow);
      background:
        radial-gradient(ellipse 70% 100% at 0% 0%, var(--fb-primary-soft), transparent 70%),
        var(--fb-surface);
    }
    .uc-head {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .uc-name {
      font-size: 14px;
      font-weight: 700;
      line-height: 1.3;
    }
    .uc-medal {
      flex-shrink: 0;
      font-size: 18px;
    }
    .uc-foot {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .uc-points {
      flex-shrink: 0;
      font-size: 16px;
      font-weight: 800;
      color: var(--fb-primary-deep);
      font-variant-numeric: tabular-nums;
    }
    .uc-points-cap {
      margin-left: 4px;
      font-size: 10.5px;
      font-weight: 700;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      color: var(--fb-muted);
    }

    /* ---- Rank pill (shared by user cards + the aside top-3) ---- */
    .rank-pill {
      width: 34px;
      height: 30px;
      flex-shrink: 0;
      border-radius: 9px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 800;
      font-size: 12px;
      background: var(--fb-primary-soft);
      color: var(--fb-primary-deep);
      font-variant-numeric: tabular-nums;
    }
    /* Medal tints are literal — they are metal colours, not brand colours, so
       they must not follow the active palette. */
    .rank-pill.medal-gold {
      background: rgba(224, 165, 42, 0.18);
      color: #b8860b;
    }
    .rank-pill.medal-silver {
      background: rgba(154, 163, 173, 0.2);
      color: #566070;
    }
    .rank-pill.medal-bronze {
      background: rgba(184, 115, 51, 0.18);
      color: #a0522d;
    }
    .uc-medal.medal-gold {
      color: #e0a52a;
    }
    .uc-medal.medal-silver {
      color: #9aa3ad;
    }
    .uc-medal.medal-bronze {
      color: #b87333;
    }
    body.dark .rank-pill.medal-silver {
      color: #cbd5e1;
    }
    body.dark .rank-pill.medal-gold {
      color: #fbbf24;
    }
    body.dark .rank-pill.medal-bronze {
      color: #e59a5b;
    }

    /* ---- Share rail ---- */
    .rank-rail {
      flex: 1 1 auto;
      display: block;
      height: 5px;
      border-radius: 999px;
      overflow: hidden;
      background: var(--fb-line);
    }
    .rank-fill {
      display: block;
      height: 100%;
      border-radius: 999px;
      background: var(--fb-primary);
    }

    /* ---- Aside: your rank tile ---- */
    .me-rank {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      width: 74px;
      height: 74px;
      flex-shrink: 0;
      border-radius: 20px;
      color: #fff;
      background: linear-gradient(135deg, var(--fb-primary), var(--fb-primary-deep));
      box-shadow: 0 10px 24px var(--fb-glow-primary-deep);
    }
    .me-rank-num {
      font-size: 22px;
      font-weight: 800;
      line-height: 1;
    }
    .me-rank-cap {
      margin-top: 3px;
      font-size: 9px;
      font-weight: 700;
      letter-spacing: 0.07em;
      text-transform: uppercase;
      opacity: 0.85;
    }

    /* ---- Aside: top-3 list ---- */
    .top-row {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 6px 4px;
      border-radius: 10px;
    }
    .top-row.is-me {
      background: rgb(var(--fb-primary-rgb) / 0.09);
    }
    .top-name {
      font-size: 13px;
      font-weight: 600;
    }
    .top-pts {
      flex-shrink: 0;
      font-size: 13px;
      font-weight: 800;
      color: var(--fb-primary-deep);
      font-variant-numeric: tabular-nums;
    }
  `,
})
export class Leaderboard {
  private readonly auth = inject(AuthService);
  private readonly volunteers = inject(VolunteerService);
  private readonly toast = inject(ToastService);

  private readonly entries = signal<LeaderboardEntry[]>([]);
  /** GET /leaderboard/me — null while loading, or when this volunteer has no points yet. */
  private readonly myEntry = signal<LeaderboardEntry | null>(null);
  protected readonly loading = signal(true);

  private readonly myId = computed(() => this.auth.currentUser()?.id ?? '');

  protected readonly myName = computed(() => this.auth.currentUser()?.name ?? 'You');

  /**
   * The caller's own standing. Prefers `/leaderboard/me`, falling back to their row
   * in the ranked page — the dedicated endpoint is authoritative but returns null
   * for a volunteer with no confirmed deliveries.
   */
  protected readonly me = computed(
    () => this.myEntry() ?? this.entries().find((e) => e.volunteerId === this.myId()) ?? null,
  );

  protected readonly rows = computed<RankRow[]>(() => {
    const list = this.entries();
    const leader = Math.max(1, ...list.map((e) => e.totalPoints));
    const myId = this.myId();
    return list.map((entry) => ({
      entry,
      isMe: entry.volunteerId === myId,
      medal: MEDALS[entry.rank - 1] ?? '',
      pct: Math.round((entry.totalPoints / leader) * 100),
    }));
  });

  protected readonly podium = computed(() => this.rows().slice(0, 3));

  /** Board-wide totals for the summary strip and the aside "Board totals" card. */
  protected readonly boardPoints = computed(() =>
    this.entries().reduce((sum, e) => sum + e.totalPoints, 0),
  );
  protected readonly boardDeliveries = computed(() =>
    this.entries().reduce((sum, e) => sum + e.totalDeliveries, 0),
  );

  /**
   * How far behind the next volunteer up the caller is. Null when they are already
   * first, or when nobody above them appears on the fetched page.
   */
  protected readonly gapToNext = computed(() => {
    const mine = this.me();
    if (!mine || mine.rank <= 1) {
      return null;
    }
    // The nearest entry strictly ahead on points — not `rank - 1`, which ties share.
    const ahead = this.entries()
      .filter((e) => e.totalPoints > mine.totalPoints)
      .sort((a, b) => a.totalPoints - b.totalPoints)[0];
    return ahead
      ? { name: ahead.name, rank: ahead.rank, points: ahead.totalPoints - mine.totalPoints + 1 }
      : null;
  });

  constructor() {
    this.load();
  }

  protected load(): void {
    this.loading.set(true);
    // `me` is a nice-to-have: a failure there must not blank the whole board.
    forkJoin({
      board: this.volunteers.leaderboard(),
      me: this.volunteers.myRank().pipe(catchError(() => of(null))),
    }).subscribe({
      next: ({ board, me }) => {
        this.entries.set(board);
        this.myEntry.set(me);
        this.loading.set(false);
      },
      error: (err: Error) => {
        this.loading.set(false);
        this.toast.show(
          'fa-solid fa-triangle-exclamation',
          err.message || 'Could not load the leaderboard',
        );
      },
    });
  }
}
