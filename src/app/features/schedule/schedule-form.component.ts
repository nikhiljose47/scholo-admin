import { Component, inject, OnInit, signal, computed } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, ActivatedRoute, RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';
import { ScheduleService, toISTDateStr, toISTTimeStr } from './schedule.service';
import { SyllabusService } from './syllabus.service';
import { UsersDirectoryService } from '../../core/services/users/users-directory.service';
import { AdminAuthService } from '../../core/services/auth/admin-auth.service';
import { UploadService, MAX_LIVE_IMAGES, slotFromUrl } from '../../core/services/storage/upload.service';
import { ProvidersService } from '../providers/providers.service';
import { ClassProgressService } from '../progress/class-progress.service';
import { UserModel } from '../../models/user/user.model';
import { ClassDoc } from '../../models/content/content.model';
import { ClassSyllabus, Subject, Chapter, Division, SyllabusIndexEntry } from '../../models/syllabus/syllabus.model';

const DURATION_OPTIONS = [30, 45, 60, 90, 120];

/** Fixed placeholders until per-center management is used. 'default' matches legacy meetings. */
const DEFAULT_CENTER_ID = 'scholo-basic';
const DEFAULT_BATCH_ID = 'default';

interface ConfirmPayload {
  className: string;
  chapter: string;
  division: string | null;
  time: string;
  duration: number;
}

interface ImageItem {
  /** Existing image: download URL + storage slot. New image: the encoded blob only. */
  url?: string;
  slot?: number;
  blob?: Blob;
  preview: string;
}

@Component({
  selector: 'app-schedule-form',
  standalone: true,
  imports: [ReactiveFormsModule, CommonModule, RouterLink],
  template: `
    <!-- Confirm modal -->
    <div class="modal-backdrop" *ngIf="confirmPayload()" (click)="confirmCancel()">
      <div class="modal-box" (click)="$event.stopPropagation()">
        <div class="modal-icon-wrap">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
            <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/>
            <line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
          </svg>
        </div>
        <h2 class="modal-title">Confirm Schedule</h2>
        <div class="modal-rows">
          <div class="modal-row">
            <span class="mrow-label">Class</span>
            <span class="mrow-value">{{ confirmPayload()!.className }}</span>
          </div>
          <div class="modal-row">
            <span class="mrow-label">Chapter</span>
            <span class="mrow-value">{{ confirmPayload()!.chapter }}</span>
          </div>
          <div class="modal-row" *ngIf="confirmPayload()!.division">
            <span class="mrow-label">Division</span>
            <span class="mrow-value">{{ confirmPayload()!.division }}</span>
          </div>
          <div class="modal-row">
            <span class="mrow-label">Time</span>
            <span class="mrow-value">{{ confirmPayload()!.time }} IST</span>
          </div>
          <div class="modal-row">
            <span class="mrow-label">Duration</span>
            <span class="mrow-value">{{ confirmPayload()!.duration }} min</span>
          </div>
        </div>
        <div class="modal-actions">
          <button class="modal-cancel" (click)="confirmCancel()">Cancel</button>
          <button class="modal-confirm" (click)="confirmOk()">Schedule class →</button>
        </div>
      </div>
    </div>

    <div class="page">
      <header class="page-header">
        <a routerLink="/schedule" class="back-link">← Schedule</a>
        <h1>{{ isEdit() ? 'Edit Session' : 'Schedule a Class' }}</h1>
        <p class="page-sub" *ngIf="!isEdit() && !auth.isAdmin()">
          Scheduling as <strong>{{ auth.userProfile()?.name }}</strong>
          &nbsp;·&nbsp; {{ defaultCenterName }}
        </p>
      </header>

      <form [formGroup]="form" (ngSubmit)="submit()" class="form-card">

        <!-- Class / Subject / Chapter / Division: cascading dropdowns -->
        <div class="section" *ngIf="!isEdit()">
          <h3>Class Details</h3>
          <div class="fields">
            <div class="field">
              <label>Class *</label>
              <select formControlName="classId" (change)="onClassChange()">
                <option value="">— Select class —</option>
                <option *ngFor="let c of classOptions()" [value]="c.classId">{{ c.className }}</option>
              </select>
              <small class="field-error" *ngIf="classLoadError()">Couldn't load classes — check connection and reload.</small>
            </div>
            <div class="field">
              <label>Subject *</label>
              <select formControlName="subjectCode" (change)="onSubjectChange()" [disabled]="subjects().length === 0">
                <option value="">— Select subject —</option>
                <option *ngFor="let s of subjects()" [value]="s.code">{{ s.name }}</option>
              </select>
            </div>
            <div class="field full">
              <label>Chapter *</label>
              <select formControlName="chapterCode" (change)="onChapterChange()" [disabled]="chapters().length === 0">
                <option value="">— Select chapter —</option>
                <option *ngFor="let ch of chapters()" [value]="ch.code"
                        [disabled]="doneChapterCodes().has(ch.code)">
                  {{ doneChapterCodes().has(ch.code) ? '✓ ' : '' }}{{ ch.name }}
                </option>
              </select>
              <small *ngIf="doneChapterCodes().size > 0" class="progress-hint">
                Greyed-out chapters are already completed. To teach one again,
                update the progress on the <a routerLink="/progress" class="hint-link">Progress page</a>.
              </small>
            </div>
            <div class="field full" *ngIf="divisions().length > 0">
              <label>Division <span class="opt-label">(optional)</span></label>
              <select (change)="onDivisionChange($any($event.target).value)">
                <option value="">— Select division —</option>
                <option *ngFor="let d of divisions()" [value]="d.code">{{ d.code }} — {{ d.name }}</option>
              </select>
            </div>
          </div>
          <small *ngIf="syllabusLoading()" class="loading-hint">Loading syllabus…</small>
        </div>

        <!-- Edit mode: chapter only -->
        <div class="section" *ngIf="isEdit()">
          <h3>Chapter</h3>
          <div class="field">
            <label>Chapter *</label>
            <select formControlName="chapterCode" [disabled]="chapters().length === 0">
              <option value="">— Select chapter —</option>
              <option *ngFor="let ch of chapters()" [value]="ch.code">{{ ch.name }}</option>
            </select>
          </div>
        </div>

        <!-- Date & Time -->
        <div class="section">
          <h3>Date & Time <span class="section-hint">(IST)</span></h3>
          <div class="dt-grid">
            <!-- Date -->
            <div class="field">
              <label>Date *</label>
              <input formControlName="dateStr" type="date" class="dt-input" />
            </div>

            <!-- Duration -->
            <div class="field">
              <label>Duration *</label>
              <select formControlName="durationMinutes" class="dt-input">
                <option *ngFor="let d of durationOptions" [value]="d">{{ d }} min</option>
              </select>
            </div>

            <!-- Time picker — full width row -->
            <div class="field dt-full">
              <label>Start time *</label>
              <div class="time-picker">
                <div class="tp-slot">
                  <span class="tp-slot-label">Hr</span>
                  <select [value]="timeHour()" (change)="updateTimePart('hour', $any($event.target).value)" class="tp-select">
                    <option value="">—</option>
                    <option *ngFor="let h of hours" [value]="h">{{ h }}</option>
                  </select>
                </div>
                <span class="tp-colon">:</span>
                <div class="tp-slot">
                  <span class="tp-slot-label">Min</span>
                  <select [value]="timeMinute()" (change)="updateTimePart('minute', $any($event.target).value)" class="tp-select">
                    <option *ngFor="let m of minutes" [value]="m">{{ m }}</option>
                  </select>
                </div>
                <div class="period-switch">
                  <button type="button" [class.active]="timePeriod() === 'AM'" (click)="updateTimePart('period', 'AM')">AM</button>
                  <button type="button" [class.active]="timePeriod() === 'PM'" (click)="updateTimePart('period', 'PM')">PM</button>
                </div>
              </div>
            </div>
          </div>

          <div class="time-range-preview" *ngIf="endTimePreview()">
            <span class="trp-icon">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
              </svg>
            </span>
            <span class="trp-value">{{ endTimePreview() }}</span>
          </div>
        </div>

        <!-- Teacher (admin only for assignment) -->
        <div class="section" *ngIf="!isEdit() && auth.isAdmin()">
          <h3>Teacher</h3>
          <div class="field">
            <label>Assign Teacher *</label>
            <select formControlName="teacherId" (change)="onTeacherChange()">
              <option value="">— Select teacher —</option>
              <option *ngFor="let t of teachers()" [value]="t.uid">{{ t.name }}</option>
            </select>
          </div>
        </div>

        <!-- Meet link -->
        <div class="section">
          <h3>Meet Link</h3>
          <div class="field full">
            <label>Google Meet URL *</label>
            <input formControlName="meetLink" type="url" placeholder="https://meet.google.com/xxx-xxxx-xxx" />
            <small>Visible to all who can read this session's record.</small>
          </div>
        </div>

        <!-- Live-class thumbnail images -->
        <div class="section" *ngIf="canEditImages()">
          <h3>Live images <span class="section-hint">(optional, up to {{ maxImages }})</span></h3>
          <p class="img-note">Shown as an animated thumbnail while the class is live.</p>
          <div class="img-grid">
            <div class="img-item" *ngFor="let img of images(); let i = index">
              <img [src]="img.preview" alt="Live class image {{ i + 1 }}" />
              <span class="img-badge">{{ i + 1 }}</span>
              <div class="img-actions">
                <button type="button" (click)="moveImage(i, -1)" [disabled]="i === 0 || busy()">←</button>
                <button type="button" (click)="moveImage(i, 1)" [disabled]="i === images().length - 1 || busy()">→</button>
                <button type="button" (click)="removeImage(i)" [disabled]="busy()">✕</button>
              </div>
            </div>
            <label class="img-add" *ngIf="images().length < maxImages">
              <input type="file" accept="image/*" multiple (change)="onFilesPicked($event)" [disabled]="busy()" hidden />
              + Add image
            </label>
          </div>
          <div class="progress" *ngIf="uploadProgress() !== null">
            <div class="bar"><div class="fill" [style.width.%]="(uploadProgress() ?? 0) * 100"></div></div>
            <small>Uploading… {{ ((uploadProgress() ?? 0) * 100) | number:'1.0-0' }}%</small>
          </div>
          <div class="field-error inline-err" *ngIf="imageError()">{{ imageError() }}</div>
        </div>

        <div class="form-error" *ngIf="error()">{{ error() }}</div>

        <div class="form-actions">
          <a routerLink="/schedule" class="btn-cancel">{{ createdId() ? 'Skip images' : 'Cancel' }}</a>
          <button type="submit" [disabled]="loading() || form.invalid" class="btn-submit">
            {{ loading() ? 'Saving…' : (createdId() ? 'Retry images' : (isEdit() ? 'Save Changes' : 'Schedule Class')) }}
          </button>
        </div>
      </form>
    </div>
  `,
  styles: [`
    /* Page */
    .page { max-width: 760px; margin: 0 auto; }
    .back-link { color: var(--brand); text-decoration: none; font-size: 13px; display: block; margin-bottom: 6px; }
    h1 { margin: 0 0 4px; font-size: 20px; font-weight: 700; color: var(--text-primary); }
    .page-sub { margin: 0 0 14px; font-size: 13px; color: var(--text-muted); }

    /* Form card */
    .form-card { background: var(--surface-primary); border-radius: 12px; box-shadow: var(--shadow-sm); overflow: hidden; }
    .section { padding: 18px 22px; border-bottom: 1px solid var(--border-subtle); }
    h3 { margin: 0 0 12px; font-size: 14px; font-weight: 600; color: var(--text-primary); }
    .section-hint { font-weight: 400; color: var(--text-placeholder); font-size: 12px; }

    .fields { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .field { display: flex; flex-direction: column; gap: 4px; }
    .field.full { grid-column: 1 / -1; }

    label { font-size: 12px; font-weight: 600; color: var(--text-secondary); letter-spacing: 0.01em; }
    .opt-label { font-weight: 400; color: var(--text-placeholder); }

    input, select, textarea {
      padding: 9px 11px;
      border: 1px solid var(--border-default);
      border-radius: 8px;
      font-size: 14px;
      outline: none;
      font-family: inherit;
      background: var(--surface-primary);
      color: var(--text-primary);
    }
    input:focus, select:focus { border-color: var(--border-focus); box-shadow: 0 0 0 3px var(--border-focus-ring); }
    select:disabled { background: var(--surface-secondary); color: var(--text-placeholder); cursor: not-allowed; }

    small { color: var(--text-placeholder); font-size: 12px; }

    .progress-hint {
      color: var(--text-muted);
      font-size: 12px;
      margin-top: 2px;
    }
    .hint-link { color: var(--brand); text-decoration: none; font-weight: 600; }
    .hint-link:hover { text-decoration: underline; }

    .loading-hint { color: var(--text-placeholder); font-size: 12px; display: block; margin-top: 8px; }

    /* Date/time grid */
    .dt-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .dt-full { grid-column: 1 / -1; }
    .dt-input { width: 100%; }

    /* Time picker */
    .time-picker { display: flex; align-items: flex-end; gap: 8px; }
    .tp-slot { display: flex; flex-direction: column; gap: 4px; }
    .tp-slot-label { font-size: 11px; font-weight: 500; color: var(--text-placeholder); letter-spacing: 0.04em; }
    .tp-select { width: 72px; text-align: center; }
    .tp-colon { font-size: 18px; font-weight: 700; color: var(--text-muted); padding-bottom: 9px; }

    /* Time range preview */
    .time-range-preview {
      display: inline-flex; align-items: center; gap: 6px;
      margin-top: 12px; padding: 6px 12px;
      background: var(--surface-secondary); border-radius: 20px;
      font-size: 12px; font-weight: 600; color: var(--text-secondary);
    }
    .trp-icon { color: var(--text-muted); display: flex; align-items: center; }
    .trp-value { color: var(--text-primary); }

    .field-error { color: var(--danger-text, #dc2626); font-size: 12px; }

    .form-error {
      margin: 0 22px;
      padding: 10px 12px;
      background: var(--danger-bg);
      border: 1px solid rgba(239,68,68,.2);
      color: var(--danger-text);
      border-radius: 8px;
      font-size: 13px;
    }
    .inline-err { margin: 8px 0 0; }

    .form-actions { display: flex; justify-content: flex-end; gap: 10px; padding: 16px 22px; }

    .btn-cancel {
      padding: 9px 16px;
      border: 1px solid var(--border-default);
      border-radius: 8px;
      text-decoration: none;
      color: var(--text-secondary);
      font-size: 13px;
    }
    .btn-submit {
      padding: 9px 20px;
      background: var(--brand);
      color: var(--text-inverse);
      border: none;
      border-radius: 8px;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
    }
    .btn-submit:disabled { opacity: 0.6; cursor: not-allowed; }

    /* Images */
    .img-note { margin: 0 0 10px; font-size: 12px; color: var(--text-placeholder); }
    .img-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 10px; }
    .img-item { position: relative; border: 1px solid var(--border-default); border-radius: 8px; overflow: hidden; background: var(--surface-secondary); }
    .img-item img { display: block; width: 100%; aspect-ratio: 4/3; object-fit: cover; }
    .img-badge { position: absolute; top: 5px; left: 5px; background: rgba(15,23,42,.75); color: #fff; font-size: 10px; border-radius: 10px; padding: 1px 6px; }
    .img-actions { display: flex; justify-content: space-between; padding: 3px; gap: 3px; }
    .img-actions button { flex: 1; padding: 4px 0; border: 1px solid var(--border-default); border-radius: 6px; background: var(--surface-primary); cursor: pointer; font-size: 12px; color: var(--text-primary); }
    .img-actions button:disabled { opacity: .4; cursor: not-allowed; }
    .img-add { display: flex; align-items: center; justify-content: center; min-height: 90px; border: 2px dashed var(--border-strong); border-radius: 8px; color: var(--brand); font-size: 13px; font-weight: 600; cursor: pointer; }
    .progress { margin-top: 10px; }
    .bar { height: 5px; background: var(--border-default); border-radius: 3px; overflow: hidden; margin-bottom: 4px; }
    .fill { height: 100%; background: var(--brand); transition: width .15s; }

    /* AM/PM switch */
    .period-switch { display: flex; border: 1px solid var(--border-default); border-radius: 8px; overflow: hidden; background: var(--surface-secondary); align-self: flex-end; }
    .period-switch button { flex: 1; padding: 9px 14px; border: none; background: transparent; font-size: 13px; font-weight: 600; color: var(--text-muted); cursor: pointer; transition: background .12s, color .12s; font-family: inherit; white-space: nowrap; }
    .period-switch button.active { background: var(--text-primary); color: var(--surface-primary); }

    /* Confirm modal */
    .modal-backdrop {
      position: fixed; inset: 0; z-index: 900;
      background: rgba(0,0,0,.4);
      backdrop-filter: blur(2px);
      display: flex; align-items: center; justify-content: center;
      padding: 20px;
      animation: fade-in .15s ease;
    }
    @keyframes fade-in { from { opacity: 0; } to { opacity: 1; } }

    .modal-box {
      background: var(--surface-primary);
      border-radius: 16px;
      padding: 28px 28px 22px;
      width: 100%; max-width: 360px;
      box-shadow: 0 20px 60px rgba(0,0,0,.25);
      animation: slide-up .18s ease;
      display: flex; flex-direction: column; gap: 18px;
    }
    @keyframes slide-up { from { transform: translateY(12px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }

    .modal-icon-wrap {
      width: 48px; height: 48px;
      border-radius: 12px;
      background: var(--brand-subtle, rgba(99,102,241,.1));
      color: var(--brand);
      display: flex; align-items: center; justify-content: center;
    }

    .modal-title { margin: 0; font-size: 17px; font-weight: 700; color: var(--text-primary); }

    .modal-rows { display: flex; flex-direction: column; gap: 0; border: 1px solid var(--border-subtle); border-radius: 10px; overflow: hidden; }
    .modal-row { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; padding: 9px 14px; border-bottom: 1px solid var(--border-subtle); }
    .modal-row:last-child { border-bottom: none; }
    .mrow-label { font-size: 12px; font-weight: 600; color: var(--text-muted); flex-shrink: 0; padding-top: 1px; }
    .mrow-value { font-size: 13px; color: var(--text-primary); text-align: right; font-weight: 500; }

    .modal-actions { display: flex; gap: 10px; }
    .modal-cancel {
      flex: 1; padding: 10px; border: 1px solid var(--border-default); border-radius: 9px;
      background: transparent; color: var(--text-secondary); font-size: 13px; font-weight: 500;
      cursor: pointer; font-family: inherit;
    }
    .modal-confirm {
      flex: 2; padding: 10px; border: none; border-radius: 9px;
      background: var(--brand); color: var(--text-inverse); font-size: 13px; font-weight: 600;
      cursor: pointer; font-family: inherit;
    }
    .modal-confirm:hover { opacity: .92; }
    .modal-cancel:hover { background: var(--surface-secondary); }
  `],
})
export class ScheduleFormComponent implements OnInit {
  private fb = inject(FormBuilder);
  private service = inject(ScheduleService);
  private syllabusService = inject(SyllabusService);
  private directory = inject(UsersDirectoryService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private uploads = inject(UploadService);
  private providersService = inject(ProvidersService);
  private progressService = inject(ClassProgressService);
  auth = inject(AdminAuthService);

  isEdit = signal(false);
  loading = signal(false);
  syllabusLoading = signal(false);
  error = signal<string | null>(null);
  confirmPayload = signal<ConfirmPayload | null>(null);

  readonly defaultCenterName = 'Scholo Basic';
  readonly defaultBatchName = 'Default batch';
  teachers = signal<UserModel[]>([]);

  classOptions = signal<SyllabusIndexEntry[]>([]);
  private classSyllabus = signal<ClassSyllabus | null>(null);
  private classDocs = signal<ClassDoc[]>([]);
  subjects = computed<Subject[]>(() => this.classSyllabus()?.subjects ?? []);
  private selectedSubject = signal<Subject | null>(null);
  selectedChapter = signal<Chapter | null>(null);
  selectedDivision = signal<Division | null>(null);
  divisions = computed<Division[]>(() => this.selectedChapter()?.divisions ?? []);

  /** Chapter code currently set as progress for the selected class/center. */
  private curChapterCode = signal<string | null>(null);

  /** All chapters across every subject for the selected class (flat list, in order). */
  private allChapters = computed<Chapter[]>(() =>
    (this.classSyllabus()?.subjects ?? []).flatMap(s => s.chapters),
  );

  /** Set of chapter codes in the current subject that are already completed (flatIdx < progress cursor). */
  doneChapterCodes = computed<Set<string>>(() => {
    if (this.isEdit() || !this.curChapterCode()) return new Set();
    const allCh = this.allChapters();
    const curFlatIdx = allCh.findIndex(c => c.code === this.curChapterCode());
    if (curFlatIdx <= 0) return new Set();
    return new Set(
      (this.selectedSubject()?.chapters ?? [])
        .filter(ch => allCh.findIndex(c => c.code === ch.code) < curFlatIdx)
        .map(ch => ch.code),
    );
  });

  /** All chapters in the selected subject — done ones are shown disabled, not hidden. */
  chapters = computed<Chapter[]>(() => this.selectedSubject()?.chapters ?? []);

  durationOptions = DURATION_OPTIONS;

  // Time picker state (12h display → 24h form value)
  readonly hours = ['1','2','3','4','5','6','7','8','9','10','11','12'];
  readonly minutes = ['00','15','30','45'];
  timeHour = signal('');
  timeMinute = signal('00');
  timePeriod = signal<'AM' | 'PM'>('PM');

  // Live-class images
  readonly maxImages = MAX_LIVE_IMAGES;
  images = signal<ImageItem[]>([]);
  imageError = signal<string | null>(null);
  classLoadError = signal(false);
  uploadProgress = signal<number | null>(null);
  /** Set once the meeting doc exists (after create) so a retry only redoes images. */
  createdId = signal<string | null>(null);
  private meetingTeacherId = signal<string | null>(null);
  private originalSlots: number[] = [];
  private encoding = signal(false);
  busy = computed(() => this.loading() || this.encoding());
  /** Admins: any meeting. Teachers: only their own (create always schedules as self). */
  canEditImages = computed(() =>
    this.auth.isAdmin() || !this.isEdit() || this.meetingTeacherId() === this.auth.uid);

  form = this.fb.nonNullable.group({
    classId: ['', Validators.required],
    subjectCode: ['', Validators.required],
    chapterCode: ['', Validators.required],
    dateStr: ['', Validators.required],
    timeStr: ['', Validators.required],
    durationMinutes: [60, [Validators.required, Validators.min(10)]],
    teacherId: [''],
    teacherName: [''],
    meetLink: ['', [Validators.required, Validators.pattern(/^https?:\/\/.+/)]],
  });

  updateTimePart(part: 'hour' | 'minute' | 'period', value: string) {
    if (part === 'hour')   this.timeHour.set(value);
    if (part === 'minute') this.timeMinute.set(value);
    if (part === 'period') this.timePeriod.set(value as 'AM' | 'PM');
    this.syncTimeToForm();
  }

  private syncTimeToForm() {
    const h = parseInt(this.timeHour(), 10);
    if (!h) return;
    const m = this.timeMinute();
    let hour24 = h % 12;
    if (this.timePeriod() === 'PM') hour24 += 12;
    this.form.patchValue({ timeStr: `${String(hour24).padStart(2, '0')}:${m}` });
  }

  private setTimeFromStr(timeStr: string) {
    const [hStr, mStr] = timeStr.split(':');
    let h24 = parseInt(hStr, 10);
    const period: 'AM' | 'PM' = h24 >= 12 ? 'PM' : 'AM';
    const h12 = h24 % 12 || 12;
    const mNum = parseInt(mStr, 10);
    const snapped = [0, 15, 30, 45].reduce((p, c) => Math.abs(c - mNum) < Math.abs(p - mNum) ? c : p, 0);
    this.timeHour.set(String(h12));
    this.timeMinute.set(String(snapped).padStart(2, '0'));
    this.timePeriod.set(period);
  }

  endTimePreview() {
    const { dateStr, timeStr, durationMinutes } = this.form.getRawValue();
    if (!dateStr || !timeStr) return null;
    try {
      const [h, m] = timeStr.split(':').map(Number);
      const dur = Number(durationMinutes) || 0;   // coerce — select values are strings

      const startPeriod = h >= 12 ? 'PM' : 'AM';
      const startH12 = h % 12 || 12;
      const startStr = `${startH12}:${String(m).padStart(2, '0')} ${startPeriod}`;

      const totalMin = h * 60 + m + dur;
      const endH24 = Math.floor(totalMin / 60) % 24;
      const endM = totalMin % 60;
      const endPeriod = endH24 >= 12 ? 'PM' : 'AM';
      const endH12 = endH24 % 12 || 12;
      const endStr = `${endH12}:${String(endM).padStart(2, '0')} ${endPeriod}`;

      return `${startStr} → ${endStr} IST`;
    } catch { return null; }
  }

  async ngOnInit() {
    const meetingId = this.route.snapshot.paramMap.get('meetingId');

    // The syllabus index (class list) is needed either way: for the create
    // dropdown, or implicitly via loadClass() when editing.
    try {
      this.classOptions.set(await this.syllabusService.listClasses());
    } catch {
      // Don't let a syllabus outage (e.g. CORS/network) abort the rest of the form setup.
      this.classLoadError.set(true);
    }

    // Pre-load Firestore class docs — needed to map catalog classId → docId/centerId
    // for progress lookup. ProvidersService caches this for 5 min so it's free on repeat visits.
    try {
      const res = await this.providersService.listClasses();
      if (res.ok) this.classDocs.set(res.data ?? []);
    } catch { /* non-fatal */ }

    if (meetingId) {
      this.isEdit.set(true);
      const res = await this.service.getMeeting(meetingId);
      if (res.data) {
        const m = res.data;
        this.meetingTeacherId.set(m.teacherId);
        const urls = (m.liveImages ?? []).slice(0, MAX_LIVE_IMAGES);
        this.images.set(urls.map((url, i) => ({ url, slot: slotFromUrl(url) ?? i + 1, preview: url })));
        this.originalSlots = this.images().map(i => i.slot!);
        const istTime = toISTTimeStr(m.date);
        this.form.patchValue({
          meetLink: m.meetLink,
          dateStr: toISTDateStr(m.date),
          timeStr: istTime,
          durationMinutes: m.duration,
        });
        this.setTimeFromStr(istTime);

        // Load just enough syllabus to populate the chapter dropdown for this session's class/subject.
        this.syllabusLoading.set(true);
        const classSyllabus = await this.syllabusService.loadClass(m.classId);
        this.classSyllabus.set(classSyllabus);
        const subject = classSyllabus?.subjects.find(s => s.code === m.subjectId) ?? null;
        this.selectedSubject.set(subject);
        this.syllabusLoading.set(false);

        this.form.patchValue({ chapterCode: m.chapterCode });
      }
    } else {
      // Pre-fill today's date
      const today = new Date().toISOString().slice(0, 10);
      this.form.patchValue({ dateStr: today });

      // Non-admins always schedule as themselves — never expose or assign another teacher.
      if (!this.auth.isAdmin()) {
        const profile = this.auth.userProfile();
        this.form.patchValue({
          teacherId: this.auth.uid ?? '',
          teacherName: profile?.name ?? '',
        });
      }

      // Only admins need the full teacher directory (to assign a session to someone else).
      const teachersRes = this.auth.isAdmin() ? await this.directory.listTeachers() : { ok: true, data: [] as UserModel[] };
      this.teachers.set(teachersRes.data ?? []);
    }
  }

  async onClassChange() {
    const classId = this.form.get('classId')?.value;
    this.form.patchValue({ subjectCode: '', chapterCode: '' });
    this.classSyllabus.set(null);
    this.selectedSubject.set(null);
    this.selectedChapter.set(null);
    this.selectedDivision.set(null);
    this.curChapterCode.set(null);
    if (!classId) return;

    this.syllabusLoading.set(true);
    const classSyllabus = await this.syllabusService.loadClass(classId);
    this.classSyllabus.set(classSyllabus);
    this.syllabusLoading.set(false);

    // Find the Firestore class doc matching this catalog classId to get docId + centerId.
    const docs = this.classDocs();
    const classDoc = docs.find(d => d.classId === classId) ?? docs.find(d => d.id === classId);
    if (classDoc?.providerId) {
      const curCode = await this.progressService.getCurrentChapter(classDoc.id, classDoc.providerId).catch(() => null);
      this.curChapterCode.set(curCode);
    }
  }

  onSubjectChange() {
    const code = this.form.get('subjectCode')?.value;
    this.form.patchValue({ chapterCode: '' });
    const subject = this.subjects().find(s => s.code === code) ?? null;
    this.selectedSubject.set(subject);
    this.selectedChapter.set(null);
    this.selectedDivision.set(null);
  }

  onChapterChange() {
    const code = this.form.get('chapterCode')?.value;
    const chapter = this.chapters().find(c => c.code === code) ?? null;
    this.selectedChapter.set(chapter);
    this.selectedDivision.set(null);
  }

  onDivisionChange(code: string) {
    const div = this.divisions().find(d => d.code === code) ?? null;
    this.selectedDivision.set(div);
  }

  onTeacherChange() {
    const tid = this.form.get('teacherId')?.value;
    const teacher = this.teachers().find(t => t.uid === tid);
    if (teacher) this.form.patchValue({ teacherName: teacher.name });
  }

  async onFilesPicked(ev: Event) {
    const input = ev.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    input.value = '';
    this.imageError.set(null);
    const room = MAX_LIVE_IMAGES - this.images().length;
    if (files.length > room) this.imageError.set(`Only ${MAX_LIVE_IMAGES} images are allowed; extra files were ignored.`);

    this.encoding.set(true);
    try {
      for (const file of files.slice(0, Math.max(0, room))) {
        try {
          const blob = await this.uploads.toWebp(file);
          this.images.update(a => [...a, { blob, preview: URL.createObjectURL(blob) }]);
        } catch (e) {
          this.imageError.set((e as Error).message);
        }
      }
    } finally {
      this.encoding.set(false);
    }
  }

  removeImage(i: number) {
    const item = this.images()[i];
    if (item?.blob) URL.revokeObjectURL(item.preview);
    this.images.update(a => a.filter((_, idx) => idx !== i));
  }

  moveImage(i: number, delta: number) {
    const j = i + delta;
    this.images.update(a => {
      if (j < 0 || j >= a.length) return a;
      const copy = [...a];
      [copy[i], copy[j]] = [copy[j], copy[i]];
      return copy;
    });
  }

  /** Reconcile storage with the picker and return the final ordered URLs.
   *  Kept images keep their slot; new ones take free slots; dropped slots are deleted.
   *  Throws on upload failure, leaving the picker intact so the user can retry. */
  private async syncImages(meetingId: string): Promise<string[]> {
    const items = this.images();
    const keptSlots = new Set(items.filter(i => i.url).map(i => i.slot!));
    const free = [1, 2, 3, 4].filter(s => !keptSlots.has(s));
    const fresh = items.filter(i => i.blob);

    // Delete slots that were removed and won't be overwritten by a new upload.
    const reused = new Set(free.slice(0, fresh.length));
    for (const s of this.originalSlots.filter(s => !keptSlots.has(s) && !reused.has(s))) {
      try { await this.uploads.deleteSlot(meetingId, s); } catch { /* best effort; lifecycle rule cleans up */ }
    }

    const total = fresh.length;
    const done = new Array<number>(total).fill(0);
    const report = () => this.uploadProgress.set(total ? done.reduce((a, b) => a + b, 0) / total : null);
    if (total) this.uploadProgress.set(0);

    try {
      let n = 0;
      const next = [...items];
      for (let idx = 0; idx < next.length; idx++) {
        const it = next[idx];
        if (!it.blob) continue;
        const k = n++;
        const slot = free[k];
        const url = await this.uploads.uploadSlot(meetingId, slot, it.blob, f => { done[k] = f; report(); });
        done[k] = 1;
        report();
        // Promote to an existing image so a retry doesn't re-upload it.
        next[idx] = { url, slot, preview: it.preview };
        this.images.set([...next]);
      }
      this.originalSlots = next.map(i => i.slot!);
      return next.map(i => i.url!);
    } finally {
      this.uploadProgress.set(null);
    }
  }

  private async saveImages(meetingId: string): Promise<boolean> {
    this.imageError.set(null);
    try {
      const urls = await this.syncImages(meetingId);
      const res = await this.service.updateMeeting(meetingId, { liveImages: urls });
      if (!res.ok) throw new Error(res.message ?? 'Could not save image links');
      return true;
    } catch (e) {
      this.imageError.set(`Image upload failed: ${(e as Error).message}. The class is saved; press "Retry image upload" to try again.`);
      return false;
    }
  }

  submit() {
    if (this.form.invalid) return;
    this.error.set(null);

    const v = this.form.getRawValue();

    // Retry path: the meeting already exists, only images remain.
    const existingId = this.createdId();
    if (existingId) {
      this.doSave();
      return;
    }

    // Edit mode: save directly (no confirmation needed for edits).
    if (this.isEdit()) {
      this.doSave();
      return;
    }

    // New schedule: show in-app confirmation modal.
    const classEntry = this.classOptions().find(c => c.classId === v.classId);
    const chapter = this.chapters().find(c => c.code === v.chapterCode);
    const division = this.selectedDivision();
    const h24 = parseInt(v.timeStr.split(':')[0], 10);
    const period = h24 >= 12 ? 'PM' : 'AM';
    const h12 = h24 % 12 || 12;
    this.confirmPayload.set({
      className: classEntry?.className ?? v.classId,
      chapter: chapter?.name ?? v.chapterCode,
      division: division ? `${division.code} — ${division.name}` : null,
      time: `${h12}:${v.timeStr.split(':')[1]} ${period}`,
      duration: v.durationMinutes,
    });
  }

  confirmCancel() {
    this.confirmPayload.set(null);
  }

  confirmOk() {
    this.confirmPayload.set(null);
    this.doSave();
  }

  private async doSave() {
    const v = this.form.getRawValue();
    const meetingId = this.route.snapshot.paramMap.get('meetingId');
    const wantsImages = this.canEditImages() && (this.images().length > 0 || this.originalSlots.length > 0);

    const existingId = this.createdId();
    if (existingId) {
      this.loading.set(true);
      if (await this.saveImages(existingId)) this.router.navigate(['/schedule']);
      this.loading.set(false);
      return;
    }

    this.loading.set(true);

    if (this.isEdit() && meetingId) {
      const chapter = this.chapters().find(c => c.code === v.chapterCode);
      const res = await this.service.updateMeeting(meetingId, {
        meetLink: v.meetLink,
        dateStr: v.dateStr,
        timeStr: v.timeStr,
        durationMinutes: v.durationMinutes,
        chapterCode: v.chapterCode,
        chapterName: chapter?.name,
      });
      if (res.ok) {
        if (wantsImages && !(await this.saveImages(meetingId))) {
          this.createdId.set(meetingId);
        } else {
          this.router.navigate(['/schedule']);
        }
      } else {
        this.error.set(res.message ?? 'Update failed');
      }
    } else {
      const classEntry = this.classOptions().find(c => c.classId === v.classId);
      const subject = this.subjects().find(s => s.code === v.subjectCode);
      const chapter = this.chapters().find(c => c.code === v.chapterCode);
      const division = this.selectedDivision();

      const res = await this.service.createMeeting({
        classId: v.classId,
        className: classEntry?.className ?? v.classId,
        subjectId: v.subjectCode,
        subjectName: subject?.name ?? v.subjectCode,
        batchId: DEFAULT_BATCH_ID,
        centerId: DEFAULT_CENTER_ID,
        chapterCode: v.chapterCode,
        chapterName: chapter?.name ?? v.chapterCode,
        divisionCode: division?.code,
        divisionName: division?.name,
        meetLink: v.meetLink,
        dateStr: v.dateStr,
        timeStr: v.timeStr,
        durationMinutes: v.durationMinutes,
        teacherId: v.teacherId,
        teacherName: v.teacherName,
        imageSrc: '',
      });
      if (res.ok) {
        if (wantsImages && res.data && !(await this.saveImages(res.data))) {
          this.createdId.set(res.data);
        } else {
          this.router.navigate(['/schedule']);
        }
      } else {
        this.error.set(res.message ?? 'Failed to schedule class');
      }
    }
    this.loading.set(false);
  }
}
