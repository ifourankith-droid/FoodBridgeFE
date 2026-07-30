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
import { EmptyState } from '@shared/ui/empty-state/empty-state';
import { PageWrapper } from '@shared/ui/page-wrapper/page-wrapper';

/** A ranked row decorated with everything the list needs to render it. */
interface RankRow {
  entry: LeaderboardEntry;
  isMe: boolean;
  /** Medal styling for the top three; empty for everyone else. */
  medal: 'gold' | 'silver' | 'bronze' | '';
  /** Share of the leader's points, for the row's progress rail. */
  pct: number;
}

/** Podium order: silver, gold, bronze — so first place stands in the middle. */
const PODIUM_ORDER = [1, 0, 2];

const MEDALS = ['gold', 'silver', 'bronze'] as const;

@Component({
  selector: 'app-leaderboard',
  imports: [DecimalPipe, Avatar, EmptyState, FbButton, PageWrapper],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-wrapper
      title="Leaderboard"
      description="Top volunteers by rescue points — one point per meal delivered and confirmed."
      [hasActions]="true"
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

      @if (loading()) {
        <div class="grid gap-4 lg:grid-cols-3 mb-4">
          @for (s of skeletons; track $index) {
            <div class="card-fb p-5">
              <div class="skeleton !rounded-full w-14 h-14 mb-3"></div>
              <div class="skeleton h-4 w-28 mb-2"></div>
              <div class="skeleton h-3 w-20"></div>
            </div>
          }
        </div>
        <div class="card-fb p-3">
          @for (s of skeletons; track $index) {
            <div class="flex items-center gap-3 p-2.5">
              <div class="skeleton w-8 h-8 !rounded-lg"></div>
              <div class="skeleton !rounded-full w-9 h-9"></div>
              <div class="flex-1">
                <div class="skeleton h-3.5 w-32 mb-1.5"></div>
                <div class="skeleton h-2.5 w-20"></div>
              </div>
              <div class="skeleton h-4 w-16"></div>
            </div>
          }
        </div>
      } @else if (!rows().length) {
        <div class="card-fb">
          <app-empty-state
            icon="fa-solid fa-ranking-star"
            title="No ranked volunteers yet"
            text="Points are awarded when a recipient confirms a delivery. The first confirmed drop-off starts the board."
          />
        </div>
      } @else {
        <!-- Your standing. Shown even when unranked, so the page always answers
             "where do I stand?" rather than leaving the volunteer to hunt the list. -->
        <div class="card-fb me-card mb-4">
          <div class="me-rank">
            @if (me(); as m) {
              <span class="me-rank-num">#{{ m.rank }}</span>
              <span class="me-rank-cap">your rank</span>
            } @else {
              <span class="me-rank-num">—</span>
              <span class="me-rank-cap">unranked</span>
            }
          </div>

          <div class="min-w-0 flex-1">
            <div class="font-bold">{{ myName() }}</div>
            @if (me(); as m) {
              <div class="text-muted text-sm mt-0.5">
                {{ m.totalPoints | number }} points · {{ m.totalDeliveries }}
                {{ m.totalDeliveries === 1 ? 'delivery' : 'deliveries' }}
              </div>
              @if (gapToNext(); as gap) {
                <div class="text-primary-deep text-xs font-semibold mt-1.5">
                  <i class="fa-solid fa-arrow-trend-up mr-1"></i>{{ gap.points | number }} more
                  {{ gap.points === 1 ? 'point' : 'points' }} to pass {{ gap.name }} at #{{
                    gap.rank
                  }}
                </div>
              } @else {
                <div class="text-success-deep text-xs font-semibold mt-1.5">
                  <i class="fa-solid fa-crown mr-1"></i>You're leading the board — nice work.
                </div>
              }
            } @else {
              <div class="text-muted text-sm mt-0.5">
                Deliver a listing and you'll appear here once the recipient confirms it.
              </div>
            }
          </div>

          <div class="me-total">
            <div class="me-total-num">{{ me()?.totalPoints ?? 0 | number }}</div>
            <div class="me-total-cap">points</div>
          </div>
        </div>

        <!-- Podium: top three, first place raised in the middle -->
        @if (podium().length === 3) {
          <div class="podium mb-4">
            @for (i of podiumOrder; track i) {
              @if (podium()[i]; as row) {
                <div class="card-fb pod" [class]="'pod-' + row.medal" [class.is-me]="row.isMe">
                  <div class="pod-medal"><i class="fa-solid fa-medal"></i>#{{ row.entry.rank }}</div>
                  <app-avatar [name]="row.entry.name" [size]="row.medal === 'gold' ? 62 : 50" />
                  <div class="pod-name">
                    {{ row.entry.name }}@if (row.isMe) {<span class="text-muted"> (you)</span>}
                  </div>
                  <div class="pod-points">{{ row.entry.totalPoints | number }} pts</div>
                  <div class="pod-sub">
                    {{ row.entry.totalDeliveries }}
                    {{ row.entry.totalDeliveries === 1 ? 'delivery' : 'deliveries' }}
                  </div>
                </div>
              }
            }
          </div>
        }

        <!-- Full ranking -->
        <div class="card-fb overflow-hidden">
          <div class="list-head">
            <span>Full ranking</span>
            <span class="list-count">{{ rows().length }}</span>
          </div>

          @for (row of rows(); track row.entry.volunteerId) {
            <div class="rank-row" [class.is-me]="row.isMe">
              <div class="rank-pill" [class]="row.medal ? 'medal-' + row.medal : ''">
                #{{ row.entry.rank }}
              </div>
              <app-avatar [name]="row.entry.name" [size]="38" />

              <div class="min-w-0 flex-1">
                <div class="rank-name">
                  {{ row.entry.name }}@if (row.isMe) {<span class="text-muted"> (you)</span>}
                </div>
                <div class="text-muted text-xs">
                  {{ row.entry.totalDeliveries }}
                  {{ row.entry.totalDeliveries === 1 ? 'delivery' : 'deliveries' }}
                </div>
                <!-- Share of the leader's total: turns a column of numbers into a
                     comparison you can read at a glance. -->
                <div class="rank-rail" aria-hidden="true">
                  <span class="rank-fill" [style.width.%]="row.pct"></span>
                </div>
              </div>

              <div class="rank-points">
                {{ row.entry.totalPoints | number }}<span class="rank-points-cap">pts</span>
              </div>
            </div>
          }
        </div>
      }
    </app-page-wrapper>
  `,
  styles: `
    /* ---- Your standing ---- */
    .me-card {
      display: flex;
      align-items: center;
      gap: 16px;
      flex-wrap: wrap;
      padding: 18px 20px;
      /* Brand wash so the volunteer's own row is unmistakably theirs. */
      background:
        radial-gradient(ellipse 60% 100% at 0% 50%, var(--fb-primary-soft), transparent 70%),
        var(--fb-surface);
    }
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
    .me-total {
      text-align: right;
      flex-shrink: 0;
    }
    .me-total-num {
      font-size: 28px;
      font-weight: 800;
      line-height: 1;
      color: var(--fb-primary-deep);
    }
    .me-total-cap {
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: var(--fb-muted);
    }

    /* ---- Podium ---- */
    .podium {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      align-items: end;
      gap: 12px;
    }
    @media (max-width: 560px) {
      .podium {
        grid-template-columns: 1fr;
        align-items: stretch;
      }
    }
    .pod {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 7px;
      padding: 18px 14px;
      text-align: center;
      border-top: 3px solid var(--fb-line);
    }
    /* First place is physically taller — the ranking reads before the numbers do. */
    .pod-gold {
      padding-top: 26px;
      padding-bottom: 26px;
      border-top-color: #e0a52a;
    }
    .pod-silver {
      border-top-color: #9aa3ad;
    }
    .pod-bronze {
      border-top-color: #b87333;
    }
    .pod.is-me {
      box-shadow: 0 0 0 2px var(--fb-primary) inset;
    }
    .pod-medal {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      font-size: 11px;
      font-weight: 800;
      letter-spacing: 0.04em;
      color: var(--fb-muted);
    }
    .pod-gold .pod-medal {
      color: #b8860b;
    }
    .pod-silver .pod-medal {
      color: #6b7280;
    }
    .pod-bronze .pod-medal {
      color: #a0522d;
    }
    .pod-name {
      font-size: 13.5px;
      font-weight: 700;
      line-height: 1.3;
    }
    .pod-points {
      font-size: 17px;
      font-weight: 800;
      color: var(--fb-primary-deep);
      line-height: 1;
    }
    .pod-sub {
      font-size: 11.5px;
      color: var(--fb-muted);
    }

    /* ---- Full ranking list ---- */
    .list-head {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 12px 16px;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--fb-muted);
      border-bottom: 1px solid var(--fb-line);
    }
    .list-count {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 20px;
      height: 18px;
      padding: 0 6px;
      border-radius: 999px;
      font-size: 10.5px;
      letter-spacing: 0;
      background: rgb(var(--fb-primary-rgb) / 0.12);
      color: var(--fb-primary-deep);
    }

    .rank-row {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 11px 16px;
    }
    .rank-row + .rank-row {
      border-top: 1px solid var(--fb-line);
    }
    .rank-row.is-me {
      background: rgb(var(--fb-primary-rgb) / 0.08);
      box-shadow: inset 3px 0 0 var(--fb-primary);
    }

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

    .rank-name {
      font-size: 13.5px;
      font-weight: 600;
    }
    .rank-rail {
      display: block;
      height: 4px;
      margin-top: 6px;
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

    .rank-points {
      flex-shrink: 0;
      font-size: 15px;
      font-weight: 800;
      color: var(--fb-primary-deep);
      font-variant-numeric: tabular-nums;
    }
    .rank-points-cap {
      margin-left: 4px;
      font-size: 10.5px;
      font-weight: 700;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      color: var(--fb-muted);
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
  `,
})
export class Leaderboard {
  private readonly auth = inject(AuthService);
  private readonly volunteers = inject(VolunteerService);
  private readonly toast = inject(ToastService);

  protected readonly podiumOrder = PODIUM_ORDER;
  protected readonly skeletons = Array.from({ length: 3 });

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
