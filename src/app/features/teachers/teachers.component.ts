import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { UsersDirectoryService } from '../../core/services/users/users-directory.service';
import { UserModel } from '../../models/user/user.model';

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
          <div class="meta">
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
      align-items: center;
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

    .role-badge { padding: 3px 10px; background: #f3e8ff; color: #6b21a8; border-radius: 12px; font-size: 11px; font-weight: 600; }
  `],
})
export class TeachersComponent implements OnInit {
  private directory = inject(UsersDirectoryService);
  teachers = signal<UserModel[]>([]);
  loading = signal(true);

  async ngOnInit() {
    const res = await this.directory.listTeachers();
    this.teachers.set(res.data ?? []);
    this.loading.set(false);
  }

  initials(name: string): string {
    return name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();
  }
}
