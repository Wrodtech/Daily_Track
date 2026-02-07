// IndexedDB wrapper for DailyTrack
class DailyTrackDB {
  constructor() {
    this.dbName = 'DailyTrackDB';
    this.version = 3;
    this.db = null;
  }

  async init() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.version);

      request.onupgradeneeded = (event) => {
        const db = event.target.result;

        // Create object stores if they don't exist
        const stores = [
          {
            name: 'tasks',
            options: { keyPath: 'id' },
            indexes: [
              { name: 'by-date', keyPath: 'createdAt' },
              { name: 'by-priority', keyPath: 'priority' },
              { name: 'by-completed', keyPath: 'completed' },
              { name: 'by-dueDate', keyPath: 'dueDate' }
            ]
          },
          {
            name: 'expenses',
            options: { keyPath: 'id' },
            indexes: [
              { name: 'by-date', keyPath: 'date' },
              { name: 'by-category', keyPath: 'category' },
              { name: 'by-amount', keyPath: 'amount' }
            ]
          },
          {
            name: 'habits',
            options: { keyPath: 'id' },
            indexes: [
              { name: 'by-streak', keyPath: 'currentStreak' },
              { name: 'by-frequency', keyPath: 'frequency' }
            ]
          },
          {
            name: 'journal',
            options: { keyPath: 'id' },
            indexes: [
              { name: 'by-date', keyPath: 'date' },
              { name: 'by-mood', keyPath: 'mood' }
            ]
          },
          {
            name: 'settings',
            options: { keyPath: 'id' }
          },
          {
            name: 'activityLog',
            options: { keyPath: 'id' },
            indexes: [
              { name: 'by-timestamp', keyPath: 'timestamp' },
              { name: 'by-type', keyPath: 'type' }
            ]
          },
          {
            name: 'syncQueue',
            options: { keyPath: 'id', autoIncrement: true },
            indexes: [
              { name: 'by-type', keyPath: 'type' },
              { name: 'by-status', keyPath: 'status' }
            ]
          },
          {
            name: 'analytics',
            options: { keyPath: 'date' },
            indexes: [
              { name: 'by-metric', keyPath: 'metric' }
            ]
          }
        ];

        stores.forEach((storeConfig) => {
          if (!db.objectStoreNames.contains(storeConfig.name)) {
            const store = db.createObjectStore(
              storeConfig.name,
              storeConfig.options
            );

            storeConfig.indexes?.forEach((index) => {
              store.createIndex(index.name, index.keyPath);
            });
          }
        });
      };

      request.onsuccess = (event) => {
        this.db = event.target.result;
        resolve(this.db);
      };

      request.onerror = (event) => {
        console.error('Database initialization failed:', event.target.error);
        reject(event.target.error);
      };
    });
  }

  // Generic CRUD operations
  async add(storeName, data) {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([storeName], 'readwrite');
      const store = transaction.objectStore(storeName);
      const request = store.add(data);

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async get(storeName, key) {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([storeName], 'readonly');
      const store = transaction.objectStore(storeName);
      const request = store.get(key);

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async getAll(storeName, indexName = null, range = null) {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([storeName], 'readonly');
      const store = transaction.objectStore(storeName);
      const target = indexName ? store.index(indexName) : store;
      const request = range ? target.getAll(range) : target.getAll();

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async update(storeName, data) {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([storeName], 'readwrite');
      const store = transaction.objectStore(storeName);
      const request = store.put(data);

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async delete(storeName, key) {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([storeName], 'readwrite');
      const store = transaction.objectStore(storeName);
      const request = store.delete(key);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async count(storeName, indexName = null, query = null) {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([storeName], 'readonly');
      const store = transaction.objectStore(storeName);
      const target = indexName ? store.index(indexName) : store;
      const request = query ? target.count(query) : target.count();

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  // Task-specific methods
  async getTasks(filter = {}) {
    let tasks = await this.getAll('tasks', 'by-date');
    
    if (filter.completed !== undefined) {
      tasks = tasks.filter(t => t.completed === filter.completed);
    }
    
    if (filter.priority) {
      tasks = tasks.filter(t => t.priority === filter.priority);
    }
    
    if (filter.category) {
      tasks = tasks.filter(t => t.category === filter.category);
    }
    
    if (filter.dueDate) {
      tasks = tasks.filter(t => t.dueDate === filter.dueDate);
    }
    
    return tasks.sort((a, b) => 
      new Date(b.createdAt) - new Date(a.createdAt)
    );
  }

  async getOverdueTasks() {
    const today = new Date().toISOString().split('T')[0];
    const tasks = await this.getAll('tasks', 'by-dueDate');
    return tasks.filter(task => 
      task.dueDate && 
      task.dueDate < today && 
      !task.completed
    );
  }

  // Expense-specific methods
  async getExpensesByPeriod(startDate, endDate) {
    const expenses = await this.getAll('expenses', 'by-date');
    return expenses.filter(expense => 
      expense.date >= startDate && 
      expense.date <= endDate
    ).sort((a, b) => new Date(b.date) - new Date(a.date));
  }

  async getExpenseSummary(startDate, endDate) {
    const expenses = await this.getExpensesByPeriod(startDate, endDate);
    const summary = {
      total: 0,
      count: expenses.length,
      byCategory: {},
      average: 0,
      dailyAverage: 0
    };

    expenses.forEach(expense => {
      summary.total += expense.amount;
      if (!summary.byCategory[expense.category]) {
        summary.byCategory[expense.category] = 0;
      }
      summary.byCategory[expense.category] += expense.amount;
    });

    if (summary.count > 0) {
      summary.average = summary.total / summary.count;
      
      // Calculate daily average
      const days = Math.max(
        1,
        Math.ceil(
          (new Date(endDate) - new Date(startDate)) / (1000 * 60 * 60 * 24)
        )
      );
      summary.dailyAverage = summary.total / days;
    }

    return summary;
  }

  // Journal-specific methods
  async getJournalEntriesByMonth(year, month) {
    const entries = await this.getAll('journal', 'by-date');
    return entries.filter(entry => {
      const [entryYear, entryMonth] = entry.date.split('-');
      return entryYear === year && entryMonth === month;
    }).sort((a, b) => b.date.localeCompare(a.date));
  }

  async getMoodStatistics(startDate, endDate) {
    const entries = await this.getAll('journal', 'by-date');
    const filtered = entries.filter(entry => 
      entry.date >= startDate && entry.date <= endDate
    );

    const stats = {
      total: filtered.length,
      averageMood: 0,
      moodDistribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
      bestDay: null,
      worstDay: null
    };

    if (filtered.length > 0) {
      let totalMood = 0;
      filtered.forEach(entry => {
        totalMood += entry.mood;
        stats.moodDistribution[entry.mood]++;
        
        if (!stats.bestDay || entry.mood > stats.bestDay.mood) {
          stats.bestDay = entry;
        }
        if (!stats.worstDay || entry.mood < stats.worstDay.mood) {
          stats.worstDay = entry;
        }
      });
      stats.averageMood = totalMood / filtered.length;
    }

    return stats;
  }

  // Habit-specific methods
  async logHabitCompletion(habitId, date = null) {
    const habit = await this.get('habits', habitId);
    if (!habit) return null;

    const today = date || new Date().toISOString().split('T')[0];
    const lastCompletion = habit.lastCompleted
      ? new Date(habit.lastCompleted).toISOString().split('T')[0]
      : null;

    // Check if already completed today
    if (lastCompletion === today) {
      return habit;
    }

    // Check if streak should continue
    if (lastCompletion) {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = yesterday.toISOString().split('T')[0];

      if (lastCompletion === yesterdayStr) {
        habit.currentStreak++;
        habit.longestStreak = Math.max(habit.longestStreak, habit.currentStreak);
      } else {
        habit.currentStreak = 1;
      }
    } else {
      habit.currentStreak = 1;
      habit.longestStreak = 1;
    }

    habit.lastCompleted = today;
    habit.completionHistory = habit.completionHistory || [];
    habit.completionHistory.push(today);

    return await this.update('habits', habit);
  }

  // Sync queue management
  async addToSyncQueue(type, data) {
    return await this.add('syncQueue', {
      type,
      data,
      status: 'pending',
      createdAt: new Date().toISOString(),
      attempts: 0
    });
  }

  async getPendingSyncItems(type = null) {
    const items = await this.getAll('syncQueue', 'by-status', 'pending');
    return type ? items.filter(item => item.type === type) : items;
  }

  async markSyncItemComplete(id) {
    const item = await this.get('syncQueue', id);
    if (item) {
      item.status = 'completed';
      item.completedAt = new Date().toISOString();
      await this.update('syncQueue', item);
    }
  }

  // Analytics
  async recordAnalytics(metric, value, date = null) {
    const today = date || new Date().toISOString().split('T')[0];
    const existing = await this.get('analytics', today);

    if (existing) {
      existing[metric] = value;
      existing.updatedAt = new Date().toISOString();
      await this.update('analytics', existing);
    } else {
      await this.add('analytics', {
        date: today,
        [metric]: value,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
    }
  }

  async getAnalytics(startDate, endDate, metric = null) {
    const analytics = await this.getAll('analytics', 'by-date');
    const filtered = analytics.filter(a => a.date >= startDate && a.date <= endDate);
    
    if (metric) {
      return filtered.map(a => ({
        date: a.date,
        value: a[metric] || 0
      }));
    }
    
    return filtered;
  }

  // Backup and restore
  async exportData() {
    const stores = ['tasks', 'expenses', 'habits', 'journal', 'settings', 'analytics'];
    const data = {};
    
    for (const store of stores) {
      data[store] = await this.getAll(store);
    }
    
    return {
      data,
      exportedAt: new Date().toISOString(),
      version: '2.0',
      app: 'DailyTrack'
    };
  }

  async importData(backupData) {
    // Validate backup data
    if (!backupData.data || !backupData.version) {
      throw new Error('Invalid backup data');
    }

    // Clear existing data
    const stores = ['tasks', 'expenses', 'habits', 'journal', 'settings', 'analytics'];
    for (const store of stores) {
      await this.clearStore(store);
    }

    // Import data
    for (const [storeName, items] of Object.entries(backupData.data)) {
      if (stores.includes(storeName)) {
        for (const item of items) {
          await this.add(storeName, item);
        }
      }
    }

    return true;
  }

  async clearStore(storeName) {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([storeName], 'readwrite');
      const store = transaction.objectStore(storeName);
      const request = store.clear();

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  // Performance optimization
  async batchAdd(storeName, items) {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([storeName], 'readwrite');
      const store = transaction.objectStore(storeName);
      const errors = [];

      items.forEach((item, index) => {
        const request = store.add(item);
        request.onerror = () => {
          errors.push({ index, error: request.error });
        };
      });

      transaction.oncomplete = () => {
        if (errors.length > 0) {
          reject(new Error(`Batch add failed for ${errors.length} items`));
        } else {
          resolve();
        }
      };

      transaction.onerror = () => reject(transaction.error);
    });
  }

  // Database maintenance
  async optimize() {
    // Reindex all stores
    const stores = ['tasks', 'expenses', 'habits', 'journal'];
    for (const store of stores) {
      await this.reindexStore(store);
    }

    // Clean up old sync queue items
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const syncItems = await this.getAll('syncQueue');
    const oldItems = syncItems.filter(
      item => new Date(item.createdAt) < thirtyDaysAgo && item.status === 'completed'
    );

    for (const item of oldItems) {
      await this.delete('syncQueue', item.id);
    }
  }

  async reindexStore(storeName) {
    // This would trigger reindexing in a real implementation
    console.log(`Reindexing ${storeName}`);
  }

  // Error handling and recovery
  async repair() {
    try {
      // Check database integrity
      const isValid = await this.validate();
      if (!isValid) {
        console.warn('Database corruption detected, attempting repair...');
        await this.backupCorruptedData();
        await this.recreateDatabase();
      }
    } catch (error) {
      console.error('Repair failed:', error);
      throw error;
    }
  }

  async validate() {
    // Basic validation - check if all stores exist and can be accessed
    const stores = ['tasks', 'expenses', 'habits', 'journal'];
    
    for (const store of stores) {
      try {
        await this.count(store);
      } catch (error) {
        console.error(`Store ${store} validation failed:`, error);
        return false;
      }
    }
    
    return true;
  }

  async backupCorruptedData() {
    // Backup data before recreation
    const backup = await this.exportData();
    localStorage.setItem('DailyTrack_backup_before_repair', JSON.stringify(backup));
  }

  async recreateDatabase() {
    // Close current connection
    if (this.db) {
      this.db.close();
    }

    // Delete database
    await new Promise((resolve, reject) => {
      const request = indexedDB.deleteDatabase(this.dbName);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });

    // Reinitialize
    await this.init();
  }
}

// Export singleton instance
export const db = new DailyTrackDB();