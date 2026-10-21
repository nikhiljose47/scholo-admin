import { Routes } from '@angular/router';
import { staffGuard } from './core/guards/staff.guard';
import { adminGuard } from './core/guards/admin.guard';
import { ShellComponent } from './shared/components/layout/shell.component';

export const routes: Routes = [
  {
    path: 'auth',
    children: [
      {
        path: 'login',
        loadComponent: () =>
          import('./features/auth/login.component').then(m => m.LoginComponent),
      },
    ],
  },
  {
    path: '',
    component: ShellComponent,
    canActivate: [staffGuard],
    children: [
      { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
      {
        path: 'dashboard',
        loadComponent: () =>
          import('./features/dashboard/dashboard.component').then(m => m.DashboardComponent),
      },
      {
        path: 'centers',
        canActivate: [adminGuard],
        children: [
          {
            path: '',
            loadComponent: () =>
              import('./features/centers/list/centers-list.component').then(m => m.CentersListComponent),
          },
          {
            path: 'new',
            loadComponent: () =>
              import('./features/centers/form/center-form.component').then(m => m.CenterFormComponent),
          },
          {
            path: ':centerId',
            loadComponent: () =>
              import('./features/centers/detail/center-detail.component').then(m => m.CenterDetailComponent),
          },
          {
            path: ':centerId/edit',
            loadComponent: () =>
              import('./features/centers/form/center-form.component').then(m => m.CenterFormComponent),
          },
          {
            path: ':centerId/batches',
            children: [
              {
                path: '',
                loadComponent: () =>
                  import('./features/batches/list/batches-list.component').then(m => m.BatchesListComponent),
              },
              {
                path: 'new',
                loadComponent: () =>
                  import('./features/batches/form/batch-form.component').then(m => m.BatchFormComponent),
              },
              {
                path: ':batchId',
                loadComponent: () =>
                  import('./features/batches/detail/batch-detail.component').then(m => m.BatchDetailComponent),
              },
            ],
          },
        ],
      },
      {
        path: 'schedule',
        children: [
          {
            path: '',
            loadComponent: () =>
              import('./features/schedule/schedule-list.component').then(m => m.ScheduleListComponent),
          },
          {
            path: 'new',
            loadComponent: () =>
              import('./features/schedule/schedule-form.component').then(m => m.ScheduleFormComponent),
          },
          {
            path: ':meetingId/edit',
            loadComponent: () =>
              import('./features/schedule/schedule-form.component').then(m => m.ScheduleFormComponent),
          },
        ],
      },
      {
        path: 'applications',
        canActivate: [adminGuard],
        loadComponent: () =>
          import('./features/centers/list/centers-list.component').then(m => m.CentersListComponent),
      },
      {
        path: 'teachers',
        canActivate: [adminGuard],
        loadComponent: () =>
          import('./features/teachers/teachers.component').then(m => m.TeachersComponent),
      },
      {
        path: 'students',
        canActivate: [adminGuard],
        loadComponent: () =>
          import('./features/students/students.component').then(m => m.StudentsComponent),
      },
      {
        path: 'analytics',
        loadComponent: () =>
          import('./features/analytics/analytics.component').then(m => m.AnalyticsComponent),
      },
      {
        path: 'settings',
        canActivate: [adminGuard],
        loadComponent: () =>
          import('./features/dashboard/dashboard.component').then(m => m.DashboardComponent),
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
