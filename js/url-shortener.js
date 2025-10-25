/**
 * URL Shortener Functionality
 * Handles URL redirection based on query parameters
 */

class URLShortener {
    constructor() {
        this.mappings = urlMappings || {};
        this.init();
    }

    init() {
        // Check for URL parameters and path when page loads
        this.checkForRedirection();
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
    redirect(key) {
        const lowerKey = key.toLowerCase();
        const targetUrl = this.mappings[lowerKey];

        if (targetUrl) {
            // Show loading message
            this.showRedirectMessage(key, targetUrl);
            
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
     */
    showRedirectMessage(key, url) {
        const pathMethod = window.location.pathname !== '/' && window.location.pathname !== '/index.html';
        const urlExample = pathMethod ? `/${key}` : `?key=${key}`;
        
        const message = `
            <div style="position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); 
                        background: #f44336; color: white; padding: 20px; border-radius: 8px; 
                        box-shadow: 0 4px 8px rgba(0,0,0,0.2); z-index: 10000; text-align: center;
                        font-family: 'Roboto', sans-serif;">
                <h4 style="margin: 0 0 10px 0;">Redirecting...</h4>
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
     * @returns {Array} - Array of available keys
     */
    getAvailableKeys() {
        return Object.keys(this.mappings);
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
function showAvailableKeys() {
    if (window.urlShortener) {
        console.table(window.urlShortener.mappings);
    } else {
        console.log('URL Shortener not initialized');
    }
}