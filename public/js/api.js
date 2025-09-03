// Corkboard Pro - API Client

class APIClient extends EventEmitter {
    constructor(baseURL = 'http://localhost:3001') {
        super();
        this.baseURL = baseURL;
        this.defaultHeaders = {
            'Content-Type': 'application/json'
        };
        this.timeout = 10000; // 10 seconds
        this.retryAttempts = 3;
        this.retryDelay = 1000; // 1 second
    }

    // Generic request method with error handling and retries
    async request(endpoint, options = {}) {
        const url = `${this.baseURL}/api/${endpoint}`;
        const requestOptions = {
            method: 'GET',
            headers: { ...this.defaultHeaders, ...options.headers },
            ...options
        };

        // Add request timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.timeout);
        requestOptions.signal = controller.signal;

        let lastError;
        
        for (let attempt = 0; attempt < this.retryAttempts; attempt++) {
            try {
                this.emit('request-start', { url, options: requestOptions, attempt });

                const response = await fetch(url, requestOptions);
                clearTimeout(timeoutId);

                if (!response.ok) {
                    const errorData = await response.json().catch(() => ({}));
                    const error = new APIError(
                        errorData.message || `HTTP ${response.status}`,
                        response.status,
                        errorData
                    );
                    throw error;
                }

                const data = await response.json();
                this.emit('request-success', { url, data, attempt });
                return data;

            } catch (error) {
                lastError = error;
                this.emit('request-error', { url, error, attempt });

                // Don't retry for client errors (4xx) or if it's the last attempt
                if (error.status >= 400 && error.status < 500 || attempt === this.retryAttempts - 1) {
                    break;
                }

                // Wait before retrying
                await Utils.wait(this.retryDelay * Math.pow(2, attempt));
            }
        }

        clearTimeout(timeoutId);
        throw lastError;
    }

    // GET request
    async get(endpoint, params = {}) {
        const urlParams = new URLSearchParams(params).toString();
        const fullEndpoint = urlParams ? `${endpoint}?${urlParams}` : endpoint;
        return this.request(fullEndpoint, { method: 'GET' });
    }

    // POST request
    async post(endpoint, data = {}) {
        return this.request(endpoint, {
            method: 'POST',
            body: JSON.stringify(data)
        });
    }

    // PUT request
    async put(endpoint, data = {}) {
        return this.request(endpoint, {
            method: 'PUT',
            body: JSON.stringify(data)
        });
    }

    // DELETE request
    async delete(endpoint) {
        return this.request(endpoint, { method: 'DELETE' });
    }

    // Upload file
    async uploadFile(endpoint, file, additionalData = {}) {
        const formData = new FormData();
        formData.append('file', file);
        
        for (const [key, value] of Object.entries(additionalData)) {
            formData.append(key, value);
        }

        return this.request(endpoint, {
            method: 'POST',
            body: formData,
            headers: {} // Let browser set content-type for FormData
        });
    }

    // Board API methods
    async getBoards() {
        return this.get('boards');
    }

    async getBoard(boardId) {
        return this.get(`boards/${boardId}`);
    }

    async createBoard(boardData) {
        return this.post('boards', boardData);
    }

    async updateBoard(boardId, boardData) {
        return this.put(`boards/${boardId}`, boardData);
    }

    async deleteBoard(boardId) {
        return this.delete(`boards/${boardId}`);
    }

    // Card API methods
    async createCard(cardData) {
        return this.post('cards', cardData);
    }

    async updateCard(cardId, cardData) {
        return this.put(`cards/${cardId}`, cardData);
    }

    async deleteCard(cardId) {
        return this.delete(`cards/${cardId}`);
    }

    // Attachment API methods
    async uploadAttachment(cardId, file) {
        return this.uploadFile(`cards/${cardId}/attachments`, file);
    }

    async deleteAttachment(attachmentId) {
        return this.delete(`attachments/${attachmentId}`);
    }

    // Sharing API methods
    async getSharedBoard(token) {
        return this.get(`shared/${token}`);
    }

    async generateShareToken(boardId) {
        return this.post(`boards/${boardId}/share`);
    }

    async revokeShareToken(boardId) {
        return this.delete(`boards/${boardId}/share`);
    }

    // Search API methods
    async search(query, filters = {}) {
        return this.get('search', { q: query, ...filters });
    }

    // Export API methods
    async exportBoard(boardId, format = 'json') {
        const data = await this.get(`boards/${boardId}/export`, { format });
        return data;
    }

    // Import API methods
    async importBoard(boardData) {
        return this.post('boards/import', boardData);
    }

    // Statistics API methods
    async getStats() {
        return this.get('stats');
    }

    async getBoardStats(boardId) {
        return this.get(`boards/${boardId}/stats`);
    }
}

// Custom API Error class
class APIError extends Error {
    constructor(message, status = 0, data = {}) {
        super(message);
        this.name = 'APIError';
        this.status = status;
        this.data = data;
    }

    get isNetworkError() {
        return this.status === 0;
    }

    get isClientError() {
        return this.status >= 400 && this.status < 500;
    }

    get isServerError() {
        return this.status >= 500;
    }

    get isRetryable() {
        return this.isNetworkError || this.isServerError;
    }
}

// Board Manager - High-level board operations
class BoardManager extends EventEmitter {
    constructor(apiClient) {
        super();
        this.api = apiClient;
        this.boards = new Map();
        this.activeBoard = null;
        this.cache = new Map();
        this.cacheTimeout = 5 * 60 * 1000; // 5 minutes
    }

    // Load all boards
    async loadBoards() {
        try {
            this.emit('boards-loading');
            const boards = await this.api.getBoards();
            
            this.boards.clear();
            boards.forEach(board => {
                this.boards.set(board.id, board);
                this.setCacheItem(`board_${board.id}`, board);
            });

            this.emit('boards-loaded', Array.from(this.boards.values()));
            return Array.from(this.boards.values());
        } catch (error) {
            this.emit('boards-load-error', error);
            
            // Try to load from cache if available
            const cachedBoards = this.getCachedBoards();
            if (cachedBoards.length > 0) {
                cachedBoards.forEach(board => {
                    this.boards.set(board.id, board);
                });
                this.emit('boards-loaded-from-cache', cachedBoards);
                return cachedBoards;
            }
            
            throw error;
        }
    }

    // Load specific board with cards
    async loadBoard(boardId) {
        try {
            this.emit('board-loading', boardId);
            
            // Check cache first
            const cached = this.getCacheItem(`board_full_${boardId}`);
            if (cached) {
                this.activeBoard = cached;
                this.emit('board-loaded-from-cache', cached);
                
                // Load fresh data in background
                this.loadBoard(boardId).catch(() => {
                    // Ignore errors for background refresh
                });
                
                return cached;
            }

            const board = await this.api.getBoard(boardId);
            
            this.boards.set(board.id, board);
            this.activeBoard = board;
            this.setCacheItem(`board_full_${boardId}`, board);

            this.emit('board-loaded', board);
            return board;
        } catch (error) {
            this.emit('board-load-error', { boardId, error });
            throw error;
        }
    }

    // Create new board
    async createBoard(boardData) {
        try {
            this.emit('board-creating', boardData);
            const board = await this.api.createBoard(boardData);
            
            this.boards.set(board.id, board);
            this.setCacheItem(`board_${board.id}`, board);

            this.emit('board-created', board);
            return board;
        } catch (error) {
            this.emit('board-create-error', { boardData, error });
            throw error;
        }
    }

    // Update board
    async updateBoard(boardId, updates) {
        try {
            this.emit('board-updating', { boardId, updates });
            await this.api.updateBoard(boardId, updates);
            
            const board = this.boards.get(boardId);
            if (board) {
                Object.assign(board, updates);
                this.setCacheItem(`board_${boardId}`, board);
            }

            this.emit('board-updated', { boardId, updates });
            return board;
        } catch (error) {
            this.emit('board-update-error', { boardId, updates, error });
            throw error;
        }
    }

    // Delete board
    async deleteBoard(boardId) {
        try {
            this.emit('board-deleting', boardId);
            await this.api.deleteBoard(boardId);
            
            this.boards.delete(boardId);
            this.clearCacheItem(`board_${boardId}`);
            this.clearCacheItem(`board_full_${boardId}`);

            if (this.activeBoard && this.activeBoard.id === boardId) {
                this.activeBoard = null;
            }

            this.emit('board-deleted', boardId);
            return true;
        } catch (error) {
            this.emit('board-delete-error', { boardId, error });
            throw error;
        }
    }

    // Card operations
    async createCard(cardData) {
        try {
            this.emit('card-creating', cardData);
            const card = await this.api.createCard(cardData);
            
            // Add card to active board if it matches
            if (this.activeBoard && this.activeBoard.id === cardData.board_id) {
                this.activeBoard.cards.push(card);
                this.setCacheItem(`board_full_${cardData.board_id}`, this.activeBoard);
            }

            this.emit('card-created', card);
            return card;
        } catch (error) {
            this.emit('card-create-error', { cardData, error });
            throw error;
        }
    }

    async updateCard(cardId, updates) {
        try {
            this.emit('card-updating', { cardId, updates });
            await this.api.updateCard(cardId, updates);
            
            // Update card in active board if present
            if (this.activeBoard) {
                const card = this.activeBoard.cards.find(c => c.id === cardId);
                if (card) {
                    Object.assign(card, updates);
                    this.setCacheItem(`board_full_${this.activeBoard.id}`, this.activeBoard);
                }
            }

            this.emit('card-updated', { cardId, updates });
            return true;
        } catch (error) {
            this.emit('card-update-error', { cardId, updates, error });
            throw error;
        }
    }

    async deleteCard(cardId) {
        try {
            this.emit('card-deleting', cardId);
            await this.api.deleteCard(cardId);
            
            // Remove card from active board if present
            if (this.activeBoard) {
                this.activeBoard.cards = this.activeBoard.cards.filter(c => c.id !== cardId);
                this.setCacheItem(`board_full_${this.activeBoard.id}`, this.activeBoard);
            }

            this.emit('card-deleted', cardId);
            return true;
        } catch (error) {
            this.emit('card-delete-error', { cardId, error });
            throw error;
        }
    }

    // Cache management
    setCacheItem(key, data) {
        this.cache.set(key, {
            data,
            timestamp: Date.now()
        });
    }

    getCacheItem(key) {
        const cached = this.cache.get(key);
        if (!cached) return null;
        
        const age = Date.now() - cached.timestamp;
        if (age > this.cacheTimeout) {
            this.cache.delete(key);
            return null;
        }
        
        return cached.data;
    }

    clearCacheItem(key) {
        this.cache.delete(key);
    }

    clearCache() {
        this.cache.clear();
    }

    getCachedBoards() {
        const boards = [];
        for (const [key, cached] of this.cache.entries()) {
            if (key.startsWith('board_') && !key.includes('_full_')) {
                const age = Date.now() - cached.timestamp;
                if (age <= this.cacheTimeout) {
                    boards.push(cached.data);
                }
            }
        }
        return boards;
    }

    // Utility methods
    getBoardById(boardId) {
        return this.boards.get(boardId);
    }

    getAllBoards() {
        return Array.from(this.boards.values());
    }

    getActiveBoard() {
        return this.activeBoard;
    }

    setActiveBoard(boardId) {
        const board = this.boards.get(boardId);
        if (board) {
            this.activeBoard = board;
            this.emit('active-board-changed', board);
            return board;
        }
        return null;
    }

    // Search functionality
    searchCards(query, boardId = null) {
        const boards = boardId ? [this.getBoardById(boardId)] : this.getAllBoards();
        const results = [];

        const queryLower = query.toLowerCase();

        boards.forEach(board => {
            if (!board || !board.cards) return;
            
            board.cards.forEach(card => {
                const matchesTitle = card.title && card.title.toLowerCase().includes(queryLower);
                const matchesBody = card.body && card.body.toLowerCase().includes(queryLower);
                const matchesDetails = card.details && card.details.toLowerCase().includes(queryLower);
                const matchesTags = card.tags && card.tags.some(tag => 
                    tag.toLowerCase().includes(queryLower)
                );

                if (matchesTitle || matchesBody || matchesDetails || matchesTags) {
                    results.push({
                        card,
                        board,
                        matches: {
                            title: matchesTitle,
                            body: matchesBody,
                            details: matchesDetails,
                            tags: matchesTags
                        }
                    });
                }
            });
        });

        return results;
    }

    // Statistics
    getStats() {
        const boards = this.getAllBoards();
        const stats = {
            totalBoards: boards.length,
            totalCards: 0,
            cardsByBoard: {},
            tagUsage: {},
            overdueTasks: 0,
            upcomingTasks: 0
        };

        boards.forEach(board => {
            const cardCount = board.cards ? board.cards.length : 0;
            stats.totalCards += cardCount;
            stats.cardsByBoard[board.name] = cardCount;

            if (board.cards) {
                board.cards.forEach(card => {
                    // Count tags
                    if (card.tags) {
                        card.tags.forEach(tag => {
                            stats.tagUsage[tag] = (stats.tagUsage[tag] || 0) + 1;
                        });
                    }

                    // Count due dates
                    if (card.due_date) {
                        if (Utils.isOverdue(card.due_date)) {
                            stats.overdueTasks++;
                        } else if (Utils.isUpcoming(card.due_date)) {
                            stats.upcomingTasks++;
                        }
                    }
                });
            }
        });

        return stats;
    }
}

// Initialize global API client and board manager
window.api = new APIClient();
window.boardManager = new BoardManager(window.api);
window.APIError = APIError;