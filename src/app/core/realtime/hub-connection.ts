import {
  HubConnection,
  HubConnectionBuilder,
  HubConnectionState,
  LogLevel,
} from '@microsoft/signalr';
import { environment } from '@env/environment';

/** Reconnect backoff (ms). After the last entry SignalR stops retrying. */
const RETRY_DELAYS = [0, 2000, 5000, 10000, 30000];

/**
 * Build a `HubConnection` for one of the backend's hubs.
 *
 * Two things here are not optional:
 *
 * 1. **`accessTokenFactory`, not a header.** Both hubs are `[Authorize]`, and the
 *    WebSocket transport cannot send an `Authorization` header — so SignalR appends
 *    the token as an `access_token` query param instead. The backend's
 *    `JwtBearerEvents.OnMessageReceived` honours that, but only for paths under
 *    `/hubs`. The factory is re-read on every (re)connect, so a refreshed token is
 *    picked up without rebuilding the connection.
 *
 * 2. **The URL is origin-root, not under `environment.apiUrl`.** The backend maps
 *    hubs at `/hubs/…`; `/api` is a sibling. In dev both are proxied (`/hubs` needs
 *    `"ws": true` in `proxy.conf.json` for the upgrade to get through).
 *
 * @param path hub path relative to the hub root, e.g. `'notifications'`.
 * @param token called on every connect attempt; return the current JWT or null.
 */
export function buildHubConnection(path: string, token: () => string | null): HubConnection {
  const root = environment.hubUrl.replace(/\/+$/, '');
  const url = `${root}/${path.replace(/^\/+/, '')}`;

  return new HubConnectionBuilder()
    .withUrl(url, { accessTokenFactory: () => token() ?? '' })
    .withAutomaticReconnect(RETRY_DELAYS)
    .configureLogging(environment.production ? LogLevel.Warning : LogLevel.Information)
    .build();
}

/** True when the connection exists and is usable for `invoke`/`send` right now. */
export function isLive(connection: HubConnection | null): boolean {
  return connection?.state === HubConnectionState.Connected;
}
