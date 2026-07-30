import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { API_ENDPOINTS } from '@core/config/api-endpoints';
import { ApiService, QueryParams } from '@core/http/api.service';
import { LeaderboardEntry } from '@core/models/leaderboard.model';

/** Volunteer data endpoints (Phase 8): leaderboard + the caller's own rank. */
@Injectable({ providedIn: 'root' })
export class VolunteerService {
  private readonly api = inject(ApiService);

  /** Volunteers ranked by total points, descending. */
  leaderboard(page = 1, pageSize = 50): Observable<LeaderboardEntry[]> {
    const params: QueryParams = { page, pageSize };
    return this.api.get<LeaderboardEntry[]>(API_ENDPOINTS.leaderboard.base, params);
  }

  /** The caller's own entry (null if they have no deliveries yet). */
  myRank(): Observable<LeaderboardEntry | null> {
    return this.api.get<LeaderboardEntry | null>(API_ENDPOINTS.leaderboard.me);
  }
}
