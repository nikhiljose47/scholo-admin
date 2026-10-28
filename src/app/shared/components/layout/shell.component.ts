import { Component, inject, signal, computed } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { CommonModule, NgStyle } from '@angular/common';
import { AdminAuthService } from '../../../core/services/auth/admin-auth.service';
import { ThemeService } from '../../../core/services/theme/theme.service';
import { IconComponent } from '../icon/icon.component';

interface NavItem {
  label: string;
  icon: string;
  path: string;
  adminOnly?: boolean;
}

@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, CommonModule, NgStyle, IconComponent],
  template: `
    <div class="shell">

      <!-- ── Sidebar ── -->
      <aside class="sidebar" [class.collapsed]="collapsed()">

        <!-- Header -->
        <div class="sb-header">
          <div class="logo">
            <div class="logo-mark">S</div>
            <span class="logo-text" *ngIf="!collapsed()">Scholo Admin</span>
          </div>
          <button
            class="icon-btn collapse-btn"
            (click)="toggleCollapse()"
            [title]="collapsed() ? 'Expand sidebar' : 'Collapse sidebar'"
          >
            <sc-icon [name]="collapsed() ? 'chevron-right' : 'chevron-left'" [size]="15" [stroke]="2"></sc-icon>
          </button>
        </div>

        <!-- Navigation -->
        <nav class="sb-nav" role="navigation">
          <a
            *ngFor="let item of visibleNavItems()"
            [routerLink]="item.path"
            routerLinkActive="active"
            class="nav-item"
            [title]="collapsed() ? item.label : ''"
          >
            <sc-icon [name]="item.icon" [size]="17" class="nav-icon"></sc-icon>
            <span class="nav-label" *ngIf="!collapsed()">{{ item.label }}</span>
          </a>
        </nav>

        <!-- Footer -->
        <div class="sb-footer">
          <a routerLink="/profile" class="user-row user-row-link" *ngIf="!collapsed()" title="Edit profile">
            <div class="user-avatar" [ngStyle]="avatarStyle()">
              <span *ngIf="!auth.userProfile()?.photoUrl">{{ userInitials() }}</span>
            </div>
            <div class="user-info">
              <div class="user-name truncate">{{ auth.userProfile()?.name ?? 'Admin' }}</div>
              <div class="user-role">{{ auth.userProfile()?.role ?? 'Admin' }}</div>
            </div>
            <sc-icon name="pencil" [size]="12" class="edit-icon"></sc-icon>
          </a>
          <a routerLink="/profile" class="user-avatar avatar-sm" *ngIf="collapsed()" title="Edit profile"
             [ngStyle]="avatarStyle()">
            <span *ngIf="!auth.userProfile()?.photoUrl">{{ userInitials() }}</span>
          </a>

          <div class="footer-actions">
            <button
              class="icon-btn"
              (click)="theme.toggle()"
              [title]="theme.isDark() ? 'Switch to light mode' : 'Switch to dark mode'"
            >
              <sc-icon [name]="theme.isDark() ? 'sun' : 'moon'" [size]="16"></sc-icon>
            </button>
            <button class="icon-btn" (click)="signOut()" title="Sign out">
              <sc-icon name="logout" [size]="16"></sc-icon>
            </button>
          </div>
        </div>

      </aside>

      <!-- ── Main content ── -->
      <main class="main-content">
        <router-outlet />
      </main>

    </div>
  `,
  styles: [`
    :host { display: contents; }

    .shell {
      display: flex;
      height: 100vh;
      overflow: hidden;
      background: var(--surface-app);
    }

    /* ── Sidebar ── */
    .sidebar {
      width: var(--sidebar-w);
      min-width: var(--sidebar-w);
      background: var(--sb-bg);
      display: flex;
      flex-direction: column;
      transition: width var(--dur-slow), min-width var(--dur-slow);
      overflow: hidden;
    }
    .sidebar.collapsed {
      width: var(--sidebar-collapsed-w);
      min-width: var(--sidebar-collapsed-w);
    }

    /* Header */
    .sb-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 12px;
      height: 56px;
      border-bottom: 1px solid var(--sb-border);
      flex-shrink: 0;
    }

    .sidebar.collapsed .sb-header { justify-content: center; gap: 0; }
    .sidebar.collapsed .collapse-btn { margin-left: 0; }

    .logo {
      display: flex;
      align-items: center;
      gap: 9px;
      overflow: hidden;
    }

    .logo-mark {
      width: 28px;
      height: 28px;
      background: var(--brand);
      border-radius: 7px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 700;
      font-size: 14px;
      color: #fff;
      flex-shrink: 0;
      letter-spacing: -0.02em;
    }

    .logo-text {
      font-size: 14px;
      font-weight: 600;
      color: var(--sb-logo);
      white-space: nowrap;
      letter-spacing: -0.01em;
    }

    /* Nav */
    .sb-nav {
      flex: 1;
      padding: 10px 8px;
      overflow-y: auto;
      overflow-x: hidden;
    }

    .nav-item {
      display: flex;
      align-items: center;
      gap: 9px;
      height: 36px;
      padding: 0 10px;
      border-radius: 8px;
      color: var(--sb-text);
      font-size: 13px;
      font-weight: 500;
      text-decoration: none;
      cursor: pointer;
      transition: background var(--dur-fast), color var(--dur-fast);
      white-space: nowrap;
      margin-bottom: 1px;
    }

    .sidebar.collapsed .nav-item {
      justify-content: center;
      padding: 0;
      width: 40px;
      margin: 0 auto 1px;
    }

    .nav-item:hover {
      background: var(--sb-hover-bg);
      color: var(--sb-text-hv);
    }

    .nav-item.active {
      background: var(--sb-active-bg);
      color: var(--sb-active-text);
    }

    .nav-icon { flex-shrink: 0; }

    /* Footer */
    .sb-footer {
      border-top: 1px solid var(--sb-border);
      padding: 12px 10px;
      flex-shrink: 0;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    .sidebar.collapsed .sb-footer {
      align-items: center;
      padding: 10px 8px;
    }

    .user-row {
      display: flex;
      align-items: center;
      gap: 9px;
      overflow: hidden;
    }

    .user-row-link {
      text-decoration: none;
      border-radius: var(--r-md);
      padding: 4px 6px;
      margin: -4px -6px;
      transition: background var(--dur-fast);
    }

    .user-row-link:hover { background: var(--sb-hover-bg); }

    .edit-icon {
      color: var(--sb-text);
      opacity: 0;
      flex-shrink: 0;
      transition: opacity var(--dur-fast);
    }

    .user-row-link:hover .edit-icon { opacity: 1; }

    .user-avatar {
      width: 30px;
      height: 30px;
      border-radius: 50%;
      background: var(--sb-active-bg);
      color: var(--sb-active-text);
      font-size: 11px;
      font-weight: 700;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      letter-spacing: 0.02em;
    }

    .avatar-sm { width: 28px; height: 28px; font-size: 10px; }

    .user-info { flex: 1; overflow: hidden; }

    .user-name {
      font-size: 12px;
      font-weight: 600;
      color: var(--sb-text-hv);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .user-role {
      font-size: 10px;
      color: var(--sb-text);
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin-top: 1px;
    }

    .footer-actions {
      display: flex;
      gap: 4px;
    }

    .sidebar.collapsed .footer-actions {
      flex-direction: column;
      align-items: center;
    }

    /* Shared icon button */
    .icon-btn {
      width: 30px;
      height: 30px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: none;
      border: none;
      border-radius: 7px;
      color: var(--sb-text);
      cursor: pointer;
      transition: background var(--dur-fast), color var(--dur-fast);
      padding: 0;
    }

    .icon-btn:hover {
      background: var(--sb-hover-bg);
      color: var(--sb-text-hv);
    }

    /* Main */
    .main-content {
      flex: 1;
      overflow-y: auto;
      padding: var(--page-gutter);
      background: var(--surface-app);
      transition: background var(--dur-base);
    }

    /* Utilities */
    .truncate { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  `],
})
export class ShellComponent {
  auth = inject(AdminAuthService);
  theme = inject(ThemeService);
  private router = inject(Router);

  collapsed = signal(false);

  navItems: NavItem[] = [
    { label: 'Dashboard',       icon: 'dashboard',    path: '/dashboard' },
    { label: 'Centers',         icon: 'buildings',    path: '/centers',      adminOnly: true },
    { label: 'Schedule',        icon: 'calendar',     path: '/schedule' },
    { label: 'Tutor Requests',  icon: 'bell',         path: '/tutor-requests' },
    { label: 'Class Progress',  icon: 'check',        path: '/progress' },
    { label: 'Syllabus',        icon: 'template',     path: '/syllabus' },
    { label: 'Puzzles',         icon: 'search',       path: '/puzzles' },
    { label: 'Materials',       icon: 'selector',     path: '/materials' },
    { label: 'Tuition Centers', icon: 'buildings',    path: '/providers',    adminOnly: true },
    { label: 'Classes',         icon: 'academic-cap', path: '/classes',      adminOnly: true },
    { label: 'Applications',    icon: 'clipboard',    path: '/applications', adminOnly: true },
    { label: 'Teachers',        icon: 'person',       path: '/teachers',     adminOnly: true },
    { label: 'Students',        icon: 'academic-cap', path: '/students',     adminOnly: true },
    { label: 'Analytics',       icon: 'chart-bar',    path: '/analytics' },
    { label: 'Profile',         icon: 'person',       path: '/profile' },
    { label: 'Settings',        icon: 'cog',          path: '/settings',     adminOnly: true },
  ];

  visibleNavItems = computed(() =>
    this.navItems.filter(item => !item.adminOnly || this.auth.isAdmin()),
  );

  userInitials = computed(() => {
    const name = this.auth.userProfile()?.name ?? 'A';
    return name.split(' ').slice(0, 2).map((w: string) => w[0]).join('').toUpperCase();
  });

  avatarStyle = computed((): Record<string, string> => {
    const url = this.auth.userProfile()?.photoUrl;
    if (!url) return {};
    return {
      'background-image': `url('${url}')`,
      'background-size': 'cover',
      'background-position': 'center',
      'color': 'transparent',
    };
  });

  toggleCollapse() {
    this.collapsed.update(v => !v);
  }

  async signOut() {
    await this.auth.signOut();
    this.router.navigate(['/auth/login']);
  }
}
