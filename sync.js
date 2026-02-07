// Background sync and cloud synchronization manager
class SyncManager {
  constructor() {
    this.syncInterval = 5 * 60 * 1000; // 5 minutes
    this.maxRetries = 3;
    this.isSyncing = false;
    this.offlineQueue = [];
    this.syncHandlers = new Map();
  }

  async init() {
    // Initialize IndexedDB
    await db.init();

    // Register sync handlers
    this.registerSyncHandlers();

    // Start periodic sync
    this.startPeriodicSync();

    // Listen for online/offline events
    window.addEventListener('online', () => this.onNetworkRestored());
    window.addEventListener('offline', () => this.onNetworkLost());

    // Register for background sync
    if ('serviceWorker' in navigator && 'SyncManager' in window) {
      await this.registerBackgroundSync();
    }

    console.log('SyncManager initialized');
  }

  registerSyncHandlers() {
    this.syncHandlers.set('task', this.syncTask.bind(this));
    this.syncHandlers.set('expense', this.syncExpense.bind(this));
    this.syncHandlers.set('habit', this.syncHabit.bind(this));
    this.syncHandlers.set('journal', this.syncJournal.bind(this));
    this.syncHandlers.set('settings', this.syncSettings.bind(this));
  }

  async registerBackgroundSync() {
    const registration = await navigator.serviceWorker.ready;
    
    try {
      await registration.sync.register('sync-tasks');
      await registration.sync.register('sync-expenses');
      await registration.sync.register('sync-journal');
      
      console.log('Background sync registered');
    } catch (error) {
      console.warn('Background sync registration failed:', error);
    }
  }

  startPeriodicSync() {
    setInterval(() => {
      if (navigator.onLine && !this.isSyncing) {
        this.syncAll();
      }
    }, this.syncInterval);
  }

  async syncAll() {
    if (this.isSyncing) {
      console.log('Sync already in progress');
      return;
    }

    this.isSyncing = true;

    try {
      await this.syncPendingItems();
      await this.syncLocalChanges();
      await this.fetchRemoteChanges();
      
      this.emit('syncComplete', { success: true });
    } catch (error) {
      console.error('Sync failed:', error);
      this.emit('syncError', { error });
    } finally {
      this.isSyncing = false;
    }
  }

  async syncPendingItems() {
    const pendingItems = await db.getPendingSyncItems();
    
    for (const item of pendingItems) {
      try {
        const handler = this.syncHandlers.get(item.type);
        if (handler) {
          await handler(item.data);
          await db.markSyncItemComplete(item.id);
        }
      } catch (error) {
        console.error(`Failed to sync item ${item.id}:`, error);
        item.attempts = (item.attempts || 0) + 1;
        
        if (item.attempts >= this.maxRetries) {
          item.status = 'failed';
          await db.update('syncQueue', item);
        }
      }
    }
  }

  async syncLocalChanges() {
    // Sync tasks
    const localTasks = await db.getAll('tasks');
    const unsyncedTasks = localTasks.filter(task => !task.synced);
    
    for (const task of unsyncedTasks) {
      await this.syncTask(task);
      task.synced = true;
      await db.update('tasks', task);
    }

    // Sync expenses
    const localExpenses = await db.getAll('expenses');
    const unsyncedExpenses = localExpenses.filter(expense => !expense.synced);
    
    for (const expense of unsyncedExpenses) {
      await this.syncExpense(expense);
      expense.synced = true;
      await db.update('expenses', expense);
    }

    // Sync journal entries
    const localJournal = await db.getAll('journal');
    const unsyncedJournal = localJournal.filter(entry => !entry.synced);
    
    for (const entry of unsyncedJournal) {
      await this.syncJournal(entry);
      entry.synced = true;
      await db.update('journal', entry);
    }
  }

  async fetchRemoteChanges() {
    // Fetch updates from server
    const lastSync = localStorage.getItem('lastSync') || 0;
    
    try {
      const updates = await this.apiRequest('GET', `/api/sync?since=${lastSync}`);
      
      if (updates.tasks && updates.tasks.length > 0) {
        await this.applyRemoteUpdates('tasks', updates.tasks);
      }
      
      if (updates.expenses && updates.expenses.length > 0) {
        await this.applyRemoteUpdates('expenses', updates.expenses);
      }
      
      if (updates.journal && updates.journal.length > 0) {
        await this.applyRemoteUpdates('journal', updates.journal);
      }
      
      localStorage.setItem('lastSync', Date.now());
    } catch (error) {
      console.error('Failed to fetch remote changes:', error);
    }
  }

  async applyRemoteUpdates(storeName, updates) {
    for (const update of updates) {
      const existing = await db.get(storeName, update.id);
      
      if (existing) {
        // Conflict resolution: use latest timestamp
        if (new Date(update.updatedAt) > new Date(existing.updatedAt)) {
          await db.update(storeName, update);
        }
      } else {
        await db.add(storeName, update);
      }
    }
  }

  async syncTask(task) {
    return await this.apiRequest('POST', '/api/tasks', task);
  }

  async syncExpense(expense) {
    return await this.apiRequest('POST', '/api/expenses', expense);
  }

  async syncHabit(habit) {
    return await this.apiRequest('POST', '/api/habits', habit);
  }

  async syncJournal(entry) {
    return await this.apiRequest('POST', '/api/journal', entry);
  }

  async syncSettings(settings) {
    return await this.apiRequest('PUT', '/api/settings', settings);
  }

  async apiRequest(method, endpoint, data = null) {
    // Check if we're online
    if (!navigator.onLine) {
      throw new Error('Offline - queued for later sync');
    }

    const options = {
      method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.getAuthToken()}`
      }
    };

    if (data) {
      options.body = JSON.stringify(data);
    }

    try {
      const response = await fetch(`https://api.DailyTrack.app${endpoint}`, options);
      
      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }
      
      return await response.json();
    } catch (error) {
      console.error('API request failed:', error);
      throw error;
    }
  }

  getAuthToken() {
    // Get auth token from secure storage
    return localStorage.getItem('auth_token');
  }

  async queueForSync(type, data) {
    const item = {
      type,
      data,
      status: 'pending',
      createdAt: new Date().toISOString(),
      attempts: 0
    };

    await db.addToSyncQueue(type, data);
    this.offlineQueue.push(item);
    
    // Try to sync immediately if online
    if (navigator.onLine) {
      this.syncAll();
    }
  }

  onNetworkRestored() {
    console.log('Network restored, syncing...');
    this.syncAll();
    this.emit('networkRestored');
  }

  onNetworkLost() {
    console.log('Network lost');
    this.emit('networkLost');
  }

  // Event emitter pattern
  listeners = new Map();

  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event).push(callback);
  }

  off(event, callback) {
    if (!this.listeners.has(event)) return;
    
    const callbacks = this.listeners.get(event);
    const index = callbacks.indexOf(callback);
    if (index > -1) {
      callbacks.splice(index, 1);
    }
  }

  emit(event, data) {
    if (!this.listeners.has(event)) return;
    
    this.listeners.get(event).forEach(callback => {
      try {
        callback(data);
      } catch (error) {
        console.error(`Error in event listener for ${event}:`, error);
      }
    });
  }

  // Metrics and monitoring
  async recordSyncMetrics(success, duration, itemsSynced) {
    await db.recordAnalytics('sync', {
      success,
      duration,
      itemsSynced,
      timestamp: new Date().toISOString()
    });
  }

  async getSyncStatistics() {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const syncMetrics = await db.getAnalytics(
      thirtyDaysAgo.toISOString().split('T')[0],
      new Date().toISOString().split('T')[0],
      'sync'
    );

    const stats = {
      totalSyncs: syncMetrics.length,
      successfulSyncs: syncMetrics.filter(m => m.value.success).length,
      averageDuration: 0,
      totalItemsSynced: 0
    };

    if (syncMetrics.length > 0) {
      const totalDuration = syncMetrics.reduce((sum, m) => sum + (m.value.duration || 0), 0);
      stats.averageDuration = totalDuration / syncMetrics.length;
      
      stats.totalItemsSynced = syncMetrics.reduce((sum, m) => sum + (m.value.itemsSynced || 0), 0);
    }

    return stats;
  }

  // Manual sync control
  async forceSync() {
    console.log('Manual sync triggered');
    await this.syncAll();
  }

  async clearSyncQueue() {
    const pending = await db.getPendingSyncItems();
    
    for (const item of pending) {
      await db.delete('syncQueue', item.id);
    }
    
    this.offlineQueue = [];
    console.log('Sync queue cleared');
  }

  // Backup and restore
  async backupToCloud() {
    try {
      const backupData = await db.exportData();
      await this.apiRequest('POST', '/api/backup', backupData);
      console.log('Backup to cloud successful');
      return true;
    } catch (error) {
      console.error('Backup to cloud failed:', error);
      return false;
    }
  }

  async restoreFromCloud() {
    try {
      const backupData = await this.apiRequest('GET', '/api/backup/latest');
      await db.importData(backupData);
      console.log('Restore from cloud successful');
      return true;
    } catch (error) {
      console.error('Restore from cloud failed:', error);
      return false;
    }
  }
}

// Export singleton instance
export const syncManager = new SyncManager();