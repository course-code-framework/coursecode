/**
 * stub-player/interaction-editor.js - Popup modal for editing interactions
 * 
 * Provides a reusable popup editor that opens when clicking on interaction
 * components in the preview iframe. Reuses renderEditForm from edit-utils.js.
 */

import { renderEditForm, saveItemEdits } from './edit-utils.js';

let currentInteraction = null;
let onSaveCallback = null;

/**
 * Generate the editor modal HTML
 */
export function generateInteractionEditor() {
    return `
    <div id="stub-player-interaction-editor" class="interaction-editor-overlay">
        <div class="interaction-editor-modal">
            <div class="interaction-editor-header">
                <div class="interaction-editor-title">
                    <span class="interaction-type-badge"></span>
                    <span class="interaction-id-text"></span>
                </div>
                <button class="interaction-editor-close" title="Close">&times;</button>
            </div>
            <div class="interaction-editor-body">
                <!-- Form content will be injected here -->
            </div>
            <div class="interaction-editor-footer">
                <button class="interaction-editor-cancel">Cancel</button>
                <button class="interaction-editor-save btn-primary">💾 Save</button>
            </div>
        </div>
    </div>
    `;
}

/**
 * Initialize the interaction editor handlers
 * @param {Object} options
 * @param {Function} options.onSave - Callback after successful save (refresh content)
 */
export function initInteractionEditor(options = {}) {
    onSaveCallback = options.onSave || null;

    const overlay = document.getElementById('stub-player-interaction-editor');
    if (!overlay) return;

    const closeBtn = overlay.querySelector('.interaction-editor-close');
    const cancelBtn = overlay.querySelector('.interaction-editor-cancel');
    const saveBtn = overlay.querySelector('.interaction-editor-save');

    // Close handlers
    closeBtn?.addEventListener('click', closeEditor);
    cancelBtn?.addEventListener('click', closeEditor);

    // Click outside to close
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
            closeEditor();
        }
    });

    // Escape key to close
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && overlay.classList.contains('visible')) {
            closeEditor();
        }
    });

    // Save handler
    saveBtn?.addEventListener('click', handleSave);
}



/**
 * Open the editor for a specific interaction
 * @param {Object} interaction - The interaction data object
 * @param {string} slideId - The slide ID containing this interaction
 */
export async function openEditor(interaction, slideId) {
    if (!interaction || !interaction.id) {
        console.warn('Cannot open editor: invalid interaction data');
        return;
    }

    currentInteraction = { ...interaction, slideId };

    const overlay = document.getElementById('stub-player-interaction-editor');
    const body = overlay?.querySelector('.interaction-editor-body');
    const typeBadge = overlay?.querySelector('.interaction-type-badge');
    const idText = overlay?.querySelector('.interaction-id-text');

    if (!overlay || !body) return;

    // Set header info
    if (typeBadge) typeBadge.textContent = interaction.type || 'unknown';
    if (idText) idText.textContent = interaction.id;

    // Use schema from interaction (provided by manifest)
    const schema = interaction.schema || null;

    body.innerHTML = renderEditForm(interaction, schema);

    // Show the modal
    overlay.classList.add('visible');

    // Focus first input
    const firstInput = body.querySelector('input, textarea, select');
    if (firstInput) firstInput.focus();
}

/**
 * Open editor by fetching interaction data from server
 * @param {string} interactionId - The interaction ID
 * @param {string} slideId - The slide ID
 */
export async function openEditorById(interactionId, slideId) {
    try {
        // Fetch interactions from manifest
        const response = await fetch('/_content-manifest.json');
        if (!response.ok) {
            console.error('Failed to fetch manifest');
            return;
        }

        const manifest = await response.json();
        
        // Collect all interactions from slides
        let interaction = null;
        for (const [sId, slideData] of Object.entries(manifest.slides || {})) {
            const found = (slideData.interactions || []).find(i => i.id === interactionId);
            if (found) {
                interaction = { ...found, slideId: sId };
                break;
            }
        }

        // If not found in standalone interactions, check assessments
        if (!interaction) {
            for (const assessment of (manifest.assessments || [])) {
                const question = (assessment.questions || []).find(q => q.id === interactionId);
                if (question) {
                    interaction = { ...question, slideId: assessment.id };
                    break;
                }
            }
        }

        if (interaction) {
            await openEditor(interaction, slideId || interaction.slideId);
        } else {
            console.warn(`Interaction "${interactionId}" not found`);
        }
    } catch (err) {
        console.error('Failed to open editor:', err);
    }
}

/**
 * Close the editor modal
 */
export function closeEditor() {
    const overlay = document.getElementById('stub-player-interaction-editor');
    if (overlay) {
        overlay.classList.remove('visible');
    }
    currentInteraction = null;
}

/**
 * Handle save button click
 */
async function handleSave() {
    if (!currentInteraction) return;

    const overlay = document.getElementById('stub-player-interaction-editor');
    const form = overlay?.querySelector('.edit-form');

    if (!form) return;

    const saveBtn = overlay.querySelector('.interaction-editor-save');
    if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.textContent = 'Saving...';
    }

    try {
        const success = await saveItemEdits(
            '/__edit-interaction',
            form,
            currentInteraction.slideId,
            currentInteraction.id
        );

        if (success) {
            closeEditor();
            if (onSaveCallback) {
                onSaveCallback();
            }
        }
    } finally {
        if (saveBtn) {
            saveBtn.disabled = false;
            saveBtn.textContent = '💾 Save';
        }
    }
}
