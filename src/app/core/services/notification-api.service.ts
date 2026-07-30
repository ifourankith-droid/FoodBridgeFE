import { inject, Injectable } from '@angular/core';
import { forkJoin, Observable, of } from 'rxjs';
import { API_ENDPOINTS } from '@core/config/api-endpoints';
import { ApiService, QueryParams } from '@core/http/api.service';
import { Notification } from '@core/models/notification.model';

/**
 * REST calls for the notifications module (fallback for the SignalR hub).
 * The in-app bell UI state lives in {@link NotificationService}.
 */
@Injectable({ providedIn: 'root' })
export class NotificationApiService {
  private readonly api = inject(ApiService);

  /** The caller's own notifications, optionally filtered by read status. */
  list(isRead?: boolean, page = 1, pageSize = 20): Observable<Notification[]> {
    const params: QueryParams = { isRead, page, pageSize };
    return this.api.get<Notification[]>(API_ENDPOINTS.notifications.base, params);
  }

  /** Mark a single notification read (idempotent). */
  markRead(id: string): Observable<Notification> {
    return this.api.patch<Notification>(API_ENDPOINTS.notifications.read(id));
  }

  /**
   * Mark several notifications read. The backend has no bulk endpoint yet, so
   * this fans out one idempotent PATCH per id; swap for a single call if one
   * lands. Emits an empty array (rather than never emitting, as bare `forkJoin`
   * would) when there is nothing to mark.
   */
  markManyRead(ids: readonly string[]): Observable<Notification[]> {
    return ids.length ? forkJoin(ids.map((id) => this.markRead(id))) : of([]);
  }
}
