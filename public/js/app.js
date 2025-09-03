// Corkboard Pro - Main Application
console.log('🚀 Corkboard Pro app.js loaded successfully');

class CorkboardApp extends EventEmitter {
    constructor() {
        super();
        
        // App state
        this.initialized = false;
        this.activeBoard = null;
        this.selectedCards = new Set();
        this.searchQuery = '';
        this.activeFilters = new Set();
        this.gridMode = true;
        this.gridSize = 280;
        
        // Keyboard state
        this.keyboardShortcuts = new Map();
        this.commandPressed = false;
        
        // Drag state
        this.dragState = {
            isDragging: false,
            draggedCard: null,
            startPos: { x: 0, y: 0 },
            dragOffset: { x: 0, y: 0 }
        };
        
        // Undo/Redo system
        this.undoStack = [];
        this.redoStack = [];
        this.maxUndoSteps = 50;
        
        // Performance optimization
        this.renderQueue = [];
        this.animationFrame = null;
        
        // Initialize debounced update method
        this.debouncedUpdateCard = Utils.debounce((cardId, field, value) => {
            this.updateCard(cardId, field, value);
        }, 300);
        
        this.init();
    }

    async init() {
        try {
            ui.showStatus('Initializing Corkboard Pro...');
            
            // Setup keyboard shortcuts
            this.setupKeyboardShortcuts();
            
            // Setup event listeners
            this.setupEventListeners();
            
            // Load initial data
            await this.loadInitialData();
            
            // Setup collaboration
            this.setupCollaboration();
            
            // Initial render
            await this.render();
            
            // Snap all existing cards to grid
            this.snapAllCardsToGrid();
            
            // Mark as initialized
            this.initialized = true;
            
            // Hide loading screen
            this.hideLoadingScreen();
            
            ui.showStatus('Corkboard Pro ready!', 'success');
            this.emit('app-initialized');
            
        } catch (error) {
            console.error('Failed to initialize app:', error);
            ui.showStatus('Failed to initialize app', 'error');
            ui.showToast('Failed to initialize Corkboard Pro. Please refresh the page.', 'error');
        }
    }

    async loadInitialData() {
        try {
            // Try to load from server first
            const boards = await boardManager.loadBoards();
            
            if (boards.length > 0) {
                // Load the first board or the last active board
                const lastActiveId = storage.loadFromLocal('last_active_board');
                const boardToLoad = lastActiveId ? 
                    boards.find(b => b.id === lastActiveId) || boards[0] : 
                    boards[0];
                
                const board = await boardManager.loadBoard(boardToLoad.id);
                this.activeBoard = board;
            } else {
                // Create default board if none exist
                await this.createDefaultBoard();
            }
            
            // Load app settings
            this.loadSettings();
            
        } catch (error) {
            console.warn('Failed to load from server, trying local storage:', error);
            
            // Fallback to local storage
            const localBoards = storage.loadFromLocal('boards') || [];
            if (localBoards.length > 0) {
                // Set up board manager with local data
                localBoards.forEach(board => {
                    boardManager.boards.set(board.id, board);
                });
                
                const lastActiveId = storage.loadFromLocal('last_active_board');
                const boardToLoad = lastActiveId ? 
                    localBoards.find(b => b.id === lastActiveId) || localBoards[0] : 
                    localBoards[0];
                
                this.activeBoard = boardToLoad;
                boardManager.activeBoard = boardToLoad;
            } else {
                // Create default board
                await this.createDefaultBoard();
            }
        }
    }

    async createDefaultBoard() {
        const defaultBoard = {
            id: Utils.generateId(),
            name: 'Welcome Board',
            color: '#B8860B',
            cards: [
                {
                    id: Utils.generateId(),
                    title: 'Welcome to Corkboard Pro!',
                    body: 'This is your first note card. You can:\n• Drag cards around\n• Flip cards to see details\n• Add tags and due dates\n• Change colors\n• And much more!',
                    details: 'Use the back of cards for detailed notes, research, or additional information.',
                    color: '#fef3c7',
                    x: 50,
                    y: 50,
                    z_index: 1,
                    tags: ['welcome', 'tutorial'],
                    due_date: null,
                    is_flipped: false,
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                },
                {
                    id: Utils.generateId(),
                    title: 'Keyboard Shortcuts',
                    body: 'Press "?" to see all keyboard shortcuts.\n\nQuick ones:\n• N - New card\n• G - Toggle grid\n• / - Search',
                    details: '',
                    color: '#dbeafe',
                    x: 320,
                    y: 80,
                    z_index: 2,
                    tags: ['shortcuts', 'help'],
                    due_date: null,
                    is_flipped: false,
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                }
            ],
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        };

        this.activeBoard = defaultBoard;
        boardManager.boards.set(defaultBoard.id, defaultBoard);
        boardManager.activeBoard = defaultBoard;
        
        // Save locally
        storage.saveToLocal('boards', [defaultBoard]);
        storage.saveToLocal('last_active_board', defaultBoard.id);
    }

    loadSettings() {
        const settings = storage.loadFromLocal('app_settings') || {};
        this.gridSize = settings.gridSize || 240;
        
        // Grid is always enabled
        document.querySelector('.cork-board')?.classList.add('grid-mode');
    }

    saveSettings() {
        const settings = {
            gridSize: this.gridSize
        };
        storage.saveToLocal('app_settings', settings);
    }

    setupKeyboardShortcuts() {
        // Define shortcuts
        this.keyboardShortcuts.set('n', () => this.createCard());
        this.keyboardShortcuts.set('b', () => this.createBoard());
        this.keyboardShortcuts.set('f', () => this.toggleSearch());
        this.keyboardShortcuts.set('/', () => this.focusSearch());
        this.keyboardShortcuts.set('?', () => ui.showKeyboardShortcuts());
        this.keyboardShortcuts.set('e', () => this.exportBoard());
        this.keyboardShortcuts.set('i', () => this.showImportModal());
        this.keyboardShortcuts.set('Escape', () => this.handleEscape());
        this.keyboardShortcuts.set('Delete', () => this.deleteSelectedCards());
        this.keyboardShortcuts.set('Backspace', () => this.deleteSelectedCards());
        
        // Ctrl/Cmd shortcuts
        this.keyboardShortcuts.set('ctrl+z', () => this.undo());
        this.keyboardShortcuts.set('cmd+z', () => this.undo());
        this.keyboardShortcuts.set('ctrl+y', () => this.redo());
        this.keyboardShortcuts.set('cmd+y', () => this.redo());
        this.keyboardShortcuts.set('ctrl+s', () => this.saveAll());
        this.keyboardShortcuts.set('cmd+s', () => this.saveAll());
        this.keyboardShortcuts.set('ctrl+a', () => this.selectAllCards());
        this.keyboardShortcuts.set('cmd+a', () => this.selectAllCards());

        // Arrow keys for card navigation
        this.keyboardShortcuts.set('ArrowUp', () => this.navigateCards('up'));
        this.keyboardShortcuts.set('ArrowDown', () => this.navigateCards('down'));
        this.keyboardShortcuts.set('ArrowLeft', () => this.navigateCards('left'));
        this.keyboardShortcuts.set('ArrowRight', () => this.navigateCards('right'));

        // Global keyboard event listener
        document.addEventListener('keydown', (e) => {
            // Don't trigger shortcuts when typing in inputs
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
                return;
            }

            const key = e.key.toLowerCase();
            const shortcut = this.buildShortcutKey(e);
            
            if (this.keyboardShortcuts.has(shortcut)) {
                e.preventDefault();
                this.keyboardShortcuts.get(shortcut)();
            } else if (this.keyboardShortcuts.has(key)) {
                e.preventDefault();
                this.keyboardShortcuts.get(key)();
            }
        });
    }

    buildShortcutKey(event) {
        const parts = [];
        if (event.ctrlKey) parts.push('ctrl');
        if (event.metaKey) parts.push('cmd');
        if (event.altKey) parts.push('alt');
        if (event.shiftKey) parts.push('shift');
        parts.push(event.key.toLowerCase());
        return parts.join('+');
    }

    setupEventListeners() {
        // Storage events
        storage.on('offline', () => {
            ui.showOfflineIndicator();
            ui.showStatus('You are offline. Changes will sync when reconnected.', 'warning');
        });

        storage.on('online', () => {
            ui.hideOfflineIndicator();
            ui.showStatus('You are back online. Syncing changes...', 'info');
        });

        // Board manager events
        boardManager.on('board-loaded', (board) => {
            this.activeBoard = board;
            this.queueRender();
        });

        boardManager.on('card-created', () => {
            this.queueRender();
        });

        boardManager.on('card-updated', () => {
            this.queueRender();
        });

        boardManager.on('card-deleted', () => {
            this.queueRender();
        });

        // Collaboration events - temporarily disabled for debugging
        /*
        collaboration.on('remote-card-created', (cardData) => {
            this.handleRemoteCardCreated(cardData);
        });

        collaboration.on('remote-card-updated', (updateData) => {
            this.handleRemoteCardUpdated(updateData);
        });

        collaboration.on('remote-card-deleted', (cardId) => {
            this.handleRemoteCardDeleted(cardId);
        });
        */

        // Window events
        window.addEventListener('resize', Utils.debounce(() => {
            this.queueRender();
        }, 200));

        window.addEventListener('beforeunload', () => {
            this.saveAll();
            if (this.activeBoard) {
                storage.saveToLocal('last_active_board', this.activeBoard.id);
            }
        });

        // Hash change for sharing
        window.addEventListener('hashchange', () => {
            this.handleHashChange();
        });

        // Initial hash check
        if (window.location.hash) {
            this.handleHashChange();
        }
    }

    setupCollaboration() {
        if (this.activeBoard) {
            collaboration.joinBoard(this.activeBoard.id);
        }

        // Handle connection status
        collaboration.on('connected', () => {
            ui.showStatus('Connected to collaboration server', 'success');
        });

        collaboration.on('disconnected', () => {
            ui.showStatus('Disconnected from collaboration server', 'warning');
        });
    }

    // Rendering
    queueRender() {
        if (this.animationFrame) return;
        
        this.animationFrame = requestAnimationFrame(() => {
            this.render();
            this.animationFrame = null;
        });
    }

    async render() {
        if (!this.activeBoard) return;

        try {
            // Render toolbar
            this.renderToolbar();
            
            // Render cork board
            this.renderCorkBoard();
            
            // Render FAB
            this.renderFAB();
            
            // Update document title
            document.title = `${this.activeBoard.name} - Corkboard Pro`;
            
            this.emit('render-complete');
            
        } catch (error) {
            console.error('Render error:', error);
            ui.showToast('Rendering error occurred', 'error');
        }
    }

    renderToolbar() {
        const toolbar = document.querySelector('.toolbar');
        if (!toolbar) return;

        const boards = Array.from(boardManager.boards.values());
        
        toolbar.innerHTML = `
            <div class="toolbar-left">
                <div class="board-tabs">
                    ${boards.map(board => this.renderBoardTab(board)).join('')}
                    <div class="new-board-btn" onclick="app.createBoard()"
                         ondrop="app.handleNewBoardDrop(event)"
                         ondragover="app.handleDragOver(event)"
                         ondragleave="app.handleDragLeave(event)">
                        + New Board
                    </div>
                </div>
            </div>
            <div class="toolbar-center">
                <div class="search-container">
                    <span class="search-icon">🔍</span>
                    <input type="text" class="search-input" 
                           placeholder="Search cards..."
                           value="${this.searchQuery}"
                           oninput="app.handleSearch(this.value)">
                    ${this.searchQuery ? '<button class="search-clear" onclick="app.clearSearch()">×</button>' : ''}
                </div>
            </div>
            <div class="toolbar-right">
                <button class="control-btn ${this.activeFilters.size > 0 ? 'active' : ''}" 
                        onclick="app.toggleFilterBar()"
                        title="Show filters">
                    <span class="control-btn-icon">⊙</span>
                    Filter
                </button>
                <button class="control-btn" 
                        onclick="app.showBoardMenu(event)"
                        title="Board options">
                    <span class="control-btn-icon">⋯</span>
                </button>
                <button class="control-btn" 
                        onclick="ui.showKeyboardShortcuts()"
                        title="Keyboard shortcuts">
                    <span class="control-btn-icon">⌨</span>
                </button>
            </div>
        `;

        // Render filter bar if needed
        this.renderFilterBar();
    }

    renderBoardTab(board) {
        const isActive = this.activeBoard && this.activeBoard.id === board.id;
        return `
            <div class="board-tab ${isActive ? 'active' : ''}"
                 data-board-id="${board.id}"
                 onclick="app.switchBoard('${board.id}')"
                 ondrop="app.handleBoardDrop(event, '${board.id}')"
                 ondragover="app.handleDragOver(event)"
                 ondragleave="app.handleDragLeave(event)">
                <div class="board-tab-color" style="background-color: ${board.color}"></div>
                <input class="board-tab-name" 
                       value="${board.name}"
                       onblur="app.renameBoard('${board.id}', this.value)"
                       onclick="event.stopPropagation()"
                       onkeypress="if(event.key==='Enter') this.blur()">
                <button class="board-tab-delete" 
                        onclick="app.deleteBoard('${board.id}', event)"
                        title="Delete board">×</button>
            </div>
        `;
    }

    renderFilterBar() {
        const existingFilterBar = document.querySelector('.filter-bar');
        if (existingFilterBar) {
            existingFilterBar.remove();
        }

        if (this.activeFilters.size === 0) return;

        const filterBar = document.createElement('div');
        filterBar.className = 'filter-bar active';
        filterBar.innerHTML = `
            <div class="filter-label">Filtered by:</div>
            ${Array.from(this.activeFilters).map(filter => `
                <div class="filter-chip">
                    ${filter}
                    <span class="filter-chip-remove" onclick="app.removeFilter('${filter}')">×</span>
                </div>
            `).join('')}
            <button class="btn btn-sm" onclick="app.clearAllFilters()">Clear All</button>
        `;

        document.querySelector('.toolbar').after(filterBar);
    }

    renderCorkBoard() {
        const corkBoard = document.querySelector('.cork-board');
        if (!corkBoard || !this.activeBoard?.cards) return;

        // Update board classes - always use grid mode
        corkBoard.className = 'cork-board grid-mode';

        // Filter cards based on search and filters
        const filteredCards = this.getFilteredCards();

        // Clear existing cards
        corkBoard.innerHTML = '';

        // Render cards
        filteredCards.forEach(card => {
            const cardElement = this.createCardElement(card);
            corkBoard.appendChild(cardElement);
        });

        // Setup card event listeners
        this.setupCardEventListeners();
        
        // Setup simple auto-save for cards
        this.setupAutoSave();
    }

    getFilteredCards() {
        if (!this.activeBoard?.cards) return [];

        let cards = [...this.activeBoard.cards];

        // Search filter
        if (this.searchQuery) {
            const query = this.searchQuery.toLowerCase();
            cards = cards.filter(card => 
                (card.title && card.title.toLowerCase().includes(query)) ||
                (card.body && card.body.toLowerCase().includes(query)) ||
                (card.details && card.details.toLowerCase().includes(query)) ||
                (card.tags && card.tags.some(tag => tag.toLowerCase().includes(query)))
            );
        }

        // Tag filters
        if (this.activeFilters.size > 0) {
            cards = cards.filter(card => 
                card.tags && Array.from(this.activeFilters).some(filter => 
                    card.tags.includes(filter)
                )
            );
        }

        return cards;
    }

    createCardElement(card) {
        const cardDiv = document.createElement('div');
        cardDiv.className = `note-card ${card.is_flipped ? 'flipped' : ''}`;
        cardDiv.id = `card-${card.id}`;
        cardDiv.style.left = card.x + 'px';
        cardDiv.style.top = card.y + 'px';
        cardDiv.style.zIndex = card.z_index || 1;
        cardDiv.draggable = true;
        cardDiv.setAttribute('data-card-id', card.id);
        cardDiv.setAttribute('data-color', card.color);

        const textColor = Utils.getContrastColor(card.color);
        const isOverdue = card.due_date && Utils.isOverdue(card.due_date);
        const isUpcoming = card.due_date && Utils.isUpcoming(card.due_date);

        cardDiv.innerHTML = `
            <div class="note-card-inner">
                <div class="note-card-front" style="background-color: ${card.color}; color: ${textColor};">
                    <button class="card-flip-btn" onclick="app.flipCard('${card.id}', event)" title="Flip card">↻</button>
                    <div class="card-content">
                        <textarea class="card-topic" 
                                  placeholder=""
                                  readonly
                                  ondblclick="app.makeCardEditable(this, event)"
                                  onblur="app.makeCardReadonly(this)"
                                  onmousedown="event.stopPropagation()">${card.title || ''}</textarea>
                        <div class="card-meta">
                            <div class="card-tags">
                                ${this.renderCardTags(card)}
                                <button class="add-tag-btn" onclick="app.addTag('${card.id}', event)">+ Tag</button>
                            </div>
                            ${card.due_date ? `
                                <div class="card-due-date ${isOverdue ? 'overdue' : isUpcoming ? 'upcoming' : ''}"
                                     onclick="app.editDueDate('${card.id}', event)">
                                    📅 ${Utils.formatDate(card.due_date)}
                                </div>
                            ` : ''}
                        </div>
                        <div class="card-attachments">
                            ${this.renderCardAttachments(card)}
                        </div>
                    </div>
                </div>
                <div class="note-card-back" style="background-color: ${card.color}; color: ${textColor};">
                    <button class="card-flip-btn" onclick="app.flipCard('${card.id}', event)" title="Flip card">↻</button>
                    <div class="card-content">
                        <textarea class="card-details" 
                                  placeholder=""
                                  readonly
                                  ondblclick="app.makeCardEditable(this, event)"
                                  onblur="app.makeCardReadonly(this)"
                                  onmousedown="event.stopPropagation()">${card.body || ''}</textarea>
                    </div>
                </div>
            </div>
            <div class="card-controls-external">
                <button class="card-control color-picker-btn" title="Change color">
                    <div class="color-indicator" style="background-color: ${card.color}"></div>
                    <input type="color" class="color-input" value="${card.color}" 
                           onchange="app.changeCardColor('${card.id}', this.value)">
                </button>
                <button class="card-control attachment-btn" title="Add attachment"
                        onclick="app.showAttachmentUpload('${card.id}', event)">📎</button>
                <button class="card-control duplicate-btn" title="Duplicate card"
                        onclick="app.duplicateCard('${card.id}', event)">📋</button>
                <button class="card-control delete-btn" title="Delete card"
                        onclick="app.deleteCard('${card.id}', event)">×</button>
            </div>
        `;

        return cardDiv;
    }

    renderCardTags(card) {
        if (!card.tags || card.tags.length === 0) return '';
        
        return card.tags.map(tag => `
            <span class="card-tag" onclick="app.filterByTag('${tag}')">
                ${Utils.sanitizeHTML(tag)}
                <span class="card-tag-remove" onclick="app.removeTag('${card.id}', '${tag}', event)">×</span>
            </span>
        `).join('');
    }

    renderCardAttachments(card) {
        if (!card.attachments || card.attachments.length === 0) return '';
        
        return card.attachments.map(attachment => `
            <a class="card-attachment" href="${attachment.url}" target="_blank">
                <span class="attachment-icon">${this.getAttachmentIcon(attachment.mimeType)}</span>
                <span class="card-attachment-name">${Utils.sanitizeHTML(attachment.originalName)}</span>
                <span class="card-attachment-remove" onclick="app.removeAttachment('${card.id}', '${attachment.id}', event)">×</span>
            </a>
        `).join('');
    }

    getAttachmentIcon(mimeType) {
        if (mimeType.startsWith('image/')) return '🖼️';
        if (mimeType.startsWith('video/')) return '🎥';
        if (mimeType.startsWith('audio/')) return '🎵';
        if (mimeType.includes('pdf')) return '📄';
        if (mimeType.includes('text')) return '📝';
        return '📎';
    }

    renderFAB() {
        const existingFAB = document.querySelector('.fab-container');
        if (!existingFAB) {
            const fabContainer = document.createElement('div');
            fabContainer.className = 'fab-container';
            fabContainer.innerHTML = `
                <div class="fab-menu" id="fab-menu">
                    <button class="fab" onclick="app.createCard()" title="New Card">
                        📝
                        <div class="fab-tooltip">New Card</div>
                    </button>
                    <button class="fab" onclick="app.showImportModal()" title="Import">
                        📥
                        <div class="fab-tooltip">Import</div>
                    </button>
                    <button class="fab" onclick="app.exportBoard()" title="Export">
                        📤
                        <div class="fab-tooltip">Export</div>
                    </button>
                    <button class="fab" onclick="app.shareBoard()" title="Share">
                        🔗
                        <div class="fab-tooltip">Share</div>
                    </button>
                    <button class="fab" onclick="app.printBoard()" title="Print">
                        🖨️
                        <div class="fab-tooltip">Print</div>
                    </button>
                </div>
                <button class="fab fab-main" onclick="app.toggleFABMenu()" id="fab-main">+</button>
            `;
            document.body.appendChild(fabContainer);
        }
    }

    setupAutoSave() {
        // Clear any existing auto-save interval
        if (this.autoSaveInterval) {
            clearInterval(this.autoSaveInterval);
        }
        
        // Auto-save every 2 seconds by reading DOM values
        this.autoSaveInterval = setInterval(() => {
            this.saveCardsFromDOM();
        }, 2000);
    }
    
    saveCardsFromDOM() {
        const corkBoard = document.querySelector('.cork-board');
        if (!corkBoard || !this.activeBoard?.cards) return;
        
        // Don't auto-save if user is currently editing (has focus on a non-readonly textarea)
        const activeElement = document.activeElement;
        if (activeElement && 
            (activeElement.classList.contains('card-topic') || activeElement.classList.contains('card-details')) &&
            !activeElement.readOnly) {
            return; // Skip this auto-save cycle
        }
        
        // Find all card textareas and save their values
        corkBoard.querySelectorAll('.note-card').forEach(cardElement => {
            const cardId = this.getCardIdFromElement(cardElement);
            if (!cardId) return;
            
            const card = this.getCardById(cardId);
            if (!card) return;
            
            const topicTextarea = cardElement.querySelector('.card-topic');
            const detailsTextarea = cardElement.querySelector('.card-details');
            
            let hasChanges = false;
            
            if (topicTextarea && topicTextarea.value !== (card.title || '')) {
                card.title = topicTextarea.value;
                hasChanges = true;
            }
            
            if (detailsTextarea && detailsTextarea.value !== (card.body || '')) {
                card.body = detailsTextarea.value;
                hasChanges = true;
            }
            
            // Only update if there were actual changes and user isn't typing
            if (hasChanges) {
                // Just update the local storage, don't call updateCard which might cause issues
                this.saveToLocalStorage();
            }
        });
    }

    getCardIdFromElement(element) {
        const cardElement = element.closest('.note-card');
        if (cardElement) {
            const match = cardElement.id.match(/card-(.+)/);
            return match ? match[1] : null;
        }
        return null;
    }

    setupCardEventListeners() {
        // Card drag and drop
        document.querySelectorAll('.note-card').forEach(card => {
            card.addEventListener('dragstart', (e) => this.handleCardDragStart(e));
            card.addEventListener('dragend', (e) => this.handleCardDragEnd(e));
            card.addEventListener('click', (e) => this.handleCardClick(e));
            card.addEventListener('contextmenu', (e) => this.handleCardContextMenu(e));
        });

        // Board drop zone
        const corkBoard = document.querySelector('.cork-board');
        if (corkBoard) {
            corkBoard.addEventListener('drop', (e) => this.handleBoardDrop(e));
            corkBoard.addEventListener('dragover', (e) => this.handleDragOver(e));
            corkBoard.addEventListener('click', (e) => this.handleBoardClick(e));
        }
    }

    // Event Handlers
    handleCardDragStart(event) {
        const cardId = event.target.getAttribute('data-card-id');
        const card = this.getCardById(cardId);
        
        if (!card) return;

        this.dragState.isDragging = true;
        this.dragState.draggedCard = card;
        
        const rect = event.target.getBoundingClientRect();
        this.dragState.dragOffset = {
            x: event.clientX - rect.left,
            y: event.clientY - rect.top
        };

        event.target.classList.add('dragging');
        event.dataTransfer.effectAllowed = 'move';
        
        // For collaboration
        if (collaboration.connected) {
            collaboration.broadcastCardPosition(cardId, card.x, card.y);
        }
    }

    handleCardDragEnd(event) {
        event.target.classList.remove('dragging');
        this.dragState.isDragging = false;
        this.dragState.draggedCard = null;
    }

    handleBoardDrop(event) {
        event.preventDefault();
        
        if (!this.dragState.draggedCard) return;

        const boardRect = event.currentTarget.getBoundingClientRect();
        let x = event.clientX - boardRect.left - this.dragState.dragOffset.x;
        let y = event.clientY - boardRect.top - this.dragState.dragOffset.y;

        // Snap to grid if enabled
        if (this.gridMode) {
            x = Math.round(x / this.gridSize) * this.gridSize;
            y = Math.round(y / this.gridSize) * this.gridSize;
        }

        // Ensure card stays within bounds
        x = Math.max(0, Math.min(x, boardRect.width - 240));
        y = Math.max(0, Math.min(y, boardRect.height - 200));

        // Always snap to grid
        x = this.snapToGrid(x);
        y = this.snapToGrid(y);
        
        // Check if position is occupied by another card
        const isOccupied = this.activeBoard?.cards?.some(card => 
            card.id !== this.dragState.draggedCard.id && 
            Math.abs(card.x - x) < 50 && 
            Math.abs(card.y - y) < 50
        );
        
        if (isOccupied) {
            // Find nearest empty position
            const emptyPos = this.findNearestEmptyPosition(x, y, this.dragState.draggedCard.id);
            x = emptyPos.x;
            y = emptyPos.y;
        }
        
        // Update card position
        this.updateCardPosition(this.dragState.draggedCard.id, x, y);
    }

    handleDragOver(event) {
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
    }

    handleDragLeave(event) {
        event.currentTarget.classList.remove('drag-over');
    }

    handleCardClick(event) {
        if (event.target.closest('.card-controls') || 
            event.target.tagName === 'TEXTAREA' || 
            event.target.tagName === 'INPUT') {
            return;
        }

        const cardId = event.currentTarget.getAttribute('data-card-id');
        
        if (event.ctrlKey || event.metaKey) {
            this.toggleCardSelection(cardId);
        } else {
            this.selectCard(cardId, !event.shiftKey);
        }
    }

    handleCardContextMenu(event) {
        event.preventDefault();
        
        const cardId = event.currentTarget.getAttribute('data-card-id');
        const card = this.getCardById(cardId);
        
        if (!card) return;

        const menuItems = [
            { text: 'Duplicate', icon: '📋', onclick: `app.duplicateCard('${cardId}')` },
            { text: 'Change Color', icon: '🎨', onclick: `app.showColorPicker('${cardId}', event)` },
            { text: 'Add Tag', icon: '🏷️', onclick: `app.addTag('${cardId}')` },
            { text: 'Set Due Date', icon: '📅', onclick: `app.editDueDate('${cardId}')` },
            { separator: true },
            { text: 'Flip Card', icon: '↻', onclick: `app.flipCard('${cardId}')` },
            { separator: true },
            { text: 'Delete', icon: '🗑️', onclick: `app.deleteCard('${cardId}')`, class: 'danger' }
        ];

        ui.showContextMenu(event.clientX, event.clientY, menuItems);
    }

    handleBoardClick(event) {
        if (event.target.classList.contains('cork-board')) {
            this.clearCardSelection();
        }
    }

    handleSearch(query) {
        this.searchQuery = query;
        this.queueRender();
    }

    handleEscape() {
        this.clearCardSelection();
        this.clearSearch();
        ui.closeTopModal();
    }

    // Card Management
    async createCard(position = null) {
        this.saveState();
        
        const boardRect = document.querySelector('.cork-board')?.getBoundingClientRect();
        
        // Find an empty grid position
        let x, y;
        if (position) {
            x = this.snapToGrid(position.x);
            y = this.snapToGrid(position.y);
        } else {
            const emptyPosition = this.findEmptyGridPosition();
            x = emptyPosition.x;
            y = emptyPosition.y;
        }

        const cardData = {
            board_id: this.activeBoard.id,
            title: '',
            body: '',
            details: '',
            color: Utils.getRandomCardColor(),
            x: x,
            y: y,
            z_index: (this.activeBoard.cards?.length || 0) + 1,
            tags: [],
            due_date: null,
            is_flipped: false
        };

        try {
            const card = await boardManager.createCard(cardData);
            ui.showStatus('Card created', 'success');
            this.queueRender();
            
            // Focus the new card's title
            setTimeout(() => {
                const cardElement = document.getElementById(`card-${card.id}`);
                const titleInput = cardElement?.querySelector('.card-title');
                if (titleInput) {
                    titleInput.focus();
                }
            }, 100);
            
            return card;
        } catch (error) {
            console.error('Failed to create card:', error);
            ui.showToast('Failed to create card', 'error');
        }
    }

    async updateCard(cardId, field, value) {
        const card = this.getCardById(cardId);
        if (!card) return;

        const updates = { [field]: value };
        
        try {
            await boardManager.updateCard(cardId, updates);
            
            // Update local state
            card[field] = value;
            card.updated_at = new Date().toISOString();
            
            // Save to local storage for offline support
            this.saveToLocalStorage();
            
        } catch (error) {
            console.error('Failed to update card:', error);
            // Don't show error toast for every keystroke
        }
    }

    async updateCardPosition(cardId, x, y) {
        const card = this.getCardById(cardId);
        if (!card) return;

        const updates = { x, y, updated_at: new Date().toISOString() };
        
        try {
            await boardManager.updateCard(cardId, updates);
            
            // Update local state
            Object.assign(card, updates);
            
            // Broadcast position update for collaboration
            if (collaboration.connected) {
                collaboration.broadcastCardPosition(cardId, x, y);
            }
            
            // Update DOM
            const cardElement = document.getElementById(`card-${cardId}`);
            if (cardElement) {
                cardElement.style.left = x + 'px';
                cardElement.style.top = y + 'px';
            }
            
            this.saveToLocalStorage();
            
        } catch (error) {
            console.error('Failed to update card position:', error);
        }
    }

    async duplicateCard(cardId, event = null) {
        if (event) event.stopPropagation();
        
        const card = this.getCardById(cardId);
        if (!card) return;

        this.saveState();

        const duplicateData = {
            ...card,
            id: undefined,
            title: card.title ? `${card.title} (Copy)` : '',
            x: card.x + 30,
            y: card.y + 30,
            z_index: (this.activeBoard.cards?.length || 0) + 1,
            created_at: undefined,
            updated_at: undefined
        };

        try {
            const newCard = await boardManager.createCard(duplicateData);
            ui.showStatus('Card duplicated', 'success');
            this.queueRender();
            return newCard;
        } catch (error) {
            console.error('Failed to duplicate card:', error);
            ui.showToast('Failed to duplicate card', 'error');
        }
    }

    async deleteCard(cardId, event = null) {
        if (event) event.stopPropagation();

        const card = this.getCardById(cardId);
        if (!card) return;

        const confirmed = await ui.confirm(
            `Delete "${card.title || 'Untitled card'}"?`,
            'Delete Card',
            { dangerous: true }
        );

        if (!confirmed) return;

        this.saveState();

        try {
            await boardManager.deleteCard(cardId);
            this.selectedCards.delete(cardId);
            ui.showStatus('Card deleted', 'success');
            this.queueRender();
        } catch (error) {
            console.error('Failed to delete card:', error);
            ui.showToast('Failed to delete card', 'error');
        }
    }

    async flipCard(cardId, event = null) {
        if (event) event.stopPropagation();

        const card = this.getCardById(cardId);
        if (!card) return;

        const isFlipped = !card.is_flipped;
        await this.updateCard(cardId, 'is_flipped', isFlipped);

        const cardElement = document.getElementById(`card-${cardId}`);
        if (cardElement) {
            if (isFlipped) {
                cardElement.classList.add('flipped');
            } else {
                cardElement.classList.remove('flipped');
            }
        }
    }

    makeCardEditable(textarea, event) {
        if (event) event.stopPropagation();
        textarea.readOnly = false;
        textarea.focus();
        // Select all text for easy editing
        textarea.select();
    }

    makeCardReadonly(textarea) {
        textarea.readOnly = true;
        // Save the changes when focus is lost
        this.saveCardsFromDOM();
    }

    async changeCardColor(cardId, color) {
        await this.updateCard(cardId, 'color', color);
        
        const cardElement = document.getElementById(`card-${cardId}`);
        if (cardElement) {
            const front = cardElement.querySelector('.note-card-front');
            const back = cardElement.querySelector('.note-card-back');
            const textColor = Utils.getContrastColor(color);
            
            if (front) {
                front.style.backgroundColor = color;
                front.style.color = textColor;
            }
            if (back) {
                back.style.backgroundColor = color;
                back.style.color = textColor;
            }
            
            // Update color indicator
            const indicator = cardElement.querySelector('.color-indicator');
            if (indicator) {
                indicator.style.backgroundColor = color;
            }
        }
    }

    // Tag Management
    async addTag(cardId, event = null) {
        if (event) event.stopPropagation();

        const tag = await ui.prompt('Enter tag name:', '', 'Add Tag');
        if (!tag || !tag.trim()) return;

        const card = this.getCardById(cardId);
        if (!card) return;

        const tags = card.tags || [];
        if (tags.includes(tag.trim())) {
            ui.showToast('Tag already exists', 'warning');
            return;
        }

        tags.push(tag.trim());
        await this.updateCard(cardId, 'tags', tags);
        this.queueRender();
    }

    async removeTag(cardId, tag, event = null) {
        if (event) event.stopPropagation();

        const card = this.getCardById(cardId);
        if (!card || !card.tags) return;

        const tags = card.tags.filter(t => t !== tag);
        await this.updateCard(cardId, 'tags', tags);
        this.queueRender();
    }

    filterByTag(tag) {
        this.activeFilters.add(tag);
        this.queueRender();
    }

    removeFilter(filter) {
        this.activeFilters.delete(filter);
        this.queueRender();
    }

    clearAllFilters() {
        this.activeFilters.clear();
        this.queueRender();
    }

    // Due Date Management
    async editDueDate(cardId, event = null) {
        if (event) event.stopPropagation();

        const card = this.getCardById(cardId);
        if (!card) return;

        const currentDate = card.due_date ? 
            new Date(card.due_date).toISOString().split('T')[0] : '';
        
        const date = await ui.prompt(
            'Enter due date (YYYY-MM-DD) or leave empty to remove:',
            currentDate,
            'Set Due Date'
        );

        if (date === null) return; // Cancelled

        const dueDate = date.trim() ? date.trim() : null;
        
        // Validate date format if provided
        if (dueDate && !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) {
            ui.showToast('Invalid date format. Use YYYY-MM-DD', 'error');
            return;
        }

        await this.updateCard(cardId, 'due_date', dueDate);
        this.queueRender();
    }

    // Board Management
    async createBoard() {
        const name = await ui.prompt('Enter board name:', `Board ${Date.now()}`, 'Create Board');
        if (!name || !name.trim()) return;

        try {
            const boardData = {
                name: name.trim(),
                color: '#B8860B'
            };

            const board = await boardManager.createBoard(boardData);
            await this.switchBoard(board.id);
            ui.showStatus('Board created', 'success');
        } catch (error) {
            console.error('Failed to create board:', error);
            ui.showToast('Failed to create board', 'error');
        }
    }

    async switchBoard(boardId) {
        if (this.activeBoard?.id === boardId) return;

        try {
            ui.showStatus('Loading board...');
            
            // Leave current collaboration room
            if (collaboration.connected && this.activeBoard) {
                collaboration.leaveBoard();
            }
            
            // Load new board
            const board = await boardManager.loadBoard(boardId);
            this.activeBoard = board;
            
            // Join new collaboration room
            if (collaboration.connected) {
                collaboration.joinBoard(boardId);
            }
            
            // Clear current state
            this.clearCardSelection();
            this.clearSearch();
            this.clearAllFilters();
            
            // Render
            await this.render();
            
            // Save as last active
            storage.saveToLocal('last_active_board', boardId);
            
            ui.showStatus('Board loaded', 'success');
            
        } catch (error) {
            console.error('Failed to switch board:', error);
            ui.showToast('Failed to load board', 'error');
        }
    }

    async renameBoard(boardId, newName) {
        if (!newName || !newName.trim()) return;

        try {
            await boardManager.updateBoard(boardId, { name: newName.trim() });
            this.queueRender();
        } catch (error) {
            console.error('Failed to rename board:', error);
            ui.showToast('Failed to rename board', 'error');
        }
    }

    async deleteBoard(boardId, event = null) {
        if (event) event.stopPropagation();

        const board = boardManager.getBoardById(boardId);
        if (!board) return;

        // Prevent deleting the last board
        if (boardManager.boards.size <= 1) {
            ui.showToast('Cannot delete the last board', 'warning');
            return;
        }

        const confirmed = await ui.confirm(
            `Delete board "${board.name}" and all its cards?`,
            'Delete Board',
            { dangerous: true }
        );

        if (!confirmed) return;

        try {
            await boardManager.deleteBoard(boardId);

            // Switch to another board if this was active
            if (this.activeBoard?.id === boardId) {
                const remainingBoards = Array.from(boardManager.boards.values());
                if (remainingBoards.length > 0) {
                    await this.switchBoard(remainingBoards[0].id);
                }
            }

            ui.showStatus('Board deleted', 'success');
        } catch (error) {
            console.error('Failed to delete board:', error);
            ui.showToast('Failed to delete board', 'error');
        }
    }

    // Utility Methods
    getCardById(cardId) {
        return this.activeBoard?.cards?.find(card => card.id === cardId);
    }

    saveToLocalStorage() {
        if (this.activeBoard) {
            const boards = Array.from(boardManager.boards.values());
            storage.saveToLocal('boards', boards);
            storage.saveToLocal('last_active_board', this.activeBoard.id);
        }
        this.saveSettings();
    }

    saveState() {
        if (this.undoStack.length >= this.maxUndoSteps) {
            this.undoStack.shift();
        }
        
        const state = {
            boards: Utils.deepClone(Array.from(boardManager.boards.values())),
            activeBoard: this.activeBoard?.id,
            timestamp: Date.now()
        };
        
        this.undoStack.push(state);
        this.redoStack = []; // Clear redo stack when new action is performed
    }

    async undo() {
        if (this.undoStack.length === 0) {
            ui.showToast('Nothing to undo', 'info');
            return;
        }

        // Save current state to redo stack
        const currentState = {
            boards: Utils.deepClone(Array.from(boardManager.boards.values())),
            activeBoard: this.activeBoard?.id,
            timestamp: Date.now()
        };
        this.redoStack.push(currentState);

        // Restore previous state
        const previousState = this.undoStack.pop();
        await this.restoreState(previousState);
        
        ui.showStatus('Undo complete', 'info');
    }

    async redo() {
        if (this.redoStack.length === 0) {
            ui.showToast('Nothing to redo', 'info');
            return;
        }

        // Save current state to undo stack
        const currentState = {
            boards: Utils.deepClone(Array.from(boardManager.boards.values())),
            activeBoard: this.activeBoard?.id,
            timestamp: Date.now()
        };
        this.undoStack.push(currentState);

        // Restore next state
        const nextState = this.redoStack.pop();
        await this.restoreState(nextState);
        
        ui.showStatus('Redo complete', 'info');
    }

    async restoreState(state) {
        // Restore boards
        boardManager.boards.clear();
        state.boards.forEach(board => {
            boardManager.boards.set(board.id, board);
        });

        // Restore active board
        if (state.activeBoard) {
            this.activeBoard = boardManager.getBoardById(state.activeBoard);
            boardManager.activeBoard = this.activeBoard;
        }

        // Re-render
        await this.render();
        
        // Save to local storage
        this.saveToLocalStorage();
    }

    // Grid Management - Always enabled
    snapToGrid(value) {
        return Math.round(value / this.gridSize) * this.gridSize;
    }
    
    findEmptyGridPosition() {
        const boardRect = document.querySelector('.cork-board')?.getBoundingClientRect();
        if (!boardRect) return { x: 20, y: 20 };
        
        const occupiedPositions = new Set();
        if (this.activeBoard?.cards) {
            this.activeBoard.cards.forEach(card => {
                occupiedPositions.add(`${card.x},${card.y}`);
            });
        }
        
        // Try to find an empty grid position
        const cols = Math.floor(boardRect.width / this.gridSize);
        const rows = Math.floor(boardRect.height / this.gridSize);
        
        for (let row = 0; row < rows; row++) {
            for (let col = 0; col < cols; col++) {
                const x = col * this.gridSize + 20; // Add margin
                const y = row * this.gridSize + 20; // Add margin
                
                if (!occupiedPositions.has(`${x},${y}`)) {
                    return { x, y };
                }
            }
        }
        
        // If no empty position found, place it at a default position
        return { x: 20, y: 20 };
    }

    findNearestEmptyPosition(targetX, targetY, excludeCardId) {
        const boardRect = document.querySelector('.cork-board')?.getBoundingClientRect();
        if (!boardRect) return { x: 20, y: 20 };
        
        // Get occupied positions (excluding the card being moved)
        const occupiedPositions = new Set();
        if (this.activeBoard?.cards) {
            this.activeBoard.cards.forEach(card => {
                if (card.id !== excludeCardId) {
                    occupiedPositions.add(`${card.x},${card.y}`);
                }
            });
        }
        
        const cols = Math.floor(boardRect.width / this.gridSize);
        const rows = Math.floor(boardRect.height / this.gridSize);
        
        // Convert target position to grid coordinates
        const targetCol = Math.floor(targetX / this.gridSize);
        const targetRow = Math.floor(targetY / this.gridSize);
        
        // Search in expanding squares around the target position
        for (let radius = 0; radius < Math.max(cols, rows); radius++) {
            for (let dx = -radius; dx <= radius; dx++) {
                for (let dy = -radius; dy <= radius; dy++) {
                    // Skip positions that aren't on the current radius
                    if (Math.abs(dx) !== radius && Math.abs(dy) !== radius && radius > 0) {
                        continue;
                    }
                    
                    const col = targetCol + dx;
                    const row = targetRow + dy;
                    
                    // Check bounds
                    if (col >= 0 && col < cols && row >= 0 && row < rows) {
                        const x = col * this.gridSize + 20;
                        const y = row * this.gridSize + 20;
                        
                        if (!occupiedPositions.has(`${x},${y}`)) {
                            return { x, y };
                        }
                    }
                }
            }
        }
        
        // If no empty position found, return the original target position
        return { x: targetX, y: targetY };
    }

    snapAllCardsToGrid() {
        if (!this.activeBoard?.cards) return;

        const occupiedPositions = new Set();
        
        this.activeBoard.cards.forEach(async (card) => {
            let x = Math.round(card.x / this.gridSize) * this.gridSize + 20;
            let y = Math.round(card.y / this.gridSize) * this.gridSize + 20;
            
            // If this position is already occupied, find a nearby empty one
            let posKey = `${x},${y}`;
            let attempts = 0;
            while (occupiedPositions.has(posKey) && attempts < 10) {
                // Try adjacent grid positions
                x += this.gridSize;
                if (x > window.innerWidth - 240) {
                    x = 20;
                    y += this.gridSize;
                }
                posKey = `${x},${y}`;
                attempts++;
            }
            
            occupiedPositions.add(posKey);
            
            if (x !== card.x || y !== card.y) {
                await this.updateCardPosition(card.id, x, y);
            }
        });
    }

    // Search Management
    focusSearch() {
        const searchInput = document.querySelector('.search-input');
        if (searchInput) {
            searchInput.focus();
            searchInput.select();
        }
    }

    clearSearch() {
        this.searchQuery = '';
        const searchInput = document.querySelector('.search-input');
        if (searchInput) {
            searchInput.value = '';
        }
        this.queueRender();
    }

    toggleSearch() {
        const searchContainer = document.querySelector('.search-container');
        if (searchContainer) {
            const searchInput = searchContainer.querySelector('.search-input');
            if (document.activeElement === searchInput) {
                searchInput.blur();
            } else {
                this.focusSearch();
            }
        }
    }

    // Selection Management
    selectCard(cardId, clearOthers = true) {
        if (clearOthers) {
            this.clearCardSelection();
        }
        
        this.selectedCards.add(cardId);
        
        const cardElement = document.getElementById(`card-${cardId}`);
        if (cardElement) {
            cardElement.classList.add('selected');
        }
    }

    toggleCardSelection(cardId) {
        if (this.selectedCards.has(cardId)) {
            this.selectedCards.delete(cardId);
            const cardElement = document.getElementById(`card-${cardId}`);
            if (cardElement) {
                cardElement.classList.remove('selected');
            }
        } else {
            this.selectCard(cardId, false);
        }
    }

    clearCardSelection() {
        this.selectedCards.forEach(cardId => {
            const cardElement = document.getElementById(`card-${cardId}`);
            if (cardElement) {
                cardElement.classList.remove('selected');
            }
        });
        this.selectedCards.clear();
    }

    selectAllCards() {
        if (!this.activeBoard?.cards) return;
        
        this.clearCardSelection();
        this.activeBoard.cards.forEach(card => {
            this.selectCard(card.id, false);
        });
        
        ui.showStatus(`Selected ${this.selectedCards.size} cards`, 'info');
    }

    async deleteSelectedCards() {
        if (this.selectedCards.size === 0) return;

        const confirmed = await ui.confirm(
            `Delete ${this.selectedCards.size} selected card${this.selectedCards.size > 1 ? 's' : ''}?`,
            'Delete Cards',
            { dangerous: true }
        );

        if (!confirmed) return;

        this.saveState();

        const promises = Array.from(this.selectedCards).map(cardId => 
            boardManager.deleteCard(cardId)
        );

        try {
            await Promise.all(promises);
            this.selectedCards.clear();
            ui.showStatus('Selected cards deleted', 'success');
            this.queueRender();
        } catch (error) {
            console.error('Failed to delete selected cards:', error);
            ui.showToast('Failed to delete some cards', 'error');
        }
    }

    // Export/Import
    async exportBoard() {
        if (!this.activeBoard) return;

        try {
            const data = {
                version: '1.0',
                exported: new Date().toISOString(),
                board: this.activeBoard
            };

            const blob = new Blob([JSON.stringify(data, null, 2)], { 
                type: 'application/json' 
            });
            
            Utils.downloadBlob(
                blob, 
                `${this.activeBoard.name}-${new Date().toISOString().split('T')[0]}.json`
            );
            
            ui.showStatus('Board exported', 'success');
            
        } catch (error) {
            console.error('Failed to export board:', error);
            ui.showToast('Failed to export board', 'error');
        }
    }

    showImportModal() {
        const content = `
            <div class="form-group">
                <label class="form-label">Select JSON file or paste data:</label>
                <input type="file" id="import-file" accept=".json" class="form-input">
            </div>
            <div class="form-group">
                <label class="form-label">Or paste JSON data:</label>
                <textarea id="import-data" class="form-textarea" placeholder="Paste JSON data here..."></textarea>
            </div>
        `;

        const modal = ui.createModal('Import Board', content, {
            buttons: [
                {
                    text: 'Cancel',
                    type: 'secondary',
                    onclick: 'ui.closeModal(this.closest(\'.modal-overlay\'))'
                },
                {
                    text: 'Import',
                    type: 'primary',
                    onclick: 'app.handleImport()'
                }
            ]
        });

        // Setup file input handler
        const fileInput = modal.querySelector('#import-file');
        fileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = (e) => {
                    modal.querySelector('#import-data').value = e.target.result;
                };
                reader.readAsText(file);
            }
        });
    }

    async handleImport() {
        const dataText = document.getElementById('import-data').value;
        if (!dataText.trim()) {
            ui.showToast('No data provided', 'warning');
            return;
        }

        try {
            const data = JSON.parse(dataText);
            
            if (!data.board) {
                throw new Error('Invalid export format - missing board data');
            }

            // Create new board with imported data
            const boardData = {
                ...data.board,
                id: Utils.generateId(), // Generate new ID
                name: `${data.board.name} (Imported)`,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            };

            // Generate new IDs for all cards
            if (boardData.cards) {
                boardData.cards = boardData.cards.map(card => ({
                    ...card,
                    id: Utils.generateId(),
                    board_id: boardData.id,
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                }));
            }

            const board = await boardManager.createBoard(boardData);
            
            // Add cards to the new board
            if (boardData.cards) {
                for (const cardData of boardData.cards) {
                    await boardManager.createCard(cardData);
                }
            }

            await this.switchBoard(board.id);
            
            ui.closeTopModal();
            ui.showStatus('Board imported successfully', 'success');
            
        } catch (error) {
            console.error('Import failed:', error);
            ui.showToast('Failed to import board: ' + error.message, 'error');
        }
    }

    // Sharing
    async shareBoard() {
        if (!this.activeBoard) return;

        try {
            // Create shareable URL
            const shareData = btoa(JSON.stringify({
                board: this.activeBoard,
                sharedAt: new Date().toISOString()
            }));
            
            const shareUrl = `${window.location.origin}${window.location.pathname}#share=${shareData}`;
            
            const success = await Utils.copyToClipboard(shareUrl);
            
            if (success) {
                ui.showStatus('Share link copied to clipboard', 'success');
            } else {
                // Fallback: show the URL in a modal
                ui.createModal('Share Board', `
                    <p>Copy this link to share your board:</p>
                    <input type="text" class="form-input" value="${shareUrl}" readonly onclick="this.select()">
                `, {
                    buttons: [
                        { text: 'Close', type: 'primary', onclick: 'ui.closeModal(this.closest(\'.modal-overlay\'))' }
                    ]
                });
            }
            
        } catch (error) {
            console.error('Failed to share board:', error);
            ui.showToast('Failed to create share link', 'error');
        }
    }

    async handleHashChange() {
        const hash = window.location.hash.slice(1);
        if (hash.startsWith('share=')) {
            try {
                const shareData = hash.substring(6);
                const decoded = atob(shareData);
                const data = JSON.parse(decoded);
                
                if (data.board) {
                    // Import the shared board
                    const confirmed = await ui.confirm(
                        `Import shared board "${data.board.name}"?`,
                        'Import Shared Board'
                    );
                    
                    if (confirmed) {
                        await this.importSharedBoard(data.board);
                        window.location.hash = ''; // Clear hash
                    }
                }
                
            } catch (error) {
                console.error('Failed to import shared board:', error);
                ui.showToast('Invalid share link', 'error');
            }
        }
    }

    async importSharedBoard(sharedBoard) {
        const boardData = {
            ...sharedBoard,
            id: Utils.generateId(),
            name: `${sharedBoard.name} (Shared)`,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        };

        // Generate new IDs for cards
        if (boardData.cards) {
            boardData.cards = boardData.cards.map(card => ({
                ...card,
                id: Utils.generateId(),
                board_id: boardData.id,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            }));
        }

        const board = await boardManager.createBoard(boardData);
        
        // Add cards
        if (boardData.cards) {
            for (const cardData of boardData.cards) {
                await boardManager.createCard(cardData);
            }
        }

        await this.switchBoard(board.id);
        ui.showStatus('Shared board imported', 'success');
    }

    // Print
    printBoard() {
        window.print();
    }

    // FAB Menu
    toggleFABMenu() {
        const menu = document.getElementById('fab-menu');
        const main = document.getElementById('fab-main');
        
        if (menu && main) {
            menu.classList.toggle('open');
            main.style.transform = menu.classList.contains('open') ? 'rotate(45deg)' : '';
        }
    }

    // Board Menu
    showBoardMenu(event) {
        const menuItems = [
            { text: 'Rename Board', icon: '✏️', onclick: `app.renameBoardPrompt()` },
            { text: 'Change Color', icon: '🎨', onclick: `app.changeBoardColor()` },
            { text: 'Export Board', icon: '📤', onclick: `app.exportBoard()` },
            { text: 'Share Board', icon: '🔗', onclick: `app.shareBoard()` },
            { separator: true },
            { text: 'Board Statistics', icon: '📊', onclick: `app.showBoardStats()` },
            { separator: true },
            { text: 'Delete Board', icon: '🗑️', onclick: `app.deleteBoardPrompt()`, class: 'danger' }
        ];

        ui.showContextMenu(event.clientX, event.clientY, menuItems);
    }

    async renameBoardPrompt() {
        if (!this.activeBoard) return;
        
        const newName = await ui.prompt(
            'Enter new board name:',
            this.activeBoard.name,
            'Rename Board'
        );
        
        if (newName && newName.trim()) {
            await this.renameBoard(this.activeBoard.id, newName.trim());
        }
    }

    async deleteBoardPrompt() {
        if (this.activeBoard) {
            await this.deleteBoard(this.activeBoard.id);
        }
    }

    showBoardStats() {
        if (!this.activeBoard) return;

        const stats = this.calculateBoardStats();
        
        const content = `
            <div class="stats-grid">
                <div class="stat-item">
                    <div class="stat-label">Total Cards</div>
                    <div class="stat-value">${stats.totalCards}</div>
                </div>
                <div class="stat-item">
                    <div class="stat-label">Tags Used</div>
                    <div class="stat-value">${stats.uniqueTags}</div>
                </div>
                <div class="stat-item">
                    <div class="stat-label">Due Today</div>
                    <div class="stat-value">${stats.dueToday}</div>
                </div>
                <div class="stat-item">
                    <div class="stat-label">Overdue</div>
                    <div class="stat-value">${stats.overdue}</div>
                </div>
            </div>
            
            ${stats.topTags.length > 0 ? `
                <h3>Most Used Tags</h3>
                <div class="tag-list">
                    ${stats.topTags.map(tag => `
                        <span class="tag-stat">${tag.name} (${tag.count})</span>
                    `).join('')}
                </div>
            ` : ''}
        `;

        ui.createModal('Board Statistics', content, {
            buttons: [
                { text: 'Close', type: 'primary', onclick: 'ui.closeModal(this.closest(\'.modal-overlay\'))' }
            ]
        });
    }

    calculateBoardStats() {
        if (!this.activeBoard?.cards) {
            return { totalCards: 0, uniqueTags: 0, dueToday: 0, overdue: 0, topTags: [] };
        }

        const cards = this.activeBoard.cards;
        const tagCounts = {};
        let dueToday = 0;
        let overdue = 0;

        const today = new Date().toISOString().split('T')[0];

        cards.forEach(card => {
            // Count tags
            if (card.tags) {
                card.tags.forEach(tag => {
                    tagCounts[tag] = (tagCounts[tag] || 0) + 1;
                });
            }

            // Count due dates
            if (card.due_date) {
                const dueDate = card.due_date.split('T')[0];
                if (dueDate === today) {
                    dueToday++;
                } else if (dueDate < today) {
                    overdue++;
                }
            }
        });

        const topTags = Object.entries(tagCounts)
            .map(([name, count]) => ({ name, count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 5);

        return {
            totalCards: cards.length,
            uniqueTags: Object.keys(tagCounts).length,
            dueToday,
            overdue,
            topTags
        };
    }

    // Remote Event Handlers
    handleRemoteCardCreated(cardData) {
        if (this.activeBoard && cardData.board_id === this.activeBoard.id) {
            // Add to local board
            this.activeBoard.cards.push(cardData);
            this.queueRender();
            ui.showStatus(`New card added by collaborator`, 'info');
        }
    }

    handleRemoteCardUpdated(updateData) {
        console.log('🌐 Remote card updated:', updateData.id, 'from user:', updateData.userId);
        
        // Don't re-render if this update came from the current user
        if (updateData.userId === collaboration.currentUser) {
            console.log('🌐 Ignoring own update');
            return;
        }
        
        if (this.activeBoard) {
            const card = this.getCardById(updateData.id);
            if (card) {
                Object.assign(card, updateData);
                this.queueRender();
            }
        }
    }

    handleRemoteCardDeleted(cardId) {
        if (this.activeBoard) {
            const index = this.activeBoard.cards.findIndex(c => c.id === cardId);
            if (index > -1) {
                this.activeBoard.cards.splice(index, 1);
                this.selectedCards.delete(cardId);
                this.queueRender();
                ui.showStatus('Card deleted by collaborator', 'info');
            }
        }
    }

    // Utility
    hideLoadingScreen() {
        const loadingScreen = document.getElementById('loading-screen');
        if (loadingScreen) {
            loadingScreen.classList.add('hidden');
            setTimeout(() => {
                loadingScreen.remove();
            }, 500);
        }
    }

    async saveAll() {
        try {
            this.saveToLocalStorage();
            ui.showStatus('All changes saved', 'success');
        } catch (error) {
            console.error('Failed to save:', error);
            ui.showStatus('Failed to save changes', 'error');
        }
    }

    // Keyboard navigation
    navigateCards(direction) {
        // Implementation for keyboard navigation between cards
        // This could be expanded to support arrow key navigation
    }

    toggleFilterBar() {
        const filterBar = document.querySelector('.filter-bar');
        if (filterBar) {
            filterBar.classList.toggle('active');
        } else if (this.activeFilters.size > 0) {
            this.renderFilterBar();
        }
    }
}

// Initialize the app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM loaded, initializing Corkboard Pro...');
    try {
        window.app = new CorkboardApp();
        console.log('Corkboard Pro initialized successfully');
    } catch (error) {
        console.error('Failed to initialize Corkboard Pro:', error);
        // Show basic error message
        document.body.innerHTML = `
            <div style="padding: 20px; color: white; background: #1a1a1a; min-height: 100vh;">
                <h1>Corkboard Pro - Initialization Error</h1>
                <p>There was an error loading the application. Please check the browser console for details.</p>
                <p>Error: ${error.message}</p>
                <button onclick="location.reload()" style="padding: 10px 20px; margin-top: 20px;">Reload Page</button>
            </div>
        `;
    }
});

// Add global error handlers
window.addEventListener('error', (event) => {
    console.error('Global JavaScript error:', event.error);
});

window.addEventListener('unhandledrejection', (event) => {
    console.error('Unhandled promise rejection:', event.reason);
});

// Global error handler
window.addEventListener('error', (event) => {
    console.error('Global error:', event.error);
    if (window.ui) {
        ui.showToast('An error occurred. Please refresh the page if problems persist.', 'error');
    }
});

// Global unhandled promise rejection handler
window.addEventListener('unhandledrejection', (event) => {
    console.error('Unhandled promise rejection:', event.reason);
    if (window.ui) {
        ui.showToast('An error occurred. Please try again.', 'error');
    }
});