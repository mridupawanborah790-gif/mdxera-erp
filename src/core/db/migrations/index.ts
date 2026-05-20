import { SQL_001_INITIAL } from './001_initial';
import { SQL_002_SYNC_TABLES } from './002_sync_tables';

export interface Migration {
  version: number;
  name: string;
  sql: string;
}

export const MIGRATIONS: Migration[] = [
  { version: 1, name: '001_initial', sql: SQL_001_INITIAL },
  { version: 2, name: '002_sync_tables', sql: SQL_002_SYNC_TABLES },
];
