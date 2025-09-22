#!/usr/bin/env node

import { WebSocket } from 'ws';
import readline from 'readline';

class JSONICServerClient {
    constructor() {
        this.ws = null;
        this.callbacks = new Map();
        this.requestId = 0;
        this.connected = false;
    }

    async connect() {
        return new Promise((resolve, reject) => {
            const wsUrl = 'wss://jsonic1.immudb.io/api/v1/ws';
            console.log(`🔌 Connecting to ${wsUrl}...`);
            
            this.ws = new WebSocket(wsUrl);
            
            this.ws.on('open', () => {
                console.log('✅ Connected to JSONIC server!');
                this.connected = true;
                resolve();
            });
            
            this.ws.on('error', (error) => {
                console.error('❌ WebSocket error:', error);
                reject(error);
            });
            
            this.ws.on('message', (data) => {
                try {
                    const message = JSON.parse(data.toString());
                    if (message.requestId && this.callbacks.has(message.requestId)) {
                        const callback = this.callbacks.get(message.requestId);
                        this.callbacks.delete(message.requestId);
                        callback(message);
                    }
                } catch (error) {
                    console.error('❌ Error parsing message:', error.message);
                }
            });
        });
    }

    async sendRequest(type, collection, data = {}) {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
            throw new Error('Not connected to server');
        }

        const requestId = `req_${++this.requestId}`;
        const message = {
            type,
            database: 'jetrix',
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

            console.log('📤 Sending request:', type, collection);
            this.ws.send(JSON.stringify(message));
        });
    }

    async getAllScores() {
        const scores = await this.sendRequest('query', 'highscores', {
            filter: {},
            options: {
                sort: { timestamp: -1 },
                limit: 1000
            }
        });
        return scores;
    }

    async deleteScore(id) {
        return await this.sendRequest('delete', 'highscores', {
            filter: { _id: id }
        });
    }

    async deleteAll() {
        // Try to delete all with empty filter
        return await this.sendRequest('delete', 'highscores', {
            filter: {}
        });
    }

    disconnect() {
        if (this.ws) {
            this.ws.close();
            this.ws = null;
            this.connected = false;
        }
    }
}

async function askQuestion(question) {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    return new Promise((resolve) => {
        rl.question(question, (answer) => {
            rl.close();
            resolve(answer);
        });
    });
}

async function main() {
    const client = new JSONICServerClient();
    
    try {
        await client.connect();
        
        // Fetch all scores first
        console.log('\n📊 Fetching all scores from JSONIC server...');
        const scores = await client.getAllScores();
        
        if (scores.length === 0) {
            console.log('✅ No scores found in the database.');
            process.exit(0);
        }
        
        console.log(`\n📊 Found ${scores.length} scores in the database:`);
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        
        // Group scores by game mode
        const scoresByMode = {};
        scores.forEach(score => {
            const mode = score.gameMode || 'normal';
            if (!scoresByMode[mode]) {
                scoresByMode[mode] = [];
            }
            scoresByMode[mode].push(score);
        });
        
        // Display summary
        Object.keys(scoresByMode).forEach(mode => {
            const modeScores = scoresByMode[mode];
            console.log(`\n${mode.toUpperCase()} mode: ${modeScores.length} scores`);
            
            // Show top 5 scores for this mode
            const topScores = modeScores.slice(0, 5);
            topScores.forEach((score, index) => {
                console.log(`  ${index + 1}. ${score.playerName || 'Anonymous'}: ${score.score} points (${new Date(score.timestamp).toLocaleDateString()})`);
            });
            
            if (modeScores.length > 5) {
                console.log(`  ... and ${modeScores.length - 5} more scores`);
            }
        });
        
        console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('\n⚠️  WARNING: This will permanently DELETE all scores from the JSONIC server!');
        console.log('⚠️  This action cannot be undone!\n');
        
        const answer = await askQuestion('Do you want to delete ALL scores? Type "DELETE ALL" to confirm: ');
        
        if (answer !== 'DELETE ALL') {
            console.log('\n❌ Deletion cancelled. No scores were deleted.');
            process.exit(0);
        }
        
        console.log('\n🗑️  Starting deletion process...');
        
        // Try bulk delete first
        try {
            await client.deleteAll();
            console.log('✅ Successfully deleted all scores in bulk!');
        } catch (bulkError) {
            console.log('⚠️  Bulk delete not supported, deleting scores individually...');
            
            // Delete scores one by one
            let deletedCount = 0;
            let failedCount = 0;
            
            for (const score of scores) {
                try {
                    await client.deleteScore(score._id);
                    deletedCount++;
                    process.stdout.write(`\r✅ Deleted ${deletedCount}/${scores.length} scores...`);
                } catch (error) {
                    failedCount++;
                    console.log(`\n❌ Failed to delete score ${score._id}: ${error.message}`);
                }
            }
            
            console.log('\n');
            console.log(`✅ Successfully deleted: ${deletedCount} scores`);
            if (failedCount > 0) {
                console.log(`❌ Failed to delete: ${failedCount} scores`);
            }
        }
        
        // Verify deletion
        console.log('\n🔍 Verifying deletion...');
        const remainingScores = await client.getAllScores();
        
        if (remainingScores.length === 0) {
            console.log('✅ All scores have been successfully deleted!');
        } else {
            console.log(`⚠️  ${remainingScores.length} scores still remain in the database.`);
        }
        
    } catch (error) {
        console.error('❌ Error:', error.message);
    } finally {
        client.disconnect();
        process.exit(0);
    }
}

// Run the script
main().catch(console.error);