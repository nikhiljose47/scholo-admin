import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AdminAuthService } from '../services/auth/admin-auth.service';
import { toObservable } from '@angular/core/rxjs-interop';
import { filter, map, take } from 'rxjs';

/** Allows admin OR teacher — for screens scoped to the signed-in user's own data. */
export const staffGuard: CanActivateFn = () => {
  const auth = inject(AdminAuthService);
  const router = inject(Router);

  return toObservable(auth.loading).pipe(
    filter(loading => !loading),
    take(1),
    map(() => {
      if (auth.isStaff()) return true;
      return router.createUrlTree(['/auth/login']);
    }),
  );
};
