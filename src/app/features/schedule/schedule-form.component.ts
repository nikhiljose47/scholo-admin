import { Component, inject, OnInit, signal, computed } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, ActivatedRoute, RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';
import { ScheduleService, toISTDateStr, toISTTimeStr } from './schedule.service';
import { SyllabusService } from './syllabus.service';
import { CentersService } from '../centers/centers.service';
import { BatchesService } from '../batches/batches.service';
import { UsersDirectoryService } from '../../core/services/users/users-directory.service';
import { AdminAuthService } from '../../core/services/auth/admin-auth.service';
import { UploadService, MAX_LIVE_IMAGES, slotFromUrl } from '../../core/services/storage/upload.service';
import { UserModel } from '../../models/user/user.model';
import { CenterDoc } from '../../models/center/center.model';
import { BatchDoc } from '../../models/batch/batch.model';
import { ClassSyllabus, Subject, Chapter, SyllabusIndexEntry } from '../../models/syllabus/syllabus.model';

const DURATION_OPTIONS = [30, 45, 60, 90, 120];

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
    <div class="page">
      <header class="page-header">
        <a routerLink="/schedule" class="back-link">← Schedule</a>
        <h1>{{ isEdit() ? 'Edit Session' : 'Schedule a Class' }}</h1>
      </header>

      <form [formGroup]="form" (ngSubmit)="submit()" class="form-card">

        <!-- Center & Batch -->
        <div class="section" *ngIf="!isEdit()">
          <h3>Center & Batch</h3>
          <div class="fields">
            <div class="field">
              <label>Center</label>
              <select formControlName="centerId" (change)="onCenterChange()">
                <option value="">— Select center —</option>
                <option *ngFor="let c of centers()" [value]="c.centerId">{{ c.name }}</option>
              </select>
            </div>
            <div class="field">
              <label>Batch <span class="hint">(optional)</span></label>
              <select formControlName="batchId" [disabled]="!form.value.centerId || batches().length === 0">
                <option value="">No specific batch</option>
                <option *ngFor="let b of batches()" [value]="b.batchId">{{ b.name }}</option>
              </select>
              <small *ngIf="form.value.centerId && batches().length === 0">No batches found for this center yet.</small>
            </div>
          </div>
        </div>

        <!-- Class / Subject / Chapter: cascading dropdowns sourced from the canonical syllabus -->
        <div class="section" *ngIf="!isEdit()">
          <h3>Class Details</h3>
          <div class="fields">
            <div class="field">
              <label>Class *</label>
              <select formControlName="classId" (change)="onClassChange()">
                <option value="">— Select class —</option>
                <option *ngFor="let c of classOptions()" [value]="c.classId">{{ c.className }}</option>
              </select>
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
              <select formControlName="chapterCode" [disabled]="chapters().length === 0">
                <option value="">— Select chapter —</option>
                <option *ngFor="let ch of chapters()" [value]="ch.code">{{ ch.name }}</option>
              </select>
            </div>
          </div>
          <small *ngIf="syllabusLoading()">Loading syllabus…</small>
        </div>

        <!-- Edit mode: chapter dropdown only, scoped to the session's existing class/subject -->
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

        <!-- When -->
        <div class="section">
          <h3>Date & Time <span class="hint">(IST — Asia/Kolkata)</span></h3>
          <div class="fields">
            <div class="field">
              <label>Date *</label>
              <input formControlName="dateStr" type="date" />
            </div>
            <div class="field">
              <label>Start time *</label>
              <input formControlName="timeStr" type="time" />
            </div>
            <div class="field">
              <label>Duration *</label>
              <select formControlName="durationMinutes">
                <option *ngFor="let d of durationOptions" [value]="d">{{ d }} minutes</option>
              </select>
            </div>
          </div>
          <div class="end-time-preview" *ngIf="endTimePreview()">
            Session ends at <strong>{{ endTimePreview() }} IST</strong>
          </div>
        </div>

        <!-- Teacher: admins assign any teacher; teachers always schedule for themselves -->
        <div class="section" *ngIf="!isEdit() && auth.isAdmin()">
          <h3>Teacher</h3>
          <div class="field">
            <label>Select Teacher *</label>
            <select formControlName="teacherId" (change)="onTeacherChange()">
              <option value="">— Select teacher —</option>
              <option *ngFor="let t of teachers()" [value]="t.uid">{{ t.name }}</option>
            </select>
          </div>
        </div>

        <div class="section" *ngIf="!isEdit() && !auth.isAdmin()">
          <h3>Teacher</h3>
          <p class="self-note">Scheduling as <strong>{{ auth.userProfile()?.name }}</strong>.</p>
        </div>

        <!-- Meet link -->
        <div class="section">
          <h3>Meet Link</h3>
          <div class="field full">
            <label>Google Meet URL *</label>
            <input formControlName="meetLink" type="url" placeholder="https://meet.google.com/xxx-xxxx-xxx" />
            <small>Entered manually. All who can read global_meetings can see this URL.</small>
          </div>
        </div>

        <!-- Live-class thumbnail images (temporary; used by the student app while the class is live) -->
        <div class="section" *ngIf="canEditImages()">
          <h3>Live class images <span class="hint">(optional, up to {{ maxImages }})</span></h3>
          <p class="img-note">Combined and animated as the live thumbnail. Removed automatically after the class.</p>
          <div class="img-grid">
            <div class="img-item" *ngFor="let img of images(); let i = index">
              <img [src]="img.preview" alt="Live class image {{ i + 1 }}" />
              <span class="img-badge">{{ i + 1 }}</span>
              <div class="img-actions">
                <button type="button" (click)="moveImage(i, -1)" [disabled]="i === 0 || busy()" aria-label="Move earlier">←</button>
                <button type="button" (click)="moveImage(i, 1)" [disabled]="i === images().length - 1 || busy()" aria-label="Move later">→</button>
                <button type="button" (click)="removeImage(i)" [disabled]="busy()" aria-label="Remove">✕</button>
              </div>
            </div>
            <label class="img-add" *ngIf="images().length < maxImages">
              <input type="file" accept="image/*" multiple (change)="onFilesPicked($event)" [disabled]="busy()" hidden />
              + Add image
            </label>
          </div>
          <div class="progress" *ngIf="uploadProgress() !== null">
            <div class="bar"><div class="fill" [style.width.%]="(uploadProgress() ?? 0) * 100"></div></div>
            <small>Uploading images… {{ ((uploadProgress() ?? 0) * 100) | number:'1.0-0' }}%</small>
          </div>
          <div class="error inline" *ngIf="imageError()">{{ imageError() }}</div>
        </div>

        <div class="error" *ngIf="error()">{{ error() }}</div>

        <div class="form-actions">
          <a routerLink="/schedule" class="btn-cancel">{{ createdId() ? 'Skip images' : 'Cancel' }}</a>
          <button type="submit" [disabled]="loading() || form.invalid" class="btn-submit">
            {{ loading() ? 'Saving…' : (createdId() ? 'Retry image upload' : (isEdit() ? 'Save Changes' : 'Schedule Class')) }}
          </button>
        </div>
      </form>
    </div>
  `,
  styles: [`
    .page { max-width: 780px; margin: 0 auto; }
    .back-link { color: #3b82f6; text-decoration: none; font-size: 14px; display: block; margin-bottom: 12px; }
    h1 { margin: 0 0 24px; font-size: 22px; font-weight: 700; color: #1e293b; }

    .form-card { background: #fff; border-radius: 12px; box-shadow: 0 1px 4px rgba(0,0,0,0.06); overflow: hidden; }
    .section { padding: 22px 24px; border-bottom: 1px solid #f1f5f9; }
    h3 { margin: 0 0 14px; font-size: 15px; font-weight: 600; color: #1e293b; }
    .hint { font-weight: 400; color: #94a3b8; font-size: 13px; }

    .fields { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
    .field { display: flex; flex-direction: column; gap: 5px; }
    .field.full { grid-column: 1 / -1; }

    label { font-size: 13px; font-weight: 600; color: #374151; }

    input, select, textarea {
      padding: 10px 12px;
      border: 1px solid #d1d5db;
      border-radius: 8px;
      font-size: 14px;
      outline: none;
      font-family: inherit;
      background: #fff;
    }
    input:focus, select:focus { border-color: #3b82f6; box-shadow: 0 0 0 3px rgba(59,130,246,0.1); }
    select:disabled { background: #f8fafc; color: #94a3b8; cursor: not-allowed; }

    small { color: #94a3b8; font-size: 12px; }
    .self-note { margin: 0; color: #374151; font-size: 14px; }

    .end-time-preview {
      margin-top: 10px;
      font-size: 13px;
      color: #64748b;
    }

    .error {
      margin: 0 24px;
      padding: 10px 12px;
      background: #fef2f2;
      border: 1px solid #fecaca;
      color: #dc2626;
      border-radius: 8px;
      font-size: 13px;
    }

    .form-actions { display: flex; justify-content: flex-end; gap: 12px; padding: 20px 24px; }

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

    .img-note { margin: 0 0 12px; font-size: 12px; color: #94a3b8; }
    .img-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(130px, 1fr)); gap: 12px; }
    .img-item { position: relative; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; background: #f8fafc; }
    .img-item img { display: block; width: 100%; aspect-ratio: 4 / 3; object-fit: cover; }
    .img-badge { position: absolute; top: 6px; left: 6px; background: rgba(15,23,42,.75); color: #fff; font-size: 11px; border-radius: 10px; padding: 1px 7px; }
    .img-actions { display: flex; justify-content: space-between; padding: 4px; gap: 4px; }
    .img-actions button { flex: 1; padding: 4px 0; border: 1px solid #d1d5db; border-radius: 6px; background: #fff; cursor: pointer; font-size: 13px; }
    .img-actions button:disabled { opacity: .4; cursor: not-allowed; }
    .img-add { display: flex; align-items: center; justify-content: center; min-height: 100px; border: 2px dashed #cbd5e1; border-radius: 8px; color: #3b82f6; font-size: 13px; font-weight: 600; cursor: pointer; }
    .progress { margin-top: 12px; }
    .bar { height: 6px; background: #e2e8f0; border-radius: 3px; overflow: hidden; margin-bottom: 4px; }
    .fill { height: 100%; background: #3b82f6; transition: width .15s; }
    .error.inline { margin: 12px 0 0; }
  `],
})
export class ScheduleFormComponent implements OnInit {
  private fb = inject(FormBuilder);
  private service = inject(ScheduleService);
  private syllabusService = inject(SyllabusService);
  private centersService = inject(CentersService);
  private batchesService = inject(BatchesService);
  private directory = inject(UsersDirectoryService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private uploads = inject(UploadService);
  auth = inject(AdminAuthService);

  isEdit = signal(false);
  loading = signal(false);
  syllabusLoading = signal(false);
  error = signal<string | null>(null);

  centers = signal<CenterDoc[]>([]);
  batches = signal<BatchDoc[]>([]);
  teachers = signal<UserModel[]>([]);

  classOptions = signal<SyllabusIndexEntry[]>([]);
  private classSyllabus = signal<ClassSyllabus | null>(null);
  subjects = computed<Subject[]>(() => this.classSyllabus()?.subjects ?? []);
  private selectedSubject = signal<Subject | null>(null);
  chapters = computed<Chapter[]>(() => this.selectedSubject()?.chapters ?? []);

  durationOptions = DURATION_OPTIONS;

  // Live-class images
  readonly maxImages = MAX_LIVE_IMAGES;
  images = signal<ImageItem[]>([]);
  imageError = signal<string | null>(null);
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
    centerId: [''],
    batchId: [''],
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

  endTimePreview() {
    const { dateStr, timeStr, durationMinutes } = this.form.getRawValue();
    if (!dateStr || !timeStr) return null;
    try {
      const [h, m] = timeStr.split(':').map(Number);
      const totalMin = h * 60 + m + (durationMinutes || 0);
      const endH = Math.floor(totalMin / 60) % 24;
      const endM = totalMin % 60;
      return `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`;
    } catch { return null; }
  }

  async ngOnInit() {
    const meetingId = this.route.snapshot.paramMap.get('meetingId');

    // The syllabus index (class list) is needed either way: for the create
    // dropdown, or implicitly via loadClass() when editing.
    this.classOptions.set(await this.syllabusService.listClasses());

    if (meetingId) {
      this.isEdit.set(true);
      const res = await this.service.getMeeting(meetingId);
      if (res.data) {
        const m = res.data;
        this.meetingTeacherId.set(m.teacherId);
        const urls = (m.liveImages ?? []).slice(0, MAX_LIVE_IMAGES);
        this.images.set(urls.map((url, i) => ({ url, slot: slotFromUrl(url) ?? i + 1, preview: url })));
        this.originalSlots = this.images().map(i => i.slot!);
        this.form.patchValue({
          meetLink: m.meetLink,
          dateStr: toISTDateStr(m.date),
          timeStr: toISTTimeStr(m.date),
          durationMinutes: m.duration,
        });

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
      const centersPromise = this.centersService.listCentersForCurrentUser();
      const teachersPromise = this.auth.isAdmin() ? this.directory.listTeachers() : Promise.resolve({ ok: true, data: [] as UserModel[] });

      const [centersRes, teachersRes] = await Promise.all([centersPromise, teachersPromise]);
      this.centers.set(centersRes.data ?? []);
      this.teachers.set(teachersRes.data ?? []);
    }
  }

  async onCenterChange() {
    const centerId = this.form.get('centerId')?.value;
    this.form.patchValue({ batchId: '' });
    this.batches.set([]);
    if (!centerId) return;

    const res = await this.batchesService.listBatchesForCurrentUser(centerId);
    this.batches.set(res.data ?? []);
  }

  async onClassChange() {
    const classId = this.form.get('classId')?.value;
    this.form.patchValue({ subjectCode: '', chapterCode: '' });
    this.classSyllabus.set(null);
    this.selectedSubject.set(null);
    if (!classId) return;

    this.syllabusLoading.set(true);
    const classSyllabus = await this.syllabusService.loadClass(classId);
    this.classSyllabus.set(classSyllabus);
    this.syllabusLoading.set(false);
  }

  onSubjectChange() {
    const code = this.form.get('subjectCode')?.value;
    this.form.patchValue({ chapterCode: '' });
    const subject = this.subjects().find(s => s.code === code) ?? null;
    this.selectedSubject.set(subject);
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

  async submit() {
    if (this.form.invalid) return;
    this.loading.set(true);
    this.error.set(null);

    const v = this.form.getRawValue();
    const meetingId = this.route.snapshot.paramMap.get('meetingId');
    const wantsImages = this.canEditImages() && (this.images().length > 0 || this.originalSlots.length > 0);

    // Retry path: the meeting already exists, only images remain.
    const existingId = this.createdId();
    if (existingId) {
      if (await this.saveImages(existingId)) this.router.navigate(['/schedule']);
      this.loading.set(false);
      return;
    }

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

      const res = await this.service.createMeeting({
        classId: v.classId,
        className: classEntry?.className ?? v.classId,
        subjectId: v.subjectCode,
        subjectName: subject?.name ?? v.subjectCode,
        batchId: v.batchId || 'default',
        centerId: v.centerId,
        chapterCode: v.chapterCode,
        chapterName: chapter?.name ?? v.chapterCode,
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
