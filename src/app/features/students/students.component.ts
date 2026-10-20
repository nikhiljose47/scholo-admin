import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { UsersDirectoryService } from '../../core/services/users/users-directory.service';
import { UserModel } from '../../models/user/user.model';

@Component({
  selector: 'app-students',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="page">
      <header class="page-header">
        <h1>Students</h1>
        <p>All enrolled students on the platform</p>
      </header>

      <div *ngIf="loading()" class="loading">Loading students…</div>

      <div *ngIf="!loading() && students().length === 0" class="empty">
        <span>👩‍🎓</span>
        <p>No students found.</p>
      </div>

      <div class="list" *ngIf="!loading() && students().length > 0">
        <div *ngFor="let s of students()" class="student-card">
          <div class="avatar">{{ initials(s.name) }}</div>
          <div class="info">
            <div class="name">{{ s.name }}</div>
            <div class="email">{{ s.email }}</div>
          </div>
          <div class="meta">
            <span class="enrolled-count">{{ s.enrolledClassIds?.length ?? 0 }} class(es)</span>
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
    .student-card {
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
      background: #10b981;
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
    .enrolled-count { font-size: 12px; color: #64748b; }
  `],
})
export class StudentsComponent implements OnInit {
  private directory = inject(UsersDirectoryService);
  students = signal<UserModel[]>([]);
  loading = signal(true);

  async ngOnInit() {
    const res = await this.directory.listStudents();
    this.students.set(res.data ?? []);
    this.loading.set(false);
  }

  initials(name: string): string {
    return name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();
  }
}
