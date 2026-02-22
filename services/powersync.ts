
import { 
  column, 
  Schema, 
  Table, 
  PowerSyncDatabase, 
  AbstractPowerSyncDatabase, 
  PowerSyncBackendConnector, 
  PowerSyncCredentials, 
  CrudEntry, 
  UpdateType,
  BaseObserver
} from '@powersync/web';
import { supabase } from './supabaseClient';
import { Session } from '@supabase/supabase-js';

/**
 * User Provided Client-Side Schema
 */
const lists = new Table(
  {
    // id column (text) is automatically included
    created_at: column.text,
    name: column.text,
    owner_id: column.text
  },
  { indexes: {} }
);

const todos = new Table(
  {
    // id column (text) is automatically included
    created_at: column.text,
    completed_at: column.text,
    description: column.text,
    completed: column.integer,
    created_by: column.text,
    completed_by: column.text,
    list_id: column.text
  },
  { indexes: {} }
);

export const AppSchema = new Schema({
  lists,
  todos
});

export type Database = (typeof AppSchema)['types'];

/**
 * Postgres Response codes that we cannot recover from by retrying.
 */
const FATAL_RESPONSE_CODES = [
  new RegExp('^22...$'), // Data Exception
  new RegExp('^23...$'), // Integrity Constraint Violation
  new RegExp('^42501$')  // Insufficient Privilege
];

export type SupabaseConnectorListener = {
  initialized: () => void;
  sessionStarted: (session: Session) => void;
};

/**
 * Advanced Supabase Connector for PowerSync.
 */
export class SupabaseConnector extends BaseObserver<SupabaseConnectorListener> implements PowerSyncBackendConnector {
  // Provided PowerSync Instance URL
  readonly powersyncUrl: string = 'https://698f5ab742bd91af920bda43.powersync.journeyapps.com';

  constructor() {
    super();
  }

  async fetchCredentials() {
    const { data: { session }, error } = await supabase.auth.getSession();

    if (!session || error) {
      throw new Error(`Could not fetch Supabase credentials: ${error?.message || 'No session'}`);
    }

    return {
      endpoint: this.powersyncUrl,
      token: session.access_token ?? ''
    } satisfies PowerSyncCredentials;
  }

  async uploadData(database: AbstractPowerSyncDatabase): Promise<void> {
    const transaction = await database.getNextCrudTransaction();

    if (!transaction) {
      return;
    }

    let lastOp: CrudEntry | null = null;
    try {
      for (const op of transaction.crud) {
        lastOp = op;
        const table = supabase.from(op.table);
        let result: any;

        switch (op.op) {
          case UpdateType.PUT:
            const record = { ...op.opData, id: op.id };
            result = await table.upsert(record);
            break;
          case UpdateType.PATCH:
            result = await table.update(op.opData).eq('id', op.id);
            break;
          case UpdateType.DELETE:
            result = await table.delete().eq('id', op.id);
            break;
        }

        if (result.error) {
          console.error('Supabase upload operation failed:', result.error);
          throw new Error(`Could not update Supabase. Received error: ${result.error.message}`);
        }
      }

      await transaction.complete();
    } catch (ex: any) {
      console.debug('Caught sync error:', ex);
      if (typeof ex.code === 'string' && FATAL_RESPONSE_CODES.some((regex) => regex.test(ex.code))) {
        console.error('Data upload error - discarding transaction due to fatal error:', lastOp, ex);
        await transaction.complete();
      } else {
        // Retryable error (network etc)
        throw ex;
      }
    }
  }
}

// Initialize the PowerSync Database with the new AppSchema
export const db = new PowerSyncDatabase({
  schema: AppSchema,
  database: {
    dbFilename: 'medimart_powersync_v1.db'
  }
});

// Connect to the Sync Gateway
const connector = new SupabaseConnector();
db.connect(connector);
