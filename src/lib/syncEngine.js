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

  async syncAll() {
    if (!this.isOnline) return;

    try {
      // 1. Fetch unsynced records from Dexie queue
      const queue = await localDb.sync_queue.toArray();
      if (queue.length === 0) return;

      console.log(`Starting sync for ${queue.length} items...`);

      for (const item of queue) {
        let success = false;
        
        try {
          if (item.action === 'INSERT_PARKING') {
            await api.post('/api/parking/entry', item.payload);
            success = true;
          } else if (item.action === 'UPDATE_PARKING') {
            await api.post('/api/parking/exit', item.payload);
            success = true;
          }
          // Add other actions as needed
        } catch (err) {
          console.error('Failed to sync item:', item, err);
          // If it's a 4xx error (validation), we might want to discard it.
          // If it's 5xx or network error, keep it in queue to retry later.
          if (err.response && err.response.status >= 400 && err.response.status < 500) {
             // discard invalid items
             success = true; 
          }
        }

        if (success) {
          // Remove from local queue
          await localDb.sync_queue.delete(item.id);
        }
      }
      console.log('Sync complete!');
      
      // Optional: Pull fresh data from server to local DB
      // await this.pullFreshData();
      
    } catch (error) {
      console.error('Error during sync:', error);
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
