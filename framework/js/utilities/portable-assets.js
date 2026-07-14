/**
 * Runtime helpers for CourseCode portable HTML exports.
 *
 * Normal LMS and hosted builds do not define the global asset map, so every
 * helper is a cheap no-op outside a portable build.
 */

const URL_ATTRIBUTES = [
    'src',
    'href',
    'poster',
    'data-src',
    'data-audio-src',
    'data-video-src',
    'data-video-poster',
    'data-video-captions',
    'data-lightbox-src',
    'data-lightbox-thumbnail',
    'data-md-src'
];

function getAssetMap() {
    if (typeof window === 'undefined') return null;
    const map = window.__COURSECODE_PORTABLE_ASSETS__;
    return map && typeof map === 'object' ? map : null;
}

function stripQueryAndHash(value) {
    return value.split('#', 1)[0].split('?', 1)[0];
}

function candidateKeys(value) {
    const clean = stripQueryAndHash(value)
        .replace(/\\/g, '/')
        .replace(/^(?:\.\/)+/, '')
        .replace(/^\//, '');
    const keys = new Set([clean]);

    if (clean.startsWith('course/')) keys.add(clean.slice('course/'.length));
    if (clean.startsWith('course/assets/')) {
        const relative = clean.slice('course/assets/'.length);
        keys.add(`assets/${relative}`);
        keys.add(relative);
    } else if (clean.startsWith('assets/')) {
        const relative = clean.slice('assets/'.length);
        keys.add(`course/assets/${relative}`);
        keys.add(relative);
    } else if (clean && !clean.startsWith('_')) {
        keys.add(`course/assets/${clean}`);
        keys.add(`assets/${clean}`);
    }

    return keys;
}

/**
 * Resolve a course-relative URL to its embedded data URL when running from a
 * portable HTML export.
 * @param {string} value
 * @returns {string}
 */
export function resolvePortableAssetUrl(value) {
    if (typeof value !== 'string' || value.length === 0) return value;
    if (/^(?:data:|blob:|https?:|mailto:|tel:|#|\/\/)/i.test(value)) return value;

    const map = getAssetMap();
    if (!map) return value;

    for (const key of candidateKeys(value)) {
        if (typeof map[key] === 'string') return map[key];
    }
    return value;
}

/**
 * Resolve an author-facing course asset path for both normal and portable builds.
 * Component APIs may use paths relative to course/assets (for example,
 * "images/diagram.svg") or the legacy "assets/..." form documented by older
 * CourseCode releases. Direct HTML should use "course/assets/...".
 * @param {string} value
 * @returns {string}
 */
export function resolveCourseAssetUrl(value) {
    if (typeof value !== 'string' || value.length === 0) return value;

    const portableValue = resolvePortableAssetUrl(value);
    if (portableValue !== value) return portableValue;
    if (/^(?:data:|blob:|https?:|mailto:|tel:|#|\/\/)/i.test(value)) return value;
    if (value.startsWith('/') || value.startsWith('./') || value.startsWith('../')) return value;
    if (value.startsWith('course/assets/')) return `./${value}`;
    if (value.startsWith('assets/')) return `./course/${value}`;
    return `./course/assets/${value}`;
}

/**
 * Rewrite URL-bearing attributes in freshly rendered slide DOM before
 * declarative components initialize and begin loading media.
 * @param {HTMLElement} root
 */
export function rewritePortableAssetAttributes(root) {
    if (!root || !getAssetMap()) return;

    const elements = [root, ...root.querySelectorAll('*')];
    for (const element of elements) {
        for (const attribute of URL_ATTRIBUTES) {
            if (!element.hasAttribute?.(attribute)) continue;
            const current = element.getAttribute(attribute);
            const resolved = resolvePortableAssetUrl(current);
            if (resolved !== current) element.setAttribute(attribute, resolved);
        }

        const style = element.getAttribute?.('style');
        if (!style || !style.includes('url(')) continue;
        const rewritten = style.replace(/url\((['"]?)([^)'"\s]+)\1\)/g, (match, quote, url) => {
            const resolved = resolvePortableAssetUrl(url);
            return resolved === url ? match : `url(${quote}${resolved}${quote})`;
        });
        if (rewritten !== style) element.setAttribute('style', rewritten);
    }
}

/**
 * Replace asset-looking strings inside course configuration objects. This
 * covers branding, narration, and programmatic component configuration that
 * never appears as DOM until after managers initialize.
 * @param {unknown} value
 * @param {WeakSet<object>} [seen]
 * @returns {unknown}
 */
export function hydratePortableAssetObject(value, seen = new WeakSet()) {
    if (!getAssetMap()) return value;
    if (typeof value === 'string') return resolvePortableAssetUrl(value);
    if (!value || typeof value !== 'object' || seen.has(value)) return value;

    seen.add(value);
    if (Array.isArray(value)) {
        for (let index = 0; index < value.length; index++) {
            value[index] = hydratePortableAssetObject(value[index], seen);
        }
        return value;
    }

    for (const [key, child] of Object.entries(value)) {
        value[key] = hydratePortableAssetObject(child, seen);
    }
    return value;
}

export function isPortableHtml() {
    return Boolean(getAssetMap());
}
