/**
 * Browser Fingerprint Manager for Jetrix
 * Uses FingerprintJS to generate stable browser IDs for user identification
 */

import FingerprintJS from '@fingerprintjs/fingerprintjs';

export class FingerprintManager {
    constructor() {
        this.fpInstance = null;
        this.browserId = null;
        this.isInitialized = false;
    }

    async initialize() {
        if (this.isInitialized) {
            return this.browserId;
        }

        try {
            console.log('🔒 Initializing browser fingerprint...');

            // Load FingerprintJS
            this.fpInstance = await FingerprintJS.load();

            // Get fingerprint
            const result = await this.fpInstance.get();

            // Use visitor ID as browser ID
            this.browserId = result.visitorId;

            // Store in localStorage for quick access
            localStorage.setItem('jetrix_browser_id', this.browserId);

            this.isInitialized = true;
            console.log('✅ Browser fingerprint initialized:', this.browserId.substring(0, 8) + '...');

            return this.browserId;
        } catch (error) {
            console.error('❌ Failed to initialize fingerprint:', error);
            // Fallback to localStorage or generate random ID
            return this.getFallbackId();
        }
    }

    getBrowserId() {
        if (this.browserId) {
            return this.browserId;
        }

        // Try to get from localStorage
        const stored = localStorage.getItem('jetrix_browser_id');
        if (stored) {
            this.browserId = stored;
            return stored;
        }

        return null;
    }

    getFallbackId() {
        // Check if we already have a fallback ID
        let fallbackId = localStorage.getItem('jetrix_fallback_id');

        if (!fallbackId) {
            // Generate a random but persistent ID
            fallbackId = 'fallback_' + Math.random().toString(36).substr(2, 16) + Date.now().toString(36);
            localStorage.setItem('jetrix_fallback_id', fallbackId);
        }

        this.browserId = fallbackId;
        console.log('⚠️ Using fallback ID:', fallbackId.substring(0, 12) + '...');
        return fallbackId;
    }

    async reset() {
        this.browserId = null;
        this.isInitialized = false;
        this.fpInstance = null;
        localStorage.removeItem('jetrix_browser_id');
        localStorage.removeItem('jetrix_fallback_id');
        console.log('🔄 Browser fingerprint reset');
    }

    /**
     * Generate a content fingerprint from data
     * Used to detect duplicate scores
     */
    async generateContentFingerprint(data) {
        try {
            // Create stable JSON string (sorted keys)
            const dataStr = JSON.stringify(data, Object.keys(data).sort());

            // Hash using WebCrypto API
            const encoder = new TextEncoder();
            const dataBuffer = encoder.encode(dataStr + this.browserId);
            const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer);

            // Convert to hex string
            const hashArray = Array.from(new Uint8Array(hashBuffer));
            return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
        } catch (error) {
            console.error('Failed to generate content fingerprint:', error);
            return null;
        }
    }
}

export default FingerprintManager;
