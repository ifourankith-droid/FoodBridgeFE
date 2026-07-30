import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { DialogService } from '@core/services/dialog.service';
import { DialogFrame } from './dialog-frame';

/**
 * Renders every dialog on {@link DialogService}'s stack. Mount once, next to
 * `<app-toast />` in `app.html`; nothing else should reference it.
 */
@Component({
  selector: 'app-dialog-host',
  imports: [DialogFrame],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @for (ref of dialog.stack(); track ref.id) {
      <app-dialog-frame [dialogRef]="ref" />
    }
  `,
})
export class DialogHost {
  protected readonly dialog = inject(DialogService);
}
