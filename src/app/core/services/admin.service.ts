import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { API_ENDPOINTS } from '@core/config/api-endpoints';
import { ApiService, QueryParams } from '@core/http/api.service';
import { AdminAccount, AdminDashboard, AdminListingSummary } from '@core/models/admin.model';
import { PlatformReport } from '@core/models/report.model';

/**
 * Admin console endpoints (Phase 9): dashboard, moderation, platform report.
 *
 * Disputes live in `DisputeService` — raising one is open to any party on a
 * listing, so it must not require injecting the admin console.
 */
@Injectable({ providedIn: 'root' })
export class AdminService {
  private readonly api = inject(ApiService);

  dashboard(): Observable<AdminDashboard> {
    return this.api.get<AdminDashboard>(API_ENDPOINTS.admin.dashboard);
  }

  /** `status` is a `Listings.Status` enum name (`Pending`, `Claimed`, …). */
  listings(status?: string, page = 1, pageSize = 50): Observable<AdminListingSummary[]> {
    const params: QueryParams = { status, page, pageSize };
    return this.api.get<AdminListingSummary[]>(API_ENDPOINTS.admin.listings, params);
  }

  /** Both filters are server-side: `role` (`Donor`…) and `accountStatus` (`Pending`…). */
  accounts(
    role?: string,
    accountStatus?: string,
    page = 1,
    pageSize = 50,
  ): Observable<AdminAccount[]> {
    const params: QueryParams = { role, accountStatus, page, pageSize };
    return this.api.get<AdminAccount[]>(API_ENDPOINTS.admin.accounts, params);
  }

  verifyAccount(id: string): Observable<AdminAccount> {
    return this.api.patch<AdminAccount>(API_ENDPOINTS.admin.verifyAccount(id));
  }

  suspendAccount(id: string): Observable<AdminAccount> {
    return this.api.patch<AdminAccount>(API_ENDPOINTS.admin.suspendAccount(id));
  }

  /**
   * Platform-wide impact report. The one caller is the admin Reports page —
   * `ReportService` covers the three per-role reports only, so this doesn't
   * duplicate it.
   */
  platformReport(): Observable<PlatformReport> {
    return this.api.get<PlatformReport>(API_ENDPOINTS.reports.platform);
  }
}
