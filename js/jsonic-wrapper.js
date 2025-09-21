/**
 * JSONIC Wrapper for Jetrix Highscores
 * Provides MongoDB-like API with OPFS persistence for game data
 */

import init, { JsonDB } from './jsonic_wasm.js';

// Configuration for GitHub Pages
const getBaseUrl = () => {
    const { pathname } = window.location;
    if (pathname.startsWith('/jetrix/')) {
        return '/jetrix/';
    }
    return '/';
};

let CONFIG = {
    wasmUrl: getBaseUrl() + 'js/jsonic_wasm_bg.wasm',
    debug: false,
    enablePersistence: true,
    persistenceKey: 'jetrix_highscores'
};

let initialized = false;
let initPromise = null;

// Initialize WASM module
async function initializeWasm() {
    if (initialized) return;
    
    if (!initPromise) {
        initPromise = init(CONFIG.wasmUrl).then(() => {
            initialized = true;
            if (CONFIG.debug) {
                console.log('[JSONIC] WASM module initialized for Jetrix');
            }
        }).catch(error => {
            console.error('[JSONIC] Failed to initialize WASM:', error);
            throw error;
        });
    }
    
    return initPromise;
}

// Enhanced database class with MongoDB-like queries and OPFS persistence
class JetrixDatabase {
    constructor(db, options = {}) {
        this.db = db;
        this.enablePersistence = options.enablePersistence !== false;
        this.persistenceKey = options.persistenceKey || 'jetrix_highscores';
        this.opfsRoot = null;
        this.initPersistence();
    }

    async initPersistence() {
        if (!this.enablePersistence) return;
        
        try {
            // Check if OPFS is available
            if ('storage' in navigator && 'getDirectory' in navigator.storage) {
                this.opfsRoot = await navigator.storage.getDirectory();
                console.log('[JSONIC] OPFS persistence enabled for Jetrix');
                await this.loadFromOPFS();
            } else {
                console.warn('[JSONIC] OPFS not available, falling back to localStorage');
            }
        } catch (error) {
            console.error('[JSONIC] Failed to initialize persistence:', error);
        }
    }

    async loadFromOPFS() {
        try {
            const fileHandle = await this.opfsRoot.getFileHandle(`${this.persistenceKey}.json`, { create: false });
            const file = await fileHandle.getFile();
            const text = await file.text();
            const data = JSON.parse(text);
            
            // Restore highscores to the database
            for (const score of data.highscores || []) {
                await this.insertScore(score);
            }
            
            console.log(`[JSONIC] Loaded ${data.highscores?.length || 0} highscores from OPFS`);
        } catch (error) {
            if (error.name !== 'NotFoundError') {
                console.error('[JSONIC] Failed to load from OPFS:', error);
            }
        }
    }

    async saveToOPFS() {
        if (!this.opfsRoot) return;
        
        try {
            const highscores = await this.getAllScores();
            
            const fileHandle = await this.opfsRoot.getFileHandle(`${this.persistenceKey}.json`, { create: true });
            const writable = await fileHandle.createWritable();
            await writable.write(JSON.stringify({ 
                highscores, 
                timestamp: Date.now(),
                version: '1.0.0'
            }));
            await writable.close();
            
            console.log(`[JSONIC] Saved ${highscores.length} highscores to OPFS`);
        } catch (error) {
            console.error('[JSONIC] Failed to save to OPFS:', error);
        }
    }
    
    async insertScore(scoreData) {
        try {
            // Add unique ID if not present
            if (!scoreData.id) {
                scoreData.id = `score_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            }
            
            const result = await this.db.insert(JSON.stringify(scoreData));
            const parsed = typeof result === 'string' ? JSON.parse(result) : result;
            
            if (CONFIG.debug) {
                console.log('[JSONIC] Inserted score:', scoreData);
                console.log('[JSONIC] Returned ID:', parsed.data);
            }
            
            if (parsed.success && this.enablePersistence) {
                await this.saveToOPFS();
            }
            
            return parsed.data;
        } catch (error) {
            console.error('[JSONIC] Failed to insert score:', error);
            throw error;
        }
    }
    
    async getScore(id) {
        try {
            const result = await this.db.get(id);
            const parsed = typeof result === 'string' ? JSON.parse(result) : result;
            
            if (parsed.success) {
                const data = parsed.data;
                // WASM may return {id, content, metadata} structure
                if (data && data.content) {
                    return data.content;
                }
                return data;
            }
            return null;
        } catch (error) {
            console.error('[JSONIC] Failed to get score:', error);
            return null;
        }
    }
    
    async updateScore(id, scoreData) {
        try {
            const result = await this.db.update(id, JSON.stringify(scoreData));
            const parsed = typeof result === 'string' ? JSON.parse(result) : result;
            
            if (parsed.success && this.enablePersistence) {
                await this.saveToOPFS();
            }
            
            return parsed.success;
        } catch (error) {
            console.error('[JSONIC] Failed to update score:', error);
            return false;
        }
    }
    
    async deleteScore(id) {
        try {
            const result = await this.db.delete(id);
            const parsed = typeof result === 'string' ? JSON.parse(result) : result;
            
            if (parsed.success && this.enablePersistence) {
                await this.saveToOPFS();
            }
            
            return parsed.success;
        } catch (error) {
            console.error('[JSONIC] Failed to delete score:', error);
            return false;
        }
    }
    
    async getAllScores() {
        try {
            const idsResult = await this.db.list_ids();
            const ids = typeof idsResult === 'string' ? JSON.parse(idsResult) : idsResult;
            const scores = [];
            
            for (const id of ids.data || []) {
                const score = await this.getScore(id);
                if (score) {
                    scores.push({ ...score, _id: id });
                }
            }
            
            return scores;
        } catch (error) {
            console.error('[JSONIC] Failed to get all scores:', error);
            return [];
        }
    }

    // MongoDB-style query methods for highscores
    async findScores(filter = {}, options = {}) {
        const allScores = await this.getAllScores();
        let filtered = allScores;
        
        // Apply filters
        if (Object.keys(filter).length > 0) {
            filtered = allScores.filter(score => {
                return Object.entries(filter).every(([key, value]) => {
                    if (typeof value === 'object' && value !== null) {
                        // Handle MongoDB-style operators
                        if (value.$gt !== undefined) return score[key] > value.$gt;
                        if (value.$gte !== undefined) return score[key] >= value.$gte;
                        if (value.$lt !== undefined) return score[key] < value.$lt;
                        if (value.$lte !== undefined) return score[key] <= value.$lte;
                        if (value.$eq !== undefined) return score[key] === value.$eq;
                        if (value.$ne !== undefined) return score[key] !== value.$ne;
                        if (value.$in !== undefined) return value.$in.includes(score[key]);
                        if (value.$nin !== undefined) return !value.$nin.includes(score[key]);
                    }
                    return score[key] === value;
                });
            });
        }
        
        // Apply sorting
        if (options.sort) {
            filtered.sort((a, b) => {
                for (const [field, direction] of Object.entries(options.sort)) {
                    const aVal = a[field];
                    const bVal = b[field];
                    if (aVal !== bVal) {
                        return direction === -1 ? (bVal > aVal ? 1 : -1) : (aVal > bVal ? 1 : -1);
                    }
                }
                return 0;
            });
        }
        
        // Apply limit and skip
        if (options.skip) {
            filtered = filtered.slice(options.skip);
        }
        if (options.limit) {
            filtered = filtered.slice(0, options.limit);
        }
        
        return filtered;
    }

    async findOneScore(filter = {}) {
        const results = await this.findScores(filter, { limit: 1 });
        return results[0] || null;
    }

    async countScores(filter = {}) {
        const filtered = await this.findScores(filter);
        return filtered.length;
    }
    
    async getStats() {
        try {
            const result = await this.db.stats();
            const parsed = typeof result === 'string' ? JSON.parse(result) : result;
            
            const allScores = await this.getAllScores();
            
            return {
                totalScores: allScores.length,
                uniquePlayers: new Set(allScores.map(s => s.playerId)).size,
                gameModes: new Set(allScores.map(s => s.gameMode)).size,
                highestScore: Math.max(...allScores.map(s => s.score), 0),
                lastUpdated: Math.max(...allScores.map(s => s.timestamp), 0),
                wasmStats: parsed.data || {}
            };
        } catch (error) {
            console.error('[JSONIC] Failed to get stats:', error);
            return { totalScores: 0, uniquePlayers: 0, gameModes: 0, highestScore: 0 };
        }
    }
}

// Main JSONIC interface for Jetrix
const JSONIC = {
    version: '1.0.0',
    
    configure(options) {
        CONFIG = { ...CONFIG, ...options };
        if (CONFIG.debug) {
            console.log('[JSONIC] Configuration updated for Jetrix:', CONFIG);
        }
    },
    
    async createDatabase(options = {}) {
        // Initialize WASM
        await initializeWasm();
        
        const db = new JsonDB();
        const mergedOptions = { ...CONFIG, ...options };
        return new JetrixDatabase(db, mergedOptions);
    }
};

// Export as default
export default JSONIC;

// Also set on window for compatibility
if (typeof window !== 'undefined') {
    window.JSONIC = JSONIC;
    window.JSONIC_READY = Promise.resolve(JSONIC);
    
    // Dispatch ready event
    setTimeout(() => {
        window.dispatchEvent(new CustomEvent('jsonic-ready', { detail: JSONIC }));
    }, 0);
}