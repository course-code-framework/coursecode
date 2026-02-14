/**
 * Google Cloud TTS Provider (Chirp)
 * 
 * Google's neural TTS with Chirp voices for natural speech synthesis.
 * 
 * Authentication:
 *   GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json
 * 
 * Setup:
 *   1. Go to: https://console.cloud.google.com/iam-admin/serviceaccounts
 *   2. Create a service account with "Cloud Text-to-Speech API User" role
 *   3. Create a JSON key and download it
 *   4. Set GOOGLE_APPLICATION_CREDENTIALS to the path
 * 
 * Environment variables:
 *   GOOGLE_APPLICATION_CREDENTIALS   - Path to service account JSON (required)
 *   GOOGLE_VOICE                     - Optional: Default voice (e.g., en-US-Chirp3-HD-Achernar)
 *   GOOGLE_LANGUAGE                  - Optional: Language code (default: en-US)
 * 
 * Voice settings (per-narration):
 *   voice     - Voice name (e.g., en-US-Chirp3-HD-Achernar, en-US-Neural2-F)
 *   language  - Language code (e.g., en-US, en-GB)
 *   speed     - Speaking rate (0.25-4.0, default: 1.0)
 *   pitch     - Pitch adjustment (-20.0 to 20.0 semitones, default: 0)
 * 
 * Chirp 3 HD voices (highest quality):
 *   en-US-Chirp3-HD-Achernar, en-US-Chirp3-HD-Aoede, en-US-Chirp3-HD-Charon,
 *   en-US-Chirp3-HD-Fenrir, en-US-Chirp3-HD-Kore, en-US-Chirp3-HD-Leda,
 *   en-US-Chirp3-HD-Orus, en-US-Chirp3-HD-Puck, en-US-Chirp3-HD-Schedar
 */

import { BaseTTSProvider } from './base-provider.js';
import fs from 'fs';
import crypto from 'crypto';

// Default settings
const DEFAULT_VOICE = 'en-US-Neural2-J';
const DEFAULT_LANGUAGE = 'en-US';
const DEFAULT_SPEED = 1.0;
const DEFAULT_PITCH = 0;

// Popular Chirp 3 HD voices (reference for documentation)
const _CHIRP_VOICES = [
    { id: 'en-US-Chirp3-HD-Achernar', name: 'Achernar', description: 'Chirp 3 HD - Warm and steady' },
    { id: 'en-US-Chirp3-HD-Aoede', name: 'Aoede', description: 'Chirp 3 HD - Bright and clear' },
    { id: 'en-US-Chirp3-HD-Charon', name: 'Charon', description: 'Chirp 3 HD - Deep and calm' },
    { id: 'en-US-Chirp3-HD-Fenrir', name: 'Fenrir', description: 'Chirp 3 HD - Strong and confident' },
    { id: 'en-US-Chirp3-HD-Kore', name: 'Kore', description: 'Chirp 3 HD - Soft and gentle' },
    { id: 'en-US-Chirp3-HD-Leda', name: 'Leda', description: 'Chirp 3 HD - Professional and friendly' },
    { id: 'en-US-Chirp3-HD-Orus', name: 'Orus', description: 'Chirp 3 HD - Authoritative' },
    { id: 'en-US-Chirp3-HD-Puck', name: 'Puck', description: 'Chirp 3 HD - Energetic and upbeat' },
    { id: 'en-US-Chirp3-HD-Schedar', name: 'Schedar', description: 'Chirp 3 HD - Smooth and reassuring' }
];

export class GoogleProvider extends BaseTTSProvider {
    constructor(config = {}) {
        super(config);
        this.name = 'google';
        this.serviceAccountPath = config.serviceAccountPath || process.env.GOOGLE_APPLICATION_CREDENTIALS;
        this._accessToken = null;
        this._tokenExpiry = null;
    }

    static getRequiredEnvVars() {
        return [
            { name: 'GOOGLE_APPLICATION_CREDENTIALS', required: true, description: 'Path to service account JSON' },
            { name: 'GOOGLE_VOICE', required: false, description: 'Default voice (e.g., en-US-Chirp3-HD-Leda)' },
            { name: 'GOOGLE_LANGUAGE', required: false, description: 'Language code (default: en-US)' }
        ];
    }

    validateConfig() {
        if (!this.serviceAccountPath) {
            throw new Error('GOOGLE_APPLICATION_CREDENTIALS must be set to the path of your service account JSON file');
        }
        
        if (!fs.existsSync(this.serviceAccountPath)) {
            throw new Error(`Service account file not found: ${this.serviceAccountPath}`);
        }
    }

    /**
     * Get OAuth2 access token from service account
     */
    async _getAccessToken() {
        // Return cached token if still valid
        if (this._accessToken && this._tokenExpiry && Date.now() < this._tokenExpiry) {
            return this._accessToken;
        }

        const serviceAccount = JSON.parse(fs.readFileSync(this.serviceAccountPath, 'utf-8'));
        
        // Create JWT
        const now = Math.floor(Date.now() / 1000);
        const header = { alg: 'RS256', typ: 'JWT' };
        const payload = {
            iss: serviceAccount.client_email,
            scope: 'https://www.googleapis.com/auth/cloud-platform',
            aud: 'https://oauth2.googleapis.com/token',
            iat: now,
            exp: now + 3600
        };

        const encodedHeader = Buffer.from(JSON.stringify(header)).toString('base64url');
        const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
        const signatureInput = `${encodedHeader}.${encodedPayload}`;
        
        const sign = crypto.createSign('RSA-SHA256');
        sign.update(signatureInput);
        const signature = sign.sign(serviceAccount.private_key, 'base64url');
        
        const jwt = `${signatureInput}.${signature}`;

        // Exchange JWT for access token
        const response = await fetch('https://oauth2.googleapis.com/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`
        });

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`Failed to get access token: ${error}`);
        }

        const data = await response.json();
        this._accessToken = data.access_token;
        this._tokenExpiry = Date.now() + (data.expires_in - 60) * 1000; // Refresh 1 min early
        
        return this._accessToken;
    }

    getDefaultVoiceId() {
        return process.env.GOOGLE_VOICE || DEFAULT_VOICE;
    }

    getDefaultSettings() {
        return {
            voice: this.getDefaultVoiceId(),
            language: process.env.GOOGLE_LANGUAGE || DEFAULT_LANGUAGE,
            speed: DEFAULT_SPEED,
            pitch: DEFAULT_PITCH
        };
    }

    normalizeSettings(settings) {
        const normalized = { ...settings };
        
        // Map 'voice_id' to 'voice'
        if (settings.voice_id && !settings.voice) {
            normalized.voice = settings.voice_id;
            delete normalized.voice_id;
        }
        
        // Map 'rate' to 'speed'
        if (settings.rate && !settings.speed) {
            // Convert percentage to multiplier if needed
            const rate = settings.rate;
            if (typeof rate === 'string' && rate.includes('%')) {
                const percent = parseFloat(rate.replace('%', '').replace('+', ''));
                normalized.speed = 1 + (percent / 100);
            } else {
                normalized.speed = parseFloat(rate);
            }
            delete normalized.rate;
        }
        
        return normalized;
    }

    async getVoices() {
        this.validateConfig();
        
        const token = await this._getAccessToken();
        
        const response = await fetch('https://texttospeech.googleapis.com/v1/voices', {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ error: { message: 'Unknown error' } }));
            throw new Error(`Failed to fetch voices (${response.status}): ${errorData.error?.message || JSON.stringify(errorData)}`);
        }
        
        const data = await response.json();
        return data.voices
            .filter(v => v.languageCodes.some(lc => lc.startsWith('en')))
            .map(v => ({
                id: v.name,
                name: v.name.split('-').pop(),
                description: `${v.ssmlGender} - ${v.languageCodes.join(', ')}`
            }));
    }

    /**
     * Extract language code from voice name if not specified
     */
    _getLanguageFromVoice(voice) {
        // Voice names like "en-US-Chirp3-HD-Leda" start with language code
        const match = voice.match(/^([a-z]{2}-[A-Z]{2})/);
        return match ? match[1] : DEFAULT_LANGUAGE;
    }

    async generateAudio(text, settings = {}) {
        this.validateConfig();
        
        const normalizedSettings = this.normalizeSettings(settings);
        const defaults = this.getDefaultSettings();
        
        const voice = normalizedSettings.voice || defaults.voice;
        const language = normalizedSettings.language || this._getLanguageFromVoice(voice);
        const speed = parseFloat(normalizedSettings.speed) || defaults.speed;
        const pitch = parseFloat(normalizedSettings.pitch) || defaults.pitch;
        
        // Validate speed
        if (speed < 0.25 || speed > 4.0) {
            throw new Error(`Speed must be between 0.25 and 4.0, got ${speed}`);
        }
        
        // Validate pitch
        if (pitch < -20 || pitch > 20) {
            throw new Error(`Pitch must be between -20 and 20, got ${pitch}`);
        }
        
        const token = await this._getAccessToken();
        
        const requestBody = {
            input: { text },
            voice: {
                languageCode: language,
                name: voice
            },
            audioConfig: {
                audioEncoding: 'MP3',
                speakingRate: speed,
                pitch: pitch
            }
        };
        
        let response;
        try {
            response = await fetch('https://texttospeech.googleapis.com/v1/text:synthesize', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(requestBody)
            });
        } catch (fetchError) {
            const cause = fetchError.cause ? `: ${fetchError.cause.message || fetchError.cause.code}` : '';
            throw new Error(`Network error connecting to Google Cloud TTS API${cause}. Check your internet connection.`);
        }
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ error: { message: 'Unknown error' } }));
            throw new Error(`Google Cloud TTS API error (${response.status}): ${errorData.error?.message || JSON.stringify(errorData)}`);
        }
        
        const data = await response.json();
        
        // Google returns base64-encoded audio
        if (!data.audioContent) {
            throw new Error('No audio content in response');
        }
        
        return Buffer.from(data.audioContent, 'base64');
    }
}
