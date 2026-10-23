/** providers/{providerId} — only the admin-set fields this app edits; other fields are left untouched. */
export interface ProviderDoc {
  id: string;
  name?: string;
  status?: 'published' | 'pending' | 'inactive';
  plan?: 'scholo-basic' | 'scholo-premium';
  acceptingEnquiries?: boolean;
  rating?: number | null;
  reviewCount?: number;
  initials?: string;
  tags?: string[];
  locked?: boolean;
  interest?: { minStudents: number; interestedNow: number; details: string[] };
  syllabusSeo?: { title: string; description: string; keywords: string };
}

/** classes/{classId} — only providerId is managed here. */
export interface ClassDoc {
  id: string;
  providerId?: string;
  /** Syllabus catalog id; the learner app also uses it as the doc id. */
  classId?: string;
  name?: string;
  className?: string;
  title?: string;
}

/** classes/{classId}/materials/{id} */
export interface MaterialDoc {
  id: string;
  title: string;
  chapterId: string;
  /** Cloudflare R2 public URL (or path) of the file. */
  fileUrl: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}
