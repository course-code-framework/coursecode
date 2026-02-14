/**
 * @file lightbox.js
 * @description Declarative lightbox component for click-to-enlarge media viewing.
 * Supports images, videos (native, YouTube, Vimeo), markdown files, and PDFs.
 *
 * Usage:
 *   <!-- Single image lightbox -->
 *   <a href="full-size.jpg" data-component="lightbox">
 *     <img src="thumbnail.jpg" alt="Description">
 *   </a>
 *
 *   <!-- Video lightbox (YouTube, Vimeo, or native) -->
 *   <a href="https://youtu.be/dQw4w9WgXcQ" data-component="lightbox">
 *     <img src="video-thumbnail.jpg" alt="Watch Video">
 *   </a>
 *   <a href="video/demo.mp4" data-component="lightbox">
 *     <img src="video-poster.jpg" alt="Demo Video">
 *   </a>
 *
 *   <!-- Gallery group with prev/next navigation -->
 *   <a href="img1.jpg" data-lightbox-gallery="my-gallery">
 *     <img src="thumb1.jpg" alt="Image 1">
 *   </a>
 *   <a href="img2.jpg" data-lightbox-gallery="my-gallery">
 *     <img src="thumb2.jpg" alt="Image 2">
 *   </a>
 *
 * Attributes:
 *   - href: Full-size media URL (for <a> elements)
 *   - data-lightbox-src: Full-size media URL (alternative to href)
 *   - data-lightbox-gallery: Gallery group ID for prev/next navigation
 *   - data-lightbox-caption: Caption text (falls back to alt text)
 *
 * Keyboard:
 *   - ESC: Close lightbox
 *   - Arrow Left/Right: Navigate gallery (if multiple items)
 */

export const schema = {
    type: 'lightbox',
    description: 'Click-to-enlarge media viewer for images, videos, markdown, PDFs',
    example: `<div style="display: flex; gap: 12px;">
  <a href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='300' fill='%23dbeafe'%3E%3Crect width='400' height='300' rx='8'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' fill='%233b82f6' font-family='system-ui' font-size='16'%3EPhoto 1%3C/text%3E%3C/svg%3E" data-component="lightbox" data-lightbox-gallery="demo" data-lightbox-caption="First image" style="cursor: zoom-in;">
    <img src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='80' fill='%23dbeafe'%3E%3Crect width='120' height='80' rx='4'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' fill='%233b82f6' font-family='system-ui' font-size='11'%3EPhoto 1%3C/text%3E%3C/svg%3E" alt="Photo 1">
  </a>
  <a href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='300' fill='%23dcfce7'%3E%3Crect width='400' height='300' rx='8'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' fill='%2322c55e' font-family='system-ui' font-size='16'%3EPhoto 2%3C/text%3E%3C/svg%3E" data-component="lightbox" data-lightbox-gallery="demo" data-lightbox-caption="Second image" style="cursor: zoom-in;">
    <img src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='80' fill='%23dcfce7'%3E%3Crect width='120' height='80' rx='4'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' fill='%2322c55e' font-family='system-ui' font-size='11'%3EPhoto 2%3C/text%3E%3C/svg%3E" alt="Photo 2">
  </a>
  <a href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='300' fill='%23fef3c7'%3E%3Crect width='400' height='300' rx='8'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' fill='%23f59e0b' font-family='system-ui' font-size='16'%3EPhoto 3%3C/text%3E%3C/svg%3E" data-component="lightbox" data-lightbox-gallery="demo" data-lightbox-caption="Third image" style="cursor: zoom-in;">
    <img src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='80' fill='%23fef3c7'%3E%3Crect width='120' height='80' rx='4'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' fill='%23f59e0b' font-family='system-ui' font-size='11'%3EPhoto 3%3C/text%3E%3C/svg%3E" alt="Photo 3">
  </a>
</div>`,
    properties: {
        gallery: { type: 'string', dataAttribute: 'data-lightbox-gallery' },
        caption: { type: 'string', dataAttribute: 'data-lightbox-caption' },
        src: { type: 'string', dataAttribute: 'data-lightbox-src' },
        thumbnail: { type: 'string', dataAttribute: 'data-lightbox-thumbnail' }
    },
    structure: {
        container: '[data-component="lightbox"]',
        children: {}
    }
};

export const metadata = {
    category: 'ui-component',
    cssFile: 'components/lightbox.css',
    engagementTracking: 'viewAllLightbox',
    emitsEvents: ['lightbox:opened', 'lightbox:closed']
};

import { eventBus } from '../../core/event-bus.js';
import { iconManager } from '../../utilities/icons.js';
import { logger } from '../../utilities/logger.js';
import { escapeHTML } from '../../utilities/utilities.js';
import { fetchAndRenderMarkdown } from '../../utilities/markdown-renderer.js';
import engagementManager from '../../engagement/engagement-manager.js';

// Lightbox state
let lightboxElement = null;
let currentIndex = 0;
let currentGallery = [];
let isOpen = false;
let currentMediaType = 'image'; // 'image' | 'video' | 'markdown' | 'pdf'

/**
 * Resolves asset paths relative to course directory.
 * Follows same pattern as embed-frame.js for consistency.
 * @param {string} src - The source path
 * @returns {string} Resolved path
 */
function _resolvePath(src) {
    if (!src) return src;
    // Already absolute URL or protocol-relative
    if (src.startsWith('http://') || src.startsWith('https://') || src.startsWith('//')) {
        return src;
    }
    // Already has leading slash (absolute path from root)
    if (src.startsWith('/')) {
        return src;
    }
    // Already uses ./ or ../ relative paths
    if (src.startsWith('./') || src.startsWith('../')) {
        return src;
    }
    // Otherwise, assume relative to course/ directory
    return `./course/${src}`;
}

/**
 * Get the source URL from a trigger element with path resolution.
 * Uses raw attribute to avoid browser pre-resolution, then applies path resolution.
 * @param {HTMLElement} trigger
 * @returns {string} Resolved source URL
 */
function getTriggerSrc(trigger) {
    const rawSrc = trigger.getAttribute('href') || trigger.dataset.lightboxSrc;
    return _resolvePath(rawSrc);
}

// ============================================================================
// Media URL Detection
// ============================================================================

/**
 * Detects if URL is a PDF file.
 * @param {string} url
 * @returns {{ type: 'pdf' } | null}
 */
function detectPDF(url) {
    if (!url) return null;
    if (/\.pdf($|\?|#)/i.test(url)) return { type: 'pdf' };
    return null;
}

/**
 * Detects if URL is a markdown file.
 * @param {string} url
 * @returns {{ type: 'markdown' } | null}
 */
function detectMarkdown(url) {
    if (!url) return null;
    if (/\.md($|\?|#)/i.test(url)) return { type: 'markdown' };
    return null;
}

/**
 * Detects if a URL is a YouTube video and extracts the video ID.
 * @param {string} url
 * @returns {{ type: 'youtube', id: string } | null}
 */
function detectYouTube(url) {
    if (!url) return null;
    // youtube.com/watch?v=VIDEO_ID
    const watchMatch = url.match(/(?:youtube\.com\/watch\?.*v=)([a-zA-Z0-9_-]{11})/);
    if (watchMatch) return { type: 'youtube', id: watchMatch[1] };
    // youtu.be/VIDEO_ID
    const shortMatch = url.match(/(?:youtu\.be\/)([a-zA-Z0-9_-]{11})/);
    if (shortMatch) return { type: 'youtube', id: shortMatch[1] };
    // youtube.com/embed/VIDEO_ID
    const embedMatch = url.match(/(?:youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/);
    if (embedMatch) return { type: 'youtube', id: embedMatch[1] };
    return null;
}

/**
 * Detects if a URL is a Vimeo video and extracts the video ID.
 * @param {string} url
 * @returns {{ type: 'vimeo', id: string } | null}
 */
function detectVimeo(url) {
    if (!url) return null;
    const match = url.match(/(?:vimeo\.com\/)([\d]+)/);
    if (match) return { type: 'vimeo', id: match[1] };
    return null;
}

/**
 * Detects if URL is a native video file.
 * @param {string} url
 * @returns {{ type: 'native' } | null}
 */
function detectNativeVideo(url) {
    if (!url) return null;
    const videoExtensions = /\.(mp4|webm|ogg|mov|m4v)($|\?)/i;
    if (videoExtensions.test(url)) return { type: 'native' };
    return null;
}

/**
 * Detects if URL is any type of video.
 * @param {string} url
 * @returns {{ type: 'youtube' | 'vimeo' | 'native', id?: string } | null}
 */
function detectVideo(url) {
    return detectYouTube(url) || detectVimeo(url) || detectNativeVideo(url);
}

/**
 * Initialize a single lightbox trigger element.
 * Called by the component catalog for each [data-component="lightbox"] element.
 * @param {HTMLElement} element - The trigger element
 */
export function init(element) {
    // Skip if already initialized
    if (element.dataset.lightboxInitialized) return;
    element.dataset.lightboxInitialized = 'true';

    // Lazy-create the shared lightbox overlay
    if (!lightboxElement) {
        createLightboxElement();
    }

    element.addEventListener('click', (e) => {
        e.preventDefault();
        openFromTrigger(element);
    });

    const src = getTriggerSrc(element);
    const mediaType = getMediaType(src);
    const customThumbnail = element.dataset.lightboxThumbnail;
    const subtitle = element.dataset.lightboxSubtitle;

    // Check for custom thumbnail override (works for any media type)
    if (customThumbnail) {
        renderCustomThumbnail(element, customThumbnail);
    } else if (mediaType === 'markdown') {
        // For markdown files, render a thumbnail preview
        renderMarkdownThumbnail(element, src);
    } else if (mediaType === 'pdf') {
        // For PDF files, render a styled placeholder
        renderPdfThumbnail(element, src);
    } else {
        // Add visual indicator if not already styled
        element.style.cursor = 'zoom-in';
    }

    // Add subtitle if present - wrap trigger in a container
    if (subtitle) {
        wrapTriggerWithSubtitle(element, subtitle);
    }
}

/**
 * Render a custom thumbnail image inside a trigger element.
 * @param {HTMLElement} trigger - The trigger element
 * @param {string} thumbnailSrc - URL of the custom thumbnail image
 */
function renderCustomThumbnail(trigger, thumbnailSrc) {
    trigger.classList.add('lightbox-custom-thumbnail');
    trigger.style.cursor = 'zoom-in';
    const resolvedSrc = _resolvePath(thumbnailSrc);
    trigger.innerHTML = `<img src="${resolvedSrc}" alt="" class="lightbox-custom-thumbnail-img">`;
}

/**
 * Render a markdown thumbnail preview inside a trigger element.
 * @param {HTMLElement} trigger - The trigger element
 * @param {string} src - URL of the markdown file
 */
async function renderMarkdownThumbnail(trigger, src) {
    // Add thumbnail container class
    trigger.classList.add('lightbox-md-thumbnail');

    // Show loading state
    trigger.innerHTML = `
        <div class="lightbox-md-thumbnail-loading">
            ${iconManager.getIcon('loader-2', { size: 'lg', class: 'icon-spin' })}
        </div>
    `;

    try {
        const html = await fetchAndRenderMarkdown(src);
        trigger.innerHTML = `<div class="lightbox-md-thumbnail-content">${html}</div>`;
    } catch (error) {
        trigger.innerHTML = `
            <div class="lightbox-md-thumbnail-danger">
                ${iconManager.getIcon('file-text', { size: 'xl' })}
                <span>Failed to load</span>
            </div>
        `;
        logger.error('Failed to render markdown thumbnail', { src, error: error.message });
    }
}

/**
 * Render a PDF placeholder thumbnail inside a trigger element.
 * @param {HTMLElement} trigger - The trigger element
 * @param {string} src - URL of the PDF file
 */
function renderPdfThumbnail(trigger, src) {
    trigger.classList.add('lightbox-pdf-thumbnail');

    // Extract filename from path
    const filename = src.split('/').pop().split('?')[0] || 'Document.pdf';

    trigger.innerHTML = `
        <div class="lightbox-pdf-thumbnail-content">
            ${iconManager.getIcon('file-text', { size: '2xl', class: 'lightbox-pdf-thumbnail-icon' })}
            <span class="lightbox-pdf-thumbnail-badge">PDF</span>
            <span class="lightbox-pdf-thumbnail-filename">${filename}</span>
        </div>
    `;
}

/**
 * Wrap a trigger element with a container that includes a subtitle below.
 * @param {HTMLElement} trigger - The trigger element
 * @param {string} subtitle - The subtitle text
 */
function wrapTriggerWithSubtitle(trigger, subtitle) {
    // Create wrapper container
    const wrapper = document.createElement('div');
    wrapper.className = 'lightbox-thumbnail-wrapper';

    // Insert wrapper before trigger, then move trigger into wrapper
    trigger.parentNode.insertBefore(wrapper, trigger);
    wrapper.appendChild(trigger);

    // Add subtitle element
    const subtitleEl = document.createElement('span');
    subtitleEl.className = 'lightbox-thumbnail-subtitle';
    subtitleEl.textContent = subtitle;
    wrapper.appendChild(subtitleEl);
}

/**
 * Create the lightbox DOM element.
 */
function createLightboxElement() {
    // Find the course container for proper z-index stacking
    const courseContainer = document.querySelector('.course-container') || document.body;

    lightboxElement = document.createElement('div');
    lightboxElement.className = 'lightbox';
    lightboxElement.innerHTML = `
        <div class="lightbox-backdrop"></div>
        <div class="lightbox-content">
            <button class="lightbox-close" aria-label="Close lightbox">
                ${iconManager.getIcon('x', { size: 'lg' })}
            </button>
            <div class="lightbox-media-wrapper">
                <div class="lightbox-loading">
                    ${iconManager.getIcon('loader-2', { size: '2xl', class: 'icon-spin' })}
                </div>
                <!-- Image container -->
                <img class="lightbox-image" src="" alt="">
                <!-- Video container (shown when media is video) -->
                <div class="lightbox-video"></div>
                <!-- Markdown container (shown when media is markdown) -->
                <div class="lightbox-markdown"></div>
                <!-- PDF container (shown when media is pdf) -->
                <iframe class="lightbox-pdf" src="" title="PDF document"></iframe>
            </div>
            <div class="lightbox-caption"></div>
            <button class="lightbox-nav lightbox-prev" aria-label="Previous">
                ${iconManager.getIcon('chevron-left', { size: 'xl' })}
            </button>
            <button class="lightbox-nav lightbox-next" aria-label="Next">
                ${iconManager.getIcon('chevron-right', { size: 'xl' })}
            </button>
        </div>
    `;

    // Event listeners
    lightboxElement.querySelector('.lightbox-backdrop').addEventListener('click', close);
    lightboxElement.querySelector('.lightbox-close').addEventListener('click', close);
    lightboxElement.querySelector('.lightbox-prev').addEventListener('click', () => navigate(-1));
    lightboxElement.querySelector('.lightbox-next').addEventListener('click', () => navigate(1));

    // Handle hash anchor links inside markdown container (TOC links)
    const markdownContainer = lightboxElement.querySelector('.lightbox-markdown');
    markdownContainer.addEventListener('click', (e) => {
        const anchor = e.target.closest('a');
        if (!anchor) return;

        const href = anchor.getAttribute('href');
        if (href && href.startsWith('#')) {
            e.preventDefault();
            const targetId = href.slice(1);
            const targetElement = markdownContainer.querySelector(`#${CSS.escape(targetId)}`);
            if (targetElement) {
                targetElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        }
    });

    // Keyboard navigation
    document.addEventListener('keydown', handleKeydown);


    courseContainer.appendChild(lightboxElement);
}

/**
 * Handle keyboard events.
 * @param {KeyboardEvent} e
 */
function handleKeydown(e) {
    if (!isOpen) return;

    switch (e.key) {
        case 'Escape':
            close();
            break;
        case 'ArrowLeft':
            navigate(-1);
            break;
        case 'ArrowRight':
            navigate(1);
            break;
    }
}

/**
 * Open lightbox from a trigger element.
 * @param {HTMLElement} trigger
 */
function openFromTrigger(trigger) {
    const src = getTriggerSrc(trigger);
    const caption = trigger.dataset.lightboxCaption ||
        trigger.querySelector('img')?.alt ||
        trigger.getAttribute('aria-label') || '';
    const galleryId = trigger.dataset.lightboxGallery;
    const lightboxId = trigger.id || trigger.dataset.lightboxId;

    // Build gallery array if part of a group
    if (galleryId) {
        const galleryTriggers = document.querySelectorAll(`[data-lightbox-gallery="${galleryId}"]`);
        currentGallery = Array.from(galleryTriggers).map(t => {
            const itemSrc = getTriggerSrc(t);
            return {
                src: itemSrc,
                caption: t.dataset.lightboxCaption || t.querySelector('img')?.alt || '',
                mediaType: getMediaType(itemSrc)
            };
        });
        currentIndex = Array.from(galleryTriggers).indexOf(trigger);
    } else {
        currentGallery = [{ src, caption, mediaType: getMediaType(src) }];
        currentIndex = 0;
    }

    // Track lightbox view for engagement
    const slideId = trigger.closest?.('[data-slide-id]')?.dataset?.slideId ||
        document.querySelector('.slide.active')?.dataset?.slideId ||
        null;
    if (slideId && lightboxId) {
        engagementManager.trackLightboxView(slideId, lightboxId);
    }

    open(src, caption);
}

/**
 * Determine media type from URL.
 * @param {string} src
 * @returns {'markdown' | 'video' | 'image'}
 */
function getMediaType(src) {
    if (detectPDF(src)) return 'pdf';
    if (detectMarkdown(src)) return 'markdown';
    if (detectVideo(src)) return 'video';
    return 'image';
}

/**
 * Open the lightbox with an image, video, or markdown file.
 * @param {string} src - Media source URL
 * @param {string} [caption=''] - Optional caption
 */
export async function open(src, caption = '') {
    if (!lightboxElement) {
        createLightboxElement();
    }

    const img = lightboxElement.querySelector('.lightbox-image');
    const videoContainer = lightboxElement.querySelector('.lightbox-video');
    const markdownContainer = lightboxElement.querySelector('.lightbox-markdown');
    const pdfContainer = lightboxElement.querySelector('.lightbox-pdf');
    const captionEl = lightboxElement.querySelector('.lightbox-caption');
    const loading = lightboxElement.querySelector('.lightbox-loading');
    const prevBtn = lightboxElement.querySelector('.lightbox-prev');
    const nextBtn = lightboxElement.querySelector('.lightbox-next');

    // Detect media type
    currentMediaType = getMediaType(src);

    // Clear previous content and hide all containers
    videoContainer.innerHTML = '';
    videoContainer.style.display = 'none';
    markdownContainer.innerHTML = '';
    markdownContainer.scrollTop = 0; // Reset scroll position before loading new content
    markdownContainer.style.display = 'none';
    pdfContainer.src = '';
    pdfContainer.style.display = 'none';
    img.style.display = 'none';
    img.src = '';

    if (currentMediaType === 'pdf') {
        // Render PDF in iframe
        loading.style.display = 'none';
        pdfContainer.style.display = 'block';
        pdfContainer.src = src;
        logger.debug('Lightbox opened with PDF', { src });
    } else if (currentMediaType === 'markdown') {
        // Render markdown
        loading.style.display = 'flex';
        markdownContainer.style.display = 'block';
        try {
            const html = await fetchAndRenderMarkdown(src);
            markdownContainer.innerHTML = html;
            // Reset scroll position after DOM renders
            requestAnimationFrame(() => {
                markdownContainer.scrollTop = 0;
            });
            loading.style.display = 'none';
            logger.debug('Lightbox opened with markdown', { src });
        } catch (error) {
            loading.style.display = 'none';
            markdownContainer.innerHTML = `<div class="lightbox-danger">Failed to load markdown: ${escapeHTML(error.message)}</div>`;
            logger.error('Failed to load lightbox markdown', { src, error: error.message });
        }
    } else if (currentMediaType === 'video') {
        // Render video
        const videoInfo = detectVideo(src);
        loading.style.display = 'none';
        videoContainer.style.display = 'block';
        videoContainer.innerHTML = renderVideo(src, videoInfo);
        logger.debug('Lightbox opened with video', { src, type: videoInfo.type });
    } else {
        // Render image (original behavior)
        img.style.display = 'block';
        loading.style.display = 'flex';
        img.style.opacity = '0';

        img.onload = () => {
            loading.style.display = 'none';
            img.style.opacity = '1';
        };
        img.onerror = () => {
            loading.style.display = 'none';
            logger.error('Failed to load lightbox image', { src });
        };
        img.src = src;
        img.alt = caption || 'Enlarged image';
    }

    // Caption
    captionEl.textContent = caption;
    captionEl.style.display = caption ? 'block' : 'none';

    // Gallery navigation visibility
    const isGallery = currentGallery.length > 1;
    prevBtn.style.display = isGallery ? 'flex' : 'none';
    nextBtn.style.display = isGallery ? 'flex' : 'none';

    // Show lightbox
    lightboxElement.classList.add('active');
    isOpen = true;

    // Trap focus
    lightboxElement.querySelector('.lightbox-close').focus();

    eventBus.emit('lightbox:opened', { src, caption, type: currentMediaType });
}

/**
 * Render video HTML based on video type.
 * @param {string} src - Video URL
 * @param {{ type: 'youtube' | 'vimeo' | 'native', id?: string }} videoInfo
 * @returns {string} HTML string
 */
function renderVideo(src, videoInfo) {
    if (videoInfo.type === 'youtube') {
        return `
            <iframe 
                class="lightbox-video-embed"
                src="https://www.youtube.com/embed/${videoInfo.id}?autoplay=1&rel=0"
                title="YouTube video"
                frameborder="0"
                allow="autoplay; fullscreen">
            </iframe>
        `;
    }

    if (videoInfo.type === 'vimeo') {
        return `
            <iframe 
                class="lightbox-video-embed"
                src="https://player.vimeo.com/video/${videoInfo.id}?autoplay=1"
                title="Vimeo video"
                frameborder="0"
                allow="autoplay; fullscreen">
            </iframe>
        `;
    }

    // Native video
    return `
        <video 
            class="lightbox-video-native"
            src="${src}"
            controls
            autoplay>
            Your browser does not support video playback.
        </video>
    `;
}

/**
 * Close the lightbox.
 */
export function close() {
    if (!lightboxElement || !isOpen) return;

    lightboxElement.classList.remove('active');
    isOpen = false;

    // Clear media to stop loading/playback
    const img = lightboxElement.querySelector('.lightbox-image');
    const videoContainer = lightboxElement.querySelector('.lightbox-video');
    const markdownContainer = lightboxElement.querySelector('.lightbox-markdown');
    const pdfContainer = lightboxElement.querySelector('.lightbox-pdf');
    img.src = '';
    videoContainer.innerHTML = ''; // Stops video/iframe playback
    markdownContainer.innerHTML = '';
    pdfContainer.src = ''; // Clear PDF iframe

    eventBus.emit('lightbox:closed');
}

/**
 * Navigate to next/previous image in gallery.
 * @param {number} direction - 1 for next, -1 for previous
 */
function navigate(direction) {
    if (currentGallery.length <= 1) return;

    currentIndex = (currentIndex + direction + currentGallery.length) % currentGallery.length;
    const item = currentGallery[currentIndex];
    open(item.src, item.caption);
}

/**
 * Check if lightbox is currently open.
 * @returns {boolean}
 */
export function isVisible() {
    return isOpen;
}

