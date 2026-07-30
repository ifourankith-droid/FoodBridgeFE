import { inject, Injectable } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { RouterStateSnapshot, TitleStrategy } from '@angular/router';

/** App brand shown in the browser tab. */
export const APP_NAME = 'FoodBridge';

/**
 * Sets the document title on every navigation as `FoodBridge · <Page>`,
 * reading the per-route `title` (wired from APP_VIEWS in app.routes.ts).
 * Routes without a title fall back to the bare brand name.
 */
@Injectable({ providedIn: 'root' })
export class AppTitleStrategy extends TitleStrategy {
  private readonly title = inject(Title);

  override updateTitle(snapshot: RouterStateSnapshot): void {
    const page = this.buildTitle(snapshot);
    this.title.setTitle(page ? `${APP_NAME} · ${page}` : APP_NAME);
  }
}
