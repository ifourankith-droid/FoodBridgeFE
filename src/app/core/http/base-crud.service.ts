import { inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService, QueryParams } from './api.service';

/**
 * Generic CRUD base service. Feature services extend this and declare a
 * `resource` path to get typed getAll/getById/create/update/patch/remove
 * for free, backed by ApiService.
 *
 * @example
 * @Injectable({ providedIn: 'root' })
 * export class UserService extends BaseCrudService<User> {
 *   protected readonly resource = 'users';
 * }
 */
export abstract class BaseCrudService<T, TCreate = Partial<T>, TUpdate = Partial<T>> {
  protected readonly api = inject(ApiService);

  /** REST resource path, e.g. `'users'` or `'listings'`. */
  protected abstract readonly resource: string;

  getAll(params?: QueryParams): Observable<T[]> {
    return this.api.get<T[]>(this.resource, params);
  }

  getById(id: string | number): Observable<T> {
    return this.api.get<T>(`${this.resource}/${id}`);
  }

  create(payload: TCreate): Observable<T> {
    return this.api.post<T>(this.resource, payload);
  }

  update(id: string | number, payload: TUpdate): Observable<T> {
    return this.api.put<T>(`${this.resource}/${id}`, payload);
  }

  patch(id: string | number, payload: Partial<TUpdate>): Observable<T> {
    return this.api.patch<T>(`${this.resource}/${id}`, payload);
  }

  remove(id: string | number): Observable<void> {
    return this.api.delete<void>(`${this.resource}/${id}`);
  }
}
