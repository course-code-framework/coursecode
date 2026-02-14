/**
 * TTS Provider Registry
 * 
 * Manages available TTS providers and handles provider selection.
 * 
 * Provider Selection Priority:
 *   1. TTS_PROVIDER environment variable (explicit selection)
 *   2. Auto-detect based on available API keys
 *   3. Default to deepgram
 * 
 * Environment Variables:
 *   TTS_PROVIDER - Explicit provider selection: elevenlabs, openai, azure
 */

import { ElevenLabsProvider } from './elevenlabs-provider.js';
import { OpenAIProvider } from './openai-provider.js';
import { AzureProvider } from './azure-provider.js';
import { GoogleProvider } from './google-provider.js';
import { DeepgramProvider } from './deepgram-provider.js';

// Provider registry
const PROVIDERS = {
    elevenlabs: ElevenLabsProvider,
    openai: OpenAIProvider,
    azure: AzureProvider,
    google: GoogleProvider,
    deepgram: DeepgramProvider
};

// Provider aliases for convenience
const PROVIDER_ALIASES = {
    '11labs': 'elevenlabs',
    'eleven': 'elevenlabs',
    'gpt': 'openai',
    'chatgpt': 'openai',
    'microsoft': 'azure',
    'cognitive': 'azure',
    'chirp': 'google',
    'gcloud': 'google',
    'googlecloud': 'google',
    'aura': 'deepgram'
};

/**
 * Get a provider instance by name
 * @param {string} name - Provider name or alias
 * @param {Object} config - Optional provider configuration
 * @returns {BaseTTSProvider}
 */
export function getProvider(name, config = {}) {
    // Resolve aliases
    const resolvedName = PROVIDER_ALIASES[name?.toLowerCase()] || name?.toLowerCase();
    
    const ProviderClass = PROVIDERS[resolvedName];
    if (!ProviderClass) {
        const available = Object.keys(PROVIDERS).join(', ');
        throw new Error(`Unknown TTS provider '${name}'. Available providers: ${available}`);
    }
    
    return new ProviderClass(config);
}

/**
 * Auto-detect the best available provider based on configured API keys
 * @returns {string|null} Provider name or null if none configured
 */
export function detectProvider() {
    // Check each provider's required env vars
    if (process.env.ELEVENLABS_API_KEY) {
        return 'elevenlabs';
    }
    if (process.env.OPENAI_API_KEY) {
        return 'openai';
    }
    if (process.env.AZURE_SPEECH_KEY && process.env.AZURE_SPEECH_REGION) {
        return 'azure';
    }
    if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
        return 'google';
    }
    if (process.env.DEEPGRAM_API_KEY) {
        return 'deepgram';
    }
    return null;
}

/**
 * Get the active provider based on environment configuration
 * @param {Object} config - Optional provider configuration
 * @returns {BaseTTSProvider}
 */
export function getActiveProvider(config = {}) {
    // 1. Explicit selection via TTS_PROVIDER
    let providerName = process.env.TTS_PROVIDER;
    
    // 2. Auto-detect from available API keys
    if (!providerName) {
        providerName = detectProvider();
    }
    
    // 3. Default to deepgram
    if (!providerName) {
        providerName = 'deepgram';
    }
    
    return getProvider(providerName, config);
}

/**
 * List all available providers with their configuration status
 * @returns {Array<{name: string, configured: boolean, envVars: Array}>}
 */
export function listProviders() {
    return Object.entries(PROVIDERS).map(([name, ProviderClass]) => {
        const envVars = ProviderClass.getRequiredEnvVars();
        const configured = envVars
            .filter(v => v.required)
            .every(v => !!process.env[v.name]);
        
        return {
            name,
            configured,
            envVars
        };
    });
}

/**
 * Print provider configuration help
 * @param {boolean} verbose - Include all env vars, not just required
 */
export function printProviderHelp(verbose = false) {
    console.warn('\n📢 Available TTS Providers:\n');
    
    for (const [name, ProviderClass] of Object.entries(PROVIDERS)) {
        const envVars = ProviderClass.getRequiredEnvVars();
        const requiredVars = envVars.filter(v => v.required);
        const configured = requiredVars.every(v => !!process.env[v.name]);
        
        const status = configured ? '✅' : '❌';
        console.warn(`   ${status} ${name}`);
        
        if (verbose || !configured) {
            for (const v of envVars) {
                const isSet = !!process.env[v.name];
                const required = v.required ? '(required)' : '(optional)';
                const setStatus = isSet ? '✓' : '✗';
                console.warn(`      ${setStatus} ${v.name} ${required} - ${v.description}`);
            }
            console.warn('');
        }
    }
    
    console.warn('   Set TTS_PROVIDER=<name> to explicitly select a provider.\n');
}

// Export provider classes for direct use
export { ElevenLabsProvider, OpenAIProvider, AzureProvider, GoogleProvider, DeepgramProvider };
