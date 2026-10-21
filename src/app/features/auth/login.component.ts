import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { AdminAuthService } from '../../core/services/auth/admin-auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [ReactiveFormsModule, CommonModule],
  template: `
    <div class="login-page">
      <div class="login-card">

        <!-- Brand -->
        <div class="login-brand">
          <div class="brand-mark">S</div>
          <h1 class="brand-name">Scholo Admin</h1>
          <p class="brand-sub">Sign in to your workspace</p>
        </div>

        <!-- Google sign-in -->
        <button
          type="button"
          class="google-btn"
          (click)="signInWithGoogle()"
          [disabled]="loading() || googleLoading()"
        >
          <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
            <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84c-.21 1.13-.84 2.09-1.8 2.73v2.27h2.91c1.7-1.57 2.69-3.88 2.69-6.64z"/>
            <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.17l-2.91-2.27c-.8.54-1.83.86-3.05.86-2.35 0-4.34-1.59-5.05-3.72H.95v2.34C2.44 15.98 5.48 18 9 18z"/>
            <path fill="#FBBC05" d="M3.95 10.7c-.18-.54-.28-1.11-.28-1.7s.1-1.16.28-1.7V4.96H.95C.35 6.17 0 7.55 0 9s.35 2.83.95 4.04l3-2.34z"/>
            <path fill="#EA4335" d="M9 3.58c1.32 0 2.51.46 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0 5.48 0 2.44 2.02.95 4.96l3 2.34C4.66 5.17 6.65 3.58 9 3.58z"/>
          </svg>
          <span>{{ googleLoading() ? 'Signing in…' : 'Continue with Google' }}</span>
        </button>

        <!-- Divider -->
        <div class="divider"><span>or sign in with email</span></div>

        <!-- Email / password form -->
        <form [formGroup]="form" (ngSubmit)="submit()" class="login-form">
          <div class="field">
            <label for="email">Email address</label>
            <input
              id="email"
              type="email"
              formControlName="email"
              class="input"
              placeholder="you@scholo.co.in"
              autocomplete="email"
            />
          </div>

          <div class="field">
            <label for="password">Password</label>
            <input
              id="password"
              type="password"
              formControlName="password"
              class="input"
              placeholder="••••••••"
              autocomplete="current-password"
            />
          </div>

          <div class="error-message" *ngIf="error()">{{ error() }}</div>

          <button
            type="submit"
            class="submit-btn"
            [disabled]="loading() || googleLoading() || form.invalid"
          >
            {{ loading() ? 'Signing in…' : 'Sign in' }}
          </button>
        </form>

        <!-- Note -->
        <p class="access-note">Access is limited to Scholo teachers and administrators.</p>

      </div>
    </div>
  `,
  styles: [`
    .login-page {
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--surface-app);
      padding: 24px;
    }

    .login-card {
      background: var(--surface-primary);
      border: 1px solid var(--border-default);
      border-radius: var(--r-2xl);
      box-shadow: var(--shadow-xl);
      padding: 36px;
      width: 100%;
      max-width: 368px;
    }

    /* Brand */
    .login-brand {
      text-align: center;
      margin-bottom: 28px;
    }

    .brand-mark {
      width: 44px;
      height: 44px;
      background: var(--brand);
      border-radius: 12px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 700;
      font-size: 20px;
      color: #fff;
      margin: 0 auto 14px;
      letter-spacing: -0.02em;
    }

    .brand-name {
      margin: 0 0 4px;
      font-size: 18px;
      font-weight: 700;
      color: var(--text-primary);
      letter-spacing: -0.02em;
    }

    .brand-sub {
      margin: 0;
      font-size: 13px;
      color: var(--text-muted);
    }

    /* Google button */
    .google-btn {
      width: 100%;
      height: 40px;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 10px;
      background: var(--surface-primary);
      color: var(--text-secondary);
      border: 1px solid var(--border-strong);
      border-radius: var(--r-md);
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      transition: background var(--dur-base), border-color var(--dur-base);
      outline: none;
      margin-bottom: 20px;
    }

    .google-btn:hover:not(:disabled) {
      background: var(--surface-hover);
      border-color: var(--border-strong);
    }

    .google-btn:focus-visible {
      box-shadow: 0 0 0 2px var(--surface-primary), 0 0 0 4px var(--border-focus);
    }

    .google-btn:disabled { opacity: 0.55; cursor: not-allowed; }

    /* Divider */
    .divider {
      display: flex;
      align-items: center;
      gap: 12px;
      color: var(--text-muted);
      font-size: 12px;
      margin-bottom: 20px;
    }
    .divider::before, .divider::after {
      content: '';
      flex: 1;
      height: 1px;
      background: var(--border-default);
    }

    /* Form */
    .login-form { display: flex; flex-direction: column; gap: 14px; }

    .field { display: flex; flex-direction: column; gap: 5px; }

    label {
      font-size: 12px;
      font-weight: 500;
      color: var(--text-secondary);
    }

    .input {
      height: 38px;
      padding: 0 12px;
      background: var(--surface-primary);
      border: 1px solid var(--border-default);
      border-radius: var(--r-md);
      color: var(--text-primary);
      font-size: 14px;
      outline: none;
      transition: border-color var(--dur-base), box-shadow var(--dur-base);
    }

    .input::placeholder { color: var(--text-placeholder); }

    .input:focus {
      border-color: var(--border-focus);
      box-shadow: 0 0 0 3px var(--border-focus-ring);
    }

    .error-message {
      background: var(--danger-bg);
      border: 1px solid rgba(239, 68, 68, 0.2);
      color: var(--danger-text);
      padding: 9px 12px;
      border-radius: var(--r-sm);
      font-size: 13px;
    }

    .submit-btn {
      height: 40px;
      background: var(--brand);
      color: #fff;
      border: none;
      border-radius: var(--r-md);
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      outline: none;
      transition: background var(--dur-base);
      margin-top: 4px;
    }

    .submit-btn:hover:not(:disabled) { background: var(--brand-hover); }
    .submit-btn:disabled { opacity: 0.55; cursor: not-allowed; }
    .submit-btn:focus-visible {
      box-shadow: 0 0 0 2px var(--surface-primary), 0 0 0 4px var(--border-focus);
    }

    .access-note {
      margin: 20px 0 0;
      text-align: center;
      font-size: 12px;
      color: var(--text-muted);
      line-height: 1.5;
    }
  `],
})
export class LoginComponent {
  private auth = inject(AdminAuthService);
  private router = inject(Router);
  private fb = inject(FormBuilder);

  form = this.fb.nonNullable.group({
    email:    ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(6)]],
  });

  loading      = signal(false);
  googleLoading = signal(false);
  error        = signal<string | null>(null);

  async submit() {
    if (this.form.invalid) return;
    this.loading.set(true);
    this.error.set(null);

    const { email, password } = this.form.getRawValue();
    const res = await this.auth.signIn(email, password);

    if (res.ok) this.router.navigate(['/dashboard']);
    else this.error.set(res.message ?? 'Sign in failed');
    this.loading.set(false);
  }

  async signInWithGoogle() {
    this.googleLoading.set(true);
    this.error.set(null);

    const res = await this.auth.signInWithGoogle();

    if (res.ok) this.router.navigate(['/dashboard']);
    else if (res.message) this.error.set(res.message);
    this.googleLoading.set(false);
  }
}
