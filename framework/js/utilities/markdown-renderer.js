/**
 * @file markdown-renderer.js
 * @description Shared utility for rendering markdown to HTML.
 * Uses the `marked` library for full GitHub-Flavored Markdown support.
 */

import { marked } from 'marked';
import { gfmHeadingId } from 'marked-gfm-heading-id';

// Enable GFM heading IDs for anchor links (e.g., #features)
marked.use(gfmHeadingId());

// Configure marked for GFM
marked.setOptions({
    gfm: true,
    breaks: true,
    pedantic: false
});

/**
 * Parse markdown string to HTML.
 * @param {string} markdown - Raw markdown string
 * @returns {string} HTML string
 */
export function parseMarkdown(markdown) {
    if (!markdown || typeof markdown !== 'string') {
        return '';
    }
    return marked.parse(markdown);
}

/**
 * Fetch a markdown file and render it to HTML.
 * @param {string} url - URL of the markdown file
 * @returns {Promise<string>} HTML string
 * @throws {Error} If fetch fails or response is not ok
 */
export async function fetchAndRenderMarkdown(url) {
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Failed to fetch markdown: ${response.status} ${response.statusText}`);
    }
    const markdown = await response.text();
    return parseMarkdown(markdown);
}
