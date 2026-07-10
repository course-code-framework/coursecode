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
