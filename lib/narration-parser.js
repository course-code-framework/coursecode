/**
 * Narration Parser - shared static-analysis utilities for narration sources.
 *
 * Used by both:
 *   - framework/scripts/generate-narration.js (audio generation + cache writes)
 *   - lib/build-linter.js                     (stale narration detection)
 *
 * Pure: no TTS calls, no audio I/O. Safe to import in any Node context.
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

// Reserved keys for voice settings (not narration content)
export const VOICE_SETTING_KEYS = [
    'voice_id', 'model_id', 'stability', 'similarity_boost',
    'voice', 'model', 'speed', 'rate', 'pitch', 'style'
];

/**
 * MD5 hash of arbitrary string content. Matches the generator's algorithm so
 * the linter can recompute hashes and compare against `.narration-cache.json`.
 */
export function hashContent(content) {
    return crypto.createHash('md5').update(content).digest('hex');
}

/**
 * Compute the cache key for a narration item, matching the generator's format.
 * `slide` key uses the bare source path; other keys are suffixed with `#key`.
 */
export function narrationCacheKey(sourceSrc, itemKey) {
    return itemKey === 'slide' ? sourceSrc : `${sourceSrc}#${itemKey}`;
}

/**
 * Compute the audio output path for a narration item.
 */
export function narrationAudioPath(audioDir, baseName, itemKey) {
    return itemKey === 'slide'
        ? path.join(audioDir, `${baseName}.mp3`)
        : path.join(audioDir, `${baseName}--${itemKey}.mp3`);
}

/**
 * Load the narration cache file. Returns {} if missing or unreadable.
 */
export function loadNarrationCache(cacheFile) {
    if (!fs.existsSync(cacheFile)) return {};
    try {
        return JSON.parse(fs.readFileSync(cacheFile, 'utf-8'));
    } catch {
        return {};
    }
}

/**
 * Extract narration export from a slide file using static analysis.
 * This avoids importing the module (which would fail due to browser-only deps).
 *
 * Returns null if no narration export is present, otherwise an array of items:
 *   [{ key, text, settings, outputPath }]
 *
 * @param {string} filePath - Absolute path to slide JS file.
 * @param {string} baseName - File stem used to derive output filenames.
 * @param {string} audioDir - Directory where .mp3 files are written.
 */
export function parseSlideNarration(filePath, baseName, audioDir) {
    let content = fs.readFileSync(filePath, 'utf-8');

    // Remove block comments (/* ... */) to avoid matching JSDoc examples
    content = content.replace(/\/\*[\s\S]*?\*\//g, '');
    // Remove single-line comments
    content = content.replace(/\/\/.*$/gm, '');

    // Match the full narration export up to the next top-level statement
    const exportMatch = content.match(
        /export\s+const\s+narration\s*=\s*([\s\S]*?);(?=\s*(?:export|async\s+function|function|const|let|var|class|\/\/|\/\*|$))/
    );

    if (!exportMatch) return null;

    const exportValue = exportMatch[1].trim();

    // Case 1: template literal — export const narration = `text`;
    if (exportValue.startsWith('`') && exportValue.endsWith('`')) {
        return [{
            key: 'slide',
            text: exportValue.slice(1, -1).trim(),
            settings: {},
            outputPath: narrationAudioPath(audioDir, baseName, 'slide')
        }];
    }

    // Case 2: quoted string
    if ((exportValue.startsWith('"') && exportValue.endsWith('"')) ||
        (exportValue.startsWith("'") && exportValue.endsWith("'"))) {
        return [{
            key: 'slide',
            text: exportValue.slice(1, -1).trim(),
            settings: {},
            outputPath: narrationAudioPath(audioDir, baseName, 'slide')
        }];
    }

    // Case 3: object — multi-key or { text, ...settings }
    if (exportValue.startsWith('{')) {
        return parseNarrationObject(exportValue, baseName, audioDir);
    }

    return null;
}

/**
 * Parse a narration object literal with multiple keys and/or voice settings.
 * Handles: { slide: `...`, 'modal-id': `...`, voice_id: '...' }
 *      and { text: `...`, voice_id: '...' }
 */
export function parseNarrationObject(objectStr, baseName, audioDir) {
    const results = [];
    const globalSettings = {};

    const settingPatterns = [
        { key: 'voice_id', regex: /voice_id\s*:\s*['"]([^'"]+)['"]/ },
        { key: 'voice', regex: /voice\s*:\s*['"]([^'"]+)['"]/ },
        { key: 'model_id', regex: /model_id\s*:\s*['"]([^'"]+)['"]/ },
        { key: 'model', regex: /model\s*:\s*['"]([^'"]+)['"]/ },
        { key: 'stability', regex: /stability\s*:\s*([\d.]+)/ },
        { key: 'similarity_boost', regex: /similarity_boost\s*:\s*([\d.]+)/ },
        { key: 'speed', regex: /speed\s*:\s*([\d.]+)/ },
        { key: 'rate', regex: /rate\s*:\s*['"]([^'"]+)['"]/ },
        { key: 'pitch', regex: /pitch\s*:\s*['"]([^'"]+)['"]/ },
        { key: 'style', regex: /style\s*:\s*['"]([^'"]+)['"]/ }
    ];

    for (const { key, regex } of settingPatterns) {
        const match = objectStr.match(regex);
        if (match) globalSettings[key] = match[1];
    }

    // Old format: { text: `...` } single narration with settings
    const singleTextMatch = objectStr.match(/^\s*\{\s*text\s*:\s*`([\s\S]*?)`/);
    if (singleTextMatch && !objectStr.match(/slide\s*:/)) {
        return [{
            key: 'slide',
            text: singleTextMatch[1].trim(),
            settings: globalSettings,
            outputPath: narrationAudioPath(audioDir, baseName, 'slide')
        }];
    }

    // Multi-key with template literals
    const keyValueRegex = /(?:(['"])([\w-]+)\1|(\w+))\s*:\s*`([\s\S]*?)`/g;
    let match;
    while ((match = keyValueRegex.exec(objectStr)) !== null) {
        const key = match[2] || match[3];
        const text = match[4].trim();
        if (VOICE_SETTING_KEYS.includes(key) || key === 'text') continue;
        results.push({
            key,
            text,
            settings: { ...globalSettings },
            outputPath: narrationAudioPath(audioDir, baseName, key)
        });
    }

    // Multi-key with quoted string values
    const quotedValueRegex = /(?:(['"])([\w-]+)\1|(\w+))\s*:\s*(['"])([\s\S]*?)\4/g;
    while ((match = quotedValueRegex.exec(objectStr)) !== null) {
        const key = match[2] || match[3];
        const text = match[5].trim();
        if (VOICE_SETTING_KEYS.includes(key) || key === 'text') continue;
        if (results.some(r => r.key === key)) continue;
        results.push({
            key,
            text,
            settings: { ...globalSettings },
            outputPath: narrationAudioPath(audioDir, baseName, key)
        });
    }

    return results.length > 0 ? results : null;
}

/**
 * Classify the freshness of a single narration item. Pure function — caller
 * supplies the parsed item, the cached hash, and the audio file existence flag.
 *
 * Returns one of:
 *   'ok'      - audio exists AND cached hash matches current text+settings
 *   'stale'   - audio exists AND cached hash differs (or no cache entry)
 *   'missing' - text defined but audio file does not exist
 *   'unknown' - audio exists but no cache file at all (can't determine; caller
 *               typically suppresses these to avoid noise on fresh clones)
 */
export function classifyNarrationFreshness({ item, cachedHash, audioExists, cacheLoaded }) {
    const currentHash = hashContent(item.text + JSON.stringify(item.settings || {}));

    if (!audioExists) return 'missing';
    if (!cacheLoaded) return 'unknown';
    if (cachedHash === currentHash) return 'ok';
    return 'stale';
}
