import { Component, inject, OnInit, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, ActivatedRoute, RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';
import { CentersService } from '../centers.service';
import { AdminAuthService } from '../../../core/services/auth/admin-auth.service';

@Component({
  selector: 'app-center-form',
  standalone: true,
  imports: [ReactiveFormsModule, CommonModule, RouterLink],
  template: `
    <div class="page">
      <header class="page-header">
        <a routerLink="/centers" class="back-link">← Centers</a>
        <h1>{{ isEdit() ? 'Edit Center' : 'Add New Center' }}</h1>
      </header>

      <form [formGroup]="form" (ngSubmit)="submit()" class="form-card">
        <div class="section">
          <h3>Basic Information</h3>
          <div class="fields">
            <div class="field">
              <label>Center Name *</label>
              <input formControlName="name" placeholder="e.g. ABC Tuition Center" />
            </div>
            <div class="field">
              <label>Slug *</label>
              <input formControlName="slug" placeholder="abc-tuition-center" />
              <small>URL-friendly identifier. Used in public URLs.</small>
            </div>
            <div class="field full">
              <label>Summary *</label>
              <textarea formControlName="summary" rows="3" placeholder="Brief description of the center"></textarea>
            </div>
            <div class="field">
              <label>City *</label>
              <input formControlName="city" placeholder="e.g. Bengaluru" />
            </div>
            <div class="field">
              <label>Country Code</label>
              <input formControlName="countryCode" placeholder="IN" />
            </div>
          </div>
        </div>

        <div class="section">
          <h3>Curricula Offered</h3>
          <div class="field full">
            <label>Class IDs (comma-separated)</label>
            <input formControlName="syllabusClassIds" placeholder="CL09_MATH, CL10_MATH" />
            <small>These should match canonical syllabus class IDs from R2.</small>
          </div>
        </div>

        <div class="section">
          <h3>Status</h3>
          <div class="fields">
            <div class="field">
              <label>Publication</label>
              <select formControlName="publication">
                <option value="draft">Draft</option>
                <option value="published">Published</option>
                <option value="archived">Archived</option>
              </select>
            </div>
            <div class="field">
              <label>Approval Status</label>
              <select formControlName="approvalStatus">
                <option value="pending">Pending</option>
                <option value="approved">Approved</option>
                <option value="rejected">Rejected</option>
                <option value="suspended">Suspended</option>
              </select>
            </div>
          </div>
        </div>

        <div class="error" *ngIf="error()">{{ error() }}</div>

        <div class="form-actions">
          <a routerLink="/centers" class="btn-cancel">Cancel</a>
          <button type="submit" [disabled]="loading() || form.invalid" class="btn-submit">
            {{ loading() ? 'Saving…' : (isEdit() ? 'Save Changes' : 'Create Center') }}
          </button>
        </div>
      </form>
    </div>
  `,
  styles: [`
    .page { max-width: 800px; margin: 0 auto; }

    .back-link { color: #3b82f6; text-decoration: none; font-size: 14px; display: block; margin-bottom: 12px; }

    h1 { margin: 0 0 24px; font-size: 22px; font-weight: 700; color: #1e293b; }

    .form-card {
      background: #fff;
      border-radius: 12px;
      box-shadow: 0 1px 4px rgba(0,0,0,0.06);
      overflow: hidden;
    }

    .section {
      padding: 24px;
      border-bottom: 1px solid #f1f5f9;
    }

    h3 { margin: 0 0 16px; font-size: 15px; font-weight: 600; color: #1e293b; }

    .fields {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 16px;
    }

    .field { display: flex; flex-direction: column; gap: 5px; }
    .field.full { grid-column: 1 / -1; }

    label { font-size: 13px; font-weight: 600; color: #374151; }

    input, textarea, select {
      padding: 10px 12px;
      border: 1px solid #d1d5db;
      border-radius: 8px;
      font-size: 14px;
      outline: none;
      font-family: inherit;
    }

    input:focus, textarea:focus, select:focus {
      border-color: #3b82f6;
      box-shadow: 0 0 0 3px rgba(59,130,246,0.1);
    }

    small { color: #94a3b8; font-size: 12px; }

    .error {
      margin: 0 24px;
      padding: 10px 12px;
      background: #fef2f2;
      border: 1px solid #fecaca;
      color: #dc2626;
      border-radius: 8px;
      font-size: 13px;
    }

    .form-actions {
      display: flex;
      justify-content: flex-end;
      gap: 12px;
      padding: 20px 24px;
    }

    .btn-cancel {
      padding: 10px 18px;
      border: 1px solid #d1d5db;
      border-radius: 8px;
      text-decoration: none;
      color: #374151;
      font-size: 14px;
    }

    .btn-submit {
      padding: 10px 22px;
      background: #3b82f6;
      color: #fff;
      border: none;
      border-radius: 8px;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
    }

    .btn-submit:disabled { opacity: 0.6; cursor: not-allowed; }
  `],
})
export class CenterFormComponent implements OnInit {
  private fb = inject(FormBuilder);
  private service = inject(CentersService);
  private auth = inject(AdminAuthService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);

  isEdit = signal(false);
  loading = signal(false);
  error = signal<string | null>(null);

  form = this.fb.nonNullable.group({
    name: ['', Validators.required],
    slug: ['', [Validators.required, Validators.pattern(/^[a-z0-9-]+$/)]],
    summary: ['', Validators.required],
    city: ['', Validators.required],
    countryCode: ['IN'],
    syllabusClassIds: [''],
    publication: ['draft' as 'draft' | 'published' | 'archived'],
    approvalStatus: ['pending' as 'pending' | 'approved' | 'rejected' | 'suspended'],
  });

  ngOnInit() {
    const centerId = this.route.snapshot.paramMap.get('centerId');
    if (centerId) {
      this.isEdit.set(true);
      // TODO: load existing center data into form
    }

    // Auto-generate slug from name
    this.form.get('name')?.valueChanges.subscribe(name => {
      if (!this.isEdit()) {
        this.form.patchValue({
          slug: name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, ''),
        });
      }
    });
  }

  async submit() {
    if (this.form.invalid) return;
    this.loading.set(true);
    this.error.set(null);

    const v = this.form.getRawValue();
    const classIds = v.syllabusClassIds
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);

    const centerId = v.slug; // use slug as centerId for simplicity

    const res = await this.service.createCenter({
      centerId,
      slug: v.slug,
      name: v.name,
      summary: v.summary,
      city: v.city,
      countryCode: v.countryCode,
      offeredSyllabusClassIds: classIds,
      publication: v.publication,
      approvalStatus: v.approvalStatus,
      schemaVersion: 1,
    });

    if (res.ok) {
      this.router.navigate(['/centers', centerId]);
    } else {
      this.error.set(res.message ?? 'Failed to save center');
    }
    this.loading.set(false);
  }
}
