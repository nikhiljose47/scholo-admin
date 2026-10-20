/** Cache TTLs, mirroring the existing app's CACHE_TTL discipline
 *  (see app.constants.ts in the main repo). Keep reads cheap — a stale
 *  dashboard number is fine; a stale progress edit is not, so progress
 *  writes explicitly invalidate their own keys instead of relying on TTL. */
export const CACHE_TTL = {
  CENTERS_LIST: 5 * 60 * 1000,      // 5 min — centers rarely change
  TEACHERS_LIST: 5 * 60 * 1000,
  STUDENTS_LIST: 5 * 60 * 1000,
  BATCH_LIST: 2 * 60 * 1000,
  PLAN_ITEMS: 2 * 60 * 1000,
  SCHEDULE_WINDOW: 60 * 1000,       // 1 min — classes get scheduled/cancelled often
} as const;
