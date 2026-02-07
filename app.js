// Main DailyTrack application
import { db } from './db.js';
import { syncManager } from './sync.js';
import { pushManager } from './push.js';

class DailyTrackApp {
  constructor() {
    this.currentView = 'dashboard';
    this.isInitialized = false;
    this.isOffline = !navigator.onLine;
    this.eventListeners = new Map();
  }

  async init() {
    if (this.isInitialized) {
      console.warn('App already initialized');
      return;
    }

    console.log('Initializing DailyTrack App...');

    try {
      // Initialize core modules
      await this.initCoreModules();
      
      // Setup UI
      this.setupUI();
      
      // Register service worker
      await this.registerServiceWorker();
      
      // Setup event listeners
      this.setupEventListeners();
      
      // Load initial data
      await this.loadInitialData();
      
      // Setup periodic tasks
      this.setupPeriodicTasks();
      
      this.isInitialized = true;
      console.log('DailyTrack App initialized successfully');
      
      this.emit('appReady');
    } catch (error) {
      console.error('Failed to initialize app:', error);
      this.emit('appError', { error });
    }
  }

  async initCoreModules() {
    // Initialize database
    await db.init();
    
    // Initialize sync manager
    await syncManager.init();
    
    // Initialize push manager
    await pushManager.init();
    
    // Check for database corruption
    const isValid = await db.validate();
    if (!isValid) {
      console.warn('Database corruption detected, attempting repair...');
      await db.repair();
    }
  }

  setupUI() {
    // Update greeting based on time
    this.updateGreeting();
    
    // Set current date
    this.updateCurrentDate();
    
    // Setup theme
    this.setupTheme();
    
    // Setup navigation
    this.setupNavigation();
    
    // Setup modals
    this.setupModals();
    
    // Setup forms
    this.setupForms();
    
    // Setup empty states
    this.setupEmptyStates();
  }

  async registerServiceWorker() {
    if ('serviceWorker' in navigator) {
      try {
        const registration = await navigator.serviceWorker.register('/sw.js');
        console.log('Service Worker registered:', registration);
        
        // Check for updates
        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing;
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              this.showUpdateAvailable();
            }
          });
        });
      } catch (error) {
        console.error('Service Worker registration failed:', error);
      }
    }
  }

  setupEventListeners() {
    // Online/offline detection
    window.addEventListener('online', () => this.handleOnline());
    window.addEventListener('offline', () => this.handleOffline());
    
    // Visibility change
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        this.handleAppVisible();
      }
    });
    
    // Before unload
    window.addEventListener('beforeunload', (e) => {
      this.handleBeforeUnload(e);
    });
    
    // App lifecycle events
    this.on('syncComplete', this.handleSyncComplete.bind(this));
    this.on('syncError', this.handleSyncError.bind(this));
    this.on('networkRestored', this.handleNetworkRestored.bind(this));
    this.on('networkLost', this.handleNetworkLost.bind(this));
  }

  async loadInitialData() {
    // Load tasks
    await this.loadTasks();
    
    // Load expenses
    await this.loadExpenses();
    
    // Load habits
    await this.loadHabits();
    
    // Load journal entries
    await this.loadJournalEntries();
    
    // Load settings
    await this.loadSettings();
    
    // Update dashboard
    this.updateDashboard();
  }

  setupPeriodicTasks() {
    // Update date every minute
    setInterval(() => this.updateCurrentDate(), 60000);
    
    // Update greeting every hour
    setInterval(() => this.updateGreeting(), 3600000);
    
    // Daily data cleanup
    setInterval(() => this.dailyCleanup(), 24 * 3600000);
    
    // Schedule daily digest notification
    this.scheduleDailyDigest();
    
    // Schedule task reminders
    this.scheduleTaskReminders();
  }

  // Data loading methods
  async loadTasks() {
    try {
      const tasks = await db.getTasks();
      this.renderTasks(tasks);
    } catch (error) {
      console.error('Failed to load tasks:', error);
    }
  }

  async loadExpenses() {
    try {
      const today = new Date().toISOString().split('T')[0];
      const expenses = await db.getExpensesByPeriod(today, today);
      this.renderExpenses(expenses);
    } catch (error) {
      console.error('Failed to load expenses:', error);
    }
  }

  async loadHabits() {
    try {
      const habits = await db.getAll('habits');
      this.renderHabits(habits);
    } catch (error) {
      console.error('Failed to load habits:', error);
    }
  }

  async loadJournalEntries() {
    try {
      const today = new Date().toISOString().split('T')[0];
      const [year, month] = today.split('-');
      const entries = await db.getJournalEntriesByMonth(year, month);
      this.renderJournalEntries(entries);
    } catch (error) {
      console.error('Failed to load journal entries:', error);
    }
  }

  async loadSettings() {
    try {
      const settings = await db.get('settings', 'general');
      if (settings) {
        this.applySettings(settings);
      }
    } catch (error) {
      console.error('Failed to load settings:', error);
    }
  }

  // UI Update methods
  updateDashboard() {
    this.updateTaskStats();
    this.updateExpenseStats();
    this.updateHabitStats();
    this.updateJournalStats();
    this.updateRecentActivity();
  }

  async updateTaskStats() {
    const tasks = await db.getTasks();
    const today = new Date().toISOString().split('T')[0];
    
    const todayTasks = tasks.filter(task => 
      !task.dueDate || task.dueDate === today
    );
    
    const completedTasks = todayTasks.filter(task => task.completed).length;
    const pendingTasks = tasks.filter(task => !task.completed).length;
    
    // Update UI
    document.getElementById('todayTasks').textContent = todayTasks.length;
    document.getElementById('taskProgress').style.width = 
      todayTasks.length > 0 ? `${(completedTasks / todayTasks.length) * 100}%` : '0%';
    
    // Update badge
    const taskBadge = document.getElementById('taskBadge');
    if (pendingTasks > 0) {
      taskBadge.textContent = pendingTasks > 99 ? '99+' : pendingTasks;
      taskBadge.style.display = 'flex';
    } else {
      taskBadge.style.display = 'none';
    }
  }

  async updateExpenseStats() {
    const today = new Date().toISOString().split('T')[0];
    const expenses = await db.getExpensesByPeriod(today, today);
    
    const totalToday = expenses.reduce((sum, exp) => sum + exp.amount, 0);
    const settings = await db.get('settings', 'general');
    const dailyBudget = settings?.dailyBudget || 50;
    
    document.getElementById('todayExpenses').textContent = `$${totalToday.toFixed(2)}`;
    
    const budgetStatus = document.getElementById('budgetStatus');
    if (totalToday > dailyBudget) {
      budgetStatus.textContent = 'Over Budget';
      budgetStatus.style.color = 'var(--error)';
    } else {
      budgetStatus.textContent = 'Under Budget';
      budgetStatus.style.color = 'var(--success)';
    }
  }

  async updateHabitStats() {
    const habits = await db.getAll('habits');
    const longestStreak = Math.max(...habits.map(h => h.currentStreak || 0), 0);
    
    document.getElementById('currentStreak').textContent = longestStreak;
    document.getElementById('streakCount').textContent = `${longestStreak} day streak`;
  }

  async updateJournalStats() {
    const today = new Date().toISOString().split('T')[0];
    const entry = await db.getJournalEntriesByMonth(
      today.split('-')[0],
      today.split('-')[1]
    );
    
    // Calculate streak
    const streak = await this.calculateJournalStreak();
    document.getElementById('currentStreak').textContent = streak;
  }

  async calculateJournalStreak() {
    const entries = await db.getAll('journal');
    if (entries.length === 0) return 0;
    
    const entryDates = new Set(entries.map(e => e.date).sort());
    const dates = Array.from(entryDates);
    
    let streak = 0;
    let currentDate = new Date();
    
    while (true) {
      const dateStr = currentDate.toISOString().split('T')[0];
      if (entryDates.has(dateStr)) {
        streak++;
        currentDate.setDate(currentDate.getDate() - 1);
      } else {
        break;
      }
    }
    
    return streak;
  }

  async updateRecentActivity() {
    const activities = await db.getAll('activityLog');
    const recent = activities
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      .slice(0, 10);
    
    this.renderRecentActivity(recent);
  }

  // Render methods
  renderTasks(tasks) {
    const container = document.getElementById('tasksList');
    const emptyState = document.getElementById('noTasks');
    
    if (!tasks || tasks.length === 0) {
      emptyState.style.display = 'block';
      container.innerHTML = '';
      return;
    }
    
    emptyState.style.display = 'none';
    container.innerHTML = '';
    
    tasks.forEach(task => {
      const element = this.createTaskElement(task);
      container.appendChild(element);
    });
  }

  renderExpenses(expenses) {
    const container = document.getElementById('expensesList');
    const emptyState = document.getElementById('noExpenses');
    
    if (!expenses || expenses.length === 0) {
      emptyState.style.display = 'block';
      container.innerHTML = '';
      return;
    }
    
    emptyState.style.display = 'none';
    container.innerHTML = '';
    
    // Group by date
    const grouped = {};
    expenses.forEach(expense => {
      if (!grouped[expense.date]) {
        grouped[expense.date] = [];
      }
      grouped[expense.date].push(expense);
    });
    
    // Render groups
    Object.entries(grouped)
      .sort(([dateA], [dateB]) => dateB.localeCompare(dateA))
      .forEach(([date, dateExpenses]) => {
        this.renderExpenseGroup(container, date, dateExpenses);
      });
  }

  renderHabits(habits) {
    const container = document.getElementById('habitsList');
    const emptyState = document.getElementById('noHabits');
    
    if (!habits || habits.length === 0) {
      emptyState.style.display = 'block';
      container.innerHTML = '';
      return;
    }
    
    emptyState.style.display = 'none';
    container.innerHTML = '';
    
    habits.forEach(habit => {
      const element = this.createHabitElement(habit);
      container.appendChild(element);
    });
  }

  renderJournalEntries(entries) {
    const container = document.getElementById('journalList');
    const emptyState = document.getElementById('noJournal');
    
    if (!entries || entries.length === 0) {
      emptyState.style.display = 'block';
      container.innerHTML = '';
      return;
    }
    
    emptyState.style.display = 'none';
    container.innerHTML = '';
    
    entries.forEach(entry => {
      const element = this.createJournalElement(entry);
      container.appendChild(element);
    });
  }

  renderRecentActivity(activities) {
    const container = document.getElementById('recentActivity');
    const emptyState = document.getElementById('noActivity');
    
    if (!activities || activities.length === 0) {
      emptyState.style.display = 'block';
      container.innerHTML = '';
      return;
    }
    
    emptyState.style.display = 'none';
    container.innerHTML = '';
    
    activities.forEach(activity => {
      const element = this.createActivityElement(activity);
      container.appendChild(element);
    });
  }

  // Element creation methods
  createTaskElement(task) {
    const element = document.createElement('div');
    element.className = 'task-item';
    element.innerHTML = `
      <div class="task-content">
        <div class="task-header">
          <input type="checkbox" ${task.completed ? 'checked' : ''}>
          <span class="task-title ${task.completed ? 'completed' : ''}">${task.title}</span>
        </div>
        <div class="task-meta">
          ${task.dueDate ? `<span class="due-date">${this.formatDate(task.dueDate)}</span>` : ''}
          ${task.priority ? `<span class="priority ${task.priority}">${task.priority}</span>` : ''}
        </div>
      </div>
      <div class="task-actions">
        <button class="icon-btn edit-task" data-id="${task.id}">
          <i class="fas fa-edit"></i>
        </button>
        <button class="icon-btn delete-task" data-id="${task.id}">
          <i class="fas fa-trash"></i>
        </button>
      </div>
    `;
    
    // Add event listeners
    element.querySelector('input[type="checkbox"]').addEventListener('change', (e) => {
      this.toggleTaskCompletion(task.id, e.target.checked);
    });
    
    element.querySelector('.edit-task').addEventListener('click', () => {
      this.editTask(task.id);
    });
    
    element.querySelector('.delete-task').addEventListener('click', () => {
      this.deleteTask(task.id);
    });
    
    return element;
  }

  createExpenseElement(expense) {
    // Similar implementation for expenses
  }

  createHabitElement(habit) {
    // Similar implementation for habits
  }

  createJournalElement(entry) {
    // Similar implementation for journal entries
  }

  createActivityElement(activity) {
    // Similar implementation for activity items
  }

  // Event handlers
  handleOnline() {
    this.isOffline = false;
    document.getElementById('offlineIndicator').style.display = 'none';
    syncManager.onNetworkRestored();
  }

  handleOffline() {
    this.isOffline = true;
    document.getElementById('offlineIndicator').style.display = 'block';
    syncManager.onNetworkLost();
  }

  handleAppVisible() {
    // Refresh data when app becomes visible
    if (!this.isOffline) {
      this.updateDashboard();
      syncManager.syncAll();
    }
  }

  handleBeforeUnload(e) {
    // Save any unsaved data
    this.savePendingChanges();
    
    // Don't prevent unload, but log it
    console.log('App unloading...');
  }

  handleSyncComplete() {
    console.log('Sync complete');
    this.showToast('Data synced successfully!', 'success');
    this.updateDashboard();
  }

  handleSyncError(error) {
    console.error('Sync error:', error);
    this.showToast('Sync failed. Will retry later.', 'error');
  }

  handleNetworkRestored() {
    this.showToast('Back online! Syncing data...', 'info');
  }

  handleNetworkLost() {
    this.showToast('You are offline. Changes will be saved locally.', 'warning');
  }

  // Utility methods
  updateGreeting() {
    const hour = new Date().getHours();
    let greeting = 'Good ';
    let icon = 'fas fa-';
    
    if (hour < 12) {
      greeting += 'Morning';
      icon += 'sun';
    } else if (hour < 17) {
      greeting += 'Afternoon';
      icon += 'sun';
    } else {
      greeting += 'Evening';
      icon += 'moon';
    }
    
    document.getElementById('greeting').innerHTML = 
      `<i class="${icon}"></i> ${greeting}!`;
  }

  updateCurrentDate() {
    const now = new Date();
    const options = { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    };
    document.getElementById('currentDate').textContent = 
      now.toLocaleDateString('en-US', options);
  }

  setupTheme() {
    const savedTheme = localStorage.getItem('theme') || 'auto';
    this.applyTheme(savedTheme);
  }

  applyTheme(theme) {
    const root = document.documentElement;
    
    if (theme === 'dark' || (theme === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
      root.classList.add('dark');
      root.classList.remove('light');
    } else {
      root.classList.add('light');
      root.classList.remove('dark');
    }
    
    localStorage.setItem('theme', theme);
  }

  setupNavigation() {
    // Setup bottom navigation
    document.querySelectorAll('.nav-item').forEach(item => {
      item.addEventListener('click', (e) => {
        e.preventDefault();
        const view = item.dataset.view;
        this.switchView(view);
      });
    });
  }

  switchView(viewName) {
    // Update active navigation item
    document.querySelectorAll('.nav-item').forEach(item => {
      item.classList.toggle('active', item.dataset.view === viewName);
    });
    
    // Update active view
    document.querySelectorAll('.view').forEach(view => {
      view.classList.toggle('active', view.id === `${viewName}View`);
    });
    
    this.currentView = viewName;
    
    // Update view-specific content
    switch(viewName) {
      case 'dashboard':
        this.updateDashboard();
        break;
      case 'tasks':
        this.loadTasks();
        break;
      case 'expenses':
        this.loadExpenses();
        break;
      case 'habits':
        this.loadHabits();
        break;
      case 'journal':
        this.loadJournalEntries();
        break;
    }
  }

  setupModals() {
    // Setup modal close buttons
    document.querySelectorAll('.modal-close').forEach(button => {
      button.addEventListener('click', () => {
        this.closeModal(button.closest('.modal'));
      });
    });
    
    // Close modal on backdrop click
    document.querySelectorAll('.modal').forEach(modal => {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) {
          this.closeModal(modal);
        }
      });
    });
  }

  setupForms() {
    // Setup task form
    document.getElementById('taskForm')?.addEventListener('submit', (e) => {
      e.preventDefault();
      this.saveTask();
    });
    
    // Setup expense form
    document.getElementById('expenseForm')?.addEventListener('submit', (e) => {
      e.preventDefault();
      this.saveExpense();
    });
    
    // Setup journal form
    document.getElementById('journalForm')?.addEventListener('submit', (e) => {
      e.preventDefault();
      this.saveJournalEntry();
    });
  }

  setupEmptyStates() {
    // Setup empty state buttons
    document.getElementById('addFirstTask')?.addEventListener('click', () => {
      this.showTaskModal();
    });
    
    document.getElementById('addFirstExpense')?.addEventListener('click', () => {
      this.showExpenseModal();
    });
    
    document.getElementById('addFirstHabit')?.addEventListener('click', () => {
      this.showHabitModal();
    });
  }

  // Modal methods
  showTaskModal(task = null) {
    const modal = document.getElementById('taskModal');
    if (task) {
      // Populate form with task data
      document.getElementById('taskId').value = task.id;
      document.getElementById('taskTitle').value = task.title;
      // ... populate other fields
    } else {
      // Reset form for new task
      document.getElementById('taskForm').reset();
    }
    
    modal.classList.add('active');
  }

  showExpenseModal(expense = null) {
    // Similar implementation for expense modal
  }

  showHabitModal(habit = null) {
    // Similar implementation for habit modal
  }

  closeModal(modal) {
    modal.classList.remove('active');
  }

  // Data methods
  async saveTask() {
    const formData = new FormData(document.getElementById('taskForm'));
    const task = {
      id: formData.get('id') || Date.now().toString(),
      title: formData.get('title'),
      description: formData.get('description'),
      dueDate: formData.get('dueDate'),
      priority: formData.get('priority'),
      category: formData.get('category'),
      completed: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    
    try {
      await db.update('tasks', task);
      await syncManager.queueForSync('task', task);
      
      this.showToast('Task saved!', 'success');
      this.closeModal(document.getElementById('taskModal'));
      this.loadTasks();
      this.updateDashboard();
    } catch (error) {
      console.error('Failed to save task:', error);
      this.showToast('Failed to save task', 'error');
    }
  }

  async toggleTaskCompletion(taskId, completed) {
    try {
      const task = await db.get('tasks', taskId);
      if (task) {
        task.completed = completed;
        task.updatedAt = new Date().toISOString();
        
        await db.update('tasks', task);
        await syncManager.queueForSync('task', task);
        
        this.showToast(`Task ${completed ? 'completed' : 'reopened'}!`, 'success');
        this.updateDashboard();
      }
    } catch (error) {
      console.error('Failed to toggle task completion:', error);
    }
  }

  async deleteTask(taskId) {
    if (!confirm('Are you sure you want to delete this task?')) {
      return;
    }
    
    try {
      await db.delete('tasks', taskId);
      await syncManager.queueForSync('task-delete', { id: taskId });
      
      this.showToast('Task deleted!', 'success');
      this.loadTasks();
      this.updateDashboard();
    } catch (error) {
      console.error('Failed to delete task:', error);
      this.showToast('Failed to delete task', 'error');
    }
  }

  async editTask(taskId) {
    const task = await db.get('tasks', taskId);
    if (task) {
      this.showTaskModal(task);
    }
  }

  // Similar methods for expenses, habits, and journal entries

  // Toast notifications
  showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `
      <i class="fas fa-${this.getToastIcon(type)}"></i>
      <span>${message}</span>
    `;
    
    document.getElementById('toastContainer').appendChild(toast);
    
    // Show with animation
    setTimeout(() => toast.classList.add('show'), 10);
    
    // Remove after delay
    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }

  getToastIcon(type) {
    switch(type) {
      case 'success': return 'check-circle';
      case 'error': return 'exclamation-circle';
      case 'warning': return 'exclamation-triangle';
      case 'info': return 'info-circle';
      default: return 'info-circle';
    }
  }

  // Daily tasks
  async dailyCleanup() {
    // Archive old data
    await this.archiveOldData();
    
    // Generate daily report
    await this.generateDailyReport();
    
    // Check for notifications
    await this.checkDailyNotifications();
  }

  async archiveOldData() {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    // Archive old completed tasks
    const tasks = await db.getAll('tasks');
    const oldTasks = tasks.filter(task => 
      task.completed && 
      new Date(task.updatedAt) < thirtyDaysAgo
    );
    
    // Move to archive (implement archive storage)
    console.log(`Archived ${oldTasks.length} old tasks`);
  }

  async generateDailyReport() {
    const today = new Date().toISOString().split('T')[0];
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];
    
    // Get yesterday's data
    const tasks = await db.getTasks({ dueDate: yesterdayStr });
    const expenses = await db.getExpensesByPeriod(yesterdayStr, yesterdayStr);
    
    // Calculate statistics
    const stats = {
      date: yesterdayStr,
      tasksCompleted: tasks.filter(t => t.completed).length,
      tasksTotal: tasks.length,
      expensesTotal: expenses.reduce((sum, exp) => sum + exp.amount, 0),
      expensesCount: expenses.length
    };
    
    // Save to analytics
    await db.recordAnalytics('daily-report', stats, yesterdayStr);
  }

  async checkDailyNotifications() {
    // Check for overdue tasks
    const overdueTasks = await db.getOverdueTasks();
    if (overdueTasks.length > 0) {
      pushManager.showTaskReminder(overdueTasks[0]);
    }
    
    // Check budget
    const today = new Date().toISOString().split('T')[0];
    const expenses = await db.getExpensesByPeriod(today, today);
    const totalToday = expenses.reduce((sum, exp) => sum + exp.amount, 0);
    const settings = await db.get('settings', 'general');
    const dailyBudget = settings?.dailyBudget || 50;
    
    if (totalToday > dailyBudget * 0.8) {
      pushManager.showBudgetAlert('Daily Budget', totalToday, dailyBudget);
    }
  }

  // Schedule methods
  scheduleDailyDigest() {
    // Schedule for 8 PM daily
    pushManager.scheduleDailyDigest('20:00');
  }

  scheduleTaskReminders() {
    // Schedule reminders for upcoming tasks
    pushManager.scheduleTaskReminders();
  }

  // Backup and restore
  async backupData() {
    try {
      const backup = await db.exportData();
      const blob = new Blob([JSON.stringify(backup, null, 2)], {
        type: 'application/json'
      });
      
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `DailyTrack-backup-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      this.showToast('Backup created successfully!', 'success');
    } catch (error) {
      console.error('Backup failed:', error);
      this.showToast('Backup failed', 'error');
    }
  }

  async restoreData(file) {
    if (!file) return;
    
    try {
      const text = await file.text();
      const backup = JSON.parse(text);
      
      if (!this.validateBackup(backup)) {
        throw new Error('Invalid backup file');
      }
      
      if (confirm('This will replace all current data. Are you sure?')) {
        await db.importData(backup);
        this.showToast('Data restored successfully!', 'success');
        this.loadInitialData();
      }
    } catch (error) {
      console.error('Restore failed:', error);
      this.showToast('Restore failed: ' + error.message, 'error');
    }
  }

  validateBackup(backup) {
    return backup && 
           backup.data && 
           backup.version && 
           backup.app === 'DailyTrack';
  }

  // Update available notification
  showUpdateAvailable() {
    if (confirm('A new version is available. Update now?')) {
      window.location.reload();
    }
  }

  // Event emitter
  on(event, callback) {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, []);
    }
    this.eventListeners.get(event).push(callback);
  }

  off(event, callback) {
    if (!this.eventListeners.has(event)) return;
    
    const callbacks = this.eventListeners.get(event);
    const index = callbacks.indexOf(callback);
    if (index > -1) {
      callbacks.splice(index, 1);
    }
  }

  emit(event, data) {
    if (!this.eventListeners.has(event)) return;
    
    this.eventListeners.get(event).forEach(callback => {
      try {
        callback(data);
      } catch (error) {
        console.error(`Error in event listener for ${event}:`, error);
      }
    });
  }

  // Utility methods
  formatDate(dateString) {
    const date = new Date(dateString);
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    if (date.toDateString() === today.toDateString()) {
      return 'Today';
    } else if (date.toDateString() === tomorrow.toDateString()) {
      return 'Tomorrow';
    } else {
      return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric'
      });
    }
  }

  savePendingChanges() {
    // Save any form data that hasn't been saved
    const forms = ['taskForm', 'expenseForm', 'journalForm'];
    forms.forEach(formId => {
      const form = document.getElementById(formId);
      if (form && form.checkValidity()) {
        form.dispatchEvent(new Event('submit'));
      }
    });
  }

  // Error handling
  setupErrorHandling() {
    window.addEventListener('error', (event) => {
      console.error('Global error:', event.error);
      this.recordError(event.error);
    });
    
    window.addEventListener('unhandledrejection', (event) => {
      console.error('Unhandled promise rejection:', event.reason);
      this.recordError(event.reason);
    });
  }

  async recordError(error) {
    const errorLog = {
      timestamp: new Date().toISOString(),
      message: error.message,
      stack: error.stack,
      url: window.location.href,
      userAgent: navigator.userAgent
    };
    
    try {
      await db.add('errorLog', errorLog);
    } catch (dbError) {
      console.error('Failed to log error:', dbError);
    }
  }

  // Performance monitoring
  setupPerformanceMonitoring() {
    if ('performance' in window) {
      // Monitor navigation timing
      const navigationTiming = performance.getEntriesByType('navigation')[0];
      if (navigationTiming) {
        this.recordPerformanceMetric('navigation', {
          loadTime: navigationTiming.loadEventEnd - navigationTiming.loadEventStart,
          domReady: navigationTiming.domContentLoadedEventEnd - navigationTiming.domContentLoadedEventStart,
          total: navigationTiming.loadEventEnd - navigationTiming.navigationStart
        });
      }
      
      // Monitor resource timing
      performance.getEntriesByType('resource').forEach(resource => {
        if (resource.initiatorType === 'script' || resource.initiatorType === 'css') {
          this.recordPerformanceMetric('resource', {
            name: resource.name,
            duration: resource.duration,
            size: resource.transferSize
          });
        }
      });
    }
  }

  async recordPerformanceMetric(type, data) {
    await db.recordAnalytics('performance', { type, ...data });
  }
}

// Create and export app instance
const app = new DailyTrackApp();

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  app.init();
});

// Export for module usage
export { app };