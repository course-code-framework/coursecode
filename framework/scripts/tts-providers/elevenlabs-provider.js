/**
 * ElevenLabs TTS Provider
 * 
 * High-quality AI voice synthesis with customizable voice settings.
 * 
 * Environment variables:
 *   ELEVENLABS_API_KEY    - Required: Your ElevenLabs API key
 *   ELEVENLABS_VOICE_ID   - Optional: Default voice ID (default: Rachel)
 *   ELEVENLABS_MODEL_ID   - Optional: Model to use (default: eleven_v3)
 * 
 * Voice settings (per-narration):
 *   voice_id         - Voice to use
 *   model_id         - Model to use
 *   stability        - Voice stability (0-1, default: 0.5)
 *   similarity_boost - Voice similarity (0-1, default: 0.75)
 */

import { BaseTTSProvider } from './base-provider.js';

// Default voice settings
const DEFAULT_VOICE_ID = 'S9UjcNYIwfBOtZiDnIQT';
const DEFAULT_MODEL_ID = 'eleven_v3';
const DEFAULT_STABILITY = 0.5;
const DEFAULT_SIMILARITY_BOOST = 0.75;

export class ElevenLabsProvider extends BaseTTSProvider {
    constructor(config = {}) {
        super(config);
        this.name = 'elevenlabs';
        this.apiKey = config.apiKey || process.env.ELEVENLABS_API_KEY;
    }

    static getRequiredEnvVars() {
        return [
            { name: 'ELEVENLABS_API_KEY', required: true, description: 'ElevenLabs API key' },
            { name: 'ELEVENLABS_VOICE_ID', required: false, description: 'Default voice ID (default: Rachel)' },
            { name: 'ELEVENLABS_MODEL_ID', required: false, description: 'Model ID (default: eleven_v3)' }
        ];
    }

    validateConfig() {
        if (!this.apiKey) {
            throw new Error('ELEVENLABS_API_KEY not set in environment or .env file');
        }
        
        const trimmedKey = this.apiKey.trim();
        if (trimmedKey !== this.apiKey || !trimmedKey) {
            throw new Error('ELEVENLABS_API_KEY contains invalid whitespace - check your .env file');
        }
    }

    getDefaultVoiceId() {
        return process.env.ELEVENLABS_VOICE_ID || DEFAULT_VOICE_ID;
    }

    getDefaultSettings() {
        return {
            voice_id: this.getDefaultVoiceId(),
            model_id: process.env.ELEVENLABS_MODEL_ID || DEFAULT_MODEL_ID,
            stability: DEFAULT_STABILITY,
            similarity_boost: DEFAULT_SIMILARITY_BOOST
        };
    }

    normalizeSettings(settings) {
        // ElevenLabs uses its own naming convention, map common names
        const normalized = { ...settings };
        
        // Map common 'voice' to 'voice_id'
        if (settings.voice && !settings.voice_id) {
            normalized.voice_id = settings.voice;
            delete normalized.voice;
        }
        
        // Map common 'model' to 'model_id'
        if (settings.model && !settings.model_id) {
            normalized.model_id = settings.model;
            delete normalized.model;
        }
        
        return normalized;
    }

    async getVoices() {
        this.validateConfig();
        
        const response = await fetch('https://api.elevenlabs.io/v1/voices', {
            headers: {
                'xi-api-key': this.apiKey.trim()
            }
        });
        
        if (!response.ok) {
            throw new Error(`Failed to fetch voices: ${response.status}`);
        }
        
        const data = await response.json();
        return data.voices.map(v => ({
            id: v.voice_id,
            name: v.name,
            description: v.description || v.labels?.description
        }));
    }

    async generateAudio(text, settings = {}) {
        this.validateConfig();
        
        const normalizedSettings = this.normalizeSettings(settings);
        const defaults = this.getDefaultSettings();
        
        const voiceId = normalizedSettings.voice_id || defaults.voice_id;
        const modelId = normalizedSettings.model_id || defaults.model_id;
        const stability = parseFloat(normalizedSettings.stability) || defaults.stability;
        const similarityBoost = parseFloat(normalizedSettings.similarity_boost) || defaults.similarity_boost;
        
        const url = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`;
        
        let response;
        try {
            response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Accept': 'audio/mpeg',
                    'Content-Type': 'application/json',
                    'xi-api-key': this.apiKey.trim()
                },
                body: JSON.stringify({
                    text,
                    model_id: modelId,
                    voice_settings: {
                        stability,
                        similarity_boost: similarityBoost
                    }
                })
            });
        } catch (fetchError) {
            const cause = fetchError.cause ? `: ${fetchError.cause.message || fetchError.cause.code}` : '';
            throw new Error(`Network error connecting to ElevenLabs API${cause}. Check your internet connection and proxy settings.`);
        }
        
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`ElevenLabs API error (${response.status}): ${errorText}`);
        }
        
        return Buffer.from(await response.arrayBuffer());
    }
}
