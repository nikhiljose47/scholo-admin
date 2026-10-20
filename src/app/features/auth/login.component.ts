import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { AdminAuthService } from '../../core/services/auth/admin-auth.service';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [ReactiveFormsModule, CommonModule],
  template: `
    <div class="login-page">
      <div class="login-card">
        <div class="login-header">
          <span class="logo">🎓</span>
          <h1>Scholo Admin</h1>
          <p>Sign in to manage your platform</p>
        </div>

        <form [formGroup]="form" (ngSubmit)="submit()" class="login-form">
          <div class="field">
            <label for="email">Email</label>
            <input
              id="email"
              type="email"
              formControlName="email"
              placeholder="admin@scholo.co.in"
              autocomplete="email"
            />
          </div>

          <div class="field">
            <label for="password">Password</label>
            <input
              id="password"
              type="password"
              formControlName="password"
              placeholder="••••••••"
              autocomplete="current-password"
            />
          </div>

          <div class="error" *ngIf="error()">{{ error() }}</div>

          <button type="submit" [disabled]="loading() || googleLoading() || form.invalid" class="submit-btn">
            {{ loading() ? 'Signing in…' : 'Sign in' }}
          </button>
        </form>

        <div class="divider"><span>or</span></div>

        <button type="button" (click)="signInWithGoogle()" [disabled]="loading() || googleLoading()" class="google-btn">
          <svg width="18" height="18" viewBox="0 0 18 18">
            <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84c-.21 1.13-.84 2.09-1.8 2.73v2.27h2.91c1.7-1.57 2.69-3.88 2.69-6.64z"/>
            <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.17l-2.91-2.27c-.8.54-1.83.86-3.05.86-2.35 0-4.34-1.59-5.05-3.72H.95v2.34C2.44 15.98 5.48 18 9 18z"/>
            <path fill="#FBBC05" d="M3.95 10.7c-.18-.54-.28-1.11-.28-1.7s.1-1.16.28-1.7V4.96H.95C.35 6.17 0 7.55 0 9s.35 2.83.95 4.04l3-2.34z"/>
            <path fill="#EA4335" d="M9 3.58c1.32 0 2.51.46 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0 5.48 0 2.44 2.02.95 4.96l3 2.34C4.66 5.17 6.65 3.58 9 3.58z"/>
          </svg>
          {{ googleLoading() ? 'Signing in…' : 'Sign in with Google' }}
        </button>

        <p class="access-note">Access is limited to Scholo teachers and admins.</p>
      </div>
    </div>
  `,
  styles: [`
    .login-page {
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%);
    }

    .login-card {
      background: #fff;
      border-radius: 16px;
      padding: 40px;
      width: 360px;
      box-shadow: 0 20px 60px rgba(0,0,0,0.3);
    }

    .login-header {
      text-align: center;
      margin-bottom: 28px;
    }

    .logo { font-size: 40px; }

    h1 {
      margin: 8px 0 4px;
      font-size: 22px;
      font-weight: 700;
      color: #1e293b;
    }

    p { color: #64748b; font-size: 14px; margin: 0; }

    .login-form { display: flex; flex-direction: column; gap: 16px; }

    .field { display: flex; flex-direction: column; gap: 4px; }

    label { font-size: 13px; font-weight: 600; color: #374151; }

    input {
      padding: 10px 12px;
      border: 1px solid #d1d5db;
      border-radius: 8px;
      font-size: 14px;
      outline: none;
      transition: border-color 0.15s;
    }

    input:focus { border-color: #3b82f6; box-shadow: 0 0 0 3px rgba(59,130,246,0.1); }

    .error {
      background: #fef2f2;
      border: 1px solid #fecaca;
      color: #dc2626;
      padding: 10px 12px;
      border-radius: 8px;
      font-size: 13px;
    }

    .submit-btn {
      padding: 12px;
      background: #3b82f6;
      color: #fff;
      border: none;
      border-radius: 8px;
      font-size: 15px;
      font-weight: 600;
      cursor: pointer;
      transition: background 0.15s;
    }

    .submit-btn:hover:not(:disabled) { background: #2563eb; }
    .submit-btn:disabled { opacity: 0.6; cursor: not-allowed; }

    .divider {
      display: flex;
      align-items: center;
      margin: 18px 0;
      color: #94a3b8;
      font-size: 12px;
    }
    .divider::before, .divider::after {
      content: '';
      flex: 1;
      height: 1px;
      background: #e2e8f0;
    }
    .divider span { padding: 0 10px; }

    .google-btn {
      width: 100%;
      padding: 10px;
      background: #fff;
      color: #374151;
      border: 1px solid #d1d5db;
      border-radius: 8px;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 10px;
      transition: background 0.15s;
    }

    .google-btn:hover:not(:disabled) { background: #f8fafc; }
    .google-btn:disabled { opacity: 0.6; cursor: not-allowed; }

    .access-note {
      margin: 18px 0 0;
      text-align: center;
      font-size: 12px;
      color: #94a3b8;
    }
  `],
})
export class LoginComponent {
  private auth = inject(AdminAuthService);
  private router = inject(Router);
  private fb = inject(FormBuilder);

  form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(6)]],
  });

  loading = signal(false);
  googleLoading = signal(false);
  error = signal<string | null>(null);

  async submit() {
    if (this.form.invalid) return;
    this.loading.set(true);
    this.error.set(null);

    const { email, password } = this.form.getRawValue();
    const res = await this.auth.signIn(email, password);

    if (res.ok) {
      this.router.navigate(['/dashboard']);
    } else {
      this.error.set(res.message ?? 'Sign in failed');
    }
    this.loading.set(false);
  }

  async signInWithGoogle() {
    this.googleLoading.set(true);
    this.error.set(null);

    const res = await this.auth.signInWithGoogle();

    if (res.ok) {
      this.router.navigate(['/dashboard']);
    } else if (res.message) {
      this.error.set(res.message);
    }
    this.googleLoading.set(false);
  }
}
