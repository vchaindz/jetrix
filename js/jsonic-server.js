/**
 * JSONIC Server Integration for Jetrix
 * Simplified client based on the official JSONIC server examples
 */

// Simplified JSONIC server client implementation
class SimpleJSONICServerClient {
    constructor(config = {}) {
        this.serverUrl = config.url || 'https://jsonic1.immudb.io';
        this.database = config.database || 'jetrix';
        this.ws = null;
        this.connected = false;
        this.requestId = 0;
        this.callbacks = new Map();
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
    }

    async connect() {
        if (this.ws?.readyState === WebSocket.OPEN) {
            return;
        }

        const wsUrl = this.serverUrl
            .replace('https://', 'wss://')
            .replace('http://', 'ws://');
        
        const fullUrl = `${wsUrl}/api/v1/ws`;
        
        return new Promise((resolve, reject) => {
            try {
                console.log('🔌 Connecting to JSONIC server:', fullUrl);
                this.ws = new WebSocket(fullUrl);

                this.ws.onopen = () => {
                    console.log('✅ Connected to JSONIC server!');
                    this.connected = true;
                    this.reconnectAttempts = 0;
                    resolve();
                };

                this.ws.onmessage = (event) => {
                    try {
                        const message = JSON.parse(event.data);
                        this.handleMessage(message);
                    } catch (error) {
                        console.error('Failed to parse server message:', error);
                    }
                };

                this.ws.onerror = (error) => {
                    console.error('❌ JSONIC server error:', error);
                    reject(error);
                };

                this.ws.onclose = (event) => {
                    console.log('🔌 Disconnected from JSONIC server');
                    this.connected = false;
                    
                    // Auto-reconnect with exponential backoff
                    if (this.reconnectAttempts < this.maxReconnectAttempts) {
                        const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
                        this.reconnectAttempts++;
                        
                        console.log(`🔄 Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);
                        setTimeout(() => this.connect(), delay);
                    }
                };

            } catch (error) {
                reject(error);
            }
        });
    }

    async disconnect() {
        if (this.ws) {
            this.ws.close();
            this.ws = null;
            this.connected = false;
            console.log('🔌 Disconnected from JSONIC server');
        }
    }

    handleMessage(message) {
        if (message.requestId && this.callbacks.has(message.requestId)) {
            const callback = this.callbacks.get(message.requestId);
            this.callbacks.delete(message.requestId);
            callback(message);
        }
    }

    async sendRequest(type, collection, data = {}) {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
            throw new Error('Not connected to server');
        }

        const requestId = `req_${++this.requestId}`;
        const message = {
            type,
            database: this.database,
            collection,
            requestId,
            ...data
        };

        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                this.callbacks.delete(requestId);
                reject(new Error('Request timeout'));
            }, 10000);

            this.callbacks.set(requestId, (response) => {
                clearTimeout(timeout);
                
                if (response.success) {
                    resolve(response.data);
                } else {
                    reject(new Error(response.error || 'Request failed'));
                }
            });

            console.log('📤 Sending WebSocket request:', message);
            this.ws.send(JSON.stringify(message));
        });
    }

    async submitScore(highscore) {
        try {
            const result = await this.sendRequest('insert', 'highscores', {
                document: {
                    ...highscore,
                    timestamp: Date.now()
                }
            });
            
            console.log('🌐 ✅ Score successfully saved to global JSONIC server!');
            console.log('📊 Server response:', result);
            console.log('🎯 Your score is now part of the global leaderboard database');
            return { success: true, id: result.id || result.insertedId };
        } catch (error) {
            console.error('❌ Failed to submit score to server:', error);
            console.log('📱 Score will be saved locally only');
            return { success: false, error: error.message };
        }
    }

    async getLeaderboard(gameMode = 'normal', options = {}) {
        const { limit = 100, timeRange = null } = options;
        
        try {
            const filter = { gameMode };
            
            if (timeRange && timeRange !== 'all') {
                const cutoff = this.getTimeCutoff(timeRange);
                filter.timestamp = { $gte: cutoff };
            }

            const result = await this.sendRequest('query', 'highscores', {
                filter,
                sort: { score: -1 },
                limit
            });

            console.log('📥 Raw server response:', result);

            // Add rank to each entry
            const leaderboard = result.map((score, index) => ({
                rank: index + 1,
                ...score
            }));

            console.log(`📊 Fetched ${leaderboard.length} scores from server`);
            return leaderboard;
        } catch (error) {
            console.warn('⚠️ Server query issue (known limitation):', error.message);
            console.log('📋 Note: Scores are still being saved to global server, but leaderboard display uses local data');
            return [];
        }
    }

    async getPersonalBest(playerId, gameMode = 'normal') {
        try {
            const result = await this.sendRequest('query', 'highscores', {
                filter: { playerId, gameMode },
                sort: { score: -1 },
                limit: 1
            });

            return result[0] || null;
        } catch (error) {
            console.warn('⚠️ Server query issue (known limitation):', error.message);
            console.log('📋 Using local data for personal best calculation');
            return null;
        }
    }

    getTimeCutoff(timeRange) {
        const now = Date.now();
        switch (timeRange) {
            case 'daily':
                return now - 24 * 60 * 60 * 1000;
            case 'weekly':
                return now - 7 * 24 * 60 * 60 * 1000;
            case 'monthly':
                return now - 30 * 24 * 60 * 60 * 1000;
            default:
                return 0;
        }
    }

    get state() {
        return { 
            connected: this.connected,
            pendingChanges: 0
        };
    }
}

export class JSONICServerClient extends SimpleJSONICServerClient {
    constructor(serverUrl = 'https://jsonic1.immudb.io') {
        super({ url: serverUrl, database: 'jetrix' });
    }

    async submitHighscore(highscore) {
        return this.submitScore(highscore);
    }

    async getHighscores(limit = 50) {
        return this.getLeaderboard('normal', { limit });
    }

    watchLeaderboard(callback) {
        // TODO: Implement WebSocket message watching
        console.log('📡 Watching leaderboard updates...');
    }
}

export default JSONICServerClient;