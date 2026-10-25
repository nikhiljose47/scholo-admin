import { Component, inject, OnInit, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, ActivatedRoute, RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';
import { BatchesService } from '../batches.service';

@Component({
  selector: 'app-batch-form',
  standalone: true,
  imports: [ReactiveFormsModule, CommonModule, RouterLink],
  template: `
    <div class="page">
      <header class="page-header">
        <a [routerLink]="['/centers', centerId, 'batches']" class="back-link">← Batches</a>
        <h1>New Batch</h1>
      </header>

      <form [formGroup]="form" (ngSubmit)="submit()" class="form-card">
        <div class="section">
          <h3>Batch Identity</h3>
          <div class="fields">
            <div class="field">
              <label>Batch Name *</label>
              <input formControlName="name" placeholder="e.g. Class 9 Math — Morning 2026" />
            </div>
            <div class="field">
              <label>Academic Year *</label>
              <input formControlName="academicYear" placeholder="2026-2027" />
            </div>
            <div class="field">
              <label>Class ID *</label>
              <input formControlName="classId" placeholder="CL09_MATH" />
              <small>Must match a canonical syllabus class ID.</small>
            </div>
            <div class="field">
              <label>Subject Code *</label>
              <input formControlName="subjectCode" placeholder="CL09_MATH" />
            </div>
            <div class="field">
              <label>Timezone</label>
              <input formControlName="timezone" placeholder="Asia/Kolkata" />
            </div>
            <div class="field">
              <label>Capacity</label>
              <input formControlName="capacity" type="number" placeholder="30" />
            </div>
          </div>
        </div>

        <div class="section">
          <h3>Status</h3>
          <div class="field" style="max-width: 200px">
            <label>Batch Status</label>
            <select formControlName="status">
              <option value="draft">Draft</option>
              <option value="active">Active</option>
              <option value="paused">Paused</option>
            </select>
          </div>
        </div>

        <div class="error" *ngIf="error()">{{ error() }}</div>

        <div class="form-actions">
          <a [routerLink]="['/centers', centerId, 'batches']" class="btn-cancel">Cancel</a>
          <button type="submit" [disabled]="loading() || form.invalid" class="btn-submit">
            {{ loading() ? 'Creating…' : 'Create Batch' }}
          </button>
        </div>
      </form>
    </div>
  `,
  styles: [`
    .page { max-width: 700px; margin: 0 auto; }
    .back-link { color: var(--brand); text-decoration: none; font-size: 14px; display: block; margin-bottom: 12px; }
    h1 { margin: 0 0 24px; font-size: 22px; font-weight: 700; color: var(--text-primary); }

    .form-card { background: var(--surface-primary); border-radius: 12px; box-shadow: var(--shadow-sm); overflow: hidden; }
    .section { padding: 24px; border-bottom: 1px solid var(--border-subtle); }
    h3 { margin: 0 0 16px; font-size: 15px; font-weight: 600; color: var(--text-primary); }
    .fields { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
    .field { display: flex; flex-direction: column; gap: 5px; }

    label { font-size: 13px; font-weight: 600; color: var(--text-secondary); }

    input, select {
      padding: 10px 12px;
      background: var(--surface-primary);
      color: var(--text-primary);
      border: 1px solid var(--border-default);
      border-radius: 8px;
      font-size: 14px;
      outline: none;
    }

    input:focus, select:focus {
      border-color: var(--border-focus);
      box-shadow: 0 0 0 3px var(--border-focus-ring);
    }

    small { color: var(--text-placeholder); font-size: 12px; }

    .error {
      margin: 0 24px;
      padding: 10px 12px;
      background: var(--danger-bg);
      border: 1px solid rgba(239, 68, 68, 0.2);
      color: var(--danger-text);
      border-radius: 8px;
      font-size: 13px;
    }

    .form-actions { display: flex; justify-content: flex-end; gap: 12px; padding: 20px 24px; }

    .btn-cancel {
      padding: 10px 18px;
      border: 1px solid var(--border-default);
      border-radius: 8px;
      text-decoration: none;
      color: var(--text-secondary);
      font-size: 14px;
    }

    .btn-submit {
      padding: 10px 22px;
      background: var(--brand);
      color: var(--text-inverse);
      border: none;
      border-radius: 8px;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
    }

    .btn-submit:disabled { opacity: 0.6; cursor: not-allowed; }
  `],
})
export class BatchFormComponent implements OnInit {
  private fb = inject(FormBuilder);
  private service = inject(BatchesService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);

  centerId = '';
  loading = signal(false);
  error = signal<string | null>(null);

  form = this.fb.nonNullable.group({
    name: ['', Validators.required],
    academicYear: ['2026-2027', Validators.required],
    classId: ['', Validators.required],
    subjectCode: ['', Validators.required],
    timezone: ['Asia/Kolkata'],
    capacity: [30],
    status: ['draft' as 'draft' | 'active' | 'paused'],
  });

  ngOnInit() {
    this.centerId = this.route.snapshot.paramMap.get('centerId')!;
  }

  async submit() {
    if (this.form.invalid) return;
    this.loading.set(true);
    this.error.set(null);

    const v = this.form.getRawValue();
    const batchId = `${v.classId.toLowerCase()}-${Date.now()}`;

    const res = await this.service.createBatch(this.centerId, {
      batchId,
      centerId: this.centerId,
      name: v.name,
      classId: v.classId,
      subjectCode: v.subjectCode,
      syllabusVersion: 'latest',
      teacherUids: [],
      status: v.status,
      academicYear: v.academicYear,
      timezone: v.timezone,
      capacity: v.capacity,
      enrolledCount: 0,
      recordType: 'center_batch',
    });

    if (res.ok) {
      this.router.navigate(['/centers', this.centerId, 'batches', batchId]);
    } else {
      this.error.set(res.message ?? 'Failed to create batch');
    }
    this.loading.set(false);
  }
}
