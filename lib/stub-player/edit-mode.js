
/**
 * stub-player/edit-mode.js - Visual editing logic
 * 
 * Handles 'Edit Mode' where users can click elements in the course iframe
 * to edit text content, tags, and classes directly.
 */

import { openEditorById } from './interaction-editor.js';

let editModeActive = false;
let currentToolbar = null;

export function createEditModeHandlers(context) {
    const { getCmiData } = context;

    // Initialize UI
    const editModeBtn = document.getElementById('stub-player-edit-mode-btn');

    if (!editModeBtn) return; // Not in live mode

    // Toggle edit mode
    editModeBtn.addEventListener('click', () => {
        toggleEditMode();
    });

    function toggleEditMode() {
        editModeActive = !editModeActive;
        editModeBtn.classList.toggle('active', editModeActive);

        const frame = document.getElementById('stub-player-course-frame');

        // Clean up when exiting edit mode
        if (!editModeActive) {
            const doc = frame?.contentDocument;
            if (doc) {
                // Cancel any active contenteditable
                const activeEditable = doc.querySelector('[contenteditable="true"]');
                if (activeEditable) {
                    activeEditable.removeAttribute('contenteditable');
                    activeEditable.style.outline = '';
                    activeEditable.style.outlineOffset = '';
                }
                removeToolbar();
                // Remove focus from everything
                doc.activeElement?.blur();
            }
        }

        setupIframeEditMode(frame);
    }



    // Initial setup if frame already loaded or on load
    const frame = document.getElementById('stub-player-course-frame');
    if (frame) {
        frame.addEventListener('load', () => setupIframeEditMode(frame));
        setupIframeEditMode(frame);
    }

    // Global keyboard shortcuts
    document.addEventListener('keydown', async (e) => {
        if (!editModeActive) return;
        // Escape always exits edit mode from parent document
        if (e.key === 'Escape') {
            toggleEditMode();
        }
    });

    // -------------------------------------------------------------------------




    function getCurrentSlideFile() {
        const cmiData = getCmiData();
        try {
            const suspendData = cmiData['cmi.suspend_data'];
            if (suspendData) {
                const parsed = typeof suspendData === 'string' ? JSON.parse(suspendData) : suspendData;
                const currentSlide = parsed.currentSlide || parsed.slideId;
                if (currentSlide) {
                    return currentSlide + '.js';
                }
            }
        } catch (_e) { }
        // Fallback
        const location = cmiData['cmi.location'];
        if (location) {
            return location + '.js';
        }
        return 'unknown.js';
    }

    function getCurrentSlideId() {
        return getCurrentSlideFile().replace(/\.js$/, '');
    }

    function setupIframeEditMode(frame) {
        try {
            const doc = frame.contentDocument || frame.contentWindow.document;
            if (!doc) return;

            // Toggle class on body
            doc.body.classList.toggle('edit-mode-active', editModeActive);

            // Inject styles
            let styleEl = doc.getElementById('coursecode-edit-mode-styles');
            if (editModeActive && !styleEl) {
                styleEl = doc.createElement('style');
                styleEl.id = 'coursecode-edit-mode-styles';
                styleEl.textContent = `
                    [data-edit-path]:not(:has([data-edit-path])) {
                        outline: 2px dashed transparent;
                        outline-offset: 2px;
                        transition: outline-color 0.15s, background-color 0.15s;
                        cursor: text !important;
                    }
                    .edit-mode-active [data-edit-path]:not(:has([data-edit-path])):hover {
                        outline-color: #6366f1;
                        background-color: rgba(99, 102, 241, 0.1);
                    }
                    .edit-mode-active [data-interaction-id] {
                        cursor: pointer !important;
                    }
                    .edit-mode-active [data-interaction-id]:hover {
                        outline: 2px dashed #f59e0b;
                        outline-offset: 2px;
                        background-color: rgba(245, 158, 11, 0.08);
                    }
                    .edit-mode-active .flip-card,
                    .edit-mode-active .accordion-button,
                    .edit-mode-active [data-action="select-tab"],
                    .edit-mode-active [data-action="toggle-collapse"],
                    .edit-mode-active [data-component="modal-trigger"],
                    .edit-mode-active .timeline-event,
                    .edit-mode-active [data-component="lightbox"],
                    .edit-mode-active [data-action="toggle-dropdown"] {
                        pointer-events: none;
                    }
                `;
                doc.head.appendChild(styleEl);
            }

            // Attach listeners if not already attached (check a flag on doc?)
            if (!doc._editHandlersAttached) {
                doc._editHandlersAttached = true;

                // Toolbar helper
                injectToolbarStyles(doc);

                // Selection change for toolbar state
                doc.addEventListener('selectionchange', () => {
                    if (currentToolbar) {
                        updateToolbarState(currentToolbar, doc);
                    }
                });

                // Main Click Handler
                doc.addEventListener('click', (e) => handleIframeClick(e, doc, frame), true);

                // Escape key in iframe: exit edit mode only if nothing is being edited
                doc.addEventListener('keydown', (e) => {
                    if (!editModeActive) return;
                    if (e.key === 'Escape') {
                        const activeEditable = doc.querySelector('[contenteditable="true"]');
                        if (!activeEditable) {
                            toggleEditMode();
                        }
                    }
                });

            }

        } catch (_e) {
            // Cannot access iframe (cross-origin?) or not ready
            // console.warn('Could not access iframe for edit mode:', e);
        }
    }

    /**
     * Check if an element is a leaf editable (has no child elements with data-edit-path).
     * This ensures we only select the deepest, most specific elements for editing.
     */
    function isLeafEditable(el) {
        return !el.querySelector('[data-edit-path]');
    }

    /**
     * Find the deepest data-edit-path element under the click target.
     * Walks from the clicked element upward, preferring the most specific (leaf) element.
     */
    function findLeafEditable(target) {
        // Start from the clicked element itself
        let el = target;
        while (el) {
            if (el.hasAttribute?.('data-edit-path') && isLeafEditable(el)) {
                return el;
            }
            el = el.parentElement;
        }
        return null;
    }

    /**
     * Determine if an element supports rich-text formatting (bold, italic, underline).
     * Returns false for UI chrome elements (buttons, code, labels, etc.) where
     * inline formatting tags would break component behavior or be meaningless.
     */
    function isProseElement(el) {
        const tag = el.tagName;
        const NON_PROSE_TAGS = new Set(['BUTTON', 'A', 'PRE', 'CODE', 'LABEL', 'INPUT', 'SELECT', 'TEXTAREA', 'IMG']);
        if (NON_PROSE_TAGS.has(tag)) return false;
        if (el.hasAttribute('data-action')) return false;
        if (el.closest('button, [data-action]')) return false;
        return true;
    }

    function handleIframeClick(e, doc, _frame) {
        if (!editModeActive) return;

        // 0. If clicking inside the currently active editable, let the browser handle
        //    cursor placement natively — don't finalize or restart the edit.
        const activeEditable = doc.querySelector('[contenteditable="true"]');
        if (activeEditable && activeEditable.contains(e.target)) {
            return;
        }

        // 1. Finalize any active edit before starting a new one
        let justFinalized = null;
        if (activeEditable) {
            justFinalized = activeEditable;
            activeEditable.removeAttribute('contenteditable');
            activeEditable.style.outline = '';
            activeEditable.style.outlineOffset = '';
            // Remove event listeners
            if (activeEditable._editCleanup) {
                activeEditable._editCleanup();
                activeEditable._editCleanup = null;
            }
            // Persist changes to server
            if (activeEditable._pendingSave) {
                activeEditable._pendingSave();
                activeEditable._pendingSave = null;
            }
            removeToolbar();
        }

        // 1. Check for interaction elements - open interaction config modal
        const interactionEl = e.target.closest('[data-interaction-id]');
        if (interactionEl) {
            e.preventDefault();
            e.stopPropagation();
            const interactionId = interactionEl.getAttribute('data-interaction-id');
            const slideId = getCurrentSlideId();
            openEditorById(interactionId, slideId);
            return;
        }

        // 2. Check for MCQ Choice editing
        const choiceEl = e.target.closest('[data-editable-choice]');
        if (choiceEl) {
            handleChoiceEdit(e, choiceEl, doc);
            return;
        }

        // 3. Check for general content editing - only target leaf elements
        const editableEl = findLeafEditable(e.target);
        if (!editableEl) return;

        // If we just finalized this same element, don't re-enter (click = save & exit)
        if (editableEl === justFinalized) return;

        e.preventDefault();
        e.stopPropagation();

        const editPath = editableEl.getAttribute('data-edit-path');
        const originalHtml = editableEl.innerHTML;
        const slideFile = getCurrentSlideFile();

        // Make editable
        editableEl.setAttribute('contenteditable', 'true');
        editableEl.style.outline = '2px solid var(--accent-color, #3b82f6)';
        editableEl.style.outlineOffset = '2px';
        editableEl.focus();

        // Place cursor at end (don't select all text)
        const selection = doc.getSelection();
        const range = doc.createRange();
        range.selectNodeContents(editableEl);
        range.collapse(false);
        selection.removeAllRanges();
        selection.addRange(range);

        // Toolbar setup
        removeToolbar();
        const toolbarCallbacks = {
            onTagSave: async (newTagString) => {
                // Parse tag string logic...
                let newTagName, newClasses = '';
                const LT = String.fromCharCode(60);
                const GT = String.fromCharCode(62);
                const patternStr = '^' + LT + '(\\w+)([^' + GT + ']*)' + GT + '$';
                const anglePattern = new RegExp(patternStr);
                const fullMatch = newTagString.match(anglePattern);

                if (fullMatch) {
                    newTagName = fullMatch[1];
                    const classMatch = fullMatch[2].match(/class="([^"]*)"/i);
                    newClasses = classMatch ? classMatch[1] : '';
                } else {
                    const simpleMatch = newTagString.match(/^(\w+)$/);
                    if (simpleMatch) {
                        newTagName = simpleMatch[1];
                    } else {
                        return { error: 'Invalid format. Use <tagname> or just tagname' };
                    }
                }

                try {
                    const response = await fetch('/__edit-tag', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            slideFile,
                            editPath,
                            newTag: newTagName,
                            newClasses
                        })
                    });
                    const result = await response.json();
                    if (!result.success) {
                        console.error('Tag edit failed:', result.error);
                    }
                } catch (err) {
                    console.error('Tag edit error:', err);
                }
            }
        };
        const proseMode = isProseElement(editableEl);
        currentToolbar = createToolbar(doc, editableEl, toolbarCallbacks, { proseMode });

        // Persist changes to server (no UI cleanup — may already be done by click handler)
        let _saving = false;
        const persistEdit = async () => {
            if (_saving) return; // Guard against double-save
            _saving = true;
            normalizeExecCommandHtml(editableEl);
            const newHtml = editableEl.innerHTML.trim();

            if (newHtml === originalHtml.trim()) return;

            try {
                const response = await fetch('/__edit', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        slideFile,
                        editPath,
                        newText: newHtml,
                        isHtml: true
                    })
                });
                const result = await response.json();
                if (!result.success) {
                    console.error('Edit failed:', result.error);
                    editableEl.innerHTML = originalHtml; // Revert
                } else {
                    // Success — edit saved
                }
            } catch (err) {
                console.error('Edit error:', err);
                editableEl.innerHTML = originalHtml;
            }
        };

        // Full save: cleanup UI + persist
        const saveEdit = () => {
            cleanup();
            editableEl.removeAttribute('contenteditable');
            editableEl.style.outline = '';
            editableEl.style.outlineOffset = '';
            editableEl._pendingSave = null;
            removeToolbar();
            persistEdit();
        };

        const cancelEdit = () => {
            cleanup();
            editableEl.innerHTML = originalHtml;
            editableEl.removeAttribute('contenteditable');
            editableEl.style.outline = '';
            editableEl.style.outlineOffset = '';
            editableEl._pendingSave = null;
            removeToolbar();
        };

        // Store persist function so click handler can invoke it during transitions
        editableEl._pendingSave = persistEdit;

        const handleBlur = (ev) => {
            // If clicking on toolbar, don't save yet
            if (currentToolbar && currentToolbar.contains(ev.relatedTarget)) return;
            setTimeout(() => {
                // If already finalized by click handler, skip
                if (!editableEl.hasAttribute('contenteditable')) return;
                saveEdit();
            }, 100);
        };

        const handleKeydown = (ev) => {
            if (ev.key === 'Escape') {
                ev.preventDefault();
                ev.stopPropagation(); // Don't bubble to doc handler — 2nd Escape exits edit mode
                cancelEdit();
            } else if (ev.key === 'Enter' && !ev.shiftKey) {
                ev.preventDefault();
                saveEdit();
            } else {
                handleFormattingShortcuts(ev, doc);
            }
        };

        // Paste sanitization: strip rich formatting, keep only plain text with line breaks
        const handlePaste = (ev) => {
            ev.preventDefault();
            const text = ev.clipboardData?.getData('text/plain') || '';
            const lines = text.split(/\r?\n/);
            const selection = doc.getSelection();
            if (!selection.rangeCount) return;
            selection.deleteFromDocument();
            const frag = doc.createDocumentFragment();
            lines.forEach((line, i) => {
                frag.appendChild(doc.createTextNode(line));
                if (i < lines.length - 1) frag.appendChild(doc.createElement('br'));
            });
            selection.getRangeAt(0).insertNode(frag);
            selection.collapseToEnd();
        };

        function cleanup() {
            editableEl.removeEventListener('blur', handleBlur);
            editableEl.removeEventListener('keydown', handleKeydown);
            editableEl.removeEventListener('paste', handlePaste);
            editableEl._editCleanup = null;
        }

        editableEl._editCleanup = cleanup;
        editableEl.addEventListener('blur', handleBlur);
        editableEl.addEventListener('keydown', handleKeydown);
        editableEl.addEventListener('paste', handlePaste);
    }

    function handleFormattingShortcuts(e, doc) {
        if (!(e.ctrlKey || e.metaKey)) return;
        if (!['b', 'i', 'u'].includes(e.key)) return;

        e.preventDefault();
        // Suppress formatting shortcuts on non-prose elements
        const activeEditable = doc.querySelector('[contenteditable="true"]');
        if (activeEditable && !isProseElement(activeEditable)) return;

        const cmd = { b: 'bold', i: 'italic', u: 'underline' }[e.key];
        doc.execCommand(cmd, false, null);
        if (currentToolbar) updateToolbarState(currentToolbar, doc);
    }

    function handleChoiceEdit(e, choiceEl, _doc) {
        if (!editModeActive) return;
        if (choiceEl.hasAttribute('contenteditable')) return;

        e.preventDefault();
        e.stopPropagation();

        const interactionId = choiceEl.getAttribute('data-edit-for-interaction');
        const choiceIndex = choiceEl.getAttribute('data-choice-index');
        const originalText = choiceEl.textContent;
        const slideId = getCurrentSlideId();

        choiceEl.setAttribute('contenteditable', 'true');
        choiceEl.style.outline = '2px solid var(--accent-color, #3b82f6)';
        choiceEl.style.outlineOffset = '2px';
        choiceEl.style.minWidth = '100px';
        choiceEl.focus();

        const saveChoiceEdit = async () => {
            const newText = choiceEl.textContent.trim();
            if (newText === originalText) {
                cleanupChoice();
                return;
            }

            try {
                const response = await fetch('/__edit-interaction', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        slideId,
                        interactionId,
                        field: `choices[${choiceIndex}].text`,
                        value: newText
                    })
                });
                if (!response.ok) {
                    const result = await response.json();
                    console.error('MCQ edit failed:', result.error);
                    choiceEl.textContent = originalText;
                }
            } catch (err) {
                console.error('MCQ edit error:', err);
                choiceEl.textContent = originalText;
            }
            cleanupChoice();
        };

        const cleanupChoice = () => {
            choiceEl.removeAttribute('contenteditable');
            choiceEl.style.outline = '';
            choiceEl.style.outlineOffset = '';
            choiceEl.style.minWidth = '';
            choiceEl.removeEventListener('blur', handleChoiceBlur);
            choiceEl.removeEventListener('keydown', handleChoiceKeydown);
        };

        const handleChoiceBlur = () => saveChoiceEdit();
        const handleChoiceKeydown = (ev) => {
            if (ev.key === 'Escape') {
                ev.preventDefault();
                choiceEl.textContent = originalText;
                cleanupChoice();
            } else if (ev.key === 'Enter' && !ev.shiftKey) {
                ev.preventDefault();
                saveChoiceEdit();
            }
        };

        choiceEl.addEventListener('blur', handleChoiceBlur);
        choiceEl.addEventListener('keydown', handleChoiceKeydown);
    }

}


// -----------------------------------------------------------------------------
// HTML Normalization (clean up execCommand artifacts)
// -----------------------------------------------------------------------------

/**
 * Browsers' execCommand leaves behind messy HTML when toggling formatting:
 *   - <span style="font-weight: normal;"> inside an already-bold parent
 *   - <span style="font-weight: bold;"> instead of <strong>
 *   - <span style="text-decoration: underline;"> instead of <u>
 *   - Combined bold+italic in a single span
 *   - Empty <strong></strong> tags after un-bolding
 *   - <b> instead of <strong>, <i> instead of <em>
 *   - Adjacent <strong>foo</strong><strong>bar</strong> that should merge
 *   - Fragmented text nodes from DOM manipulation
 * 
 * This normalizes the HTML before saving to produce clean, semantic output
 * that aligns with the framework's CSS (e.g. <strong> not inline styles).
 */
function normalizeExecCommandHtml(container) {
    const win = container.ownerDocument.defaultView || window;
    const doc = container.ownerDocument;

    // Check if the container itself provides bold/italic context
    const inheritsBold = container.tagName === 'B' || container.tagName === 'STRONG'
        || container.classList?.contains('font-bold')
        || win.getComputedStyle(container).fontWeight >= 700;

    const inheritsItalic = container.tagName === 'I' || container.tagName === 'EM'
        || container.classList?.contains('italic')
        || win.getComputedStyle(container).fontStyle === 'italic';

    // ── Pass 1: Normalize <b> → <strong>, <i> → <em> ──
    const TAG_MAP = { B: 'strong', I: 'em' };
    for (const [oldTag, newTag] of Object.entries(TAG_MAP)) {
        for (const el of [...container.querySelectorAll(oldTag)]) {
            const replacement = doc.createElement(newTag);
            // Copy attributes (rare, but defensive)
            for (const attr of el.attributes) {
                replacement.setAttribute(attr.name, attr.value);
            }
            replacement.append(...el.childNodes);
            el.replaceWith(replacement);
        }
    }

    // ── Pass 2: Convert styled spans to semantic elements (bottom-up) ──
    const spans = [...container.querySelectorAll('span[style]')].reverse();

    for (const span of spans) {
        const weight = span.style.fontWeight;
        const fontStyle = span.style.fontStyle;
        const textDecor = span.style.textDecoration;

        // 2a. Remove redundant "normal" overrides when parent already provides formatting
        if (weight === 'normal' && (inheritsBold || span.closest('strong, b'))) {
            span.style.removeProperty('font-weight');
        }
        if (fontStyle === 'normal' && (inheritsItalic || span.closest('em, i'))) {
            span.style.removeProperty('font-style');
        }

        const isBold = weight === 'bold' || weight === '700';
        const isItalic = fontStyle === 'italic';
        const isUnderline = textDecor?.includes('underline');

        // 2b. Combined bold+italic → nested <strong><em>
        if (isBold && isItalic) {
            span.style.removeProperty('font-weight');
            span.style.removeProperty('font-style');
            const hasRemainingStyles = span.getAttribute('style')?.trim();
            const strong = doc.createElement('strong');
            const em = doc.createElement('em');
            em.append(...span.childNodes);
            strong.appendChild(em);
            if (hasRemainingStyles) {
                span.innerHTML = '';
                span.appendChild(strong);
            } else {
                span.replaceWith(strong);
            }
            continue;
        }

        // 2c. Bold span → <strong>
        if (isBold) {
            span.style.removeProperty('font-weight');
            if (!span.getAttribute('style')?.trim()) {
                const el = doc.createElement('strong');
                el.append(...span.childNodes);
                span.replaceWith(el);
                continue;
            }
        }

        // 2d. Italic span → <em>
        if (isItalic) {
            span.style.removeProperty('font-style');
            if (!span.getAttribute('style')?.trim()) {
                const el = doc.createElement('em');
                el.append(...span.childNodes);
                span.replaceWith(el);
                continue;
            }
        }

        // 2e. Underline span → <u>
        if (isUnderline) {
            span.style.removeProperty('text-decoration');
            if (!span.getAttribute('style')?.trim()) {
                const el = doc.createElement('u');
                el.append(...span.childNodes);
                span.replaceWith(el);
                continue;
            }
        }

        // 2f. Unwrap spans with no remaining meaningful attributes
        if (!span.getAttribute('style')?.trim()) span.removeAttribute('style');
        if (!span.attributes.length) {
            span.replaceWith(...span.childNodes);
        }
    }

    // ── Pass 3: Normalize <div> line breaks (Chrome inserts <div> for Enter) ──
    for (const div of [...container.querySelectorAll('div')]) {
        // Only unwrap divs that execCommand inserted (no classes, no id, no data attrs)
        if (div.attributes.length > 0) continue;
        const br = doc.createElement('br');
        div.before(br);
        div.replaceWith(...div.childNodes);
    }

    // ── Pass 4: Remove empty semantic tags (left after un-formatting) ──
    for (const tag of ['strong', 'em', 'u', 'b', 'i']) {
        for (const el of [...container.querySelectorAll(tag)]) {
            if (!el.textContent.trim() && !el.querySelector('img, br')) {
                el.replaceWith(...el.childNodes);
            }
        }
    }

    // ── Pass 5: Merge adjacent same-tag siblings ──
    // e.g. <strong>foo</strong><strong>bar</strong> → <strong>foobar</strong>
    for (const tag of ['strong', 'em', 'u']) {
        for (const el of [...container.querySelectorAll(tag)]) {
            while (el.nextSibling && el.nextSibling.nodeName === el.nodeName) {
                const sibling = el.nextSibling;
                el.append(...sibling.childNodes);
                sibling.remove();
            }
        }
    }

    // ── Pass 6: Clean up &nbsp; → regular spaces ──
    const walker = doc.createTreeWalker(container, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
        if (node.nodeValue.includes('\u00A0')) {
            node.nodeValue = node.nodeValue.replace(/\u00A0/g, ' ');
        }
    }

    // Merge fragmented text nodes
    container.normalize();
}

// -----------------------------------------------------------------------------
// Toolbar Logic (Extracted)
// -----------------------------------------------------------------------------

function injectToolbarStyles(iframeDoc) {
    if (iframeDoc.getElementById('stub-player-toolbar-styles')) return;
    const style = iframeDoc.createElement('style');
    style.id = 'stub-player-toolbar-styles';
    style.textContent = `
        .stub-player-format-toolbar {
            position: absolute;
            display: flex;
            flex-wrap: nowrap;
            align-items: center;
            gap: 4px;
            padding: 4px;
            background: #1a1a2e;
            border: 1px solid #3a3a5c;
            border-radius: 6px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.4);
            z-index: 999999;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        }
        .stub-player-format-toolbar button {
            width: 28px;
            height: 28px;
            border: none;
            background: #4a6fa5;
            color: #fff;
            border-radius: 4px;
            cursor: pointer;
            font-size: 13px;
            font-weight: 600;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: all 0.15s;
            flex-shrink: 0;
        }
        .stub-player-format-toolbar button:hover:not(:disabled) { background: #5a5a9c; color: #fff; }
        .stub-player-format-toolbar button.active { background: #6366f1; color: #fff; }
        .stub-player-format-toolbar button:disabled {
            opacity: 0.35;
            cursor: not-allowed;
            background: #3a3a5c;
        }
        .stub-player-format-toolbar .separator { width: 1px; background: #3a3a5c; margin: 4px 2px; }
        .stub-player-format-toolbar.tag-mode { gap: 4px; align-items: center; }
        .stub-player-format-toolbar .tag-input {
            background: #252542;
            border: 1px solid #3a3a5c;
            border-radius: 4px;
            color: #e0e0e0;
            padding: 6px 10px;
            font-family: 'SF Mono', Consolas, monospace;
            font-size: 12px;
            line-height: 1.4;
            min-width: 280px;
            max-width: 500px;
            min-height: 0;
            height: auto;
            resize: vertical;
            field-sizing: content;
        }
        .stub-player-format-toolbar .tag-input:focus { outline: none; border-color: #6366f1; }
        .stub-player-format-toolbar .tag-save-btn { background: #22c55e; color: #fff; padding: 0 12px; width: auto; height: auto; align-self: stretch; }
        .stub-player-format-toolbar .tag-save-btn:hover { background: #16a34a; }
        .stub-player-format-toolbar .tag-cancel-btn { background: #6b7280; padding: 0 10px; height: auto; align-self: stretch; }
        .stub-player-format-toolbar .tag-cancel-btn:hover { background: #4b5563; }
        .stub-player-format-toolbar .tag-edit-btn { width: auto; padding: 0 8px; font-size: 12px; white-space: nowrap; }
    `;
    iframeDoc.head.appendChild(style);
}

function createToolbar(iframeDoc, editableEl, callbacks = {}, options = {}) {
    injectToolbarStyles(iframeDoc);

    const { proseMode = true } = options;
    const toolbar = iframeDoc.createElement('div');
    toolbar.className = 'stub-player-format-toolbar';
    toolbar._editableEl = editableEl;
    toolbar._callbacks = callbacks;
    toolbar._tagMode = false;
    toolbar._proseMode = proseMode;

    const getOpeningTag = () => {
        const tag = editableEl.tagName.toLowerCase();
        const classes = editableEl.className ? ` class="${editableEl.className}"` : '';
        const id = editableEl.id ? ` id="${editableEl.id}"` : '';
        return `<${tag}${id}${classes}>`;
    };

    const disabledAttr = proseMode ? '' : ' disabled';
    const disabledTitle = proseMode ? '' : ' — text only';

    const renderFormatMode = () => {
        toolbar._tagMode = false;
        toolbar.classList.remove('tag-mode');
        toolbar.innerHTML = `
            <button data-cmd="bold" title="Bold (Ctrl+B)${disabledTitle}"${disabledAttr}><strong>B</strong></button>
            <button data-cmd="italic" title="Italic (Ctrl+I)${disabledTitle}"${disabledAttr}><em>I</em></button>
            <button data-cmd="underline" title="Underline (Ctrl+U)${disabledTitle}"${disabledAttr}><u>U</u></button>
            <div class="separator"></div>
            <button data-action="tag-edit" class="tag-edit-btn" title="${proseMode ? 'Edit Tag/Classes' : 'Tag editing unavailable — text only'}"${disabledAttr}>&lt;/&gt;</button>
        `;

        toolbar.querySelectorAll('button[data-cmd]:not(:disabled)').forEach(btn => {
            btn.addEventListener('mousedown', (e) => {
                e.preventDefault();
                iframeDoc.execCommand(btn.dataset.cmd, false, null);
                updateToolbarState(toolbar, iframeDoc);
            });
        });

        const tagEditBtn = toolbar.querySelector('[data-action="tag-edit"]:not(:disabled)');
        if (tagEditBtn) {
            tagEditBtn.addEventListener('mousedown', (e) => {
                e.preventDefault();
                renderTagMode();
            });
        }

        updateToolbarState(toolbar, iframeDoc);
    };

    const renderTagMode = () => {
        toolbar._tagMode = true;
        toolbar.classList.add('tag-mode');
        const currentTag = getOpeningTag();
        const escapedTag = currentTag.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        toolbar.innerHTML = `
            <textarea class="tag-input" rows="1" title="Edit opening tag">${escapedTag}</textarea>
            <button class="tag-save-btn" title="Save (Ctrl+Enter)">Save</button>
            <button class="tag-cancel-btn" title="Cancel (Esc)">×</button>
        `;

        const input = toolbar.querySelector('.tag-input');
        input.focus();
        // Place cursor at end, don't select
        input.setSelectionRange(input.value.length, input.value.length);

        // Decode HTML entities back for the actual value
        input.value = currentTag;

        const saveTagEdit = async () => {
            const newTag = input.value.trim();
            if (callbacks.onTagSave) {
                try {
                    const result = await callbacks.onTagSave(newTag);
                    if (result && result.error) {
                        input.style.borderColor = '#ff4444';
                        input.title = result.error;
                        return;
                    }
                } catch (_err) {
                    input.style.borderColor = '#ff4444';
                    return;
                }
            }
            renderFormatMode();
            editableEl.focus();
        };

        const cancelTagEdit = () => {
            renderFormatMode();
            editableEl.focus();
        };

        toolbar.querySelector('.tag-save-btn').addEventListener('mousedown', (e) => {
            e.preventDefault();
            saveTagEdit();
        });

        toolbar.querySelector('.tag-cancel-btn').addEventListener('mousedown', (e) => {
            e.preventDefault();
            cancelTagEdit();
        });

        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                saveTagEdit();
            } else if (e.key === 'Escape') {
                e.preventDefault();
                cancelTagEdit();
            }
        });

        input.addEventListener('blur', (e) => {
            if (toolbar.contains(e.relatedTarget)) return;
            setTimeout(() => {
                if (toolbar._tagMode && toolbar.isConnected) renderFormatMode();
            }, 100);
        });
    };

    const rect = editableEl.getBoundingClientRect();
    const scrollTop = iframeDoc.documentElement.scrollTop || iframeDoc.body.scrollTop;
    toolbar.style.left = rect.left + 'px';
    toolbar.style.top = (rect.top + scrollTop - 44) + 'px';

    renderFormatMode();
    iframeDoc.body.appendChild(toolbar);
    return toolbar;
}

function updateToolbarState(toolbar, iframeDoc) {
    if (toolbar._tagMode) return;
    const boldBtn = toolbar.querySelector('[data-cmd="bold"]');
    const italicBtn = toolbar.querySelector('[data-cmd="italic"]');
    const underlineBtn = toolbar.querySelector('[data-cmd="underline"]');
    if (boldBtn) boldBtn.classList.toggle('active', iframeDoc.queryCommandState('bold'));
    if (italicBtn) italicBtn.classList.toggle('active', iframeDoc.queryCommandState('italic'));
    if (underlineBtn) underlineBtn.classList.toggle('active', iframeDoc.queryCommandState('underline'));
}

function removeToolbar() {
    if (currentToolbar) {
        currentToolbar.remove();
        currentToolbar = null;
    }
}
