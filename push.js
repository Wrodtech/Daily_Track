// Push notification manager
class PushManager {
  constructor() {
    this.subscription = null;
    this.notificationPermission = null;
    this.notificationHandlers = new Map();
  }

  async init() {
    // Check notification permission
    this.notificationPermission = Notification.permission;
    
    if (this.notificationPermission === 'default') {
      // Request permission
      this.notificationPermission = await this.requestPermission();
    }

    // Initialize push subscription
    if ('serviceWorker' in navigator && 'PushManager' in window) {
      await this.initPushSubscription();
    }

    // Register notification handlers
    this.registerNotificationHandlers();

    console.log('PushManager initialized');
  }

  async requestPermission() {
    try {
      const permission = await Notification.requestPermission();
      this.notificationPermission = permission;
      this.emit('permissionChanged', { permission });
      return permission;
    } catch (error) {
      console.error('Failed to request notification permission:', error);
      return 'denied';
    }
  }

  async initPushSubscription() {
    try {
      const registration = await navigator.serviceWorker.ready;
      this.subscription = await registration.pushManager.getSubscription();
      
      if (!this.subscription) {
        // Create new subscription
        this.subscription = await this.subscribeToPush();
      }

      // Send subscription to server
      await this.sendSubscriptionToServer();
      
      console.log('Push subscription initialized');
    } catch (error) {
      console.error('Failed to initialize push subscription:', error);
    }
  }

  async subscribeToPush() {
    const registration = await navigator.serviceWorker.ready;
    
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: this.urlBase64ToUint8Array(
        'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U'
      )
    });

    return subscription;
  }

  async sendSubscriptionToServer() {
    if (!this.subscription) return;

    try {
      await fetch('https://api.DailyTrack.app/push/subscribe', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.getAuthToken()}`
        },
        body: JSON.stringify(this.subscription)
      });
    } catch (error) {
      console.error('Failed to send subscription to server:', error);
    }
  }

  urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding)
      .replace(/\-/g, '+')
      .replace(/_/g, '/');

    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);

    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  }

  registerNotificationHandlers() {
    this.notificationHandlers.set('task-reminder', this.handleTaskReminder.bind(this));
    this.notificationHandlers.set('daily-digest', this.handleDailyDigest.bind(this));
    this.notificationHandlers.set('streak-reminder', this.handleStreakReminder.bind(this));
    this.notificationHandlers.set('budget-alert', this.handleBudgetAlert.bind(this));
  }

  async showLocalNotification(title, options) {
    if (this.notificationPermission !== 'granted') {
      console.warn('Notification permission not granted');
      return null;
    }

    try {
      const registration = await navigator.serviceWorker.ready;
      return await registration.showNotification(title, {
        icon: '/icons/icon-192x192.png',
        badge: '/icons/badge-72x72.png',
        vibrate: [200, 100, 200],
        ...options
      });
    } catch (error) {
      console.error('Failed to show notification:', error);
      return null;
    }
  }

  // Notification types
  async showTaskReminder(task) {
    return await this.showLocalNotification('Task Reminder', {
      body: `"${task.title}" is due ${this.getDueDateText(task.dueDate)}`,
      tag: `task-${task.id}`,
      data: {
        type: 'task-reminder',
        taskId: task.id,
        url: `/?view=tasks&task=${task.id}`
      },
      actions: [
        {
          action: 'complete',
          title: '✓ Complete'
        },
        {
          action: 'snooze',
          title: '⏰ Snooze'
        }
      ]
    });
  }

  async showDailyDigest(stats) {
    const completedTasks = stats.tasks.completed;
    const totalTasks = stats.tasks.total;
    const expensesToday = stats.expenses.today;
    const budget = stats.expenses.budget;
    
    let body = '';
    if (totalTasks > 0) {
      body += `✅ ${completedTasks}/${totalTasks} tasks completed`;
    }
    if (expensesToday > 0) {
      const status = expensesToday > budget ? '⚠️ Over' : '✓ Under';
      body += `\n💰 ${status} budget: $${expensesToday}/$${budget}`;
    }
    
    if (!body) {
      body = 'No activity today. Add some tasks or expenses!';
    }

    return await this.showLocalNotification('Daily Digest', {
      body,
      tag: 'daily-digest',
      data: {
        type: 'daily-digest',
        url: '/?view=dashboard'
      }
    });
  }

  async showStreakReminder(streak) {
    return await this.showLocalNotification('🔥 Keep Your Streak Alive!', {
      body: `You have a ${streak} day streak going! Don't break it now.`,
      tag: 'streak-reminder',
      data: {
        type: 'streak-reminder',
        url: '/?view=habits'
      }
    });
  }

  async showBudgetAlert(category, amount, budget) {
    return await this.showLocalNotification('💰 Budget Alert', {
      body: `You've spent $${amount} on ${category}, exceeding your $${budget} budget.`,
      tag: `budget-${category}`,
      data: {
        type: 'budget-alert',
        category,
        url: '/?view=expenses'
      }
    });
  }

  // Handler methods
  async handleTaskReminder(notification) {
    const { taskId } = notification.data;
    
    // Mark task as complete or snooze
    const task = await db.get('tasks', taskId);
    if (task) {
      // Update task based on action
      this.emit('taskAction', { task, action: notification.action });
    }
  }

  async handleDailyDigest() {
    // Navigate to dashboard
    window.location.href = '/?view=dashboard';
  }

  async handleStreakReminder() {
    // Navigate to habits
    window.location.href = '/?view=habits';
  }

  async handleBudgetAlert(notification) {
    const { category } = notification.data;
    window.location.href = `/?view=expenses&category=${category}`;
  }

  // Utility methods
  getDueDateText(dueDate) {
    if (!dueDate) return 'soon';
    
    const today = new Date();
    const due = new Date(dueDate);
    const diffTime = due - today;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) return 'today';
    if (diffDays === 1) return 'tomorrow';
    if (diffDays === -1) return 'yesterday';
    if (diffDays < 0) return `${Math.abs(diffDays)} days ago`;
    return `in ${diffDays} days`;
  }

  getAuthToken() {
    return localStorage.getItem('auth_token');
  }

  // Schedule notifications
  async scheduleDailyDigest(time = '20:00') {
    if (!('Notification' in window) || Notification.permission !== 'granted') {
      return false;
    }

    const [hours, minutes] = time.split(':').map(Number);
    const now = new Date();
    const scheduledTime = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      hours,
      minutes,
      0
    );

    // If time already passed today, schedule for tomorrow
    if (scheduledTime < now) {
      scheduledTime.setDate(scheduledTime.getDate() + 1);
    }

    const delay = scheduledTime.getTime() - now.getTime();

    setTimeout(async () => {
      // Get daily stats
      const stats = await this.getDailyStats();
      await this.showDailyDigest(stats);
      
      // Schedule next day
      this.scheduleDailyDigest(time);
    }, delay);

    console.log(`Daily digest scheduled for ${scheduledTime.toLocaleTimeString()}`);
    return true;
  }

  async getDailyStats() {
    const today = new Date().toISOString().split('T')[0];
    
    const tasks = await db.getAll('tasks');
    const todayTasks = tasks.filter(task => 
      task.dueDate === today || 
      (!task.dueDate && !task.completed)
    );
    
    const expenses = await db.getAll('expenses');
    const todayExpenses = expenses
      .filter(expense => expense.date === today)
      .reduce((sum, exp) => sum + exp.amount, 0);
    
    const settings = await db.get('settings', 'general');
    const dailyBudget = settings?.dailyBudget || 50;

    return {
      tasks: {
        total: todayTasks.length,
        completed: todayTasks.filter(t => t.completed).length
      },
      expenses: {
        today: todayExpenses,
        budget: dailyBudget
      }
    };
  }

  async scheduleTaskReminders() {
    const tasks = await db.getAll('tasks');
    const uncompletedTasks = tasks.filter(task => !task.completed && task.dueDate);
    
    for (const task of uncompletedTasks) {
      await this.scheduleTaskReminder(task);
    }
  }

  async scheduleTaskReminder(task) {
    if (!task.dueDate) return;

    const dueDate = new Date(task.dueDate);
    const reminderTime = new Date(dueDate.getTime() - 2 * 60 * 60 * 1000); // 2 hours before
    
    const now = new Date();
    if (reminderTime < now) return;

    const delay = reminderTime.getTime() - now.getTime();

    setTimeout(async () => {
      await this.showTaskReminder(task);
    }, delay);

    console.log(`Task reminder scheduled for ${reminderTime.toLocaleString()}`);
  }

  // Manage subscriptions
  async unsubscribeFromPush() {
    if (!this.subscription) return;

    try {
      await this.subscription.unsubscribe();
      
      // Notify server
      await fetch('https://api.DailyTrack.app/push/unsubscribe', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.getAuthToken()}`
        },
        body: JSON.stringify(this.subscription)
      });

      this.subscription = null;
      console.log('Unsubscribed from push notifications');
    } catch (error) {
      console.error('Failed to unsubscribe from push:', error);
    }
  }

  async updateSubscription() {
    await this.unsubscribeFromPush();
    await this.initPushSubscription();
  }

  // Event emitter
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

  // Analytics
  async recordNotificationMetrics(type, action = null) {
    await db.recordAnalytics('notifications', {
      type,
      action,
      timestamp: new Date().toISOString()
    });
  }

  async getNotificationStatistics() {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const notificationMetrics = await db.getAnalytics(
      thirtyDaysAgo.toISOString().split('T')[0],
      new Date().toISOString().split('T')[0],
      'notifications'
    );

    const stats = {
      total: notificationMetrics.length,
      byType: {},
      clickRate: 0
    };

    let clicks = 0;
    
    notificationMetrics.forEach(metric => {
      const type = metric.value.type;
      if (!stats.byType[type]) {
        stats.byType[type] = 0;
      }
      stats.byType[type]++;
      
      if (metric.value.action) {
        clicks++;
      }
    });

    if (stats.total > 0) {
      stats.clickRate = (clicks / stats.total) * 100;
    }

    return stats;
  }
}

// Export singleton instance
export const pushManager = new PushManager();