import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { FbLogo } from '@shared/ui/logo/logo';

@Component({
  selector: 'app-auth-layout',
  imports: [RouterOutlet, FbLogo],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './auth-layout.html',
  styles: `
    .auth-shell {
      display: grid;
      grid-template-columns: 1fr;
      height: 100dvh;
      overflow: hidden;
    }
    @media (min-width: 1024px) {
      .auth-shell {
        grid-template-columns: 1.1fr 1fr;
      }
    }

    /* ---------- Left brand panel ---------- */
    .auth-brand {
      display: none;
    }
    @media (min-width: 1024px) {
      .auth-brand {
        display: flex;
        position: relative;
        overflow: hidden;
        color: #fff;
        background: linear-gradient(
          160deg,
          var(--fb-primary-deep) 0%,
          var(--fb-primary) 55%,
          var(--fb-primary-bright) 100%
        );
      }
    }
    .auth-brand::before {
      content: '';
      position: absolute;
      width: 520px;
      height: 520px;
      border-radius: 50%;
      top: -160px;
      right: -140px;
      background: rgba(255, 255, 255, 0.12);
    }
    .auth-brand::after {
      content: '';
      position: absolute;
      width: 360px;
      height: 360px;
      border-radius: 50%;
      bottom: -120px;
      left: -110px;
      background: rgb(var(--fb-accent-rgb) / 0.35);
      filter: blur(8px);
    }
    .auth-brand-content {
      position: relative;
      z-index: 1;
      display: flex;
      flex-direction: column;
      gap: clamp(20px, 4vh, 40px);
      padding: clamp(28px, 5vh, 56px);
      width: 100%;
      /* Scroll internally on very short screens instead of cropping content. */
      overflow-y: auto;
      min-height: 0;
    }
    .auth-brand-top {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .auth-brand-name {
      font-size: 20px;
      font-weight: 700;
      letter-spacing: -0.01em;
    }
    .auth-brand-title {
      font-size: clamp(30px, 3vw, 44px);
      line-height: 1.05;
      font-weight: 800;
      letter-spacing: -0.03em;
      margin: 0 0 clamp(12px, 2vh, 18px);
    }
    .auth-brand-desc {
      font-size: 15px;
      line-height: 1.6;
      color: rgba(255, 255, 255, 0.88);
      max-width: 440px;
      margin: 0 0 clamp(18px, 3vh, 30px);
    }
    .auth-brand-features {
      list-style: none;
      padding: 0;
      margin: 0;
      display: flex;
      flex-direction: column;
      gap: clamp(10px, 1.8vh, 16px);
    }
    .auth-brand-features li {
      display: flex;
      align-items: center;
      gap: 14px;
      font-size: 15px;
      font-weight: 500;
    }
    .feat-ic {
      width: 38px;
      height: 38px;
      border-radius: 12px;
      background: rgba(255, 255, 255, 0.16);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 15px;
      flex-shrink: 0;
    }
    .auth-brand-stats {
      display: flex;
      align-items: center;
      gap: 22px;
      /* Sit at the bottom when there's room; flow naturally when space is tight. */
      margin-top: auto;
      flex-wrap: wrap;
    }
    .auth-brand-stats .num {
      font-size: 26px;
      font-weight: 800;
      letter-spacing: -0.02em;
    }
    .auth-brand-stats .lbl {
      font-size: 12px;
      color: rgba(255, 255, 255, 0.8);
    }
    .auth-brand-stats .sep {
      width: 1px;
      height: 38px;
      background: rgba(255, 255, 255, 0.25);
    }

    /* ---------- Right form panel ---------- */
    .auth-form-panel {
      display: flex;
      overflow-y: auto;
      min-height: 0;
      background: var(--fb-bg);
    }
    .auth-form-scroll {
      margin: auto;
      width: 100%;
      padding: 48px 28px;
    }
    @media (min-width: 1024px) {
      .auth-form-scroll {
        padding: 56px 64px;
      }
    }
    .auth-mobile-brand {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 10px;
      margin-bottom: 34px;
      font-weight: 700;
      font-size: 19px;
    }
    @media (min-width: 1024px) {
      .auth-mobile-brand {
        display: none;
      }
    }
  `,
})
export class AuthLayout { }
