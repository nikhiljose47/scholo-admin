import { inject, Injectable, signal, computed } from '@angular/core';
import {
  Auth,
  signInWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  signOut,
  onAuthStateChanged,
  User,
} from '@angular/fire/auth';
import { toObservable } from '@angular/core/rxjs-interop';
import { filter, firstValueFrom } from 'rxjs';
import { FirestoreService } from '../fire/firestore.service';
import { UserModel } from '../../../models/user/user.model';

const PORTAL_ALLOWED_ROLES: UserModel['role'][] = ['admin', 'teacher'];

@Injectable({ providedIn: 'root' })
export class AdminAuthService {
  private auth = inject(Auth);
  private fs = inject(FirestoreService);

  readonly currentUser = signal<User | null>(null);
  readonly userProfile = signal<UserModel | null>(null);
  readonly loading = signal(true);
  private readonly loading$ = toObservable(this.loading);

  readonly isAdmin = computed(() => this.userProfile()?.role === 'admin');
  readonly isTeacher = computed(() => this.userProfile()?.role === 'teacher');
  /** Admin or teacher — anyone allowed into the shared staff shell. */
  readonly isStaff = computed(() => this.isAdmin() || this.isTeacher());
  readonly isLoggedIn = computed(() => !!this.currentUser());

  constructor() {
    onAuthStateChanged(this.auth, async user => {
      // Mark not-ready for the duration of this transition so anything
      // awaiting "auth settled" (signIn(), route guards) waits for the
      // fresh role check below rather than reading a stale prior value.
      this.loading.set(true);
      this.currentUser.set(user);

      if (!user) {
        this.userProfile.set(null);
        this.loading.set(false);
        return;
      }

      const res = await this.fs.getOnce<UserModel>(`users/${user.uid}`);
      const profile = res.data ?? null;
      const allowed = !!profile && PORTAL_ALLOWED_ROLES.includes(profile.role);

      if (!allowed) {
        // A real account (e.g. a student or guest) signed in successfully with
        // Firebase Auth, but this portal is staff-only. Reject it here instead
        // of only in a route guard, so no dashboard data is ever requested.
        this.userProfile.set(null);
        this.loading.set(false);
        await signOut(this.auth);
        return;
      }

      this.userProfile.set(profile);
      this.loading.set(false);
    });
  }

  async signIn(email: string, password: string): Promise<{ ok: boolean; message?: string }> {
    try {
      this.loading.set(true);
      await signInWithEmailAndPassword(this.auth, email, password);
      return await this.awaitStaffCheck();
    } catch (e: unknown) {
      this.loading.set(false);
      return { ok: false, message: (e as Error).message };
    }
  }

  async signInWithGoogle(): Promise<{ ok: boolean; message?: string }> {
    try {
      this.loading.set(true);
      await signInWithPopup(this.auth, new GoogleAuthProvider());
      return await this.awaitStaffCheck();
    } catch (e: unknown) {
      this.loading.set(false);
      // Popup closed by the user shouldn't show as a scary error.
      const code = (e as { code?: string }).code;
      if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
        return { ok: false };
      }
      return { ok: false, message: (e as Error).message };
    }
  }

  /** Waits for onAuthStateChanged's role lookup (and, if rejected, the forced
   *  sign-out) to finish, then reports whether the signed-in account is staff.
   *  Shared by both sign-in methods so Google and email/password are gated identically. */
  private async awaitStaffCheck(): Promise<{ ok: boolean; message?: string }> {
    await firstValueFrom(this.loading$.pipe(filter(l => !l)));
    if (!this.isStaff()) {
      return { ok: false, message: 'This portal is for Scholo teachers and admins only.' };
    }
    return { ok: true };
  }

  async signOut(): Promise<void> {
    await signOut(this.auth);
  }

  get uid(): string | null {
    return this.currentUser()?.uid ?? null;
  }
}
