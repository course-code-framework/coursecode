/** Escape text inserted into XML element content. */
export function escapeXmlText(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

/** Escape text inserted into a double-quoted XML attribute. */
export function escapeXmlAttribute(value) {
    return escapeXmlText(value)
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

/**
 * Percent-encode a relative package path for use as an xs:anyURI href.
 * Each segment is encoded separately so `/` separators survive, while
 * characters with URI meaning (`%`, `#`, `?`, `[`, `]`, spaces, non-ASCII)
 * are escaped. Path-safe sub-delimiters are kept readable. The result still
 * needs XML attribute escaping (e.g. `&`).
 */
export function encodeUriPath(value) {
    return String(value ?? '')
        .split('/')
        .map(segment => encodeURIComponent(segment)
            .replace(/%(24|26|2B|2C|3B|3D|40)/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16))))
        .join('/');
}

/**
 * Small, dependency-free, stable string hash (FNV-1a, 32-bit) rendered as
 * 8 lowercase hex characters. Used only to keep identifiers distinct when an
 * authored title cannot be represented in ASCII; it is not a security hash.
 */
export function stableHash(value) {
    const input = String(value ?? '').normalize('NFC');
    let hash = 0x811c9dc5;
    for (const char of input) {
        let codePoint = char.codePointAt(0);
        // Mix every byte of the code point so all scripts contribute evenly.
        do {
            hash ^= codePoint & 0xff;
            hash = Math.imul(hash, 0x01000193) >>> 0;
            codePoint = Math.floor(codePoint / 256);
        } while (codePoint > 0);
    }
    return hash.toString(16).padStart(8, '0');
}

const NON_ASCII_ALNUM = /(?!\p{ASCII})[\p{L}\p{N}]/u;

/**
 * Derive an ASCII identifier slug from authored text (usually a course title).
 *
 * The historical slug (non-ASCII characters dropped) is kept whenever it is
 * non-empty, so existing package identifiers never change on upgrade. Only
 * when nothing representable remains (e.g. "安全研修", which used to collapse
 * to the shared generic "course" ID) is a stable hash of the full text used,
 * so distinct titles get distinct IDs.
 *
 * @param {string} value - Authored text
 * @param {object} [options]
 * @param {boolean} [options.lowercase=false] - Lowercase and restrict to [a-z0-9-]
 * @param {string} [options.fallback='course'] - Prefix for a hash-only slug
 * @returns {{ slug: string, hashed: boolean }} slug may be '' for empty/punctuation-only ASCII input
 */
export function deriveIdentifierSlug(value, { lowercase = false, fallback = 'course' } = {}) {
    const raw = String(value ?? '').trim();
    const source = lowercase ? raw.toLowerCase() : raw;
    let slug = source
        .replace(lowercase ? /[^a-z0-9]+/g : /[^A-Za-z0-9_.-]+/g, '-')
        .replace(/^-+|-+$/g, '');

    const hashed = slug === '' && NON_ASCII_ALNUM.test(raw);
    if (hashed) {
        slug = `${fallback}-${stableHash(raw)}`;
    }
    return { slug, hashed };
}

/** Create a conservative ASCII XML ID (xsd:ID) from authored text. */
export function makeXmlId(value, fallback = 'course') {
    const { slug } = deriveIdentifierSlug(value, { fallback });
    const candidate = slug || fallback;
    return /^[A-Za-z_]/.test(candidate) ? candidate : `${fallback}-${candidate}`;
}

/**
 * Whether a course's package identifiers fall back to a title hash because no
 * explicit identifier is configured and the title is not representable in ASCII.
 * @param {{ identifier?: string, title?: string }} config
 */
export function usesHashDerivedIdentifier(config = {}) {
    if (config.identifier) return false;
    return deriveIdentifierSlug(config.title).hashed;
}
