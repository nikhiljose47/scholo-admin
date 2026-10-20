import { inject, Injectable } from '@angular/core';
import { where, limit } from '@angular/fire/firestore';
import { FirestoreService, FireResponse } from '../fire/firestore.service';
import { CacheService } from '../cache/cache.service';
import { CACHE_TTL } from '../../constants/cache-ttl.constants';
import { UserModel } from '../../../models/user/user.model';

/** Admin-only directory reads — cached, since the full teacher/student
 *  roster rarely changes and otherwise gets re-read on every nav click. */
@Injectable({ providedIn: 'root' })
export class UsersDirectoryService {
  private fs = inject(FirestoreService);
  private cache = inject(CacheService);

  listTeachers(pageLimit = 100): Promise<FireResponse<UserModel[]>> {
    return this.cache.get(`users:role:teacher`, CACHE_TTL.TEACHERS_LIST, () =>
      this.fs.getAllOnce<UserModel>('users', where('role', '==', 'teacher'), limit(pageLimit)),
    );
  }

  listStudents(pageLimit = 100): Promise<FireResponse<UserModel[]>> {
    return this.cache.get(`users:role:student`, CACHE_TTL.STUDENTS_LIST, () =>
      this.fs.getAllOnce<UserModel>('users', where('role', '==', 'student'), limit(pageLimit)),
    );
  }

  invalidate(): void {
    this.cache.invalidatePrefix('users:role:');
  }
}
