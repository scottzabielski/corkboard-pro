// Corkboard Pro - Real-time Collaboration
console.log('🤝 Collaboration.js loaded');

class CollaborationManager extends EventEmitter {
    constructor() {
        super();
        this.socket = null;
        this.connected = false;
        this.currentBoard = null;
        this.currentUser = this.generateUserId();
        this.cursors = new Map();
        this.typingIndicators = new Map();
        this.connectionRetries = 0;
        this.maxRetries = 5;
        this.retryDelay = 2000;
        
        this.initializeConnection();
        this.setupEventListeners();
    }

    generateUserId() {
        return `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    initializeConnection() {
        try {
            if (typeof io === 'undefined') {
                console.warn('Socket.io not available, collaboration features disabled');
                return;
            }
            
            this.socket = io('http://localhost:3001', {
                transports: ['websocket', 'polling'],
                timeout: 10000,
                reconnection: true,
                reconnectionDelay: this.retryDelay,
                reconnectionAttempts: this.maxRetries
            });

            this.setupSocketListeners();
        } catch (error) {
            console.error('Failed to initialize socket connection:', error);
            this.emit('connection-failed', error);
        }
    }

    setupSocketListeners() {
        this.socket.on('connect', () => {
            console.log('Connected to collaboration server');
            this.connected = true;
            this.connectionRetries = 0;
            this.emit('connected');
            
            // Rejoin current board if we were in one
            if (this.currentBoard) {
                this.joinBoard(this.currentBoard);
            }
        });

        this.socket.on('disconnect', (reason) => {
            console.log('Disconnected from collaboration server:', reason);
            this.connected = false;
            this.emit('disconnected', reason);
            this.clearAllCursors();
            this.clearAllTypingIndicators();
        });

        this.socket.on('connect_error', (error) => {
            console.error('Connection error:', error);
            this.connectionRetries++;
            this.emit('connection-error', { error, retries: this.connectionRetries });
            
            if (this.connectionRetries >= this.maxRetries) {
                this.emit('connection-failed', error);
            }
        });

        this.socket.on('reconnect', () => {
            console.log('Reconnected to collaboration server');
            this.emit('reconnected');
        });

        // Real-time card updates
        this.socket.on('card-created', (cardData) => {
            this.emit('remote-card-created', cardData);
        });

        this.socket.on('card-updated', (updateData) => {
            this.emit('remote-card-updated', updateData);
        });

        this.socket.on('card-deleted', (cardId) => {
            this.emit('remote-card-deleted', cardId);
        });

        this.socket.on('card-position-update', (positionData) => {
            this.emit('remote-card-position-update', positionData);
        });

        // User presence
        this.socket.on('user-joined', (userId) => {
            console.log('User joined:', userId);
            this.emit('user-joined', userId);
        });

        this.socket.on('user-left', (userId) => {
            console.log('User left:', userId);
            this.emit('user-left', userId);
            this.removeCursor(userId);
            this.removeTypingIndicator(userId);
        });

        // Cursor tracking
        this.socket.on('cursor-update', (cursorData) => {
            this.updateCursor(cursorData);
        });

        // Typing indicators
        this.socket.on('typing-start', (typingData) => {
            this.showTypingIndicator(typingData);
        });

        this.socket.on('typing-stop', (typingData) => {
            this.hideTypingIndicator(typingData);
        });

        // Board updates
        this.socket.on('board-updated', (boardData) => {
            this.emit('remote-board-updated', boardData);
        });
    }

    setupEventListeners() {
        // Track mouse movement for cursor sharing
        let cursorThrottle = Utils.throttle((e) => {
            if (this.connected && this.currentBoard) {
                this.broadcastCursorPosition(e.clientX, e.clientY);
            }
        }, 100);

        document.addEventListener('mousemove', cursorThrottle);

        // Track typing in card inputs
        document.addEventListener('focusin', (e) => {
            if (this.isCardInput(e.target)) {
                this.startTyping(e.target);
            }
        });

        document.addEventListener('focusout', (e) => {
            if (this.isCardInput(e.target)) {
                this.stopTyping(e.target);
            }
        });

        // Handle page visibility for presence management
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                this.setUserIdle();
            } else {
                this.setUserActive();
            }
        });
    }

    // Board Management
    joinBoard(boardId) {
        if (!this.socket || !this.connected) {
            console.warn('Cannot join board: not connected to collaboration server');
            return;
        }

        // Leave current board if different
        if (this.currentBoard && this.currentBoard !== boardId) {
            this.leaveBoard();
        }

        this.currentBoard = boardId;
        this.socket.emit('join-board', boardId);
        this.emit('board-joined', boardId);
        console.log('Joined board:', boardId);
    }

    leaveBoard() {
        if (!this.socket || !this.currentBoard) return;

        this.socket.emit('leave-board', this.currentBoard);
        this.emit('board-left', this.currentBoard);
        console.log('Left board:', this.currentBoard);
        
        this.currentBoard = null;
        this.clearAllCursors();
        this.clearAllTypingIndicators();
    }

    // Real-time Card Updates
    broadcastCardCreate(cardData) {
        if (this.connected && this.currentBoard) {
            // The server will broadcast this to other clients
            // Local creation is handled by the main app
        }
    }

    broadcastCardUpdate(cardId, updates) {
        if (this.connected && this.currentBoard) {
            // The server will broadcast this to other clients
            // Local update is handled by the main app
        }
    }

    broadcastCardDelete(cardId) {
        if (this.connected && this.currentBoard) {
            // The server will broadcast this to other clients
            // Local deletion is handled by the main app
        }
    }

    broadcastCardPosition(cardId, x, y) {
        if (this.connected && this.currentBoard) {
            this.socket.emit('card-position-update', {
                cardId,
                x,
                y,
                boardId: this.currentBoard,
                userId: this.currentUser
            });
        }
    }

    // Cursor Management
    broadcastCursorPosition(x, y) {
        if (this.connected && this.currentBoard) {
            this.socket.emit('cursor-update', {
                x,
                y,
                boardId: this.currentBoard,
                userId: this.currentUser,
                timestamp: Date.now()
            });
        }
    }

    updateCursor(cursorData) {
        if (cursorData.userId === this.currentUser) return; // Don't show own cursor

        const cursor = this.getOrCreateCursor(cursorData.userId);
        cursor.style.left = cursorData.x + 'px';
        cursor.style.top = cursorData.y + 'px';
        cursor.style.display = 'block';

        // Auto-hide cursor after inactivity
        this.cursors.set(cursorData.userId, {
            element: cursor,
            timeout: setTimeout(() => {
                cursor.style.display = 'none';
            }, 3000)
        });
    }

    getOrCreateCursor(userId) {
        let cursorData = this.cursors.get(userId);
        
        if (!cursorData) {
            const cursor = document.createElement('div');
            cursor.className = 'user-cursor';
            cursor.innerHTML = `
                <div class="user-cursor-pointer"></div>
                <div class="user-cursor-label">${this.getUserDisplayName(userId)}</div>
            `;
            
            // Assign a unique color based on userId
            const color = this.getUserColor(userId);
            cursor.style.color = color;
            cursor.style.borderColor = color;
            
            document.body.appendChild(cursor);
            
            cursorData = { element: cursor, timeout: null };
            this.cursors.set(userId, cursorData);
        }

        // Clear existing timeout
        if (cursorData.timeout) {
            clearTimeout(cursorData.timeout);
        }

        return cursorData.element;
    }

    removeCursor(userId) {
        const cursorData = this.cursors.get(userId);
        if (cursorData) {
            if (cursorData.timeout) {
                clearTimeout(cursorData.timeout);
            }
            cursorData.element.remove();
            this.cursors.delete(userId);
        }
    }

    clearAllCursors() {
        this.cursors.forEach((cursorData) => {
            if (cursorData.timeout) {
                clearTimeout(cursorData.timeout);
            }
            cursorData.element.remove();
        });
        this.cursors.clear();
    }

    // Typing Indicators
    startTyping(element) {
        if (!this.connected || !this.currentBoard) return;

        const cardId = this.getCardIdFromElement(element);
        const fieldType = this.getFieldType(element);

        if (cardId) {
            this.socket.emit('typing-start', {
                cardId,
                fieldType,
                boardId: this.currentBoard,
                userId: this.currentUser
            });
        }
    }

    stopTyping(element) {
        if (!this.connected || !this.currentBoard) return;

        const cardId = this.getCardIdFromElement(element);
        const fieldType = this.getFieldType(element);

        if (cardId) {
            this.socket.emit('typing-stop', {
                cardId,
                fieldType,
                boardId: this.currentBoard,
                userId: this.currentUser
            });
        }
    }

    showTypingIndicator(typingData) {
        if (typingData.userId === this.currentUser) return; // Don't show own typing

        const cardElement = document.getElementById(`card-${typingData.cardId}`);
        if (!cardElement) return;

        const indicatorKey = `${typingData.userId}-${typingData.cardId}-${typingData.fieldType}`;
        
        // Remove existing indicator for this user/card/field
        this.hideTypingIndicator(typingData);

        const indicator = document.createElement('div');
        indicator.className = 'typing-indicator';
        indicator.style.backgroundColor = this.getUserColor(typingData.userId);
        indicator.innerHTML = `${this.getUserDisplayName(typingData.userId)} is typing...`;
        
        cardElement.appendChild(indicator);
        
        this.typingIndicators.set(indicatorKey, {
            element: indicator,
            timeout: setTimeout(() => {
                this.hideTypingIndicator(typingData);
            }, 5000) // Auto-hide after 5 seconds
        });
    }

    hideTypingIndicator(typingData) {
        const indicatorKey = `${typingData.userId}-${typingData.cardId}-${typingData.fieldType}`;
        const indicatorData = this.typingIndicators.get(indicatorKey);
        
        if (indicatorData) {
            if (indicatorData.timeout) {
                clearTimeout(indicatorData.timeout);
            }
            indicatorData.element.remove();
            this.typingIndicators.delete(indicatorKey);
        }
    }

    removeTypingIndicator(userId) {
        // Remove all typing indicators for a specific user
        for (const [key, indicatorData] of this.typingIndicators.entries()) {
            if (key.startsWith(`${userId}-`)) {
                if (indicatorData.timeout) {
                    clearTimeout(indicatorData.timeout);
                }
                indicatorData.element.remove();
                this.typingIndicators.delete(key);
            }
        }
    }

    clearAllTypingIndicators() {
        this.typingIndicators.forEach((indicatorData) => {
            if (indicatorData.timeout) {
                clearTimeout(indicatorData.timeout);
            }
            indicatorData.element.remove();
        });
        this.typingIndicators.clear();
    }

    // User Management
    setUserIdle() {
        if (this.connected) {
            // Could implement user status updates here
        }
    }

    setUserActive() {
        if (this.connected) {
            // Could implement user status updates here
        }
    }

    getUserColor(userId) {
        // Generate consistent color based on userId
        let hash = 0;
        for (let i = 0; i < userId.length; i++) {
            const char = userId.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32bit integer
        }
        
        const colors = [
            '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7',
            '#DDA0DD', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E9',
            '#F8C471', '#82E0AA', '#F1948A', '#85C1E9', '#D7DBDD'
        ];
        
        return colors[Math.abs(hash) % colors.length];
    }

    getUserDisplayName(userId) {
        // In a real app, you'd fetch this from user data
        const shortId = userId.split('_').pop().substring(0, 4);
        return `User ${shortId}`;
    }

    // Utility Methods
    isCardInput(element) {
        return element.classList.contains('card-title') ||
               element.classList.contains('card-body') ||
               element.classList.contains('card-details');
    }

    getCardIdFromElement(element) {
        const cardElement = element.closest('.note-card');
        if (cardElement) {
            const match = cardElement.id.match(/card-(.+)/);
            return match ? match[1] : null;
        }
        return null;
    }

    getFieldType(element) {
        if (element.classList.contains('card-title')) return 'title';
        if (element.classList.contains('card-body')) return 'body';
        if (element.classList.contains('card-details')) return 'details';
        return 'unknown';
    }

    // Connection Management
    reconnect() {
        if (this.socket && !this.connected) {
            this.socket.connect();
        }
    }

    disconnect() {
        if (this.socket) {
            this.leaveBoard();
            this.socket.disconnect();
            this.connected = false;
        }
    }

    getConnectionStatus() {
        return {
            connected: this.connected,
            currentBoard: this.currentBoard,
            userId: this.currentUser,
            retries: this.connectionRetries,
            activeCursors: this.cursors.size,
            activeTypingIndicators: this.typingIndicators.size
        };
    }

    // Conflict Resolution
    resolveConflict(localData, remoteData) {
        // Simple last-write-wins strategy
        // In a production app, you might want more sophisticated conflict resolution
        const localTimestamp = new Date(localData.updated_at || localData.modified || 0).getTime();
        const remoteTimestamp = new Date(remoteData.updated_at || remoteData.modified || 0).getTime();
        
        return remoteTimestamp >= localTimestamp ? remoteData : localData;
    }

    // Event Handlers for Integration
    onRemoteCardCreated(callback) {
        this.on('remote-card-created', callback);
    }

    onRemoteCardUpdated(callback) {
        this.on('remote-card-updated', callback);
    }

    onRemoteCardDeleted(callback) {
        this.on('remote-card-deleted', callback);
    }

    onRemoteCardPositionUpdate(callback) {
        this.on('remote-card-position-update', callback);
    }

    onUserJoined(callback) {
        this.on('user-joined', callback);
    }

    onUserLeft(callback) {
        this.on('user-left', callback);
    }

    onConnectionStatusChange(callback) {
        this.on('connected', () => callback(true));
        this.on('disconnected', () => callback(false));
        this.on('reconnected', () => callback(true));
    }
}

// Initialize global collaboration manager
window.collaboration = new CollaborationManager();