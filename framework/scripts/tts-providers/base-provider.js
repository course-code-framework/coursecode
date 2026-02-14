/**
 * Base TTS Provider Interface
 * 
 * All TTS providers must extend this class and implement the required methods.
 * This enables easy swapping between providers (ElevenLabs, OpenAI, Azure, etc.)
 */

export class BaseTTSProvider {
    constructor(config = {}) {
        this.config = config;
        this.name = 'base';
    }

    /**
     * Get the provider name for logging/identification
     * @returns {string}
     */
    getName() {
        return this.name;
    }

    /**
     * Validate that the provider is properly configured (API keys, etc.)
     * @throws {Error} If configuration is invalid
     */
    validateConfig() {
        throw new Error('validateConfig() must be implemented by provider');
    }

    /**
     * Get the list of environment variables this provider requires
     * @returns {Array<{name: string, required: boolean, description: string}>}
     */
    static getRequiredEnvVars() {
        return [];
    }

    /**
     * Get available voices for this provider
     * @returns {Promise<Array<{id: string, name: string, description?: string}>>}
     */
    async getVoices() {
        throw new Error('getVoices() must be implemented by provider');
    }

    /**
     * Generate audio from text
     * @param {string} text - The text to convert to speech
     * @param {Object} options - Provider-specific options (voice, model, etc.)
     * @returns {Promise<Buffer>} - Audio buffer (MP3 format preferred)
     */
    async generateAudio(text, _options = {}) {
        throw new Error('generateAudio() must be implemented by provider');
    }

    /**
     * Get the default voice ID for this provider
     * @returns {string}
     */
    getDefaultVoiceId() {
        throw new Error('getDefaultVoiceId() must be implemented by provider');
    }

    /**
     * Get default settings for this provider
     * @returns {Object}
     */
    getDefaultSettings() {
        return {};
    }

    /**
     * Normalize provider-specific settings to a common format
     * This allows course authors to use consistent setting names across providers
     * @param {Object} settings - Settings object (may have provider-specific keys)
     * @returns {Object} - Normalized settings for this provider
     */
    normalizeSettings(settings) {
        return settings;
    }
}
