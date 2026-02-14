/**
 * OpenAI TTS Provider
 * 
 * Uses OpenAI's Text-to-Speech API with natural-sounding voices.
 * 
 * Environment variables:
 *   OPENAI_API_KEY  - Required: Your OpenAI API key
 *   OPENAI_VOICE    - Optional: Default voice (alloy, echo, fable, onyx, nova, shimmer)
 *   OPENAI_MODEL    - Optional: Model to use (tts-1, tts-1-hd)
 * 
 * Voice settings (per-narration):
 *   voice  - Voice name (alloy, echo, fable, onyx, nova, shimmer)
 *   model  - Model to use (tts-1 for speed, tts-1-hd for quality)
 *   speed  - Speed multiplier (0.25-4.0, default: 1.0)
 */

import { BaseTTSProvider } from './base-provider.js';

// Default settings
const DEFAULT_VOICE = 'alloy';
const DEFAULT_MODEL = 'tts-1';
const DEFAULT_SPEED = 1.0;

// Available voices
const AVAILABLE_VOICES = [
    { id: 'alloy', name: 'Alloy', description: 'Neutral and balanced' },
    { id: 'echo', name: 'Echo', description: 'Warm and conversational' },
    { id: 'fable', name: 'Fable', description: 'Expressive and British-accented' },
    { id: 'onyx', name: 'Onyx', description: 'Deep and authoritative' },
    { id: 'nova', name: 'Nova', description: 'Friendly and upbeat' },
    { id: 'shimmer', name: 'Shimmer', description: 'Clear and pleasant' }
];

export class OpenAIProvider extends BaseTTSProvider {
    constructor(config = {}) {
        super(config);
        this.name = 'openai';
        this.apiKey = config.apiKey || process.env.OPENAI_API_KEY;
    }

    static getRequiredEnvVars() {
        return [
            { name: 'OPENAI_API_KEY', required: true, description: 'OpenAI API key' },
            { name: 'OPENAI_VOICE', required: false, description: 'Default voice (alloy, echo, fable, onyx, nova, shimmer)' },
            { name: 'OPENAI_MODEL', required: false, description: 'Model (tts-1 or tts-1-hd)' }
        ];
    }

    validateConfig() {
        if (!this.apiKey) {
            throw new Error('OPENAI_API_KEY not set in environment or .env file');
        }
        
        const trimmedKey = this.apiKey.trim();
        if (trimmedKey !== this.apiKey || !trimmedKey) {
            throw new Error('OPENAI_API_KEY contains invalid whitespace - check your .env file');
        }
    }

    getDefaultVoiceId() {
        return process.env.OPENAI_VOICE || DEFAULT_VOICE;
    }

    getDefaultSettings() {
        return {
            voice: this.getDefaultVoiceId(),
            model: process.env.OPENAI_MODEL || DEFAULT_MODEL,
            speed: DEFAULT_SPEED
        };
    }

    normalizeSettings(settings) {
        const normalized = { ...settings };
        
        // Map 'voice_id' to 'voice' (from ElevenLabs format)
        if (settings.voice_id && !settings.voice) {
            normalized.voice = settings.voice_id;
            delete normalized.voice_id;
        }
        
        // Map 'model_id' to 'model'
        if (settings.model_id && !settings.model) {
            normalized.model = settings.model_id;
            delete normalized.model_id;
        }
        
        return normalized;
    }

    async getVoices() {
        // OpenAI voices are fixed, no API call needed
        return AVAILABLE_VOICES;
    }

    async generateAudio(text, settings = {}) {
        this.validateConfig();
        
        const normalizedSettings = this.normalizeSettings(settings);
        const defaults = this.getDefaultSettings();
        
        const voice = normalizedSettings.voice || defaults.voice;
        const model = normalizedSettings.model || defaults.model;
        const speed = parseFloat(normalizedSettings.speed) || defaults.speed;
        
        // Validate voice
        if (!AVAILABLE_VOICES.some(v => v.id === voice)) {
            throw new Error(`Invalid voice '${voice}'. Available: ${AVAILABLE_VOICES.map(v => v.id).join(', ')}`);
        }
        
        // Validate speed
        if (speed < 0.25 || speed > 4.0) {
            throw new Error(`Speed must be between 0.25 and 4.0, got ${speed}`);
        }
        
        let response;
        try {
            response = await fetch('https://api.openai.com/v1/audio/speech', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.apiKey.trim()}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    model,
                    input: text,
                    voice,
                    speed,
                    response_format: 'mp3'
                })
            });
        } catch (fetchError) {
            const cause = fetchError.cause ? `: ${fetchError.cause.message || fetchError.cause.code}` : '';
            throw new Error(`Network error connecting to OpenAI API${cause}. Check your internet connection.`);
        }
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ error: { message: 'Unknown error' } }));
            throw new Error(`OpenAI API error (${response.status}): ${errorData.error?.message || JSON.stringify(errorData)}`);
        }
        
        return Buffer.from(await response.arrayBuffer());
    }
}
