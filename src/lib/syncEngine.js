import localDb from './db.local';
import api from './api';

export const SyncEngine = {
  isOnline: navigator.onLine,
  
  init() {
    window.addEventListener('online', () => {
      this.isOnline = true;
      this.syncAll();
    });
    
    window.addEventListener('offline', () => {
      this.isOnline = false;
    });
    
    // Attempt initial sync on load if online
    if (this.isOnline) {
      this.syncAll();
    }
  },

  isSyncing: false,
  
  async syncAll() {
    if (!this.isOnline || this.isSyncing) return;
    this.isSyncing = true;

    try {
      // 1. Fetch unsynced records from Dexie queue
      const queue = await localDb.sync_queue.toArray();
      if (queue.length === 0) {
        this.isSyncing = false;
        return;
      }

      console.log(`Starting sync for ${queue.length} items...`);

      for (const item of queue) {
        let success = false;
        
        try {
          if (item.action === 'INSERT_PARKING') {
            await api.post('/api/parking/entry', item.payload);
            success = true;
          } else if (item.action === 'UPDATE_PARKING_EXIT' || item.action === 'UPDATE_PARKING') {
            await api.post('/api/parking/exit', item.payload);
            success = true;
          }
          // Add other actions as needed
        } catch (err) {
          console.error('Failed to sync item:', item, err);
          // If it's a 4xx error (validation), discard it UNLESS it's a 404 for an exit (out of order sync)
          if (err.response && err.response.status >= 400 && err.response.status < 500) {
             if (err.response.status === 404 && item.action === 'UPDATE_PARKING_EXIT') {
               // The entry hasn't synced yet. Do not discard! Keep it in the queue.
               success = false;
             } else if (err.response.status === 409 && item.action === 'INSERT_PARKING') {
               // Already parked. Discard.
               success = true;
             } else {
               // For other 4xx errors, discard to prevent blocking the queue forever
               success = true;
             }
          }
        }

        if (success) {
          // Remove from local queue
          await localDb.sync_queue.delete(item.id);
        } else {
          // Stop processing the queue and wait for the next sync interval (Exponential backoff concept)
          console.log('Sync halted due to network/dependency error. Will retry later.');
          break;
        }
      }
      console.log('Sync complete!');
      
    } catch (error) {
      console.error('Error during sync:', error);
    } finally {
      this.isSyncing = false;
    }
  },
  
  // Helper to add an action to the queue
  async queueAction(action, table, payload) {
    await localDb.sync_queue.add({
      action,
      table,
      payload,
      created_at: new Date().toISOString()
    });
    
    // If online, immediately try to sync
    if (this.isOnline) {
      this.syncAll();
    }
  }
};

export default SyncEngine;
