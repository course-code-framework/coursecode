/**
 * Azure Cognitive Services TTS Provider
 * 
 * Microsoft's neural TTS with extensive language and voice support.
 * 
 * Environment variables:
 *   AZURE_SPEECH_KEY      - Required: Your Azure Speech service key
 *   AZURE_SPEECH_REGION   - Required: Azure region (e.g., eastus, westeurope)
 *   AZURE_VOICE           - Optional: Default voice name (e.g., en-US-JennyNeural)
 * 
 * Voice settings (per-narration):
 *   voice  - Full voice name (e.g., en-US-JennyNeural)
 *   style  - Speaking style (e.g., cheerful, sad, angry) - neural voices only
 *   rate   - Speaking rate (e.g., "+10%", "-20%", "1.2")
 *   pitch  - Pitch adjustment (e.g., "+5%", "-10%")
 */

import { BaseTTSProvider } from './base-provider.js';

// Default settings
const DEFAULT_VOICE = 'en-US-JennyNeural';
const DEFAULT_OUTPUT_FORMAT = 'audio-24khz-48kbitrate-mono-mp3';

export class AzureProvider extends BaseTTSProvider {
    constructor(config = {}) {
        super(config);
        this.name = 'azure';
        this.apiKey = config.apiKey || process.env.AZURE_SPEECH_KEY;
        this.region = config.region || process.env.AZURE_SPEECH_REGION;
    }

    static getRequiredEnvVars() {
        return [
            { name: 'AZURE_SPEECH_KEY', required: true, description: 'Azure Speech service key' },
            { name: 'AZURE_SPEECH_REGION', required: true, description: 'Azure region (e.g., eastus)' },
            { name: 'AZURE_VOICE', required: false, description: 'Default voice (e.g., en-US-JennyNeural)' }
        ];
    }

    validateConfig() {
        if (!this.apiKey) {
            throw new Error('AZURE_SPEECH_KEY not set in environment or .env file');
        }
        if (!this.region) {
            throw new Error('AZURE_SPEECH_REGION not set in environment or .env file');
        }
    }

    getDefaultVoiceId() {
        return process.env.AZURE_VOICE || DEFAULT_VOICE;
    }

    getDefaultSettings() {
        return {
            voice: this.getDefaultVoiceId(),
            style: null,
            rate: null,
            pitch: null
        };
    }

    normalizeSettings(settings) {
        const normalized = { ...settings };
        
        // Map 'voice_id' to 'voice'
        if (settings.voice_id && !settings.voice) {
            normalized.voice = settings.voice_id;
            delete normalized.voice_id;
        }
        
        // Map 'speed' to 'rate'
        if (settings.speed && !settings.rate) {
            // Convert numeric speed to percentage
            const speed = parseFloat(settings.speed);
            if (!isNaN(speed)) {
                const percent = Math.round((speed - 1) * 100);
                normalized.rate = percent >= 0 ? `+${percent}%` : `${percent}%`;
            }
            delete normalized.speed;
        }
        
        return normalized;
    }

    async getVoices() {
        this.validateConfig();
        
        const url = `https://${this.region}.tts.speech.microsoft.com/cognitiveservices/voices/list`;
        
        const response = await fetch(url, {
            headers: {
                'Ocp-Apim-Subscription-Key': this.apiKey
            }
        });
        
        if (!response.ok) {
            throw new Error(`Failed to fetch voices: ${response.status}`);
        }
        
        const voices = await response.json();
        return voices.map(v => ({
            id: v.ShortName,
            name: v.DisplayName,
            description: `${v.LocaleName} - ${v.VoiceType}`
        }));
    }

    /**
     * Build SSML for the request
     */
    _buildSSML(text, settings) {
        const voice = settings.voice || this.getDefaultVoiceId();
        
        // Build prosody attributes
        const prosodyAttrs = [];
        if (settings.rate) prosodyAttrs.push(`rate="${settings.rate}"`);
        if (settings.pitch) prosodyAttrs.push(`pitch="${settings.pitch}"`);
        
        // Build express-as for style (neural voices only)
        let content = this._escapeXml(text);
        
        if (settings.style) {
            content = `<mstts:express-as style="${settings.style}">${content}</mstts:express-as>`;
        }
        
        if (prosodyAttrs.length > 0) {
            content = `<prosody ${prosodyAttrs.join(' ')}>${content}</prosody>`;
        }
        
        return `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xmlns:mstts="http://www.w3.org/2001/mstts" xml:lang="en-US">
    <voice name="${voice}">
        ${content}
    </voice>
</speak>`;
    }

    _escapeXml(text) {
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&apos;');
    }

    async generateAudio(text, settings = {}) {
        this.validateConfig();
        
        const normalizedSettings = this.normalizeSettings(settings);
        const ssml = this._buildSSML(text, normalizedSettings);
        
        const url = `https://${this.region}.tts.speech.microsoft.com/cognitiveservices/v1`;
        
        let response;
        try {
            response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Ocp-Apim-Subscription-Key': this.apiKey,
                    'Content-Type': 'application/ssml+xml',
                    'X-Microsoft-OutputFormat': DEFAULT_OUTPUT_FORMAT,
                    'User-Agent': 'SCORMNarrationGenerator'
                },
                body: ssml
            });
        } catch (fetchError) {
            const cause = fetchError.cause ? `: ${fetchError.cause.message || fetchError.cause.code}` : '';
            throw new Error(`Network error connecting to Azure Speech API${cause}. Check your internet connection.`);
        }
        
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Azure Speech API error (${response.status}): ${errorText}`);
        }
        
        return Buffer.from(await response.arrayBuffer());
    }
}
