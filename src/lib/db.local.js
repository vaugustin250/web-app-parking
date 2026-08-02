import Dexie from 'dexie';

export const localDb = new Dexie('VBillsOfflineDB');

localDb.version(2).stores({
  parking_records: 'id, tenant_id, vehicle_number, status, entry_time, exit_time, synced',
  settings: 'tenant_id, company_name',
  tenants: 'id',
  staff: 'id, tenant_id',
  parking_zones: 'id, tenant_id',
  parking_passes: 'id, tenant_id, vehicle_number, used_entries',
  payments: 'id, tenant_id, ticket_no',
  shift_reports: '++id, tenant_id',
  sync_queue: '++id, action, table, payload, created_at'
});

export default localDb;
