import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { API_ENDPOINTS } from '../config/api-endpoints';
import { ApiService } from '../http/api.service';
import { UpdateProfileBody, UserProfile } from '../models/user.model';
import { UserDocumentType, UserVerification } from '../models/verification.model';

/** Result of POST /users/{id}/avatar. */
export interface AvatarUploadResult {
  avatarUrl: string;
}

/**
 * User / Profile endpoints (Phase 3): GET/PUT profile, availability toggle,
 * avatar upload. All require an authenticated JWT (attached by the interceptor).
 */
@Injectable({ providedIn: 'root' })
export class UserService {
  private readonly api = inject(ApiService);

  getProfile(id: string): Observable<UserProfile> {
    return this.api.get<UserProfile>(API_ENDPOINTS.users.byId(id));
  }

  updateProfile(id: string, body: UpdateProfileBody): Observable<UserProfile> {
    return this.api.put<UserProfile>(API_ENDPOINTS.users.byId(id), body);
  }

  /** Toggle availability — volunteers & recipients only. */
  setAvailability(id: string, isAvailable: boolean): Observable<UserProfile> {
    return this.api.patch<UserProfile>(API_ENDPOINTS.users.availability(id), { isAvailable });
  }

  /** Upload a profile photo (multipart, any browser-renderable image, max 2MB). */
  uploadAvatar(id: string, file: File): Observable<AvatarUploadResult> {
    const form = new FormData();
    form.append('file', file);
    return this.api.post<AvatarUploadResult>(API_ENDPOINTS.users.avatar(id), form);
  }

  /**
   * Verification status and submitted documents. Self, or an admin reviewing the account —
   * both read the same payload so the two screens can never disagree.
   */
  getVerification(id: string): Observable<UserVerification> {
    return this.api.get<UserVerification>(API_ENDPOINTS.users.verification(id));
  }

  /**
   * Upload or replace one verification document (multipart, image or PDF, max 5MB; a Selfie must
   * be an image). Re-uploading the same `type` replaces it server-side and deletes the old file,
   * so a bad photo can simply be retaken. Returns the refreshed verification state.
   */
  uploadDocument(id: string, type: UserDocumentType, file: File): Observable<UserVerification> {
    const form = new FormData();
    form.append('file', file);
    form.append('type', type);
    return this.api.post<UserVerification>(API_ENDPOINTS.users.documents(id), form);
  }
}
