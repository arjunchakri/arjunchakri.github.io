/**
 * Firebase Configuration for URL Shortener
 * Handles Firebase connection and database operations
 */

class FirebaseURLManager {
    constructor() {
        this.db = null;
        this.initialized = false;
        this.initFirebase();
    }

    /**
     * Initialize Firebase with existing configuration
     */
    initFirebase() {
        try {
            // Use existing Firebase configuration from test-firebase.html
            const config = {
                apiKey: "AIzaSyCibTNoAZEu37Lih8PM5I5neXXpUUmKA_A",
                authDomain: "arjunchakri-commonutil-db-dnd.firebaseapp.com",
                databaseURL: "https://arjunchakri-commonutil-db-dnd-default-rtdb.firebaseio.com",
                projectId: "arjunchakri-commonutil-db-dnd",
                storageBucket: "arjunchakri-commonutil-db-dnd.firebasestorage.app",
                messagingSenderId: "427544663337",
                appId: "1:427544663337:web:7d76d4095003960d6a9338",
                measurementId: "G-J5NS09W79T"
            };

            // Initialize Firebase if not already initialized
            if (!firebase.apps.length) {
                firebase.initializeApp(config);
            }

            this.db = firebase.database();
            this.initialized = true;
            console.log('Firebase URL Manager initialized successfully');
        } catch (error) {
            console.error('Firebase initialization failed:', error);
            this.initialized = false;
        }
    }

    /**
     * Get all URL mappings from Firebase
     * @returns {Promise<Object>} URL mappings object
     */
    async getMappings() {
        if (!this.initialized) {
            throw new Error('Firebase not initialized');
        }

        try {
            const snapshot = await this.db.ref('urlShortener/mappings').once('value');
            const mappings = snapshot.val() || {};
            console.log('Retrieved mappings from Firebase:', mappings);
            return mappings;
        } catch (error) {
            console.error('Error retrieving mappings:', error);
            throw error;
        }
    }

    /**
     * Add or update a URL mapping
     * @param {string} key - Shortcut key
     * @param {string} url - Target URL
     * @returns {Promise<void>}
     */
    async setMapping(key, url) {
        if (!this.initialized) {
            throw new Error('Firebase not initialized');
        }

        try {
            const cleanKey = key.toLowerCase().trim();
            await this.db.ref(`urlShortener/mappings/${cleanKey}`).set({
                url: url,
                createdAt: firebase.database.ServerValue.TIMESTAMP,
                updatedAt: firebase.database.ServerValue.TIMESTAMP
            });
            console.log(`Mapping added: ${cleanKey} -> ${url}`);
        } catch (error) {
            console.error('Error setting mapping:', error);
            throw error;
        }
    }

    /**
     * Delete a URL mapping
     * @param {string} key - Shortcut key to delete
     * @returns {Promise<void>}
     */
    async deleteMapping(key) {
        if (!this.initialized) {
            throw new Error('Firebase not initialized');
        }

        try {
            const cleanKey = key.toLowerCase().trim();
            await this.db.ref(`urlShortener/mappings/${cleanKey}`).remove();
            console.log(`Mapping deleted: ${cleanKey}`);
        } catch (error) {
            console.error('Error deleting mapping:', error);
            throw error;
        }
    }

    /**
     * Get a specific mapping
     * @param {string} key - Shortcut key
     * @returns {Promise<string|null>} URL or null if not found
     */
    async getMapping(key) {
        if (!this.initialized) {
            throw new Error('Firebase not initialized');
        }

        try {
            const cleanKey = key.toLowerCase().trim();
            const snapshot = await this.db.ref(`urlShortener/mappings/${cleanKey}`).once('value');
            const mapping = snapshot.val();
            return mapping ? mapping.url : null;
        } catch (error) {
            console.error('Error getting mapping:', error);
            throw error;
        }
    }

    /**
     * Get usage statistics for a mapping
     * @param {string} key - Shortcut key
     * @returns {Promise<number>} Usage count
     */
    async getUsageCount(key) {
        if (!this.initialized) {
            throw new Error('Firebase not initialized');
        }

        try {
            const cleanKey = key.toLowerCase().trim();
            const snapshot = await this.db.ref(`urlShortener/stats/${cleanKey}/count`).once('value');
            return snapshot.val() || 0;
        } catch (error) {
            console.error('Error getting usage count:', error);
            return 0;
        }
    }

    /**
     * Increment usage count for a mapping
     * @param {string} key - Shortcut key
     * @returns {Promise<void>}
     */
    async incrementUsage(key) {
        if (!this.initialized) {
            return; // Silently fail for usage tracking
        }

        try {
            const cleanKey = key.toLowerCase().trim();
            const statsRef = this.db.ref(`urlShortener/stats/${cleanKey}`);
            
            await statsRef.transaction((currentStats) => {
                if (currentStats === null) {
                    return {
                        count: 1,
                        firstUsed: firebase.database.ServerValue.TIMESTAMP,
                        lastUsed: firebase.database.ServerValue.TIMESTAMP
                    };
                } else {
                    return {
                        ...currentStats,
                        count: (currentStats.count || 0) + 1,
                        lastUsed: firebase.database.ServerValue.TIMESTAMP
                    };
                }
            });
        } catch (error) {
            console.error('Error incrementing usage:', error);
            // Don't throw error for usage tracking
        }
    }

    /**
     * Initialize default mappings (migrate from static config)
     * @param {Object} staticMappings - Static mappings from url-mappings.js
     * @returns {Promise<void>}
     */
    async initializeDefaultMappings(staticMappings) {
        if (!this.initialized) {
            throw new Error('Firebase not initialized');
        }

        try {
            // Check if mappings already exist
            const existingMappings = await this.getMappings();
            
            if (Object.keys(existingMappings).length === 0) {
                console.log('No existing mappings found. Initializing with defaults...');
                
                // Convert static mappings to Firebase format
                const firebaseMappings = {};
                for (const [key, url] of Object.entries(staticMappings)) {
                    firebaseMappings[key] = {
                        url: url,
                        createdAt: firebase.database.ServerValue.TIMESTAMP,
                        updatedAt: firebase.database.ServerValue.TIMESTAMP
                    };
                }
                
                await this.db.ref('urlShortener/mappings').set(firebaseMappings);
                console.log('Default mappings initialized in Firebase');
            } else {
                console.log('Existing mappings found in Firebase');
            }
        } catch (error) {
            console.error('Error initializing default mappings:', error);
            throw error;
        }
    }
}

// Export for use in other scripts
if (typeof window !== 'undefined') {
    window.FirebaseURLManager = FirebaseURLManager;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = FirebaseURLManager;
}