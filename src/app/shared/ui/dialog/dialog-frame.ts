import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  inject,
  Injector,
  input,
  viewChild,
  ViewContainerRef,
} from '@angular/core';
import { isObservable } from 'rxjs';
import { FbButton } from '@shared/ui/button/button';
import { DialogRef } from './dialog-ref';
import { DIALOG_DATA, DialogAction } from './dialog.model';

/**
 * Renders one dialog as a native modal `<dialog>`. Using the platform element
 * rather than a hand-rolled overlay is what makes "background completely
 * disabled" real: `showModal()` puts the panel in the top layer and marks
 * everything else inert, so the page behind cannot be clicked, tabbed into, or
 * read by a screen reader — no z-index juggling and no focus trap to maintain.
 *
 * Instantiated by {@link DialogHost}; not used directly.
 */
@Component({
  selector: 'app-dialog-frame',
  imports: [FbButton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <dialog
      #el
      class="dlg"
      [attr.data-size]="config().size"
      [attr.aria-labelledby]="config().header ? titleId : null"
      (cancel)="onEscape($event)"
      (click)="onBackdropClick($event)"
    >
      <div [class]="panelClasses()">
        @if (config().header; as header) {
          <div class="dlg-head">
            @if (header.icon) {
              <div class="dlg-icon" [style.background]="header.iconBg || 'var(--fb-primary-soft)'">
                <i [class]="header.icon"></i>
              </div>
            }
            <div class="min-w-0 flex-1">
              <h2 class="dlg-title" [id]="titleId">{{ header.title }}</h2>
              @if (header.subtitle) {
                <p class="dlg-subtitle">{{ header.subtitle }}</p>
              }
            </div>
            @if (showClose()) {
              <button type="button" class="btn-icon shrink-0" aria-label="Close dialog" (click)="dismiss()">
                <i class="fa-solid fa-xmark"></i>
              </button>
            }
          </div>
        }

        <div class="dlg-body">
          @if (config().message; as message) {
            <p class="dlg-message">{{ message }}</p>
          }
          <ng-container #bodyHost />
        </div>

        @if (config().actions.length) {
          <div class="dlg-foot">
            <div class="dlg-foot-group">
              @for (a of startActions(); track a.id) {
                <app-button
                  [variant]="a.variant ?? 'ghost'"
                  size="sm"
                  [icon]="a.icon ?? ''"
                  [loading]="busy() === a.id"
                  [disabled]="isDisabled(a)"
                  (clicked)="run(a)"
                >{{ a.label }}</app-button>
              }
            </div>
            <div class="dlg-foot-group">
              @for (a of endActions(); track a.id) {
                <app-button
                  [variant]="a.variant ?? 'solid'"
                  size="sm"
                  [icon]="a.icon ?? ''"
                  [loading]="busy() === a.id"
                  [disabled]="isDisabled(a)"
                  (clicked)="run(a)"
                >{{ a.label }}</app-button>
              }
            </div>
          </div>
        }
      </div>
    </dialog>
  `,
  styles: `
    /* The <dialog> itself is the full-viewport centring layer; the visible card
       is .dlg-panel inside it, so a click landing on the dialog element is a
       backdrop click. */
    .dlg {
      max-width: 100vw;
      max-height: 100dvh;
      width: 100%;
      height: 100%;
      margin: 0;
      padding: 20px;
      border: 0;
      background: transparent;
      overflow-y: auto;
      overscroll-behavior: contain;
    }
    .dlg:not([open]) {
      display: none;
    }
    .dlg[open] {
      display: flex;
      align-items: center;
      justify-content: center;
    }

    /* Literal colours: ::backdrop sits outside the normal cascade in older
       engines and cannot be relied on to inherit our CSS custom properties. */
    .dlg::backdrop {
      background: rgba(12, 26, 21, 0.55);
      backdrop-filter: blur(6px) saturate(120%);
      -webkit-backdrop-filter: blur(6px) saturate(120%);
      animation: dlg-fade 0.18s ease;
    }

    .dlg-panel {
      width: 100%;
      margin: auto;
      display: flex;
      flex-direction: column;
      max-height: calc(100dvh - 40px);
      background: var(--fb-surface);
      color: var(--fb-text);
      border: 1px solid var(--fb-line);
      border-radius: 20px;
      box-shadow: 0 24px 70px rgba(0, 0, 0, 0.32);
      animation: dlg-pop 0.2s cubic-bezier(0.22, 1, 0.36, 1);
      overflow: hidden;
    }
    .dlg[data-size='sm'] .dlg-panel {
      max-width: 420px;
    }
    .dlg[data-size='md'] .dlg-panel {
      max-width: 580px;
    }
    .dlg[data-size='lg'] .dlg-panel {
      max-width: 780px;
    }
    .dlg[data-size='xl'] .dlg-panel {
      max-width: 1000px;
    }
    .dlg[data-size='full'] .dlg-panel {
      max-width: none;
      min-height: calc(100dvh - 40px);
    }

    .dlg-head {
      display: flex;
      align-items: flex-start;
      gap: 12px;
      padding: 18px 20px;
      border-bottom: 1px solid var(--fb-line);
      flex-shrink: 0;
    }
    .dlg-icon {
      width: 42px;
      height: 42px;
      flex-shrink: 0;
      border-radius: 14px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 17px;
      color: var(--fb-primary-deep);
    }
    .dlg-title {
      font-size: 17px;
      font-weight: 700;
      line-height: 1.3;
    }
    .dlg-subtitle {
      font-size: 13px;
      color: var(--fb-muted);
      margin-top: 2px;
    }

    .dlg-body {
      padding: 20px;
      overflow-y: auto;
      flex: 1 1 auto;
    }

    /* allowOverflow — an anchored popover in the body (date picker, searchable
       select) is positioned against its field, so the scroll container would cut
       it off. Both boxes have to stop clipping for the panel to escape; the footer
       re-rounds its own corners since the panel no longer clips them. */
    .dlg-panel.allow-overflow,
    .dlg-panel.allow-overflow .dlg-body {
      overflow: visible;
    }
    .dlg-panel.allow-overflow .dlg-foot {
      border-bottom-left-radius: 20px;
      border-bottom-right-radius: 20px;
    }
    .dlg-message {
      font-size: 14px;
      line-height: 1.6;
      color: var(--fb-text);
    }
    /* A message plus a projected component reads as two blocks. */
    .dlg-message:not(:only-child) {
      margin-bottom: 14px;
    }

    .dlg-foot {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      flex-wrap: wrap;
      padding: 14px 20px;
      border-top: 1px solid var(--fb-line);
      background: var(--fb-bg);
      flex-shrink: 0;
    }
    .dlg-foot-group {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    /* With no start actions the end group still hugs the right edge. */
    .dlg-foot-group:last-child {
      margin-left: auto;
    }

    @keyframes dlg-fade {
      from {
        opacity: 0;
      }
    }
    @keyframes dlg-pop {
      from {
        opacity: 0;
        transform: translateY(12px) scale(0.97);
      }
    }
    @media (prefers-reduced-motion: reduce) {
      .dlg-panel,
      .dlg::backdrop {
        animation: none;
      }
    }
  `,
})
export class DialogFrame {
  readonly dialogRef = input.required<DialogRef>();

  private readonly el = viewChild.required<ElementRef<HTMLDialogElement>>('el');
  private readonly bodyHost = viewChild.required('bodyHost', { read: ViewContainerRef });
  private readonly injector = inject(Injector);

  protected readonly titleId = `dlg-title-${Math.random().toString(36).slice(2, 9)}`;

  protected readonly config = computed(() => this.dialogRef().config());
  protected readonly busy = computed(() => this.dialogRef().busyAction());
  protected readonly showClose = computed(() => {
    const cfg = this.config();
    return !cfg.disableClose && (cfg.header?.showClose ?? true);
  });
  protected readonly panelClasses = computed(() => {
    const cfg = this.config();
    return ['dlg-panel', cfg.panelClass ?? '', cfg.allowOverflow ? 'allow-overflow' : '']
      .filter(Boolean)
      .join(' ');
  });

  protected readonly startActions = computed(() =>
    this.config().actions.filter((a) => a.align === 'start'),
  );
  protected readonly endActions = computed(() =>
    this.config().actions.filter((a) => a.align !== 'start'),
  );

  constructor() {
    afterNextRender(() => {
      this.mountBody();
      this.el().nativeElement.showModal();
    });

    // Leaving an open dialog in the top layer as its element is torn down
    // confuses the browser's modal bookkeeping — close it first.
    inject(DestroyRef).onDestroy(() => {
      const el = this.el().nativeElement;
      if (el.open) {
        el.close();
      }
    });
  }

  /** Instantiate the body component with DIALOG_DATA + DialogRef available to it. */
  private mountBody(): void {
    const ref = this.dialogRef();
    const cfg = ref.config();
    if (!cfg.content) {
      return;
    }
    const injector = Injector.create({
      parent: this.injector,
      providers: [
        { provide: DIALOG_DATA, useValue: cfg.data ?? null },
        { provide: DialogRef, useValue: ref },
      ],
    });
    const created = this.bodyHost().createComponent(cfg.content, { injector });
    for (const [key, value] of Object.entries(cfg.inputs ?? {})) {
      created.setInput(key, value);
    }
    ref.attachBody(created.instance);
  }

  protected isDisabled(action: DialogAction): boolean {
    const busy = this.busy();
    if (busy && busy !== action.id) {
      return true;
    }
    return typeof action.disabled === 'function' ? action.disabled() : !!action.disabled;
  }

  /**
   * Run an action. `close: true` dismisses straight away; otherwise the handler
   * decides, and any Promise/Observable it returns keeps the button spinning.
   */
  protected run(action: DialogAction): void {
    const ref = this.dialogRef();
    if (ref.busyAction() || ref.isClosed) {
      return;
    }
    if (action.close) {
      ref.close(action.result);
      return;
    }

    const work = action.handler?.(ref);
    if (!work) {
      return;
    }

    ref.busyAction.set(action.id);
    const done = () => {
      if (!ref.isClosed) {
        ref.busyAction.set(null);
      }
    };
    // Escalate a rejected handler to the global error handler rather than
    // swallowing it — the dialog just stops spinning and stays open.
    const fail = (err: unknown) => {
      done();
      queueMicrotask(() => {
        throw err;
      });
    };

    if (isObservable(work)) {
      work.subscribe({ complete: done, error: fail });
    } else {
      work.then(done, fail);
    }
  }

  /** Esc — the browser fires `cancel`; we always take over so `disableClose` holds. */
  protected onEscape(event: Event): void {
    event.preventDefault();
    this.dismiss();
  }

  protected onBackdropClick(event: MouseEvent): void {
    // Clicks on the padding area (or the ::backdrop) target the dialog element
    // itself; anything inside the panel targets a descendant.
    if (event.target === this.el().nativeElement) {
      this.dismiss();
    }
  }

  /** Close via Esc, backdrop or ✕ — blocked while an action is mid-flight. */
  protected dismiss(): void {
    const ref = this.dialogRef();
    if (ref.config().disableClose || ref.busyAction()) {
      return;
    }
    ref.close();
  }
}
