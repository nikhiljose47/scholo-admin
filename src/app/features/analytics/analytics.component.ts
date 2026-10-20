import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-analytics',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="page">
      <header class="page-header">
        <h1>Analytics & Reports</h1>
        <p>Platform-wide insights across all centers and batches</p>
      </header>

      <div class="coming-soon">
        <span>📊</span>
        <h2>Analytics Coming in Phase 4</h2>
        <p>
          Full analytics including center comparisons, batch progress tracking,
          attendance summaries, and export capabilities will be available in Phase 4.
        </p>
        <ul class="feature-list">
          <li>✓ Per-batch teaching progress</li>
          <li>✓ Center comparison dashboards</li>
          <li>✓ Planned vs actual date tracking</li>
          <li>✓ Overdue section flags</li>
          <li>✓ Attendance summaries (Phase 3+)</li>
          <li>✓ CSV / XLSX export</li>
        </ul>
      </div>
    </div>
  `,
  styles: [`
    .page { max-width: 900px; margin: 0 auto; }
    .page-header { margin-bottom: 28px; }
    h1 { margin: 0; font-size: 22px; font-weight: 700; color: #1e293b; }
    p { margin: 4px 0 0; color: #64748b; font-size: 14px; }

    .coming-soon {
      background: #fff;
      border-radius: 16px;
      padding: 60px;
      text-align: center;
      box-shadow: 0 1px 4px rgba(0,0,0,0.06);
    }

    .coming-soon span { font-size: 56px; display: block; margin-bottom: 16px; }
    h2 { margin: 0 0 12px; font-size: 20px; color: #1e293b; }

    .coming-soon p {
      margin: 0 auto 24px;
      max-width: 480px;
      color: #64748b;
      font-size: 15px;
      line-height: 1.6;
    }

    .feature-list {
      list-style: none;
      padding: 0;
      margin: 0;
      display: inline-flex;
      flex-direction: column;
      gap: 8px;
      text-align: left;
    }

    .feature-list li { color: #374151; font-size: 14px; }
  `],
})
export class AnalyticsComponent {}
