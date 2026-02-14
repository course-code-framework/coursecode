/**
 * Deepgram TTS Provider (Aura)
 * 
 * Deepgram's Aura text-to-speech with fast, natural-sounding voices.
 * 
 * Environment variables:
 *   DEEPGRAM_API_KEY  - Required: Your Deepgram API key
 *   DEEPGRAM_VOICE    - Optional: Default voice (default: aura-2-orion-en)
 * 
 * Voice settings (per-narration):
 *   voice  - Voice name (e.g., aura-2-orion-en, aura-2-luna-en)
 * 
 * Available Aura 2 voices:
 *   aura-2-asteria-en  - Female, American, warm and conversational
 *   aura-2-luna-en     - Female, American, soft and calm
 *   aura-2-stella-en   - Female, American, confident and clear
 *   aura-2-athena-en   - Female, British, refined and articulate
 *   aura-2-hera-en     - Female, American, authoritative
 *   aura-2-orion-en    - Male, American, deep and steady
 *   aura-2-arcas-en    - Male, American, energetic and upbeat
 *   aura-2-perseus-en  - Male, American, warm and friendly
 *   aura-2-angus-en    - Male, Irish, warm and friendly
 *   aura-2-orpheus-en  - Male, American, smooth and rich
 *   aura-2-helios-en   - Male, British, refined
 *   aura-2-zeus-en     - Male, American, authoritative
 */

import { BaseTTSProvider } from './base-provider.js';

// Default settings
const DEFAULT_VOICE = 'aura-2-hermes-en';

// Available Aura 2 voices
const AURA_VOICES = [
    { id: 'aura-2-asteria-en', name: 'Asteria', description: 'Female, American - warm and conversational' },
    { id: 'aura-2-luna-en', name: 'Luna', description: 'Female, American - soft and calm' },
    { id: 'aura-2-stella-en', name: 'Stella', description: 'Female, American - confident and clear' },
    { id: 'aura-2-athena-en', name: 'Athena', description: 'Female, British - refined and articulate' },
    { id: 'aura-2-hera-en', name: 'Hera', description: 'Female, American - authoritative' },
    { id: 'aura-2-orion-en', name: 'Orion', description: 'Male, American - deep and steady' },
    { id: 'aura-2-arcas-en', name: 'Arcas', description: 'Male, American - energetic and upbeat' },
    { id: 'aura-2-perseus-en', name: 'Perseus', description: 'Male, American - warm and friendly' },
    { id: 'aura-2-angus-en', name: 'Angus', description: 'Male, Irish - warm and friendly' },
    { id: 'aura-2-orpheus-en', name: 'Orpheus', description: 'Male, American - smooth and rich' },
    { id: 'aura-2-helios-en', name: 'Helios', description: 'Male, British - refined' },
    { id: 'aura-2-zeus-en', name: 'Zeus', description: 'Male, American - authoritative' }
];

export class DeepgramProvider extends BaseTTSProvider {
    constructor(config = {}) {
        super(config);
        this.name = 'deepgram';
        this.apiKey = config.apiKey || process.env.DEEPGRAM_API_KEY;
    }

    static getRequiredEnvVars() {
        return [
            { name: 'DEEPGRAM_API_KEY', required: true, description: 'Deepgram API key' },
            { name: 'DEEPGRAM_VOICE', required: false, description: 'Default voice (e.g., aura-asteria-en)' }
        ];
    }

    validateConfig() {
        if (!this.apiKey) {
            throw new Error('DEEPGRAM_API_KEY not set in environment or .env file');
        }
        
        const trimmedKey = this.apiKey.trim();
        if (trimmedKey !== this.apiKey || !trimmedKey) {
            throw new Error('DEEPGRAM_API_KEY contains invalid whitespace - check your .env file');
        }
    }

    getDefaultVoiceId() {
        return process.env.DEEPGRAM_VOICE || DEFAULT_VOICE;
    }

    getDefaultSettings() {
        return {
            voice: this.getDefaultVoiceId()
        };
    }

    normalizeSettings(settings) {
        const normalized = { ...settings };
        
        // Map 'voice_id' to 'voice'
        if (settings.voice_id && !settings.voice) {
            normalized.voice = settings.voice_id;
            delete normalized.voice_id;
        }
        
        return normalized;
    }

    async getVoices() {
        // Deepgram voices are fixed, no API call needed
        return AURA_VOICES;
    }

    async generateAudio(text, settings = {}) {
        this.validateConfig();
        
        const normalizedSettings = this.normalizeSettings(settings);
        const defaults = this.getDefaultSettings();
        
        const voice = normalizedSettings.voice || defaults.voice;
        
        // Deepgram TTS endpoint
        const url = `https://api.deepgram.com/v1/speak?model=${voice}`;
        
        let response;
        try {
            response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Authorization': `Token ${this.apiKey.trim()}`,
                    'Content-Type': 'text/plain'
                },
                body: text
            });
        } catch (fetchError) {
            const cause = fetchError.cause ? `: ${fetchError.cause.message || fetchError.cause.code}` : '';
            throw new Error(`Network error connecting to Deepgram API${cause}. Check your internet connection.`);
        }
        
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Deepgram API error (${response.status}): ${errorText}`);
        }
        
        // Deepgram returns audio directly (not base64)
        return Buffer.from(await response.arrayBuffer());
    }
}
