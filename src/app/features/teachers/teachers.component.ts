import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { UsersDirectoryService } from '../../core/services/users/users-directory.service';
import { FirestoreService } from '../../core/services/fire/firestore.service';
import { ProvidersService } from '../providers/providers.service';
import { UserModel } from '../../models/user/user.model';
import { ProviderDoc } from '../../models/content/content.model';

@Component({
  selector: 'app-teachers',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="page">
      <header class="page-header">
        <h1>Teachers</h1>
        <p>All users with teacher role across the platform</p>
      </header>

      <div class="error" *ngIf="error()">{{ error() }}</div>
      <div *ngIf="loading()" class="loading">Loading teachers…</div>

      <div *ngIf="!loading() && teachers().length === 0" class="empty">
        <span>👨‍🏫</span>
        <p>No teachers found.</p>
      </div>

      <div class="list" *ngIf="!loading() && teachers().length > 0">
        <div *ngFor="let t of teachers()" class="teacher-card">
          <div class="avatar">{{ initials(t.name) }}</div>
          <div class="info">
            <div class="name">{{ t.name }}</div>
            <div class="email">{{ t.email }}</div>
          </div>
          <div class="controls">
            <!-- canEditContent -->
            <label class="perm" title="Lets this teacher update class progress and other content">
              <input type="checkbox" [checked]="t.canEditContent === true" [disabled]="saving() === t.uid"
                     (change)="setCanEdit(t, $any($event.target).checked)" />
              Can edit content
            </label>

            <!-- tuitionCenterIds -->
            <div class="centers-row">
              <span class="centers-label">Tuition centers</span>
              <div class="centers-list" *ngIf="providers().length; else loadingProviders">
                <label *ngFor="let p of providers()" class="center-chip"
                       [class.on]="isAssigned(t, p.id)"
                       [class.busy]="saving() === t.uid">
                  <input type="checkbox"
                         [checked]="isAssigned(t, p.id)"
                         [disabled]="saving() === t.uid"
                         (change)="toggleCenter(t, p.id, $any($event.target).checked)" />
                  {{ p.name || p.id }}
                </label>
              </div>
              <ng-template #loadingProviders><span class="muted-sm">Loading centers…</span></ng-template>
            </div>

            <span class="role-badge">Teacher</span>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .page { max-width: 900px; margin: 0 auto; }

    .page-header { margin-bottom: 24px; }
    h1 { margin: 0; font-size: 22px; font-weight: 700; color: #1e293b; }
    p { margin: 4px 0 0; color: #64748b; font-size: 14px; }

    .loading { color: #64748b; padding: 20px; }

    .empty { text-align: center; padding: 60px; color: #64748b; }
    .empty span { font-size: 48px; display: block; margin-bottom: 12px; }

    .list { display: flex; flex-direction: column; gap: 10px; }

    .teacher-card {
      background: #fff;
      border-radius: 10px;
      padding: 16px;
      display: flex;
      align-items: flex-start;
      gap: 14px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.05);
    }

    .avatar {
      width: 44px;
      height: 44px;
      background: #8b5cf6;
      color: #fff;
      border-radius: 12px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 700;
      font-size: 14px;
    }

    .info { flex: 1; }
    .name { font-weight: 600; color: #1e293b; font-size: 15px; }
    .email { color: #64748b; font-size: 13px; }

    .controls { display: flex; align-items: flex-start; gap: 16px; flex-wrap: wrap; flex: 1; }
    .perm { font-size: 13px; color: #475569; display: flex; align-items: center; gap: 6px; cursor: pointer; white-space: nowrap; }
    .centers-row { display: flex; flex-direction: column; gap: 6px; flex: 1; min-width: 200px; }
    .centers-label { font-size: 12px; color: #64748b; font-weight: 500; }
    .centers-list { display: flex; flex-wrap: wrap; gap: 6px; }
    .center-chip { display: inline-flex; align-items: center; gap: 5px; padding: 3px 10px; border-radius: 20px; font-size: 12px; background: #f1f5f9; color: #334155; cursor: pointer; border: 1px solid #e2e8f0; transition: background .15s, border-color .15s; }
    .center-chip.on { background: #eff6ff; border-color: #3b82f6; color: #1d4ed8; }
    .center-chip.busy { opacity: .5; pointer-events: none; }
    .center-chip input { display: none; }
    .muted-sm { font-size: 12px; color: #94a3b8; }
    .error { color: #b91c1c; background: #fef2f2; padding: 10px 14px; border-radius: 8px; margin-bottom: 12px; font-size: 13px; }
    .role-badge { padding: 3px 10px; background: #f3e8ff; color: #6b21a8; border-radius: 12px; font-size: 11px; font-weight: 600; white-space: nowrap; align-self: center; }
  `],
})
export class TeachersComponent implements OnInit {
  private directory = inject(UsersDirectoryService);
  private providersService = inject(ProvidersService);
  private fs = inject(FirestoreService);

  teachers = signal<UserModel[]>([]);
  providers = signal<ProviderDoc[]>([]);
  saving = signal('');
  error = signal('');
  loading = signal(true);

  async ngOnInit() {
    const [teachersRes, providersRes] = await Promise.all([
      this.directory.listTeachers(),
      this.providersService.listProviders(),
    ]);
    this.teachers.set(teachersRes.data ?? []);
    this.providers.set(providersRes.data ?? []);
    this.loading.set(false);
  }

  isAssigned(t: UserModel, centerId: string): boolean {
    return (t.tuitionCenterIds ?? []).includes(centerId);
  }

  /** Toggle one center in/out of the teacher's tuitionCenterIds — admin-only. */
  async toggleCenter(t: UserModel, centerId: string, checked: boolean) {
    this.error.set('');
    this.saving.set(t.uid);
    const current = t.tuitionCenterIds ?? [];
    const next = checked ? [...new Set([...current, centerId])] : current.filter(id => id !== centerId);
    this.patchCenters(t.uid, next);
    const res = await this.fs.update(`users/${t.uid}`, { tuitionCenterIds: next });
    if (!res.ok) {
      this.patchCenters(t.uid, current);
      this.error.set(`Couldn't update ${t.name}: ${res.message}`);
    } else {
      this.directory.invalidate();
    }
    this.saving.set('');
  }

  private patchCenters(uid: string, ids: string[]) {
    this.teachers.update(ts => ts.map(x => (x.uid === uid ? { ...x, tuitionCenterIds: ids } : x)));
  }

  /** Admin-only write (enforced by Firestore rules too); optimistic with rollback. */
  async setCanEdit(t: UserModel, value: boolean) {
    this.error.set('');
    this.saving.set(t.uid);
    this.patchCanEdit(t.uid, value);
    const res = await this.fs.update(`users/${t.uid}`, { canEditContent: value });
    if (!res.ok) {
      this.patchCanEdit(t.uid, !value);
      this.error.set(`Couldn't update ${t.name}: ${res.message}`);
    } else {
      this.directory.invalidate();
    }
    this.saving.set('');
  }

  private patchCanEdit(uid: string, value: boolean) {
    this.teachers.update(ts => ts.map(x => (x.uid === uid ? { ...x, canEditContent: value } : x)));
  }

  initials(name: string): string {
    return name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();
  }
}
