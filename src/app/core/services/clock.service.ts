import { Injectable, signal } from '@angular/core';

/**
 * App-wide ticking clock. A single interval updates `now` every 30s so many
 * time-relative UI elements (deadline meters, "x ago" labels) stay fresh
 * without each spinning up its own timer.
 */
@Injectable({ providedIn: 'root' })
export class ClockService {
  readonly now = signal(Date.now());

  constructor() {
    setInterval(() => this.now.set(Date.now()), 30_000);
  }
}
