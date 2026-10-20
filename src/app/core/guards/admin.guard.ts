import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AdminAuthService } from '../services/auth/admin-auth.service';
import { toObservable } from '@angular/core/rxjs-interop';
import { filter, map, take } from 'rxjs';

export const adminGuard: CanActivateFn = () => {
  const auth = inject(AdminAuthService);
  const router = inject(Router);

  return toObservable(auth.loading).pipe(
    filter(loading => !loading),
    take(1),
    map(() => {
      if (auth.isAdmin()) return true;
      return router.createUrlTree(['/auth/login']);
    }),
  );
};
