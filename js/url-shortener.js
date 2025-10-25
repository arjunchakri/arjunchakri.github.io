/**
 * URL Shortener Functionality
 * Handles URL redirection based on query parameters
 */

class URLShortener {
    constructor() {
        this.mappings = {};
        this.firebaseManager = null;
        this.useFirebase = typeof FirebaseURLManager !== 'undefined';
        this.init();
    }

    async init() {
        try {
            // Always start with static mappings as the primary cache
            this.mappings = urlMappings || {};
            console.log('URL Shortener: Loaded static mappings as primary cache');
            
            // Initialize Firebase manager for fallback lookups
            if (this.useFirebase) {
                this.firebaseManager = new FirebaseURLManager();
                console.log('URL Shortener: Firebase manager initialized for fallback lookups');
            }
            
            // Check for URL parameters and path when page loads
            this.checkForRedirection();
            
        } catch (error) {
            console.error('URL Shortener initialization error:', error);
            // Ensure we at least have static mappings
            this.mappings = urlMappings || {};
            this.checkForRedirection();
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

    /**
     * Get URL parameter value by name
     * @param {string} name - Parameter name
     * @returns {string|null} - Parameter value or null if not found
     */
    getURLParameter(name) {
        const urlParams = new URLSearchParams(window.location.search);
        return urlParams.get(name);
    }

    /**
     * Extract key from URL path or query parameter
     * @returns {string|null} - The shortcut key or null if not found
     */
    extractKey() {
        // First, check for direct path (e.g., /linkedin, /github)
        const path = window.location.pathname;
        
        // Remove leading slash and any trailing slashes
        const pathKey = path.replace(/^\/+|\/+$/g, '');
        
        // If we have a path key and it's not index.html or empty, use it
        if (pathKey && pathKey !== 'index.html' && pathKey !== '') {
            return pathKey;
        }
        
        // Fallback to query parameter method (?key=value)
        const queryKey = this.getURLParameter('key');
        if (queryKey) {
            return queryKey;
        }
        
        return null;
    }

    /**
     * Check if there's a shortcut key and redirect accordingly
     */
    checkForRedirection() {
        const key = this.extractKey();
        
        if (key) {
            this.redirect(key);
        }
    }

    /**
     * Redirect to the URL mapped to the given key
     * @param {string} key - The shortcut key
     */
    async redirect(key) {
        const lowerKey = key.toLowerCase();
        let targetUrl = null;
        let source = 'static';

        // Step 1: Check static mappings first (fastest)
        targetUrl = this.mappings[lowerKey];
        
        if (targetUrl) {
            console.log(`URL found in static mappings: ${lowerKey} -> ${targetUrl}`);
            source = 'static';
        } else if (this.firebaseManager && this.firebaseManager.initialized) {
            // Step 2: Only check Firebase if not found in static mappings
            try {
                console.log(`Key '${lowerKey}' not found in static mappings, checking Firebase...`);
                targetUrl = await this.firebaseManager.getMapping(lowerKey);
                
                if (targetUrl) {
                    console.log(`URL found in Firebase: ${lowerKey} -> ${targetUrl}`);
                    source = 'firebase';
                    
                    // Cache it locally for future use (optional optimization)
                    this.mappings[lowerKey] = targetUrl;
                } else {
                    console.log(`Key '${lowerKey}' not found in Firebase either`);
                }
            } catch (error) {
                console.error('Error fetching mapping from Firebase:', error);
            }
        } else {
            console.log(`Key '${lowerKey}' not found in static mappings, Firebase not available`);
        }

        if (targetUrl) {
            // Track usage if Firebase is available (for both static and Firebase mappings)
            if (this.firebaseManager && this.firebaseManager.initialized) {
                this.firebaseManager.incrementUsage(lowerKey);
            }
            
            // Show loading message with source info
            this.showRedirectMessage(key, targetUrl, source);
            
            // Delay redirect slightly to show the message
            setTimeout(() => {
                this.performRedirect(targetUrl);
            }, 1000);
        } else {
            this.showNotFoundMessage(key);
        }
    }

    /**
     * Perform the actual redirect
     * @param {string} url - Target URL
     */
    performRedirect(url) {
        if (url.startsWith('http') || url.startsWith('mailto:')) {
            // External URL or email
            window.location.href = url;
        } else if (url.startsWith('#')) {
            // Internal anchor
            window.location.hash = url;
        } else {
            // Relative URL
            window.location.href = url;
        }
    }

    /**
     * Show redirect message to user
     * @param {string} key - The shortcut key used
     * @param {string} url - Target URL
     * @param {string} source - Source of the mapping ('static' or 'firebase')
     */
    showRedirectMessage(key, url, source = '') {
        const pathMethod = window.location.pathname !== '/' && window.location.pathname !== '/index.html';
        const urlExample = pathMethod ? `/${key}` : `?key=${key}`;
        
        // Add source indicator for debugging (only in development)
        const sourceIndicator = (source && console.log) ? 
            `<small style="opacity: 0.7; font-size: 0.8em;">${source === 'static' ? '📄 Static' : '☁️ Firebase'}</small>` : '';
        
        const message = `
            <div style="position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); 
                        background: #f44336; color: white; padding: 20px; border-radius: 8px; 
                        box-shadow: 0 4px 8px rgba(0,0,0,0.2); z-index: 10000; text-align: center;
                        font-family: 'Roboto', sans-serif;">
                <h4 style="margin: 0 0 10px 0;">Redirecting... ${sourceIndicator}</h4>
                <p style="margin: 0;">Shortcut: <strong>${urlExample}</strong></p>
                <p style="margin: 5px 0 0 0; font-size: 0.9em; opacity: 0.9;">
                    Taking you to: ${this.formatUrlForDisplay(url)}
                </p>
                <div style="margin-top: 15px;">
                    <div style="width: 200px; height: 4px; background: rgba(255,255,255,0.3); 
                                border-radius: 2px; overflow: hidden;">
                        <div style="width: 100%; height: 100%; background: white; 
                                    animation: loading 1s ease-in-out;"></div>
                    </div>
                </div>
            </div>
            <style>
                @keyframes loading {
                    0% { transform: translateX(-100%); }
                    100% { transform: translateX(0); }
                }
            </style>
        `;
        
        document.body.insertAdjacentHTML('beforeend', message);
    }

    /**
     * Show not found message for invalid keys
     * @param {string} key - The invalid key
     */
    showNotFoundMessage(key) {
        const message = `
            <div style="position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); 
                        background: #ff5722; color: white; padding: 20px; border-radius: 8px; 
                        box-shadow: 0 4px 8px rgba(0,0,0,0.2); z-index: 10000; text-align: center;
                        font-family: 'Roboto', sans-serif;">
                <h4 style="margin: 0 0 10px 0;">Key Not Found</h4>
                <p style="margin: 0;">The shortcut key "<strong>${key}</strong>" is not configured.</p>
                <p style="margin: 10px 0 0 0; font-size: 0.9em; opacity: 0.9;">
                    Redirecting to homepage in 3 seconds...
                </p>
            </div>
        `;
        
        document.body.insertAdjacentHTML('beforeend', message);
        
        // Redirect to homepage after 3 seconds
        setTimeout(() => {
            window.location.href = 'index.html';
        }, 3000);
    }

    /**
     * Format URL for display purposes
     * @param {string} url - URL to format
     * @returns {string} - Formatted URL
     */
    formatUrlForDisplay(url) {
        if (url.length > 50) {
            return url.substring(0, 47) + '...';
        }
        return url;
    }

    /**
     * Get all available shortcuts (for admin/debug purposes)
     * @returns {Promise<Array>} - Array of available keys from both sources
     */
    async getAvailableKeys() {
        const staticKeys = Object.keys(this.mappings);
        
        if (this.firebaseManager && this.firebaseManager.initialized) {
            try {
                const firebaseMappings = await this.firebaseManager.getMappings();
                const firebaseKeys = Object.keys(firebaseMappings);
                
                // Combine and deduplicate keys
                const allKeys = [...new Set([...staticKeys, ...firebaseKeys])];
                return allKeys.sort();
            } catch (error) {
                console.error('Error getting Firebase keys:', error);
                return staticKeys.sort();
            }
        }
        
        return staticKeys.sort();
    }

    /**
     * Add a new mapping (for dynamic additions)
     * @param {string} key - Shortcut key
     * @param {string} url - Target URL
     */
    addMapping(key, url) {
        this.mappings[key.toLowerCase()] = url;
    }
}

// Initialize URL Shortener when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    // Only initialize if urlMappings is available
    if (typeof urlMappings !== 'undefined') {
        window.urlShortener = new URLShortener();
    } else {
        console.warn('URL Shortener: urlMappings configuration not found');
    }
});

// Debug function - can be called from browser console
async function showAvailableKeys() {
    if (window.urlShortener) {
        console.log('📄 Static mappings:');
        console.table(window.urlShortener.mappings);
        
        if (window.urlShortener.firebaseManager && window.urlShortener.firebaseManager.initialized) {
            try {
                const firebaseMappings = await window.urlShortener.firebaseManager.getMappings();
                console.log('☁️ Firebase mappings:');
                console.table(firebaseMappings);
                
                const allKeys = await window.urlShortener.getAvailableKeys();
                console.log(`🔗 Total available shortcuts: ${allKeys.length}`);
                console.log('All keys:', allKeys);
            } catch (error) {
                console.error('Error loading Firebase mappings:', error);
            }
        } else {
            console.log('Firebase not available, showing static mappings only');
        }
    } else {
        console.log('URL Shortener not initialized');
    }
}