import { CanDeactivateFn } from '@angular/router';

/**
 * Asks before leaving a page that has typed-but-unsaved work. Closing or reloading the tab is covered separately
 * by the editor's `beforeunload` handler; this covers in-app navigation. Components opt in by implementing
 * `hasUnsavedChanges()`.
 */
export const unsavedChangesGuard: CanDeactivateFn<{ hasUnsavedChanges?: () => boolean }> = (component) => {
  if (!component.hasUnsavedChanges?.()) return true;
  return typeof window === 'undefined' ? true : window.confirm('You have unsaved changes in the problem editor. Leave without saving?');
};
