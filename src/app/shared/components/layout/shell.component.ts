import { Component, inject, signal, computed } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AdminAuthService } from '../../../core/services/auth/admin-auth.service';
import { CommonModule } from '@angular/common';

interface NavItem {
  label: string;
  icon: string;
  path: string;
  adminOnly?: boolean;
}

@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, CommonModule],
  template: `
    <div class="shell">
      <!-- Sidebar -->
      <aside class="sidebar" [class.collapsed]="sidebarCollapsed()">
        <div class="sidebar-header">
          <div class="logo">
            <span class="logo-icon">🎓</span>
            <span class="logo-text" *ngIf="!sidebarCollapsed()">Scholo Admin</span>
          </div>
          <button class="collapse-btn" (click)="toggleSidebar()">
            {{ sidebarCollapsed() ? '›' : '‹' }}
          </button>
        </div>

        <nav class="sidebar-nav">
          <a
            *ngFor="let item of visibleNavItems()"
            [routerLink]="item.path"
            routerLinkActive="active"
            class="nav-item"
            [title]="item.label"
          >
            <span class="nav-icon">{{ item.icon }}</span>
            <span class="nav-label" *ngIf="!sidebarCollapsed()">{{ item.label }}</span>
          </a>
        </nav>

        <div class="sidebar-footer" *ngIf="!sidebarCollapsed()">
          <div class="user-info">
            <div class="user-name">{{ auth.userProfile()?.name ?? 'Admin' }}</div>
            <div class="user-role">{{ auth.userProfile()?.role }}</div>
          </div>
          <button class="signout-btn" (click)="signOut()">Sign out</button>
        </div>
      </aside>

      <!-- Main content -->
      <main class="main-content">
        <router-outlet />
      </main>
    </div>
  `,
  styles: [`
    .shell {
      display: flex;
      height: 100vh;
      overflow: hidden;
      background: #f8fafc;
    }

    .sidebar {
      width: 240px;
      background: #1e293b;
      color: #e2e8f0;
      display: flex;
      flex-direction: column;
      transition: width 0.2s ease;
      flex-shrink: 0;
    }

    .sidebar.collapsed { width: 56px; }

    .sidebar-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 16px 12px;
      border-bottom: 1px solid #334155;
    }

    .logo {
      display: flex;
      align-items: center;
      gap: 8px;
      font-weight: 700;
      font-size: 15px;
      color: #f1f5f9;
    }

    .logo-icon { font-size: 20px; }

    .collapse-btn {
      background: none;
      border: none;
      color: #94a3b8;
      cursor: pointer;
      font-size: 18px;
      padding: 4px;
    }

    .sidebar-nav {
      flex: 1;
      padding: 12px 8px;
      overflow-y: auto;
    }

    .nav-item {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 10px 10px;
      border-radius: 8px;
      text-decoration: none;
      color: #94a3b8;
      font-size: 14px;
      transition: background 0.15s, color 0.15s;
      white-space: nowrap;
      margin-bottom: 2px;
    }

    .nav-item:hover { background: #334155; color: #f1f5f9; }
    .nav-item.active { background: #3b82f6; color: #fff; }

    .nav-icon { font-size: 16px; min-width: 20px; text-align: center; }

    .sidebar-footer {
      padding: 12px;
      border-top: 1px solid #334155;
    }

    .user-name { font-weight: 600; font-size: 13px; color: #f1f5f9; }
    .user-role { font-size: 11px; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em; }

    .signout-btn {
      width: 100%;
      margin-top: 8px;
      padding: 6px;
      background: #ef4444;
      color: #fff;
      border: none;
      border-radius: 6px;
      cursor: pointer;
      font-size: 13px;
    }

    .main-content {
      flex: 1;
      overflow-y: auto;
      padding: 24px;
    }
  `],
})
export class ShellComponent {
  auth = inject(AdminAuthService);
  private router = inject(Router);

  sidebarCollapsed = signal(false);

  navItems: NavItem[] = [
    { label: 'Dashboard', icon: '📊', path: '/dashboard' },
    { label: 'Centers', icon: '🏫', path: '/centers', adminOnly: true },
    { label: 'Schedule', icon: '📅', path: '/schedule' },
    { label: 'Applications', icon: '📋', path: '/applications', adminOnly: true },
    { label: 'Teachers', icon: '👨‍🏫', path: '/teachers', adminOnly: true },
    { label: 'Students', icon: '👩‍🎓', path: '/students', adminOnly: true },
    { label: 'Analytics', icon: '📈', path: '/analytics', adminOnly: true },
    { label: 'Settings', icon: '⚙️', path: '/settings', adminOnly: true },
  ];

  /** Teachers only ever see nav entries scoped to their own data (Dashboard, Schedule). */
  visibleNavItems = computed(() =>
    this.navItems.filter(item => !item.adminOnly || this.auth.isAdmin()),
  );

  toggleSidebar() {
    this.sidebarCollapsed.update(v => !v);
  }

  async signOut() {
    await this.auth.signOut();
    this.router.navigate(['/auth/login']);
  }
}
