import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { API_ENDPOINTS } from '@core/config/api-endpoints';
import { ApiService } from '@core/http/api.service';
import { DonorReport, RecipientReport, VolunteerReport } from '@core/models/report.model';

/**
 * Chart-ready impact reports (Phase 8/9), role-scoped via the JWT.
 *
 * The admin-only platform report lives on `AdminService.platformReport()` — it
 * used to be declared here too, and two names for one endpoint meant neither got
 * wired up.
 */
@Injectable({ providedIn: 'root' })
export class ReportService {
  private readonly api = inject(ApiService);

  donor(): Observable<DonorReport> {
    return this.api.get<DonorReport>(API_ENDPOINTS.reports.donor);
  }

  volunteer(): Observable<VolunteerReport> {
    return this.api.get<VolunteerReport>(API_ENDPOINTS.reports.volunteer);
  }

  recipient(): Observable<RecipientReport> {
    return this.api.get<RecipientReport>(API_ENDPOINTS.reports.recipient);
  }
}
