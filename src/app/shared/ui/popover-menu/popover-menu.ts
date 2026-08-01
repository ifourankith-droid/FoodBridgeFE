import { NgClass, NgTemplateOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  contentChild,
  DestroyRef,
  Directive,
  effect,
  ElementRef,
  inject,
  input,
  model,
  signal,
  TemplateRef,
  viewChild,
} from '@angular/core';
import { FbScrollLock } from '@shared/directives/scroll-lock.directive';

/**
 * Marks the `<ng-template>` that holds a popover's panel body. Kept as a
 * template (rather than projected DOM) so the SAME markup can be stamped into
 * either the anchored desktop popover or the mobile modal, without duplicating
 * it — only one is ever live at a time.
 *
 * @example
 * <ng-template fbPanel> …panel content… </ng-template>
 */
@Directive({ selector: 'ng-template[fbPanel]' })
export class FbPopoverPanel {
  readonly template = inject<TemplateRef<unknown>>(TemplateRef);
}

/**
 * Optional rich content for the left of the mobile modal's header bar — the
 * account menu puts the signed-in name and role pill there. Without one the bar
 * falls back to the `heading` text.
 *
 * @example
 * <ng-template fbPanelHeader> …name + role… </ng-template>
 */
@Directive({ selector: 'ng-template[fbPanelHeader]' })
export class FbPopoverHeader {
  readonly template = inject<TemplateRef<unknown>>(TemplateRef);
}

/**
 * Responsive menu wrapper. On wide screens it renders its panel as a popover
 * anchored to the trigger (the classic dropdown); on small screens it renders
 * the same panel as a centred modal in a native `<dialog>` — top layer, inert
 * background, dimmed/blurred backdrop — matching the app's common dialog.
 *
 * Give it a trigger (any element tagged `fbTrigger`) and a panel
 * (`<ng-template fbPanel>`); the wrapper owns open/close, click-away, Esc and
 * the modal lifecycle. `open` is two-way so the host keeps its own state.
 *
 * The modal carries its own close button and is sized to leave a backdrop margin
 * on every side, so it can be dismissed by tapping outside as well as by Esc.
 *
 * @example
 * <app-popover-menu [(open)]="menuOpen" align="end" panelClass="w-[300px]">
 *   <button fbTrigger (click)="menuOpen.set(!menuOpen())">…</button>
 *   <ng-template fbPanel> …items… </ng-template>
 * </app-popover-menu>
 */
@Component({
  selector: 'app-popover-menu',
  imports: [NgClass, NgTemplateOutlet, FbScrollLock],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(document:pointerdown)': 'onDocumentPointerDown($event)',
    '(document:keydown.escape)': 'onEscape()',
  },
  template: `
    <ng-content select="[fbTrigger]" />

    @if (open() && !asModal()) {
      <div
        class="pm-popover"
        [ngClass]="panelClass()"
        [class.pm-end]="align() === 'end'"
        [class.pm-up]="dropUp()"
        role="dialog"
        [attr.aria-label]="ariaLabel() || null"
      >
        <ng-container [ngTemplateOutlet]="panelTemplate()" />
      </div>
    }

    <dialog
      #dlg
      class="pm-dialog"
      [fbScrollLock]="open() && asModal()"
      [attr.aria-label]="ariaLabel() || null"
      (cancel)="onDialogCancel($event)"
      (click)="onDialogClick($event)"
    >
      <div class="pm-modal">
        @if (open() && asModal()) {
          <!-- Its own row rather than an overlay in the corner: panels bring
               their own headers (the notification panel puts "Mark all read"
               top-right), and a floating cross would land on top of them.
               Title on the left, close on the right. -->
          <div class="pm-modal-bar" [class.has-title]="hasTitle()">
            <div class="pm-modal-title">
              @if (headerTemplate(); as header) {
                <ng-container [ngTemplateOutlet]="header" />
              } @else if (headingText()) {
                <span class="pm-heading">{{ headingText() }}</span>
              }
            </div>
            <button type="button" class="pm-close" aria-label="Close" (click)="open.set(false)">
              <i class="fa-solid fa-xmark" aria-hidden="true"></i>
            </button>
          </div>
          <div class="pm-modal-scroll">
            <ng-container [ngTemplateOutlet]="panelTemplate()" />
          </div>
        }
      </div>
    </dialog>
  `,
  styles: `
    :host {
      position: relative;
      display: block;
    }

    /* ---- Desktop: anchored popover ---- */
    .pm-popover {
      position: absolute;
      top: calc(100% + 8px);
      left: 0;
      z-index: 1050;
      max-height: min(70vh, 560px);
      overflow-y: auto;
      overscroll-behavior: contain;
      background: var(--fb-surface);
      border: 1px solid var(--fb-line);
      border-radius: 16px;
      box-shadow: var(--fb-shadow-lg);
      animation: pm-pop 0.16s ease;
    }
    .pm-popover.pm-end {
      left: auto;
      right: 0;
    }
    .pm-popover.pm-up {
      top: auto;
      bottom: calc(100% + 8px);
    }

    /* ---- Mobile: centred modal in the top layer ---- */
    /* The <dialog> is the full-viewport centring layer; the card is .pm-modal,
       so a click landing on the dialog element itself is a backdrop click. */
    .pm-dialog {
      max-width: 100vw;
      max-height: 100dvh;
      width: 100%;
      height: 100%;
      margin: 0;
      padding: 16px;
      border: 0;
      background: transparent;
      overflow: hidden;
    }
    .pm-dialog:not([open]) {
      display: none;
    }
    .pm-dialog[open] {
      display: flex;
      align-items: center;
      justify-content: center;
    }
    /* Literal colours: ::backdrop sits outside the normal cascade and can't be
       relied on to inherit our CSS custom properties. */
    .pm-dialog::backdrop {
      background: rgba(12, 26, 21, 0.55);
      backdrop-filter: blur(6px) saturate(120%);
      -webkit-backdrop-filter: blur(6px) saturate(120%);
      animation: pm-fade 0.18s ease;
    }
    .pm-modal {
      width: 100%;
      /* Deliberately short of the viewport on both axes: the card used to fill
         all but the dialog's 16px padding, leaving a ring too thin to aim at, so
         the only way out was Esc. This keeps ~24px either side and ~64px above
         and below as backdrop — .pm-dialog handles a click landing there. */
      max-width: min(440px, calc(100vw - 48px));
      max-height: calc(100dvh - 128px);
      margin: auto;
      display: flex;
      flex-direction: column;
      background: var(--fb-surface);
      color: var(--fb-text);
      border: 1px solid var(--fb-line);
      border-radius: 20px;
      box-shadow: 0 24px 70px rgba(0, 0, 0, 0.32);
      overflow: hidden;
      animation: pm-modal-pop 0.2s cubic-bezier(0.22, 1, 0.36, 1);
    }
    .pm-modal-bar {
      flex: none;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      padding: 8px 8px 8px 16px;
    }
    /* Only a bar that says something earns a rule under it — otherwise it would
       draw a stray line above the panel's own header. */
    .pm-modal-bar.has-title {
      border-bottom: 1px solid var(--fb-line);
    }
    /* mr-auto rather than a shared justify rule: the title stays hard against
       the bar's left edge whatever the panel puts in it, and the close button is
       the only thing on the right. */
    .pm-modal-title {
      flex: 1 1 auto;
      min-width: 0;
      margin-right: auto;
      text-align: left;
    }
    .pm-heading {
      display: block;
      font-size: 14.5px;
      font-weight: 700;
      color: var(--fb-ink);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .pm-close {
      display: grid;
      place-items: center;
      width: 32px;
      height: 32px;
      border: 0;
      border-radius: 10px;
      background: var(--fb-bg);
      color: var(--fb-muted);
      font-size: 14px;
      cursor: pointer;
    }
    .pm-close:hover {
      color: var(--fb-ink);
    }
    .pm-close:focus-visible {
      outline: none;
      box-shadow: var(--fb-ring);
    }
    .pm-modal-scroll {
      flex: 1 1 auto;
      min-height: 0;
      overflow-y: auto;
      overscroll-behavior: contain;
    }

    @keyframes pm-pop {
      from {
        opacity: 0;
        transform: translateY(-4px);
      }
    }
    @keyframes pm-fade {
      from {
        opacity: 0;
      }
    }
    @keyframes pm-modal-pop {
      from {
        opacity: 0;
        transform: translateY(12px) scale(0.97);
      }
    }
    @media (prefers-reduced-motion: reduce) {
      .pm-popover,
      .pm-modal,
      .pm-dialog::backdrop {
        animation: none;
      }
    }
  `,
})
export class FbPopoverMenu {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  /** Open state — two-way bound so the host component keeps ownership. */
  readonly open = model(false);
  /** Horizontal edge the desktop popover aligns to. */
  readonly align = input<'start' | 'end'>('start');
  /** Extra classes for the desktop popover (typically a width, e.g. `w-[300px]`). */
  readonly panelClass = input('');
  /** Accessible label for the popover / modal. */
  readonly ariaLabel = input('');
  /**
   * Title shown at the left of the mobile modal's header bar — "what this is
   * for". Defaults to {@link ariaLabel}; pass `''` to suppress it where the
   * panel already renders a header of its own, and use an
   * `<ng-template fbPanelHeader>` where the title needs more than text.
   */
  readonly heading = input<string | null>(null);
  /** When false, stays an anchored popover even on small screens. */
  readonly modalOnMobile = input(true);
  /** Estimated panel height (px) used to decide desktop drop direction. */
  readonly estimatedHeight = input(360);

  private readonly panel = contentChild.required(FbPopoverPanel);
  protected readonly panelTemplate = computed(() => this.panel().template);

  private readonly header = contentChild(FbPopoverHeader);
  protected readonly headerTemplate = computed(() => this.header()?.template ?? null);
  protected readonly headingText = computed(() => this.heading() ?? this.ariaLabel());
  protected readonly hasTitle = computed(() => !!(this.headerTemplate() || this.headingText()));

  private readonly dlg = viewChild<ElementRef<HTMLDialogElement>>('dlg');

  protected readonly dropUp = signal(false);
  protected readonly isMobile = signal(false);
  /** Render as a centred modal (small screen + not opted out). */
  protected readonly asModal = computed(() => this.isMobile() && this.modalOnMobile());

  constructor() {
    // Track the small-screen breakpoint.
    if (typeof window !== 'undefined' && window.matchMedia) {
      const mq = window.matchMedia('(max-width: 640px)');
      this.isMobile.set(mq.matches);
      const onChange = (e: MediaQueryListEvent) => this.isMobile.set(e.matches);
      mq.addEventListener('change', onChange);
      inject(DestroyRef).onDestroy(() => mq.removeEventListener('change', onChange));
    }

    // Drive the native modal on small screens. Keeping the <dialog> in the DOM
    // and toggling showModal()/close() (rather than adding/removing it) keeps the
    // browser's top-layer bookkeeping happy.
    effect(() => {
      const el = this.dlg()?.nativeElement;
      if (!el) {
        return;
      }
      const show = this.open() && this.asModal();
      if (show && !el.open) {
        el.showModal();
      } else if (!show && el.open) {
        el.close();
      }
    });

    // Decide drop direction against the viewport when opening as a popover.
    effect(() => {
      if (this.open() && !this.asModal() && typeof window !== 'undefined') {
        const rect = this.host.nativeElement.getBoundingClientRect();
        const below = window.innerHeight - rect.bottom;
        this.dropUp.set(below < this.estimatedHeight() && rect.top > below);
      }
    });
  }

  /** Desktop click-away: a pointer down outside the trigger + popover closes it. */
  protected onDocumentPointerDown(event: PointerEvent): void {
    if (!this.open() || this.asModal()) {
      return;
    }
    if (!this.host.nativeElement.contains(event.target as Node)) {
      this.open.set(false);
    }
  }

  protected onEscape(): void {
    if (this.open() && !this.asModal()) {
      this.open.set(false);
    }
  }

  /** Esc inside the modal — take over so we control the close. */
  protected onDialogCancel(event: Event): void {
    event.preventDefault();
    this.open.set(false);
  }

  /** A click on the dialog element itself (the padding / backdrop) dismisses. */
  protected onDialogClick(event: MouseEvent): void {
    if (event.target === this.dlg()?.nativeElement) {
      this.open.set(false);
    }
  }
}
