import { SQL_001_INITIAL } from './001_initial';
import { SQL_002_SYNC_TABLES } from './002_sync_tables';
import { SQL_003_JOURNAL_ENTRIES } from './003_journal_entries';
import { SQL_004_MBC_CARDS } from './004_mbc_cards';
import { SQL_005_PINCODE_CACHE } from './005_pincode_cache';
import { SQL_006_VOUCHER_RESERVATIONS } from './006_voucher_reservations';
import { SQL_007_INITIAL_SYNC_STATE } from './007_initial_sync_state';
import { SQL_008_SALES_BILL_COLUMNS } from './008_sales_bill_columns';

export interface Migration {
  version: number;
  name: string;
  sql: string;
}

export const MIGRATIONS: Migration[] = [
  { version: 1, name: '001_initial', sql: SQL_001_INITIAL },
  { version: 2, name: '002_sync_tables', sql: SQL_002_SYNC_TABLES },
  { version: 3, name: '003_journal_entries', sql: SQL_003_JOURNAL_ENTRIES },
  { version: 4, name: '004_mbc_cards', sql: SQL_004_MBC_CARDS },
  { version: 5, name: '005_pincode_cache', sql: SQL_005_PINCODE_CACHE },
  { version: 6, name: '006_voucher_reservations', sql: SQL_006_VOUCHER_RESERVATIONS },
  { version: 7, name: '007_initial_sync_state', sql: SQL_007_INITIAL_SYNC_STATE },
  { version: 8, name: '008_sales_bill_columns', sql: SQL_008_SALES_BILL_COLUMNS },
];
