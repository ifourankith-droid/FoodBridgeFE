import { environment } from '@env/environment';

/**
 * Origin the API is served from, derived from `environment.apiUrl` by dropping the trailing `/api`.
 *
 * - **dev** — `apiUrl` is `/api`, so this is `''` and media URLs stay relative. The Angular dev
 *   server's `/uploads` proxy entry then forwards them, exactly as before.
 * - **prod** — `apiUrl` is `https://foodbridge-api.azurewebsites.net/api`, so this is the API's
 *   origin and media URLs become absolute against it.
 *
 * Deriving it rather than adding another environment key means there is no second value that can
 * drift out of step with `apiUrl`.
 */
const API_ORIGIN = environment.apiUrl.replace(/\/api\/?$/, '');

/**
 * Resolves a server-relative media path (`/uploads/…`) to somewhere the browser can actually fetch.
 *
 * Necessary because the frontend and the API are on **different origins** in production: the API
 * returns `/uploads/abc.jpg`, and a browser resolves that against the *frontend's* origin, where
 * nothing is served — so every listing photo, avatar, and volunteer ID document would 404. Anything
 * consuming `imageUrl` / `avatarUrl` / `fileUrl` / `photoUrl` from the API must pass it through here.
 *
 * Passes through unchanged:
 * - already-absolute URLs (`http:`, `https:`) — e.g. a future blob-storage URL
 * - `data:` and `blob:` URLs — local previews from the image picker, which have no server origin
 * - null/undefined/empty — callers decide their own fallback
 */
export function mediaUrl(url: string | null | undefined): string | null {
  if (!url) {
    return null;
  }

  if (/^(https?:|data:|blob:)/i.test(url)) {
    return url;
  }

  // Guard the join rather than assuming a leading slash, so '/uploads/x' and 'uploads/x' both work.
  return `${API_ORIGIN}${url.startsWith('/') ? '' : '/'}${url}`;
}
