import Database from '@tauri-apps/plugin-sql';
import { MIGRATIONS } from './migrations';

let _db: Database | null = null;
let _initPromise: Promise<Database> | null = null;

async function applyMigrations(database: Database): Promise<void> {
  await database.execute(`
    CREATE TABLE IF NOT EXISTS _migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at INTEGER NOT NULL
    )
  `);

  // tauri-plugin-sql select returns unknown[] at runtime; cast explicitly
  const rows = (await database.select(
    'SELECT version FROM _migrations ORDER BY version ASC'
  )) as Array<{ version: number }>;
  const appliedVersions = new Set(rows.map((r) => r.version));

  for (const migration of MIGRATIONS) {
    if (appliedVersions.has(migration.version)) continue;

    const statements = migration.sql
      .split(';')
      .map((s) => s.trim())
      .filter(Boolean);

    for (const stmt of statements) {
      await database.execute(stmt);
    }

    await database.execute(
      'INSERT INTO _migrations (version, name, applied_at) VALUES (?, ?, ?)',
      [migration.version, migration.name, Date.now()]
    );
  }
}

async function createDb(): Promise<Database> {
  const database = await Database.load('sqlite:mdxera.db');
  await applyMigrations(database);
  return database;
}

function getDb(): Promise<Database> {
  if (_db) return Promise.resolve(_db);
  if (!_initPromise) {
    _initPromise = createDb().then((database) => {
      _db = database;
      return database;
    });
  }
  return _initPromise;
}

export interface DbClient {
  execute(sql: string, params?: unknown[]): Promise<void>;
  select<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
  transaction(fn: (tx: Pick<DbClient, 'execute' | 'select'>) => Promise<void>): Promise<void>;
  upsert(table: string, row: Record<string, unknown>): Promise<void>;
  bulkUpsert(table: string, rows: Record<string, unknown>[]): Promise<void>;
}

export const db: DbClient = {
  async execute(sql: string, params: unknown[] = []): Promise<void> {
    const database = await getDb();
    await database.execute(sql, params);
  },

  async select<T = Record<string, unknown>>(
    sql: string,
    params: unknown[] = []
  ): Promise<T[]> {
    const database = await getDb();
    return (await database.select(sql, params)) as T[];
  },

  async transaction(
    fn: (tx: Pick<DbClient, 'execute' | 'select'>) => Promise<void>
  ): Promise<void> {
    const database = await getDb();
    await database.execute('BEGIN');
    try {
      await fn(db);
      await database.execute('COMMIT');
    } catch (err) {
      await database.execute('ROLLBACK');
      throw err;
    }
  },

  async upsert(table: string, row: Record<string, unknown>): Promise<void> {
    const cols = Object.keys(row);
    const placeholders = cols.map(() => '?').join(', ');
    await db.execute(
      `INSERT OR REPLACE INTO ${table} (${cols.join(', ')}) VALUES (${placeholders})`,
      Object.values(row)
    );
  },

  async bulkUpsert(
    table: string,
    rows: Record<string, unknown>[]
  ): Promise<void> {
    if (rows.length === 0) return;
    await db.transaction(async (tx) => {
      for (const row of rows) {
        const cols = Object.keys(row);
        const placeholders = cols.map(() => '?').join(', ');
        await tx.execute(
          `INSERT OR REPLACE INTO ${table} (${cols.join(', ')}) VALUES (${placeholders})`,
          Object.values(row)
        );
      }
    });
  },
};

export async function initDatabase(): Promise<void> {
  await getDb();
}
