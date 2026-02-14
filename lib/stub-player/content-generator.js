/**
 * stub-player/content-generator.js - Server-side content HTML generator
 * 
 * Handles rendering of course content directly to HTML for the content viewer.
 */

import { parseCourse } from '../course-parser.js';

/**
 * Escape HTML special characters
 */
function escapeHtml(text) {
    if (!text) return '';
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

/**
 * Render an element to HTML based on its semantic type
 */
function renderElement(el) {
    const text = escapeHtml(el.innerText);

    switch (el.semantic) {
        case 'title':
            return text ? `<p><strong>${text}</strong></p>` : '';
        case 'description':
            return text ? `<p>${text}</p>` : '';
        case 'heading':
            return text ? `<h4>${text}</h4>` : '';
        case 'subheading':
            return text ? `<h5>${text}</h5>` : '';
        case 'paragraph':
            return text ? `<p>${text}</p>` : '';
        case 'callout':
            return text ? `<blockquote>${text}</blockquote>` : '';
        case 'list-item':
            return text ? `<li>${text}</li>` : '';

        // Pattern layouts - extract child content for readability
        case 'intro-cards':
            return renderPatternCards(el, 'intro-card');
        case 'steps':
            return renderPatternSteps(el);
        case 'features':
            return renderPatternCards(el, 'feature');
        case 'comparison':
            return renderPatternComparison(el);
        case 'timeline':
            return renderPatternTimeline(el);
        case 'stats':
            return renderPatternStats(el);
        case 'checklist':
            return renderPatternChecklist(el);
        case 'hero':
            return renderPatternHero(el);
        case 'quote':
            return text ? `<blockquote class="pattern-quote">${text}</blockquote>` : '';
        case 'content-image':
            // Just render the text content, images are visual
            return text ? `<p>${text}</p>` : '';

        case 'accordion':
            if (!el.children || el.children.length === 0) return '';
            let html = '<div class="accordion-content">';
            for (const panel of el.children) {
                const title = escapeHtml(panel.attributes?.['data-title']) || 'Untitled';
                const content = escapeHtml(panel.innerText) || '';
                html += `<details><summary>${title}</summary><div class="accordion-panel">${content}</div></details>`;
            }
            html += '</div>';
            return html;
        case 'accordion-panel':
            return ''; // Handled by parent
        case 'tabs':
            return renderPatternTabs(el);
        case 'card':
        case 'flip-card':
            return ''; // Handled by parent
        default:
            return '';
    }
}

/**
 * Render intro-cards or feature cards as a clean list
 */
function renderPatternCards(el, childClass) {
    if (!el.children || el.children.length === 0) return '';

    let html = '<div class="pattern-cards">';
    for (const child of el.children) {
        // Find cards within this pattern
        if (child.className?.includes(childClass) || child.className?.includes('card')) {
            const title = getChildHeading(child);
            const content = getChildParagraph(child);
            if (title || content) {
                html += '<div class="pattern-card-item">';
                if (title) html += `<h5>${escapeHtml(title)}</h5>`;
                if (content) html += `<p>${escapeHtml(content)}</p>`;
                html += '</div>';
            }
        }
    }
    html += '</div>';
    return html;
}

/**
 * Render steps pattern as numbered list
 */
function renderPatternSteps(el) {
    if (!el.children || el.children.length === 0) return '';

    let html = '<ol class="pattern-steps">';
    for (const child of el.children) {
        if (child.className?.includes('step')) {
            const title = getChildHeading(child);
            const content = getChildParagraph(child);
            html += '<li>';
            if (title) html += `<strong>${escapeHtml(title)}</strong> - `;
            if (content) html += escapeHtml(content);
            html += '</li>';
        }
    }
    html += '</ol>';
    return html;
}

/**
 * Render timeline as sequential entries
 */
function renderPatternTimeline(el) {
    if (!el.children || el.children.length === 0) return '';

    let html = '<div class="pattern-timeline">';
    for (const child of el.children) {
        if (child.className?.includes('event') || child.className?.includes('timeline')) {
            const date = child.attributes?.['data-date'] || child.attributes?.['data-year'] || '';
            const title = getChildHeading(child);
            const content = getChildParagraph(child);
            html += '<div class="timeline-entry">';
            if (date) html += `<span class="timeline-date"><strong>${escapeHtml(date)}</strong></span> `;
            if (title) html += `<span class="timeline-title">${escapeHtml(title)}</span>: `;
            if (content) html += `<span class="timeline-content">${escapeHtml(content)}</span>`;
            html += '</div>';
        }
    }
    html += '</div>';
    return html;
}

/**
 * Render comparison as two-column display
 */
function renderPatternComparison(el) {
    if (!el.children || el.children.length < 2) return '';

    let html = '<div class="pattern-comparison">';
    for (const child of el.children) {
        const title = getChildHeading(child);
        const items = getChildListItems(child);
        html += '<div class="comparison-column">';
        if (title) html += `<h5>${escapeHtml(title)}</h5>`;
        if (items.length > 0) {
            html += '<ul>';
            for (const item of items) {
                html += `<li>${escapeHtml(item)}</li>`;
            }
            html += '</ul>';
        }
        html += '</div>';
    }
    html += '</div>';
    return html;
}

/**
 * Render stats as key metrics
 */
function renderPatternStats(el) {
    if (!el.children || el.children.length === 0) return '';

    let html = '<div class="pattern-stats">';
    for (const child of el.children) {
        if (child.className?.includes('stat')) {
            const value = getChildByClass(child, 'stat-value') || getChildHeading(child);
            const label = getChildByClass(child, 'stat-label') || getChildParagraph(child);
            if (value || label) {
                html += '<div class="stat-item">';
                if (value) html += `<strong>${escapeHtml(value)}</strong>`;
                if (label) html += ` - ${escapeHtml(label)}`;
                html += '</div>';
            }
        }
    }
    html += '</div>';
    return html;
}

/**
 * Render checklist as bullet points
 */
function renderPatternChecklist(el) {
    const items = getChildListItems(el);
    if (items.length === 0) return '';

    let html = '<ul class="pattern-checklist">';
    for (const item of items) {
        html += `<li>☑ ${escapeHtml(item)}</li>`;
    }
    html += '</ul>';
    return html;
}

/**
 * Render hero as prominent heading
 */
function renderPatternHero(el) {
    const title = getChildHeading(el);
    const content = getChildParagraph(el);
    if (!title && !content) return '';

    let html = '<div class="pattern-hero">';
    if (title) html += `<h3>${escapeHtml(title)}</h3>`;
    if (content) html += `<p>${escapeHtml(content)}</p>`;
    html += '</div>';
    return html;
}

/**
 * Render tabs content
 */
function renderPatternTabs(el) {
    if (!el.children || el.children.length === 0) return '';

    let html = '<div class="pattern-tabs">';
    for (const child of el.children) {
        const title = child.attributes?.['data-tab'] || child.attributes?.['data-title'] || 'Tab';
        const content = escapeHtml(child.innerText) || '';
        html += `<details><summary>${escapeHtml(title)}</summary><div class="tab-content">${content}</div></details>`;
    }
    html += '</div>';
    return html;
}

// Helper functions to extract child content
function getChildHeading(el) {
    const heading = el.children?.find(c => ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(c.tag));
    return heading?.innerText || '';
}

function getChildParagraph(el) {
    const para = el.children?.find(c => c.tag === 'p');
    return para?.innerText || '';
}

function getChildListItems(el) {
    return el.children?.filter(c => c.tag === 'li').map(c => c.innerText || '') || [];
}

function getChildByClass(el, className) {
    const child = el.children?.find(c => c.className?.includes(className));
    return child?.innerText || '';
}

/**
 * Render elements array to HTML
 */
function renderElements(elements, skipHeader = true) {
    const parts = [];
    let inList = false;

    for (const el of elements) {
        if (skipHeader && (el.semantic === 'title' || el.semantic === 'description')) {
            continue;
        }

        const isListItem = el.semantic === 'list-item';

        if (isListItem && !inList) {
            parts.push('<ul>');
            inList = true;
        } else if (!isListItem && inList) {
            parts.push('</ul>');
            inList = false;
        }

        const html = renderElement(el);
        if (html) parts.push(html);
    }

    if (inList) parts.push('</ul>');
    return parts.join('\n');
}

/**
 * Render course header/metadata
 */
function renderMetadata(config) {
    const meta = config.metadata || {};
    const title = meta.title || 'CourseCode';
    const desc = meta.description || '';

    let html = '<div class="content-hero">';
    html += `<h1 id="course-title">${escapeHtml(title)}</h1>`;
    if (desc) {
        html += `<p class="content-hero-description">${escapeHtml(desc)}</p>`;
    }

    const details = [];
    if (meta.version) details.push(`<span class="meta-item"><span class="meta-label">Version</span> ${escapeHtml(meta.version)}</span>`);
    if (meta.author) details.push(`<span class="meta-item"><span class="meta-label">Author</span> ${escapeHtml(meta.author)}</span>`);
    if (meta.language) details.push(`<span class="meta-item"><span class="meta-label">Language</span> ${escapeHtml(meta.language)}</span>`);

    if (details.length > 0) {
        html += `<div class="content-hero-meta">${details.join('')}</div>`;
    }
    html += '</div>';

    return html;
}

/**
 * Render course structure overview
 */
function renderStructureOverview(structure, depth = 0) {
    const items = [];

    for (const item of structure) {
        const typeClass = item.type === 'section' ? 'toc-section' :
            item.type === 'assessment' ? 'toc-assessment' : 'toc-slide';
        const typeLabel = item.type === 'section' ? 'Section' :
            item.type === 'assessment' ? 'Assessment' : 'Slide';
        const title = item.title || item.menu?.label || item.id;
        const anchor = `slide-${item.id}`;

        let entry = `<li class="toc-item ${typeClass}">`;
        entry += `<a href="#${anchor}" class="toc-link">`;
        entry += `<span class="toc-type-badge">${typeLabel}</span>`;
        entry += `<span class="toc-title">${escapeHtml(title)}</span>`;

        // Add tags
        const tags = [];
        if (item.engagement?.required) tags.push('Engagement');
        if (item.navigation?.gating) tags.push('Gated');
        if (tags.length > 0) {
            entry += `<span class="toc-tags">${tags.map(t => `<span class="toc-tag">${t}</span>`).join('')}</span>`;
        }
        entry += '</a>';

        // Recurse for sections
        if (item.children && item.children.length > 0) {
            entry += '<ul class="toc-children">' + renderStructureOverview(item.children, depth + 1) + '</ul>';
        }

        entry += '</li>';
        items.push(entry);
    }

    return items.join('\n');
}

/**
 * Render an interaction to HTML
 */
function renderInteractionHtml(interaction, options = {}) {
    const { includeAnswers = true, includeFeedback = true } = options;

    const typeLabel = interaction.type?.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) || 'Interaction';
    const id = interaction.id || 'unknown';

    let html = '<div class="interaction-card">';
    html += '<div class="interaction-header">';
    html += `<span class="interaction-type-badge">${escapeHtml(typeLabel)}</span>`;
    html += `<span class="interaction-id"><code>${escapeHtml(id)}</code></span>`;
    html += '</div>';
    html += '<div class="interaction-body">';

    // Prompt/Question
    if (interaction.prompt) {
        html += `<div class="interaction-prompt">${escapeHtml(interaction.prompt)}</div>`;
    }

    // Options for choice-based interactions
    if (interaction.options && interaction.options.length > 0) {
        html += '<ul class="interaction-options">';
        for (const opt of interaction.options) {
            const isCorrect = includeAnswers && opt.correct;
            const correctClass = isCorrect ? 'option-correct' : '';
            html += `<li class="interaction-option ${correctClass}">`;
            html += escapeHtml(opt.text || opt.label || opt);
            if (isCorrect) html += ' <span class="correct-indicator">✓</span>';
            html += '</li>';
        }
        html += '</ul>';
    }

    // Correct answer for non-choice interactions
    if (includeAnswers && interaction.correctAnswer && !interaction.options) {
        html += `<div class="interaction-answer"><strong>Answer:</strong> <code>${escapeHtml(String(interaction.correctAnswer))}</code></div>`;
    }

    // Feedback
    if (includeFeedback) {
        if (interaction.feedback?.correct) {
            html += `<div class="interaction-feedback feedback-correct"><span class="feedback-label">Correct:</span> ${escapeHtml(interaction.feedback.correct)}</div>`;
        }
        if (interaction.feedback?.incorrect) {
            html += `<div class="interaction-feedback feedback-incorrect"><span class="feedback-label">Incorrect:</span> ${escapeHtml(interaction.feedback.incorrect)}</div>`;
        }
    }

    html += '</div></div>';
    return html;
}

/**
 * Render a slide to HTML
 */
function renderSlide(item, parsedData, options = {}) {
    const { includeNarration = true, includeAnswers = true, includeFeedback = true } = options;
    const title = item.title || item.menu?.label || item.id;
    const typeClass = item.type === 'assessment' ? 'slide-card-assessment' : 'slide-card-standard';
    const typeLabel = item.type === 'assessment' ? 'Assessment' : 'Slide';

    let html = `<span id="slide-${item.id}"></span>`;
    html += `<article class="slide-card ${typeClass}">`;
    html += '<header class="slide-card-header">';
    html += '<div class="slide-card-title-row">';
    html += `<span class="slide-type-badge">${typeLabel}</span>`;
    html += `<h2 class="slide-card-title">${escapeHtml(title)}</h2>`;
    html += '</div>';
    html += '<div class="slide-card-meta">';
    html += `<span class="slide-meta-item"><span class="meta-label">ID</span> <code>${item.id}</code></span>`;
    if (item.component) {
        html += `<span class="slide-meta-item"><span class="meta-label">Component</span> <code>${item.component}</code></span>`;
    }
    html += '</div>';
    html += '</header>';

    html += '<div class="slide-card-body">';

    if (parsedData) {
        // Header content
        if (parsedData.header?.title || parsedData.header?.description) {
            html += '<div class="slide-content-header">';
            if (parsedData.header.title) {
                html += `<h3 class="slide-content-title">${escapeHtml(parsedData.header.title)}</h3>`;
            }
            if (parsedData.header.description) {
                html += `<p class="slide-content-description">${escapeHtml(parsedData.header.description)}</p>`;
            }
            html += '</div>';
        }

        // Elements
        if (parsedData.elements && parsedData.elements.length > 0) {
            html += '<div class="slide-elements">';
            html += renderElements(parsedData.elements);
            html += '</div>';
        }

        // Interactions
        if (parsedData.interactions && parsedData.interactions.length > 0) {
            html += '<div class="slide-interactions">';
            html += `<h3 class="section-label">Interactions <span class="count-badge">${parsedData.interactions.length}</span></h3>`;
            for (const interaction of parsedData.interactions) {
                html += renderInteractionHtml(interaction, { includeAnswers, includeFeedback });
            }
            html += '</div>';
        }

        // Narration
        if (includeNarration && parsedData.narration) {
            html += '<div class="slide-narration">';
            html += '<h3 class="section-label narration-header">Narration</h3>';
            html += '<div class="narration-section">';
            for (const [key, text] of Object.entries(parsedData.narration)) {
                if (Object.keys(parsedData.narration).length > 1 && key !== 'slide') {
                    html += `<p class="narration-key"><strong>${escapeHtml(key)}:</strong></p>`;
                }
                html += `<p>${escapeHtml(text)}</p>`;
            }
            html += '</div>';
            html += '</div>';
        }
    } else {
        html += '<p class="no-content"><em>No content available</em></p>';
    }

    html += '</div>';
    html += '<footer class="slide-card-footer"><a href="#course-structure" class="back-to-toc">↑ Back to Course Structure</a></footer>';
    html += '</article>';
    return html;
}

/**
 * Render a section to HTML
 */
function renderSection(section, slides, options) {
    const title = section.title || section.menu?.label || section.id;
    let html = `<span id="slide-${section.id}"></span>`;
    html += '<div class="section-container">';
    html += '<div class="section-header">';
    html += '<span class="section-icon">📂</span>';
    html += `<h2 class="section-title">${escapeHtml(title)}</h2>`;
    html += '</div>';
    html += '<div class="section-slides">';

    if (section.children) {
        for (const child of section.children) {
            if (child.type === 'slide' || child.type === 'assessment') {
                const parsedData = slides[child.id] || null;
                html += renderSlide(child, parsedData, options);
            } else if (child.type === 'section') {
                html += renderSection(child, slides, options);
            }
        }
    }

    html += '</div></div>';
    return html;
}

/**
 * Generate course content HTML (server-side rendering)
 * Used by preview-server to embed content directly in stub player
 * @param {Object} options - { coursePath, includeNarration }
 * @returns {Promise<string|null>} HTML content or null on error
 */
export async function generateContentHtml(options = {}) {
    const {
        coursePath = './course',
        includeNarration = true
    } = options;

    try {
        const courseData = await parseCourse(coursePath);
        const { config, slides } = courseData;
        const structure = config.structure || [];

        const renderOptions = {
            includeNarration,
            includeAnswers: true,
            includeFeedback: true
        };

        let html = '<div class="course-content">';

        // Metadata
        html += renderMetadata(config);
        html += '<hr>';

        // Structure overview
        html += '<nav class="toc-section">';
        html += '<h2 id="course-structure" class="toc-heading">Course Structure</h2>';
        html += '<ul class="toc-list">';
        html += renderStructureOverview(structure);
        html += '</ul>';
        html += '</nav>';

        // Process each item
        for (const item of structure) {
            if (item.type === 'slide') {
                const parsedData = slides[item.id] || null;
                html += renderSlide(item, parsedData, renderOptions);
            } else if (item.type === 'assessment') {
                const parsedData = slides[item.id] || null;
                html += renderSlide(item, parsedData, renderOptions);
            } else if (item.type === 'section') {
                html += renderSection(item, slides, renderOptions);
            }
        }

        html += '</div>';
        return html;

    } catch (error) {
        console.error('Failed to generate content HTML:', error.message);
        return null;
    }
}
