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

/** Create a conservative ASCII XML ID (xsd:ID) from authored text. */
export function makeXmlId(value, fallback = 'course') {
    const normalized = String(value ?? '')
        .trim()
        .replace(/[^A-Za-z0-9_.-]+/g, '-')
        .replace(/^-+|-+$/g, '');
    const candidate = normalized || fallback;
    return /^[A-Za-z_]/.test(candidate) ? candidate : `${fallback}-${candidate}`;
}
