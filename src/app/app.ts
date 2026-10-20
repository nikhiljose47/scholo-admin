import { Component, inject, OnInit } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { AppUpdateService } from './core/services/update/app-update.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet],
  template: `
    <router-outlet />
    @if (update.waiting()) {
      <div class="update-banner" role="status">
        A new version is available. It will load when you leave this page.
        <button type="button" (click)="update.reloadNow()">Reload now</button>
      </div>
    }
  `,
  styles: [`
    .update-banner {
      position: fixed; left: 50%; bottom: 16px; transform: translateX(-50%);
      z-index: 1000; display: flex; align-items: center; gap: 12px;
      max-width: calc(100vw - 32px); padding: 10px 14px; border-radius: 10px;
      background: #1f2937; color: #fff; font: 14px/1.4 system-ui, sans-serif;
      box-shadow: 0 4px 16px rgba(0, 0, 0, .25);
    }
    .update-banner button {
      border: 0; border-radius: 6px; padding: 6px 10px; cursor: pointer;
      background: #fff; color: #1f2937; font-weight: 600; white-space: nowrap;
    }
  `],
})
export class App implements OnInit {
  protected update = inject(AppUpdateService);

  ngOnInit(): void {
    this.update.start();
  }
}
