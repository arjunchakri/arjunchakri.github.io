/**
 * Admin Interface JavaScript for URL Shortener Management
 * Handles UI interactions and Firebase operations
 */

class URLShortenerAdmin {
    constructor() {
        this.firebaseManager = null;
        this.mappings = {};
        this.stats = {};
        this.init();
    }

    async init() {
        try {
            // Initialize Firebase manager
            this.firebaseManager = new FirebaseURLManager();
            
            // Wait a bit for Firebase to initialize
            await this.waitForFirebase();
            
            // Load existing mappings
            await this.loadMappings();
            
            // Setup event listeners
            this.setupEventListeners();
            
            // Initialize Materialize components (with fallback)
            if (typeof M !== 'undefined') {
                M.AutoInit();
                console.log('Materialize components initialized');
            } else {
                console.warn('Materialize (M) not available, using basic functionality');
            }
            
            this.hideLoading();
            this.showSuccess('Admin interface loaded successfully!');
        } catch (error) {
            console.error('Admin initialization failed:', error);
            this.showError('Failed to initialize admin interface: ' + error.message);
            this.hideLoading();
        }
    }

    async waitForFirebase() {
        return new Promise((resolve) => {
            const checkFirebase = () => {
                if (this.firebaseManager && this.firebaseManager.initialized) {
                    resolve();
                } else {
                    setTimeout(checkFirebase, 100);
                }
            };
            checkFirebase();
        });
    }

    async loadMappings() {
        try {
            this.showLoading();
            
            // Get mappings from Firebase
            const firebaseMappings = await this.firebaseManager.getMappings();
            
            // Convert Firebase format to simple key-value pairs
            this.mappings = {};
            for (const [key, data] of Object.entries(firebaseMappings)) {
                this.mappings[key] = data.url || data; // Handle both new and legacy formats
            }
            
            // Load usage statistics
            await this.loadStatistics();
            
            // Render mappings
            this.renderMappings();
            this.renderStatistics();
            
        } catch (error) {
            console.error('Error loading mappings:', error);
            this.showError('Failed to load mappings: ' + error.message);
        } finally {
            this.hideLoading();
        }
    }

    async loadStatistics() {
        this.stats = {};
        for (const key of Object.keys(this.mappings)) {
            try {
                this.stats[key] = await this.firebaseManager.getUsageCount(key);
            } catch (error) {
                console.error(`Error loading stats for ${key}:`, error);
                this.stats[key] = 0;
            }
        }
    }

    renderMappings() {
        const container = document.getElementById('mappings-container');
        
        if (Object.keys(this.mappings).length === 0) {
            container.innerHTML = `
                <div class="card-panel grey lighten-4 center">
                    <i class="material-icons large grey-text">link_off</i>
                    <p>No shortcuts configured yet. Add your first one above!</p>
                </div>
            `;
            return;
        }

        const sortedMappings = Object.entries(this.mappings).sort(([a], [b]) => a.localeCompare(b));
        
        container.innerHTML = sortedMappings.map(([key, url]) => {
            const usage = this.stats[key] || 0;
            const shortUrl = this.formatUrl(url);
            
            return `
                <div class="card mapping-card" data-key="${key}">
                    <div class="card-content">
                        <div class="row valign-wrapper" style="margin-bottom: 0;">
                            <div class="col s12 m8">
                                <span class="card-title">
                                    <code>/${key}</code>
                                    ${usage > 0 ? `<span class="usage-badge">${usage} uses</span>` : ''}
                                </span>
                                <p class="grey-text">
                                    <i class="material-icons tiny">arrow_forward</i>
                                    <a href="${url}" target="_blank" class="blue-text">${shortUrl}</a>
                                </p>
                            </div>
                            <div class="col s12 m4 right-align">
                                <button class="btn-small waves-effect waves-light blue test-btn" 
                                        data-key="${key}">
                                    <i class="material-icons">open_in_new</i>
                                </button>
                                <button class="btn-small waves-effect waves-light orange edit-btn" 
                                        data-key="${key}" data-url="${this.escapeHtml(url)}">
                                    <i class="material-icons">edit</i>
                                </button>
                                <button class="btn-small waves-effect waves-light red delete-btn" 
                                        data-key="${key}">
                                    <i class="material-icons">delete</i>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        // Add event listeners to buttons
        this.attachMappingEventListeners();
    }

    renderStatistics() {
        const totalShortcuts = Object.keys(this.mappings).length;
        const totalUsage = Object.values(this.stats).reduce((sum, count) => sum + count, 0);
        const mostUsedEntry = Object.entries(this.stats).reduce(
            (max, [key, count]) => count > max.count ? {key, count} : max, 
            {key: '-', count: 0}
        );

        document.getElementById('total-shortcuts').textContent = totalShortcuts;
        document.getElementById('total-usage').textContent = totalUsage;
        document.getElementById('most-used').textContent = mostUsedEntry.key;
        
        document.getElementById('stats-overview').style.display = totalShortcuts > 0 ? 'block' : 'none';
    }

    attachMappingEventListeners() {
        // Test buttons
        document.querySelectorAll('.test-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const key = e.target.closest('.test-btn').dataset.key;
                this.testShortcut(key);
            });
        });

        // Edit buttons
        document.querySelectorAll('.edit-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const button = e.target.closest('.edit-btn');
                const key = button.dataset.key;
                const url = button.dataset.url;
                this.editMapping(key, url);
            });
        });

        // Delete buttons
        document.querySelectorAll('.delete-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const key = e.target.closest('.delete-btn').dataset.key;
                this.deleteMapping(key);
            });
        });
    }

    setupEventListeners() {
        // Add mapping form
        document.getElementById('add-mapping-form').addEventListener('submit', (e) => {
            e.preventDefault();
            this.addMapping();
        });

        // Clear form button
        document.getElementById('clear-form').addEventListener('click', () => {
            this.clearForm();
        });

        // Test shortcut button
        document.getElementById('test-shortcut').addEventListener('click', () => {
            const key = document.getElementById('test-key').value.trim();
            if (key) {
                this.testShortcut(key);
            }
        });

        // Enter key in test input
        document.getElementById('test-key').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                const key = e.target.value.trim();
                if (key) {
                    this.testShortcut(key);
                }
            }
        });
    }

    async addMapping() {
        const key = document.getElementById('shortcut-key').value.trim().toLowerCase();
        const url = document.getElementById('target-url').value.trim();

        if (!key || !url) {
            this.showError('Both shortcut key and target URL are required.');
            return;
        }

        if (!/^[a-z0-9-_]+$/.test(key)) {
            this.showError('Shortcut key can only contain lowercase letters, numbers, hyphens, and underscores.');
            return;
        }

        try {
            this.showLoading();
            
            // Check if key already exists
            const existing = await this.firebaseManager.getMapping(key);
            if (existing && !confirm(`Shortcut "${key}" already exists. Do you want to update it?`)) {
                this.hideLoading();
                return;
            }

            // Add/update mapping
            await this.firebaseManager.setMapping(key, url);
            
            // Reload mappings
            await this.loadMappings();
            
            // Clear form
            this.clearForm();
            
            this.showSuccess(`Shortcut "${key}" ${existing ? 'updated' : 'added'} successfully!`);
        } catch (error) {
            console.error('Error adding mapping:', error);
            this.showError('Failed to add shortcut: ' + error.message);
        } finally {
            this.hideLoading();
        }
    }

    async deleteMapping(key) {
        if (!confirm(`Are you sure you want to delete the shortcut "${key}"?`)) {
            return;
        }

        try {
            this.showLoading();
            await this.firebaseManager.deleteMapping(key);
            await this.loadMappings();
            this.showSuccess(`Shortcut "${key}" deleted successfully!`);
        } catch (error) {
            console.error('Error deleting mapping:', error);
            this.showError('Failed to delete shortcut: ' + error.message);
        } finally {
            this.hideLoading();
        }
    }

    editMapping(key, currentUrl) {
        document.getElementById('shortcut-key').value = key;
        document.getElementById('target-url').value = currentUrl;
        
        // Update labels for Materialize (with fallback)
        this.updateMaterializeFields();
        
        // Scroll to form
        document.querySelector('.add-form').scrollIntoView({ behavior: 'smooth' });
        
        // Focus on URL field
        document.getElementById('target-url').focus();
    }

    testShortcut(key) {
        const baseUrl = window.location.origin;
        const testUrl = `${baseUrl}/${key}`;
        
        // Increment usage count
        if (this.firebaseManager) {
            this.firebaseManager.incrementUsage(key);
        }
        
        // Open in new tab
        window.open(testUrl, '_blank');
        
        this.showSuccess(`Testing shortcut: ${testUrl}`);
    }

    clearForm() {
        document.getElementById('add-mapping-form').reset();
        this.updateMaterializeFields(); // Update Materialize labels
    }

    updateMaterializeFields() {
        // Safely update Materialize text fields if M is available
        if (typeof M !== 'undefined' && M.updateTextFields) {
            M.updateTextFields();
        }
    }

    formatUrl(url) {
        if (url.length > 60) {
            return url.substring(0, 57) + '...';
        }
        return url;
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    showLoading() {
        document.getElementById('loading').style.display = 'block';
    }

    hideLoading() {
        document.getElementById('loading').style.display = 'none';
    }

    showError(message) {
        const errorDiv = document.getElementById('error-message');
        errorDiv.textContent = message;
        errorDiv.style.display = 'block';
        setTimeout(() => {
            errorDiv.style.display = 'none';
        }, 5000);
    }

    showSuccess(message) {
        const successDiv = document.getElementById('success-message');
        successDiv.textContent = message;
        successDiv.style.display = 'block';
        setTimeout(() => {
            successDiv.style.display = 'none';
        }, 3000);
    }
}

// Initialize admin interface when DOM is loaded and dependencies are available
document.addEventListener('DOMContentLoaded', function() {
    // Wait a moment for all scripts to load
    setTimeout(() => {
        try {
            // Check for required dependencies
            if (typeof FirebaseURLManager === 'undefined') {
                throw new Error('FirebaseURLManager not loaded. Please check firebase-config.js');
            }
            
            if (typeof firebase === 'undefined') {
                throw new Error('Firebase SDK not loaded. Please check Firebase script tags');
            }
            
            // Initialize admin interface
            window.urlShortenerAdmin = new URLShortenerAdmin();
            
        } catch (error) {
            console.error('Failed to initialize URL Shortener Admin:', error);
            
            // Show error in UI
            const statusDiv = document.getElementById('error-message') || document.createElement('div');
            statusDiv.innerHTML = `
                <h4>Initialization Error</h4>
                <p>${error.message}</p>
                <p>Please check the browser console for more details.</p>
            `;
            statusDiv.style.display = 'block';
            statusDiv.style.background = '#ffebee';
            statusDiv.style.color = '#c62828';
            statusDiv.style.padding = '1rem';
            statusDiv.style.margin = '1rem';
            statusDiv.style.borderRadius = '4px';
            
            if (!statusDiv.id) {
                statusDiv.id = 'init-error';
                document.body.insertBefore(statusDiv, document.body.firstChild);
            }
        }
    }, 500); // Give scripts 500ms to load
});