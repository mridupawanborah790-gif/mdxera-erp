export type ConflictWinner = 'local' | 'remote';

/**
 * Decide which version wins when a record exists in both SQLite and Supabase
 * with different updated_at values.
 *
 * Strategy: remote wins if it is newer by more than 2 seconds (guards against
 * minor clock skew between the device and the Supabase server clock).
 * Otherwise local wins (optimistic update model).
 */
export function resolveConflict(
  localUpdatedAt: string | number,
  remoteUpdatedAt: string | number
): ConflictWinner {
  const localMs =
    typeof localUpdatedAt === 'number'
      ? localUpdatedAt
      : new Date(localUpdatedAt).getTime();
  const remoteMs =
    typeof remoteUpdatedAt === 'number'
      ? remoteUpdatedAt
      : new Date(remoteUpdatedAt).getTime();

  return remoteMs > localMs + 2000 ? 'remote' : 'local';
}
