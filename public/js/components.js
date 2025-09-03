// Corkboard Pro - UI Components
console.log('🎨 Components.js loaded');

class UIComponents {
    constructor() {
        this.modals = new Map();
        this.toasts = [];
        this.dragState = {
            isDragging: false,
            draggedElement: null,
            startPos: { x: 0, y: 0 },
            offset: { x: 0, y: 0 }
        };
        this.setupGlobalEventListeners();
    }

    setupGlobalEventListeners() {
        // Global click handler for modal backgrounds
        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('modal-overlay')) {
                this.closeModal(e.target.querySelector('.modal'));
            }
        });

        // Global escape key handler
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.closeTopModal();
            }
        });

        // Prevent default drag behavior on images
        document.addEventListener('dragstart', (e) => {
            if (e.target.tagName === 'IMG') {
                e.preventDefault();
            }
        });
    }

    // Toast Notifications
    showToast(message, type = 'info', duration = 4000) {
        const toast = this.createToastElement(message, type);
        const container = document.getElementById('toast-container');
        
        container.appendChild(toast);
        this.toasts.push(toast);

        // Animate in
        requestAnimationFrame(() => {
            toast.classList.add('fadeIn');
        });

        // Auto remove
        setTimeout(() => {
            this.removeToast(toast);
        }, duration);

        return toast;
    }

    createToastElement(message, type) {
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;

        const icons = {
            success: '✅',
            error: '❌',
            warning: '⚠️',
            info: 'ℹ️'
        };

        toast.innerHTML = `
            <div class="toast-icon">${icons[type] || icons.info}</div>
            <div class="toast-content">
                <div class="toast-message">${Utils.sanitizeHTML(message)}</div>
            </div>
            <button class="toast-close" onclick="ui.removeToast(this.parentElement)">×</button>
        `;

        return toast;
    }

    removeToast(toast) {
        if (!toast.parentElement) return;

        toast.classList.add('fadeOut');
        setTimeout(() => {
            if (toast.parentElement) {
                toast.parentElement.removeChild(toast);
            }
            const index = this.toasts.indexOf(toast);
            if (index > -1) {
                this.toasts.splice(index, 1);
            }
        }, 300);
    }

    // Modal Management
    createModal(title, content, options = {}) {
        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        
        const {
            size = 'medium',
            closable = true,
            backdrop = true,
            buttons = []
        } = options;

        modal.innerHTML = `
            <div class="modal modal-${size}">
                <div class="modal-header">
                    <h2 class="modal-title">${Utils.sanitizeHTML(title)}</h2>
                    ${closable ? '<button class="modal-close" onclick="ui.closeModal(this.closest(\'.modal-overlay\'))">×</button>' : ''}
                </div>
                <div class="modal-body">
                    ${content}
                </div>
                ${buttons.length > 0 ? `
                    <div class="modal-footer">
                        ${buttons.map(btn => `
                            <button class="btn btn-${btn.type || 'secondary'}" 
                                    onclick="${btn.onclick || ''}"
                                    ${btn.disabled ? 'disabled' : ''}>
                                ${Utils.sanitizeHTML(btn.text)}
                            </button>
                        `).join('')}
                    </div>
                ` : ''}
            </div>
        `;

        if (!backdrop) {
            modal.style.pointerEvents = 'none';
            modal.querySelector('.modal').style.pointerEvents = 'all';
        }

        document.body.appendChild(modal);
        this.modals.set(modal, options);

        // Animate in
        requestAnimationFrame(() => {
            modal.classList.add('open');
        });

        return modal;
    }

    showModal(title, content, options = {}) {
        return this.createModal(title, content, options);
    }

    closeModal(modal) {
        if (!modal) return;
        
        console.log('closeModal called for:', modal.querySelector('.modal-title')?.textContent || 'unknown modal');
        console.trace('Modal close stack trace');
        
        const overlay = modal.classList.contains('modal-overlay') ? modal : modal.closest('.modal-overlay');
        if (!overlay) return;

        overlay.classList.remove('open');
        setTimeout(() => {
            if (overlay.parentElement) {
                overlay.parentElement.removeChild(overlay);
            }
            this.modals.delete(overlay);
        }, 300);
    }

    closeTopModal() {
        const modals = document.querySelectorAll('.modal-overlay.open');
        if (modals.length > 0) {
            this.closeModal(modals[modals.length - 1]);
        }
    }

    // Confirmation Dialog
    confirm(message, title = 'Confirm', options = {}) {
        return new Promise((resolve) => {
            const modal = this.createModal(title, `<p>${Utils.sanitizeHTML(message)}</p>`, {
                buttons: [
                    {
                        text: options.cancelText || 'Cancel',
                        type: 'secondary',
                        onclick: `ui.closeModal(this.closest('.modal-overlay')); ui.resolveConfirm(false)`
                    },
                    {
                        text: options.confirmText || 'Confirm',
                        type: options.dangerous ? 'danger' : 'primary',
                        onclick: `ui.closeModal(this.closest('.modal-overlay')); ui.resolveConfirm(true)`
                    }
                ]
            });

            this.confirmResolve = resolve;
        });
    }

    resolveConfirm(result) {
        if (this.confirmResolve) {
            this.confirmResolve(result);
            this.confirmResolve = null;
        }
    }

    // Prompt Dialog
    prompt(message, defaultValue = '', title = 'Input') {
        return new Promise((resolve) => {
            const inputId = `prompt-input-${Date.now()}`;
            const modal = this.createModal(title, `
                <p>${Utils.sanitizeHTML(message)}</p>
                <input type="text" id="${inputId}" class="form-input" 
                       value="${Utils.sanitizeHTML(defaultValue)}" 
                       placeholder="Enter value..."
                       onkeypress="if(event.key==='Enter') document.querySelector('#${inputId}').nextElementSibling.click()">
            `, {
                buttons: [
                    {
                        text: 'Cancel',
                        type: 'secondary',
                        onclick: `ui.closeModal(this.closest('.modal-overlay')); ui.resolvePrompt(null)`
                    },
                    {
                        text: 'OK',
                        type: 'primary',
                        onclick: `ui.resolvePrompt(document.getElementById('${inputId}').value); ui.closeModal(this.closest('.modal-overlay'))`
                    }
                ]
            });

            // Focus the input
            setTimeout(() => {
                const input = document.getElementById(inputId);
                if (input) {
                    input.focus();
                    input.select();
                }
            }, 100);

            this.promptResolve = resolve;
        });
    }

    resolvePrompt(result) {
        if (this.promptResolve) {
            this.promptResolve(result);
            this.promptResolve = null;
        }
    }

    // Context Menu
    showContextMenu(x, y, items) {
        this.hideContextMenu(); // Hide any existing menu

        const menu = document.createElement('div');
        menu.className = 'context-menu';
        menu.innerHTML = items.map(item => {
            if (item.separator) {
                return '<div class="context-menu-separator"></div>';
            }
            
            // Escape quotes for HTML
            const onclickHandler = item.disabled ? '' : `${item.onclick}; ui.hideContextMenu()`;
            const escapedOnclick = onclickHandler.replace(/'/g, '&apos;');
            
            return `
                <div class="context-menu-item ${item.disabled ? 'disabled' : ''}" 
                     onclick="${escapedOnclick}">
                    ${item.icon ? `<span class="context-menu-icon">${item.icon}</span>` : ''}
                    <span class="context-menu-text">${Utils.sanitizeHTML(item.text)}</span>
                    ${item.shortcut ? `<span class="context-menu-shortcut">${item.shortcut}</span>` : ''}
                </div>
            `;
        }).join('');

        // Position menu
        menu.style.position = 'fixed';
        menu.style.left = x + 'px';
        menu.style.top = y + 'px';
        menu.style.zIndex = '3000';

        document.body.appendChild(menu);

        // Adjust position if menu goes off screen
        const rect = menu.getBoundingClientRect();
        if (rect.right > window.innerWidth) {
            menu.style.left = (x - rect.width) + 'px';
        }
        if (rect.bottom > window.innerHeight) {
            menu.style.top = (y - rect.height) + 'px';
        }

        // Hide menu on outside click, but not on menu itself
        const hideOnOutsideClick = (event) => {
            if (!event.target.closest('.context-menu')) {
                this.hideContextMenu();
                document.removeEventListener('click', hideOnOutsideClick);
            }
        };
        
        setTimeout(() => {
            document.addEventListener('click', hideOnOutsideClick);
        }, 100);
        
        // Add hover behavior to keep menu open
        menu.addEventListener('mouseenter', () => {
            menu.classList.add('hovering');
        });
        
        menu.addEventListener('mouseleave', () => {
            menu.classList.remove('hovering');
            // Hide menu after a delay when mouse leaves
            setTimeout(() => {
                if (!menu.classList.contains('hovering') && document.body.contains(menu)) {
                    this.hideContextMenu();
                }
            }, 200);
        });

        return menu;
    }

    hideContextMenu() {
        const menus = document.querySelectorAll('.context-menu');
        menus.forEach(menu => menu.remove());
    }

    // Loading Indicator
    showLoading(message = 'Loading...', target = null) {
        const loading = document.createElement('div');
        loading.className = 'loading-overlay';
        loading.innerHTML = `
            <div class="loading-content">
                <div class="loading-spinner"></div>
                <div class="loading-message">${Utils.sanitizeHTML(message)}</div>
            </div>
        `;

        if (target) {
            target.style.position = 'relative';
            target.appendChild(loading);
        } else {
            document.body.appendChild(loading);
        }

        return loading;
    }

    hideLoading(loadingElement) {
        if (loadingElement && loadingElement.parentElement) {
            loadingElement.parentElement.removeChild(loadingElement);
        }
    }

    // File Upload Component
    createFileUpload(options = {}) {
        const {
            accept = '*/*',
            multiple = false,
            maxSize = 5 * 1024 * 1024, // 5MB
            onSelect = () => {},
            onError = () => {}
        } = options;

        const container = document.createElement('div');
        container.className = 'file-upload-container';

        const input = document.createElement('input');
        input.type = 'file';
        input.accept = accept;
        input.multiple = multiple;
        input.style.display = 'none';

        const dropZone = document.createElement('div');
        dropZone.className = 'file-upload-dropzone';
        dropZone.innerHTML = `
            <div class="file-upload-icon">📁</div>
            <div class="file-upload-text">
                Drop files here or <span class="file-upload-browse">browse</span>
            </div>
            <div class="file-upload-hint">
                ${accept === 'image/*' ? 'Images only' : 'Any file type'} • 
                Max ${Utils.formatFileSize(maxSize)}
            </div>
        `;

        container.appendChild(input);
        container.appendChild(dropZone);

        // Event handlers
        dropZone.addEventListener('click', () => input.click());
        
        input.addEventListener('change', (e) => {
            this.handleFileSelect(e.target.files, onSelect, onError, maxSize);
        });

        // Drag and drop
        dropZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            dropZone.classList.add('dragover');
        });

        dropZone.addEventListener('dragleave', () => {
            dropZone.classList.remove('dragover');
        });

        dropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            dropZone.classList.remove('dragover');
            this.handleFileSelect(e.dataTransfer.files, onSelect, onError, maxSize);
        });

        return container;
    }

    handleFileSelect(files, onSelect, onError, maxSize) {
        const validFiles = [];
        
        Array.from(files).forEach(file => {
            if (file.size > maxSize) {
                onError(new Error(`File "${file.name}" is too large. Max size: ${Utils.formatFileSize(maxSize)}`));
                return;
            }
            validFiles.push(file);
        });

        if (validFiles.length > 0) {
            onSelect(validFiles);
        }
    }

    // Color Picker Component
    createColorPicker(currentColor = '#fef3c7', onColorChange = () => {}) {
        const picker = document.createElement('div');
        picker.className = 'color-picker-popup';
        
        const colors = [
            '#fef3c7', '#fde68a', '#fbbf24', '#f59e0b', // Yellow
            '#fed7aa', '#fdba74', '#fb923c', '#f97316', // Orange
            '#fca5a5', '#f87171', '#ef4444', '#dc2626', // Red
            '#f3e8ff', '#e9d5ff', '#c084fc', '#a855f7', // Purple
            '#dbeafe', '#bfdbfe', '#60a5fa', '#3b82f6', // Blue
            '#d1fae5', '#a7f3d0', '#6ee7b7', '#34d399', // Green
            '#fef7cd', '#fef08a', '#facc15', '#eab308', // Yellow-green
            '#ede9fe', '#ddd6fe', '#c7d2fe', '#a5b4fc'  // Light purple
        ];

        picker.innerHTML = `
            <div class="color-picker-colors">
                ${colors.map(color => `
                    <div class="color-picker-color ${color === currentColor ? 'selected' : ''}" 
                         style="background-color: ${color}"
                         onclick="ui.selectColor('${color}', this)"
                         data-color="${color}">
                    </div>
                `).join('')}
            </div>
            <div class="color-picker-custom">
                <input type="color" class="color-picker-input" 
                       value="${currentColor}"
                       onchange="ui.selectCustomColor(this.value, this)">
                <label>Custom color</label>
            </div>
        `;

        this.colorChangeCallback = onColorChange;
        return picker;
    }

    selectColor(color, element) {
        // Update selected state
        element.parentElement.querySelectorAll('.color-picker-color').forEach(el => {
            el.classList.remove('selected');
        });
        element.classList.add('selected');

        // Update custom input
        const customInput = element.closest('.color-picker-popup').querySelector('.color-picker-input');
        customInput.value = color;

        if (this.colorChangeCallback) {
            this.colorChangeCallback(color);
        }
    }

    selectCustomColor(color, input) {
        // Update selected state
        const colorElements = input.closest('.color-picker-popup').querySelectorAll('.color-picker-color');
        colorElements.forEach(el => el.classList.remove('selected'));

        if (this.colorChangeCallback) {
            this.colorChangeCallback(color);
        }
    }

    // Tooltip Component
    showTooltip(element, text, position = 'top') {
        this.hideTooltip(element);

        const tooltip = document.createElement('div');
        tooltip.className = `tooltip tooltip-${position}`;
        tooltip.textContent = text;

        document.body.appendChild(tooltip);

        const rect = element.getBoundingClientRect();
        const tooltipRect = tooltip.getBoundingClientRect();

        let x, y;

        switch (position) {
            case 'top':
                x = rect.left + (rect.width - tooltipRect.width) / 2;
                y = rect.top - tooltipRect.height - 8;
                break;
            case 'bottom':
                x = rect.left + (rect.width - tooltipRect.width) / 2;
                y = rect.bottom + 8;
                break;
            case 'left':
                x = rect.left - tooltipRect.width - 8;
                y = rect.top + (rect.height - tooltipRect.height) / 2;
                break;
            case 'right':
                x = rect.right + 8;
                y = rect.top + (rect.height - tooltipRect.height) / 2;
                break;
        }

        tooltip.style.left = Math.max(0, x) + 'px';
        tooltip.style.top = Math.max(0, y) + 'px';

        element._tooltip = tooltip;
    }

    hideTooltip(element) {
        if (element._tooltip) {
            element._tooltip.remove();
            element._tooltip = null;
        }
    }

    // Keyboard Shortcuts Modal
    showKeyboardShortcuts() {
        const shortcuts = [
            { key: 'N', description: 'New Card' },
            { key: 'B', description: 'New Board' },
            { key: '/', description: 'Search' },
            { key: 'G', description: 'Toggle Grid' },
            { key: 'F', description: 'Toggle Filter' },
            { key: 'E', description: 'Export Board' },
            { key: 'I', description: 'Import Data' },
            { key: '?', description: 'Show Shortcuts' },
            { key: 'Ctrl+Z', description: 'Undo' },
            { key: 'Ctrl+Y', description: 'Redo' },
            { key: 'Ctrl+S', description: 'Save' },
            { key: 'Escape', description: 'Close Modal/Clear Selection' }
        ];

        const content = `
            <div class="shortcuts-grid">
                ${shortcuts.map(shortcut => `
                    <div class="shortcut-item">
                        <span class="shortcut-description">${shortcut.description}</span>
                        <span class="shortcut-key">${shortcut.key}</span>
                    </div>
                `).join('')}
            </div>
        `;

        this.createModal('Keyboard Shortcuts', content, {
            size: 'large',
            buttons: [
                {
                    text: 'Close',
                    type: 'primary',
                    onclick: 'ui.closeModal(this.closest(\'.modal-overlay\'))'
                }
            ]
        });
    }

    // Animation utilities
    slideIn(element, direction = 'up', duration = 300) {
        const transforms = {
            up: 'translateY(20px)',
            down: 'translateY(-20px)',
            left: 'translateX(20px)',
            right: 'translateX(-20px)'
        };

        element.style.transform = transforms[direction];
        element.style.opacity = '0';
        element.style.transition = `all ${duration}ms ease-out`;

        requestAnimationFrame(() => {
            element.style.transform = 'translate(0)';
            element.style.opacity = '1';
        });
    }

    slideOut(element, direction = 'up', duration = 300) {
        const transforms = {
            up: 'translateY(-20px)',
            down: 'translateY(20px)',
            left: 'translateX(-20px)',
            right: 'translateX(20px)'
        };

        element.style.transition = `all ${duration}ms ease-in`;
        element.style.transform = transforms[direction];
        element.style.opacity = '0';

        return new Promise(resolve => {
            setTimeout(resolve, duration);
        });
    }

    fadeIn(element, duration = 300) {
        element.style.opacity = '0';
        element.style.transition = `opacity ${duration}ms ease-out`;

        requestAnimationFrame(() => {
            element.style.opacity = '1';
        });
    }

    fadeOut(element, duration = 300) {
        element.style.transition = `opacity ${duration}ms ease-in`;
        element.style.opacity = '0';

        return new Promise(resolve => {
            setTimeout(resolve, duration);
        });
    }

    // Status updates
    showStatus(message, type = 'info') {
        const statusBar = document.getElementById('status-bar');
        const statusMessage = document.getElementById('status-message');
        
        if (statusBar && statusMessage) {
            statusBar.className = `status-bar active ${type}`;
            statusMessage.textContent = message;
            
            setTimeout(() => {
                statusBar.classList.remove('active');
            }, 3000);
        }
    }

    showOfflineIndicator() {
        const indicator = document.getElementById('offline-indicator');
        if (indicator) {
            indicator.classList.add('active');
        }
    }

    hideOfflineIndicator() {
        const indicator = document.getElementById('offline-indicator');
        if (indicator) {
            indicator.classList.remove('active');
        }
    }
}

// Initialize global UI components
window.ui = new UIComponents();