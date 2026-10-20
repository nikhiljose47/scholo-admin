export type GlobalRole = 'admin' | 'teacher' | 'student' | 'guest';

export interface UserModel {
  uid: string;
  name: string;
  email: string;
  role: GlobalRole;
  enrolledClassIds: string[];
  bio?: string;
  rating?: number;
  photoUrl?: string;
  /** Admin-set: which tuition center(s) (providers/{id}) a teacher belongs to. */
  tuitionCenterIds?: string[];
  /** Admin-set: lets a teacher edit syllabus progress, materials and other class content. */
  canEditContent?: boolean;
  createdAt?: unknown; // Firestore Timestamp
}
