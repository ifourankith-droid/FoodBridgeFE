import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '@env/environment';
import { API_ENDPOINTS } from '@core/config/api-endpoints';
import { ApiService, QueryParams } from '@core/http/api.service';
import { Certificate } from '@core/models/certificate.model';

/**
 * Certificate endpoints (Phase 8): list + PDF download.
 *
 * `GET /certificates/{id}` is intentionally not wrapped: `CertificateResponse` is
 * the same shape in the list as on its own, so a detail fetch would re-request data
 * the page already holds. Add it back if a deep-linked certificate view appears.
 */
@Injectable({ providedIn: 'root' })
export class CertificateService {
  private readonly api = inject(ApiService);
  private readonly http = inject(HttpClient);
  private readonly baseUrl = environment.apiUrl.replace(/\/+$/, '');

  /** The caller's own certificates, newest first. */
  list(page = 1, pageSize = 50): Observable<Certificate[]> {
    const params: QueryParams = { page, pageSize };
    return this.api.get<Certificate[]>(API_ENDPOINTS.certificates.base, params);
  }

  /** Fetch the certificate PDF as a blob (auth header attached by the interceptor). */
  downloadPdf(id: string): Observable<Blob> {
    return this.http.get(`${this.baseUrl}/${API_ENDPOINTS.certificates.pdf(id)}`, {
      responseType: 'blob',
    });
  }
}
