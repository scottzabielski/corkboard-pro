// Corkboard Pro - Storage Management

class StorageManager extends EventEmitter {
    constructor() {
        super();
        this.isOnline = navigator.onLine;
        this.syncQueue = [];
        this.lastSync = null;
        this.syncInProgress = false;
        
        this.setupEventListeners();
        this.startSyncScheduler();
    }

    setupEventListeners() {
        // Online/offline status
        window.addEventListener('online', () => {
            this.isOnline = true;
            this.emit('online');
            this.processSyncQueue();
        });

        window.addEventListener('offline', () => {
            this.isOnline = false;
            this.emit('offline');
        });

        // Page visibility for sync
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden && this.isOnline) {
                this.processSyncQueue();
            }
        });

        // Before page unload
        window.addEventListener('beforeunload', () => {
            this.saveToLocal('app_state', { lastSeen: new Date().toISOString() });
        });
    }

    // Local Storage Operations
    saveToLocal(key, data) {
        try {
            const serialized = JSON.stringify({
                data,
                timestamp: Date.now(),
                version: '1.0'
            });
            localStorage.setItem(`corkboard_${key}`, serialized);
            this.emit('local-save', { key, data });
            return true;
        } catch (error) {
            console.error('Failed to save to localStorage:', error);
            this.emit('storage-error', { type: 'local-save', error, key });
            return false;
        }
    }

    loadFromLocal(key) {
        try {
            const serialized = localStorage.getItem(`corkboard_${key}`);
            if (!serialized) return null;

            const parsed = JSON.parse(serialized);
            this.emit('local-load', { key, data: parsed.data });
            return parsed.data;
        } catch (error) {
            console.error('Failed to load from localStorage:', error);
            this.emit('storage-error', { type: 'local-load', error, key });
            return null;
        }
    }

    removeFromLocal(key) {
        try {
            localStorage.removeItem(`corkboard_${key}`);
            this.emit('local-remove', { key });
            return true;
        } catch (error) {
            console.error('Failed to remove from localStorage:', error);
            return false;
        }
    }

    clearLocal() {
        try {
            const keys = Object.keys(localStorage).filter(key => key.startsWith('corkboard_'));
            keys.forEach(key => localStorage.removeItem(key));
            this.emit('local-clear');
            return true;
        } catch (error) {
            console.error('Failed to clear localStorage:', error);
            return false;
        }
    }

    // Server Storage Operations
    async saveToServer(endpoint, data) {
        try {
            const response = await fetch(`/api/${endpoint}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(data)
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const result = await response.json();
            this.emit('server-save', { endpoint, data, result });
            return result;
        } catch (error) {
            console.error('Failed to save to server:', error);
            this.queueForSync('save', endpoint, data);
            this.emit('storage-error', { type: 'server-save', error, endpoint, data });
            throw error;
        }
    }

    async loadFromServer(endpoint) {
        try {
            const response = await fetch(`/api/${endpoint}`);
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            this.emit('server-load', { endpoint, data });
            return data;
        } catch (error) {
            console.error('Failed to load from server:', error);
            this.emit('storage-error', { type: 'server-load', error, endpoint });
            throw error;
        }
    }

    async updateOnServer(endpoint, data) {
        try {
            const response = await fetch(`/api/${endpoint}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(data)
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const result = await response.json();
            this.emit('server-update', { endpoint, data, result });
            return result;
        } catch (error) {
            console.error('Failed to update on server:', error);
            this.queueForSync('update', endpoint, data);
            this.emit('storage-error', { type: 'server-update', error, endpoint, data });
            throw error;
        }
    }

    async deleteFromServer(endpoint) {
        try {
            const response = await fetch(`/api/${endpoint}`, {
                method: 'DELETE'
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const result = await response.json();
            this.emit('server-delete', { endpoint, result });
            return result;
        } catch (error) {
            console.error('Failed to delete from server:', error);
            this.queueForSync('delete', endpoint, null);
            this.emit('storage-error', { type: 'server-delete', error, endpoint });
            throw error;
        }
    }

    // Sync Queue Management
    queueForSync(operation, endpoint, data) {
        const syncItem = {
            id: Utils.generateId(),
            operation,
            endpoint,
            data,
            timestamp: Date.now(),
            retries: 0,
            maxRetries: 3
        };

        this.syncQueue.push(syncItem);
        this.saveSyncQueue();
        this.emit('sync-queued', syncItem);
    }

    async processSyncQueue() {
        if (!this.isOnline || this.syncInProgress || this.syncQueue.length === 0) {
            return;
        }

        this.syncInProgress = true;
        this.emit('sync-start');

        const successful = [];
        const failed = [];

        for (const item of this.syncQueue) {
            try {
                await this.processSyncItem(item);
                successful.push(item);
            } catch (error) {
                item.retries++;
                if (item.retries >= item.maxRetries) {
                    failed.push(item);
                    this.emit('sync-item-failed', { item, error });
                } else {
                    // Keep in queue for retry
                    continue;
                }
            }
        }

        // Remove processed items
        this.syncQueue = this.syncQueue.filter(item => 
            !successful.includes(item) && !failed.includes(item)
        );

        this.saveSyncQueue();
        this.lastSync = new Date().toISOString();
        this.saveToLocal('last_sync', this.lastSync);

        this.syncInProgress = false;
        this.emit('sync-complete', { successful, failed });
    }

    async processSyncItem(item) {
        const { operation, endpoint, data } = item;

        switch (operation) {
            case 'save':
                return await this.saveToServer(endpoint, data);
            case 'update':
                return await this.updateOnServer(endpoint, data);
            case 'delete':
                return await this.deleteFromServer(endpoint);
            default:
                throw new Error(`Unknown sync operation: ${operation}`);
        }
    }

    saveSyncQueue() {
        this.saveToLocal('sync_queue', this.syncQueue);
    }

    loadSyncQueue() {
        const queue = this.loadFromLocal('sync_queue');
        if (queue && Array.isArray(queue)) {
            this.syncQueue = queue;
        }
    }

    clearSyncQueue() {
        this.syncQueue = [];
        this.saveSyncQueue();
        this.emit('sync-queue-cleared');
    }

    // Auto-sync scheduler
    startSyncScheduler() {
        // Load existing sync queue
        this.loadSyncQueue();
        this.lastSync = this.loadFromLocal('last_sync');

        // Sync every 30 seconds if online
        setInterval(() => {
            if (this.isOnline && this.syncQueue.length > 0) {
                this.processSyncQueue();
            }
        }, 30000);

        // Initial sync after 5 seconds
        setTimeout(() => {
            if (this.isOnline) {
                this.processSyncQueue();
            }
        }, 5000);
    }

    // Data Migration
    async migrateData(fromVersion, toVersion) {
        this.emit('migration-start', { fromVersion, toVersion });

        try {
            const migrations = {
                '1.0': {
                    // Migration logic for version 1.0
                    migrate: (data) => {
                        // Add new fields, transform data structure, etc.
                        return data;
                    }
                }
                // Add more migrations as needed
            };

            let currentData = this.loadFromLocal('boards') || [];
            
            // Apply migrations in sequence
            for (const version in migrations) {
                if (this.shouldApplyMigration(fromVersion, version, toVersion)) {
                    currentData = migrations[version].migrate(currentData);
                }
            }

            // Save migrated data
            this.saveToLocal('boards', currentData);
            this.saveToLocal('app_version', toVersion);

            this.emit('migration-complete', { fromVersion, toVersion, data: currentData });
            return currentData;
        } catch (error) {
            this.emit('migration-error', { fromVersion, toVersion, error });
            throw error;
        }
    }

    shouldApplyMigration(fromVersion, migrationVersion, toVersion) {
        // Simple version comparison logic
        return fromVersion < migrationVersion && migrationVersion <= toVersion;
    }

    // Backup and Restore
    createBackup() {
        const backup = {
            version: '1.0',
            timestamp: new Date().toISOString(),
            data: {
                boards: this.loadFromLocal('boards'),
                settings: this.loadFromLocal('settings'),
                preferences: this.loadFromLocal('preferences')
            }
        };

        const blob = new Blob([JSON.stringify(backup, null, 2)], { 
            type: 'application/json' 
        });
        
        Utils.downloadBlob(blob, `corkboard-backup-${Date.now()}.json`);
        this.emit('backup-created', backup);
        return backup;
    }

    async restoreFromBackup(backupData) {
        try {
            this.emit('restore-start', backupData);

            // Validate backup data
            if (!backupData.data || !backupData.version) {
                throw new Error('Invalid backup format');
            }

            // Clear existing data
            this.clearLocal();

            // Restore data
            for (const [key, value] of Object.entries(backupData.data)) {
                if (value !== null && value !== undefined) {
                    this.saveToLocal(key, value);
                }
            }

            this.emit('restore-complete', backupData);
            return true;
        } catch (error) {
            this.emit('restore-error', { error, backupData });
            throw error;
        }
    }

    // Storage Statistics
    getStorageStats() {
        const stats = {
            localStorage: {
                used: 0,
                available: 0,
                items: 0
            },
            syncQueue: {
                pending: this.syncQueue.length,
                lastSync: this.lastSync
            },
            online: this.isOnline
        };

        // Calculate localStorage usage
        let totalSize = 0;
        let itemCount = 0;
        
        for (let key in localStorage) {
            if (key.startsWith('corkboard_')) {
                totalSize += localStorage[key].length;
                itemCount++;
            }
        }

        stats.localStorage.used = totalSize;
        stats.localStorage.items = itemCount;

        // Estimate available space (rough calculation)
        try {
            const testKey = 'corkboard_test_storage';
            let testSize = 1024; // Start with 1KB
            let maxSize = 0;

            while (testSize <= 10 * 1024 * 1024) { // Up to 10MB
                try {
                    localStorage.setItem(testKey, 'x'.repeat(testSize));
                    localStorage.removeItem(testKey);
                    maxSize = testSize;
                    testSize *= 2;
                } catch (e) {
                    break;
                }
            }

            stats.localStorage.available = maxSize - totalSize;
        } catch (error) {
            stats.localStorage.available = -1; // Unknown
        }

        return stats;
    }

    // Cleanup old data
    cleanup(maxAge = 30 * 24 * 60 * 60 * 1000) { // 30 days default
        const cutoffTime = Date.now() - maxAge;
        let cleaned = 0;

        for (let key in localStorage) {
            if (key.startsWith('corkboard_')) {
                try {
                    const data = JSON.parse(localStorage[key]);
                    if (data.timestamp && data.timestamp < cutoffTime) {
                        localStorage.removeItem(key);
                        cleaned++;
                    }
                } catch (error) {
                    // Remove invalid entries
                    localStorage.removeItem(key);
                    cleaned++;
                }
            }
        }

        this.emit('cleanup-complete', { cleaned, maxAge });
        return cleaned;
    }
}

// Initialize global storage manager
window.storage = new StorageManager();