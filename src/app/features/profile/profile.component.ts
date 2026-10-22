import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AdminAuthService } from '../../core/services/auth/admin-auth.service';
import { FirestoreService } from '../../core/services/fire/firestore.service';
import { UploadService } from '../../core/services/storage/upload.service';
import { IconComponent } from '../../shared/components/icon/icon.component';
import { UserModel } from '../../models/user/user.model';

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [CommonModule, FormsModule, IconComponent],
  template: `
    <div class="page">
      <header class="page-header">
        <div>
          <h1 class="page-title">My Profile</h1>
          <p class="page-subtitle">Update your personal details and preferences</p>
        </div>
      </header>

      <div class="profile-layout">

        <!-- Avatar card -->
        <div class="card avatar-card">
          <div class="avatar-section">
            <div class="avatar-wrap">
              <img *ngIf="photoUrl()" [src]="photoUrl()" class="avatar-img" alt="Profile photo" />
              <div *ngIf="!photoUrl()" class="avatar-placeholder">
                {{ initials() }}
              </div>
              <label class="avatar-overlay" title="Change photo">
                <sc-icon name="camera" [size]="18"></sc-icon>
                <input
                  type="file"
                  accept="image/*"
                  class="file-input"
                  (change)="onAvatarPick($event)"
                  [disabled]="uploading()"
                />
              </label>
              <div class="upload-progress" *ngIf="uploading()">
                <div class="progress-bar" [style.width.%]="uploadPct() * 100"></div>
              </div>
            </div>
            <div class="avatar-meta">
              <div class="avatar-name">{{ form.name || '—' }}</div>
              <div class="avatar-role">{{ auth.userProfile()?.role }}</div>
            </div>
          </div>
          <p class="avatar-hint">Click the avatar to upload a new photo (JPG, PNG, WebP · max 20 MB)</p>
          <div class="error-msg" *ngIf="avatarError()">{{ avatarError() }}</div>
        </div>

        <!-- Details card -->
        <div class="card details-card">
          <h2 class="section-heading">Personal details</h2>

          <div class="field-grid">

            <div class="field-group">
              <label class="field-label">Full name</label>
              <input class="input" type="text" [(ngModel)]="form.name" placeholder="Your full name" />
            </div>

            <div class="field-group">
              <label class="field-label">Email</label>
              <input class="input" type="email" [value]="auth.userProfile()?.email ?? ''" disabled
                     title="Email cannot be changed here" />
            </div>

            <div class="field-group">
              <label class="field-label">Phone</label>
              <input class="input" type="tel" [(ngModel)]="form.phone" placeholder="+91 98765 43210" />
            </div>

            <div class="field-group">
              <label class="field-label">UPI ID</label>
              <div class="input-icon-wrap">
                <sc-icon name="currency-rupee" [size]="15" class="input-icon"></sc-icon>
                <input class="input with-icon" type="text" [(ngModel)]="form.upiId"
                       placeholder="yourname@upi" />
              </div>
              <span class="field-hint">Used for payment transfers and fee collection</span>
            </div>

            <div class="field-group full-width">
              <label class="field-label">Bio</label>
              <textarea class="input textarea" [(ngModel)]="form.bio" rows="4"
                        placeholder="Tell students a bit about yourself…"></textarea>
            </div>

          </div>

          <div class="form-footer">
            <div class="save-feedback" *ngIf="saveMsg()">
              <sc-icon [name]="saveOk() ? 'check' : 'x'" [size]="14"></sc-icon>
              {{ saveMsg() }}
            </div>
            <button class="btn btn-primary" (click)="save()" [disabled]="saving()">
              <sc-icon name="check" [size]="15" [stroke]="2.5" *ngIf="!saving()"></sc-icon>
              <span *ngIf="saving()">Saving…</span>
              <span *ngIf="!saving()">Save changes</span>
            </button>
          </div>
        </div>

      </div>
    </div>
  `,
  styles: [`
    .profile-layout {
      display: grid;
      grid-template-columns: 280px 1fr;
      gap: 20px;
      align-items: start;
    }

    @media (max-width: 768px) {
      .profile-layout { grid-template-columns: 1fr; }
    }

    /* Avatar card */
    .avatar-card {
      padding: 24px 20px;
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    .avatar-section {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 14px;
    }

    .avatar-wrap {
      position: relative;
      width: 96px;
      height: 96px;
      border-radius: 50%;
      overflow: hidden;
      flex-shrink: 0;
    }

    .avatar-img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    .avatar-placeholder {
      width: 100%;
      height: 100%;
      background: rgba(96, 165, 250, 0.18);
      color: #93c5fd;
      font-size: 28px;
      font-weight: 700;
      display: flex;
      align-items: center;
      justify-content: center;
      letter-spacing: 0.02em;
    }

    .avatar-overlay {
      position: absolute;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      background: rgba(0, 0, 0, 0.45);
      color: #fff;
      opacity: 0;
      transition: opacity 0.15s;
      cursor: pointer;
    }

    .avatar-wrap:hover .avatar-overlay { opacity: 1; }

    .file-input {
      position: absolute;
      width: 0;
      height: 0;
      opacity: 0;
    }

    .upload-progress {
      position: absolute;
      bottom: 0;
      left: 0;
      right: 0;
      height: 4px;
      background: rgba(255,255,255,0.2);
    }

    .progress-bar {
      height: 100%;
      background: var(--brand);
      transition: width 0.1s;
    }

    .avatar-meta {
      text-align: center;
    }

    .avatar-name {
      font-size: 15px;
      font-weight: 600;
      color: var(--text-primary);
    }

    .avatar-role {
      font-size: 12px;
      color: var(--text-muted);
      text-transform: capitalize;
      margin-top: 2px;
    }

    .avatar-hint {
      font-size: 12px;
      color: var(--text-muted);
      text-align: center;
      margin: 0;
      line-height: 1.5;
    }

    /* Details card */
    .details-card {
      padding: 24px 24px;
    }

    .section-heading {
      margin: 0 0 20px;
      font-size: 14px;
      font-weight: 600;
      color: var(--text-primary);
    }

    .field-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 16px;
    }

    .field-group {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .full-width { grid-column: 1 / -1; }

    .field-label {
      font-size: 12px;
      font-weight: 500;
      color: var(--text-muted);
      letter-spacing: 0.01em;
    }

    .field-hint {
      font-size: 11px;
      color: var(--text-muted);
    }

    .input {
      width: 100%;
      padding: 8px 12px;
      background: var(--surface-secondary);
      border: 1px solid var(--border-subtle);
      border-radius: var(--r-md);
      color: var(--text-primary);
      font-size: 13px;
      outline: none;
      transition: border-color 0.15s;
      box-sizing: border-box;
    }

    .input:focus { border-color: var(--brand); }
    .input:disabled { opacity: 0.5; cursor: not-allowed; }

    .textarea { resize: vertical; min-height: 96px; font-family: inherit; }

    .input-icon-wrap {
      position: relative;
    }

    .input-icon {
      position: absolute;
      left: 10px;
      top: 50%;
      transform: translateY(-50%);
      color: var(--text-muted);
      pointer-events: none;
    }

    .input.with-icon { padding-left: 30px; }

    .form-footer {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: 12px;
      margin-top: 24px;
      padding-top: 20px;
      border-top: 1px solid var(--border-subtle);
    }

    .save-feedback {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 13px;
      color: var(--text-muted);
    }

    .error-msg {
      font-size: 12px;
      color: var(--danger, #ef4444);
      text-align: center;
    }
  `],
})
export class ProfileComponent implements OnInit {
  auth = inject(AdminAuthService);
  private fs = inject(FirestoreService);
  private upload = inject(UploadService);

  photoUrl = signal<string | null>(null);
  uploading = signal(false);
  uploadPct = signal(0);
  avatarError = signal<string | null>(null);
  saving = signal(false);
  saveMsg = signal<string | null>(null);
  saveOk = signal(true);

  form = {
    name: '',
    phone: '',
    upiId: '',
    bio: '',
  };

  initials = () => {
    const name = this.form.name || this.auth.userProfile()?.name || 'U';
    return name.split(' ').slice(0, 2).map((w: string) => w[0]).join('').toUpperCase();
  };

  ngOnInit() {
    const p = this.auth.userProfile();
    if (p) {
      this.form.name  = p.name ?? '';
      this.form.phone = p.phone ?? '';
      this.form.upiId = p.upiId ?? '';
      this.form.bio   = p.bio ?? '';
      this.photoUrl.set(p.photoUrl ?? null);
    }
  }

  async onAvatarPick(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const uid = this.auth.uid;
    if (!uid) return;

    this.avatarError.set(null);
    this.uploading.set(true);
    this.uploadPct.set(0);

    try {
      const url = await this.upload.uploadAvatar(uid, file, pct => this.uploadPct.set(pct));
      this.photoUrl.set(url);
      await this.fs.update<UserModel>(`users/${uid}`, { photoUrl: url });
      this.auth.userProfile.update(p => p ? { ...p, photoUrl: url } : p);
    } catch (e: unknown) {
      this.avatarError.set((e as Error).message ?? 'Upload failed');
    } finally {
      this.uploading.set(false);
    }
  }

  async save() {
    const uid = this.auth.uid;
    if (!uid) return;
    this.saving.set(true);
    this.saveMsg.set(null);

    const patch: Partial<UserModel> = {
      name:  this.form.name.trim(),
      phone: this.form.phone.trim() || undefined,
      upiId: this.form.upiId.trim() || undefined,
      bio:   this.form.bio.trim() || undefined,
    };

    const res = await this.fs.update<UserModel>(`users/${uid}`, patch);
    this.saving.set(false);

    if (res.ok) {
      this.auth.userProfile.update(p => p ? { ...p, ...patch } : p);
      this.saveOk.set(true);
      this.saveMsg.set('Changes saved');
    } else {
      this.saveOk.set(false);
      this.saveMsg.set(res.message ?? 'Save failed');
    }

    setTimeout(() => this.saveMsg.set(null), 3000);
  }
}
