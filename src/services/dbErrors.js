/**
 * Shared helpers so admin writes never report success unless Supabase confirmed them.
 */

export function describeDbError(error) {
  if (!error) return '';
  return `${error.message}${error.code ? ` (code ${error.code})` : ''}${error.details ? ` — ${error.details}` : ''}`;
}

export function dbError(action, error) {
  return new Error(`${action}: ${describeDbError(error) || 'unknown database error'}`);
}

/**
 * Supabase returns success with zero rows when RLS hides the target row,
 * so updates/deletes must request the affected rows back and check them.
 */
export function assertRows(rows, action) {
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error(
      `${action}: no row was changed. The record no longer exists or the database policies do not allow this account to change it.`
    );
  }
  return rows;
}
