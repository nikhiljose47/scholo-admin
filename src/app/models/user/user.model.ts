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
  createdAt?: unknown; // Firestore Timestamp
}
