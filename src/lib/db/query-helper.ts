import type { OpfsSAHPoolDatabase } from '@sqlite.org/sqlite-wasm';

/** Helper de lectura tipado sobre `db.exec(..., rowMode: 'object')`. Solo se usa dentro del Worker de datos. */
export function queryRows<T>(
  db: OpfsSAHPoolDatabase,
  sql: string,
  bind: unknown[] = [],
): T[] {
  return db.exec(sql, {
    bind: bind as never,
    rowMode: 'object',
    returnValue: 'resultRows',
  }) as unknown as T[];
}
