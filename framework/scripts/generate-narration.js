#!/usr/bin/env node

/* eslint-disable no-console */

/**
 * Narration Generator Script
 * 
 * Generates audio narration from text sources via configurable TTS providers.
 * Supports ElevenLabs, OpenAI, and Azure Cognitive Services.
 * 
 * Narration source: `export const narration` in slide JS files
 *   - Simple: export const narration = `text`;
 *   - Multi-key: export const narration = { slide: `...`, 'modal-id': `...`, 'tab-id': `...` };
 *   - Generates: audio/intro.mp3, audio/intro--modal-id.mp3, audio/intro--tab-id.mp3
 * 
 * Usage:
 *   npm run narration                  # Generate all changed narration
 *   npm run narration -- --force       # Regenerate all narration (ignore cache)
 *   npm run narration -- --dry-run     # Show what would be generated
 *   npm run narration -- --providers   # List available TTS providers
 * 
 * Provider Selection (in priority order):
 *   1. TTS_PROVIDER env var (explicit: elevenlabs, openai, azure)
 *   2. Auto-detect based on available API keys
 *   3. Default to deepgram
 * 
 * Provider Setup:
 *   ElevenLabs: ELEVENLABS_API_KEY (optional: ELEVENLABS_VOICE_ID, ELEVENLABS_MODEL_ID)
 *   OpenAI:     OPENAI_API_KEY (optional: OPENAI_VOICE, OPENAI_MODEL)
 *   Azure:      AZURE_SPEECH_KEY + AZURE_SPEECH_REGION (optional: AZURE_VOICE)
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getActiveProvider, printProviderHelp, listProviders as _listProviders } from './tts-providers/index.js';
import {
    parseSlideNarration as parseSlideNarrationShared,
    hashContent,
    loadNarrationCache,
    narrationCacheKey
} from './narration-parser.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// __dirname = framework/scripts, go up two levels to reach scorm_template
const SCORM_TEMPLATE_DIR = path.resolve(__dirname, '../..');
const ROOT_DIR = path.resolve(SCORM_TEMPLATE_DIR, '..');
const COURSE_DIR = path.join(SCORM_TEMPLATE_DIR, 'course');
const ASSETS_DIR = path.join(COURSE_DIR, 'assets');
const AUDIO_DIR = path.join(ASSETS_DIR, 'audio');

const SLIDES_DIR = path.join(COURSE_DIR, 'slides');
const CACHE_FILE = path.join(SCORM_TEMPLATE_DIR, '.narration-cache.json');

// Parse command line arguments
const args = process.argv.slice(2);
const FORCE_REGENERATE = args.includes('--force');
const DRY_RUN = args.includes('--dry-run');
const VERBOSE = args.includes('--verbose') || args.includes('-v');
const SLIDE_FILTER = args.includes('--slide') ? args[args.indexOf('--slide') + 1] : null;
const SHOW_PROVIDERS = args.includes('--providers') || args.includes('--provider');
const SHOW_HELP = args.includes('--help') || args.includes('-h');
// Rebuild .narration-cache.json from current slide text without calling any
// TTS provider. Useful when audio is committed but the cache is missing
// (e.g. after a fresh clone or migrating a project).
const REBUILD_CACHE = args.includes('--rebuild-cache');

/**
 * Load environment variables from .env file
 * Searches in multiple locations: CWD, SCORM_TEMPLATE_DIR, ROOT_DIR
 */
function loadEnv() {
    const searchPaths = [
        path.join(process.cwd(), '.env'),           // Current working directory (most common)
        path.join(SCORM_TEMPLATE_DIR, '.env'),      // Template directory
        path.join(ROOT_DIR, '.env')                 // Root directory
    ];
    
    for (const envPath of searchPaths) {
        if (fs.existsSync(envPath)) {
            const envContent = fs.readFileSync(envPath, 'utf-8');
            for (const line of envContent.split('\n')) {
                const trimmed = line.trim();
                if (trimmed && !trimmed.startsWith('#')) {
                    const [key, ...valueParts] = trimmed.split('=');
                    const value = valueParts.join('=').replace(/^["']|["']$/g, '');
                    process.env[key.trim()] = value;
                }
            }
            if (VERBOSE) {
                console.log(`   Loaded .env from: ${envPath}`);
            }
            return;
        }
    }
}

/**
 * Load and parse course-config.js to extract audio sources
 */
async function loadCourseConfig() {
    const configPath = path.join(COURSE_DIR, 'course-config.js');
    
    if (!fs.existsSync(configPath)) {
        throw new Error(`Course config not found: ${configPath}`);
    }
    
    // Dynamic import of the ES module
    const configModule = await import(`file://${configPath}`);
    return configModule.courseConfig;
}

/**
 * Recursively find all audio sources in the course structure
 */
function findAudioSources(structure, sources = []) {
    for (const item of structure) {
        // Check slide-level audio
        if (item.audio?.src) {
            sources.push({
                slideId: item.id,
                src: item.audio.src,
                component: item.component,
                type: 'slide'
            });
        }
        
        // Recurse into sections
        if (item.children) {
            findAudioSources(item.children, sources);
        }
    }
    return sources;
}

/**
 * Scan all slide files for component-level narration exports (modal/tab audio).
 * These are narration exports with multi-key format that are NOT referenced in course config.
 */
function findComponentNarrationSources() {
    const sources = [];
    
    if (!fs.existsSync(SLIDES_DIR)) {
        return sources;
    }
    
    const slideFiles = fs.readdirSync(SLIDES_DIR).filter(f => f.endsWith('.js'));
    
    for (const slideFile of slideFiles) {
        const filePath = path.join(SLIDES_DIR, slideFile);
        let content = fs.readFileSync(filePath, 'utf-8');
        
        // Quick check: does the file have a narration export?
        if (!content.includes('export const narration')) {
            continue;
        }
        
        // Remove block comments to avoid matching examples in JSDoc
        content = content.replace(/\/\*[\s\S]*?\*\//g, '');
        
        // Check for narration export
        const exportMatch = content.match(/export\s+const\s+narration\s*=\s*([\s\S]*?);(?=\s*(?:export|async\s+function|function|const|let|var|class|\/\/|\/\*|$))/);
        
        if (exportMatch) {
            const baseName = slideFile.replace('.js', '');
            sources.push({
                slideId: baseName,
                src: `@slides/${slideFile}`,
                component: `@slides/${slideFile}`,
                type: 'component',
                sourceType: 'slide',
                sourcePath: filePath,
                baseName
            });
        }
    }
    
    return sources;
}

/**
 * Determine source type and filter to only generatable sources
 * 
 * Source types:
 *   @slides/file.js     → course/slides/file.js      → course/assets/audio/file.mp3 (+ keyed variants)
 */
function categorizeAndFilterSources(sources) {
    const result = [];
    
    for (const source of sources) {
        const src = source.src;
        
        // Slide file reference (@slides/...)
        if (src.startsWith('@slides/') && src.endsWith('.js')) {
            const slideFile = src.replace('@slides/', '');
            const baseName = slideFile.replace('.js', '');
            result.push({
                ...source,
                sourceType: 'slide',
                sourcePath: path.join(SLIDES_DIR, slideFile),
                baseName
            });
        }
        // Skip other sources (direct .mp3 files, URLs, etc.)
    }
    
    return result;
}

/** Load the narration cache (delegates to shared module) */
function loadCache() {
    return loadNarrationCache(CACHE_FILE);
}

/** Save the narration cache */
function saveCache(cache) {
    fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2));
}

/** Wrapper that injects this script's AUDIO_DIR into the shared parser. */
function parseSlideNarration(filePath, baseName) {
    return parseSlideNarrationShared(filePath, baseName, AUDIO_DIR);
}

// Removed: original inline parseSlideNarration / parseNarrationObject implementations
// now live in framework/scripts/narration-parser.js so the build linter can reuse them.

/**
 * Main execution
 */
async function main() {
    // Handle --providers flag
    if (SHOW_PROVIDERS) {
        loadEnv();
        printProviderHelp(VERBOSE);
        return;
    }
    
    // Handle --help flag
    if (SHOW_HELP) {
        console.log(`
🎙️  Narration Generator

Usage:
   npm run narration                  Generate all changed narration
   npm run narration -- --force          Regenerate all (ignore cache)
   npm run narration -- --dry-run        Preview without generating
   npm run narration -- --slide <id>     Generate specific slide only
   npm run narration -- --rebuild-cache  Rebuild cache from existing audio (no TTS calls)
   npm run narration -- --providers      List available TTS providers
   npm run narration -- --verbose        Show detailed output

Provider Selection:
   Set TTS_PROVIDER env var to: elevenlabs, openai, or azure
   Or configure API keys and provider will be auto-detected.

Examples:
   TTS_PROVIDER=openai npm run narration
   OPENAI_API_KEY=sk-xxx npm run narration
`);
        return;
    }
    
    console.log('🎙️  Narration Generator\n');
    
    // Load environment variables
    loadEnv();
    
    // Initialize TTS provider — skipped in --rebuild-cache mode since we
    // never call the provider when only refreshing the cache file.
    let provider;
    if (REBUILD_CACHE) {
        console.log('🔁 Rebuild-cache mode: hashing existing audio, no TTS calls.\n');
    } else {
        try {
            provider = getActiveProvider();
            provider.validateConfig();
            const defaultVoice = provider.getDefaultVoiceId();
            console.log(`🔊 Using TTS provider: ${provider.getName()} (voice: ${defaultVoice})\n`);
        } catch (error) {
            console.error(`❌ Provider error: ${error.message}\n`);
            printProviderHelp();
            process.exit(1);
        }
    }
    
    // Load course config
    let config;
    try {
        config = await loadCourseConfig();
        console.log(`📚 Loaded course: ${config.metadata?.title || 'Untitled'}\n`);
    } catch (error) {
        console.error(`❌ Failed to load course config: ${error.message}`);
        process.exit(1);
    }
    
    // Find all audio sources from course config and categorize them
    const configSources = findAudioSources(config.structure);
    const generatableSources = categorizeAndFilterSources(configSources);
    
    // Also scan slide files for component-level narration (modal/tab audio)
    const componentSources = findComponentNarrationSources();
    
    // Merge sources, avoiding duplicates (config sources take precedence)
    const configSrcSet = new Set(generatableSources.map(s => s.src));
    for (const compSource of componentSources) {
        if (!configSrcSet.has(compSource.src)) {
            generatableSources.push(compSource);
        }
    }
    
    if (generatableSources.length === 0) {
        console.log('ℹ️  No narration sources found.');
        console.log('   Options:');
        console.log('   • Slide-level: audio: { src: "@slides/intro.js" } in course config');
        console.log('   • Component-level: export const narration = {...} in slide file');
        return;
    }
    
    // Filter by slide ID if specified
    if (SLIDE_FILTER) {
        const beforeCount = generatableSources.length;
        const filtered = generatableSources.filter(s => s.slideId === SLIDE_FILTER || s.baseName === SLIDE_FILTER);
        if (filtered.length === 0) {
            console.log(`❌ No narration source found for slide: ${SLIDE_FILTER}`);
            console.log(`   Available slides: ${generatableSources.map(s => s.slideId || s.baseName).join(', ')}`);
            process.exit(1);
        }
        generatableSources.length = 0;
        generatableSources.push(...filtered);
        console.log(`🎯 Filtered to slide: ${SLIDE_FILTER} (${filtered.length} of ${beforeCount} sources)\n`);
    }

    console.log(`📝 Found ${generatableSources.length} narration source(s)\n`);
    
    // Load cache
    const cache = FORCE_REGENERATE ? {} : loadCache();
    const newCache = {};
    
    let generated = 0;
    let skipped = 0;
    let noNarration = 0;
    let errors = 0;
    
    for (const source of generatableSources) {
        const relativeSrcPath = path.relative(ROOT_DIR, source.sourcePath);
        
        // Check if source file exists
        if (!fs.existsSync(source.sourcePath)) {
            console.log(`   ⚠️  ${source.slideId}: Source not found: ${relativeSrcPath}`);
            errors++;
            continue;
        }
        
        // Parse narration based on source type - returns array of items
        let narrationItems;
        try {
            narrationItems = parseSlideNarration(source.sourcePath, source.baseName);
            
            if (!narrationItems) {
                if (VERBOSE) {
                    console.log(`   ⏭️  ${source.slideId}: No narration export in slide`);
                }
                noNarration++;
                continue;
            }
        } catch (error) {
            console.log(`   ❌ ${source.slideId}: ${error.message}`);
            errors++;
            continue;
        }
        
        // Process each narration item (slide, modals, tabs)
        for (const item of narrationItems) {
            const { key, text, settings, outputPath } = item;
            const relativeOutPath = path.relative(ROOT_DIR, outputPath);
            const contentHash = hashContent(text + JSON.stringify(settings));
            
            // Cache key includes the item key for multi-key narration
            const cacheKey = narrationCacheKey(source.src, key);
            const cachedHash = cache[cacheKey];
            const outputExists = fs.existsSync(outputPath);

            // --rebuild-cache: hash text+settings for existing audio and move on.
            // Never call TTS, never write or delete audio files.
            if (REBUILD_CACHE) {
                if (outputExists) {
                    newCache[cacheKey] = contentHash;
                    skipped++;
                    if (VERBOSE) {
                        const label = key === 'slide' ? source.slideId : `${source.slideId}#${key}`;
                        console.log(`   ✅ ${label}: cached (${path.relative(ROOT_DIR, outputPath)})`);
                    }
                } else if (VERBOSE) {
                    const label = key === 'slide' ? source.slideId : `${source.slideId}#${key}`;
                    console.log(`   ⏭️  ${label}: no audio yet, skipping`);
                }
                continue;
            }

            if (cachedHash === contentHash && outputExists && !FORCE_REGENERATE) {
                if (VERBOSE) {
                    const label = key === 'slide' ? source.slideId : `${source.slideId}#${key}`;
                    console.log(`   ⏭️  ${label}: Unchanged, skipping`);
                }
                newCache[cacheKey] = contentHash;
                skipped++;
                continue;
            }
            
            // Generate audio
            const sourceLabel = '(slide)';
            const keyLabel = key === 'slide' ? '' : ` [${key}]`;
            console.log(`   🔄 ${source.slideId}${keyLabel} ${sourceLabel}`);
            console.log(`      → ${relativeOutPath}`);
            
            if (VERBOSE) {
                console.log(`      Text: "${text.substring(0, 60)}${text.length > 60 ? '...' : ''}"`);
                if (Object.keys(settings).length > 0) {
                    console.log(`      Settings: ${JSON.stringify(settings)}`);
                }
            }
            
            if (DRY_RUN) {
                console.log('      (dry run - skipping generation)');
                generated++;
                continue;
            }
            
            try {
                const audioBuffer = await provider.generateAudio(text, settings);
                
                // Ensure output directory exists
                const outputDir = path.dirname(outputPath);
                if (!fs.existsSync(outputDir)) {
                    fs.mkdirSync(outputDir, { recursive: true });
                }
                
                // Write audio file
                fs.writeFileSync(outputPath, audioBuffer);
                
                // Update cache
                newCache[cacheKey] = contentHash;
                generated++;
                
                console.log(`      ✅ Generated (${(audioBuffer.length / 1024).toFixed(1)} KB)`);
                
            } catch (error) {
                console.log(`      ❌ Error: ${error.message}`);
                errors++;
            }
        }
    }
    
    // Save cache
    if (!DRY_RUN) {
        // Preserve unchanged entries from old cache
        for (const [key, hash] of Object.entries(cache)) {
            if (!(key in newCache)) {
                newCache[key] = hash;
            }
        }
        saveCache(newCache);
    }
    
    // Summary
    console.log('\n' + '─'.repeat(50));
    const parts = [`${generated} generated`, `${skipped} unchanged`];
    if (noNarration > 0) parts.push(`${noNarration} no export`);
    if (errors > 0) parts.push(`${errors} errors`);
    console.log(`✨ Complete: ${parts.join(', ')}`);
    
    if (DRY_RUN) {
        console.log('\n   (This was a dry run. No files were modified.)');
    }
    
    if (errors > 0) {
        process.exit(1);
    }
}

main().catch(error => {
    console.error(`\n❌ Fatal error: ${error.message}`);
    process.exit(1);
});
