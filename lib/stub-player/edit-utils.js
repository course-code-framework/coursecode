/**
 * stub-player/edit-utils.js - Shared editing utilities
 * 
 * Provides reusable edit form rendering and save logic for both
 * standalone interactions and assessment questions.
 */

/**
 * Escape HTML entities for safe rendering in form values
 */
export function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * Render an edit form for an interaction or question
 * Now schema-aware when a schema is provided
 * @param {Object} item - The interaction or question object with type
 * @param {Object|null} schema - Optional schema for the interaction type
 * @returns {string} HTML string for the edit form
 */
export function renderEditForm(item, schema = null) {
    let html = '<div class="edit-form">';

    // If no schema provided, fall back to legacy hardcoded rendering
    if (!schema) {
        return renderLegacyEditForm(item);
    }

    const props = schema.properties || {};
    // schema.extends contains base properties directly (not nested under .properties)
    const baseProps = schema.extends || {};
    const allProps = { ...baseProps, ...props };

    // Priority order for common fields
    const priorityFields = ['label', 'prompt', 'correctAnswer'];
    const sortedKeys = [
        ...priorityFields.filter(k => k in allProps),
        ...Object.keys(allProps).filter(k => !priorityFields.includes(k) && !['id'].includes(k))
    ];

    for (const propName of sortedKeys) {
        const propDef = allProps[propName];
        // Handle zones/dropZones naming mismatch between schema and data
        let value = item[propName];
        if (propName === 'dropZones' && value === undefined) {
            value = item['zones']; // Fallback to zones if dropZones not found
        }
        const isPresent = value !== undefined && value !== null;

        // Skip non-editable or complex nested types for now
        if (propDef.type === 'object') continue;

        const requiredIndicator = propDef.required ? '<span class="required-indicator" title="Required">*</span>' : '';
        const tooltip = propDef.description ? ` title="${escapeHtml(propDef.description)}"` : '';
        const label = formatLabel(propName);

        html += `<div class="edit-field"${tooltip}>`;
        html += `<label>${label}${requiredIndicator}</label>`;

        // Render appropriate input based on type
        if (propDef.type === 'boolean') {
            const checked = value === true || value === 'true';
            html += `<select name="${propName}">
                <option value="true" ${checked ? 'selected' : ''}>True</option>
                <option value="false" ${!checked ? 'selected' : ''}>False</option>
            </select>`;
        } else if (propDef.enum) {
            html += `<select name="${propName}">`;
            for (const opt of propDef.enum) {
                html += `<option value="${escapeHtml(opt)}" ${value === opt ? 'selected' : ''}>${escapeHtml(opt)}</option>`;
            }
            html += '</select>';
        } else if (propDef.type === 'array') {
            // Special handling for common array types
            if (propName === 'choices' && Array.isArray(value)) {
                html += renderChoicesEditor(value, item.correctAnswer);
            } else if (propName === 'pairs' && Array.isArray(value)) {
                html += renderPairsEditor(value);
            } else if (propName === 'items' && Array.isArray(value)) {
                html += renderItemsEditor(value);
            } else if ((propName === 'zones' || propName === 'dropZones') && Array.isArray(value)) {
                html += renderZonesEditor(value);
            } else if (propName === 'scale' && Array.isArray(value)) {
                html += renderScaleEditor(value);
            } else if (propName === 'questions' && Array.isArray(value)) {
                html += renderSubQuestionsEditor(value);
            } else {
                // Generic array display
                html += `<textarea name="${propName}" rows="3" readonly>${escapeHtml(JSON.stringify(value, null, 2))}</textarea>`;
            }
        } else if (propName === 'template') {
            // Fill-in-the-blank template with syntax helper
            html += `<textarea name="${propName}" rows="3">${escapeHtml(value || '')}</textarea>`;
            html += '<div class="template-syntax-help">Use <code>{{answer}}</code> for single blank or <code>{{1:answer}}</code> for multiple blanks</div>';
        } else if (propName === 'prompt' || propDef.multiline) {
            html += `<textarea name="${propName}" rows="2">${escapeHtml(value || '')}</textarea>`;
        } else if (propDef.type === 'number') {
            html += `<input type="number" name="${propName}" value="${isPresent ? value : ''}" />`;
        } else {
            html += `<input type="text" name="${propName}" value="${escapeHtml(value || '')}" />`;
        }

        html += '</div>';
    }

    html += `<div class="edit-actions">
        <button class="edit-save-btn">💾 Save</button>
        <button class="edit-cancel-btn">Cancel</button>
    </div>`;

    html += '</div>';
    return html;
}

/**
 * Format a camelCase property name as a human-readable label
 */
function formatLabel(propName) {
    return propName
        .replace(/([A-Z])/g, ' $1')
        .replace(/^./, s => s.toUpperCase())
        .trim();
}

/**
 * Render choices editor for multiple-choice questions
 */
function renderChoicesEditor(choices, correctAnswer) {
    let html = '<div class="edit-choices">';
    for (let i = 0; i < choices.length; i++) {
        const c = choices[i];
        const isCorrect = c.value === correctAnswer || c.correct === true;
        html += `<div class="edit-choice" data-index="${i}">
            <input type="radio" name="correctChoice" value="${c.value}" ${isCorrect ? 'checked' : ''} />
            <span class="choice-value">${c.value}:</span>
            <input type="text" name="choice-${i}" value="${escapeHtml(c.text)}" class="choice-text" />
        </div>`;
    }
    html += '</div>';
    return html;
}

/**
 * Render pairs editor for matching questions
 */
function renderPairsEditor(pairs) {
    let html = '<div class="edit-pairs">';
    for (let i = 0; i < pairs.length; i++) {
        const p = pairs[i];
        html += `<div class="edit-pair" data-index="${i}">
            <input type="text" name="pair-text-${i}" value="${escapeHtml(p.text)}" placeholder="Item" />
            <span class="pair-arrow">→</span>
            <input type="text" name="pair-match-${i}" value="${escapeHtml(p.match)}" placeholder="Match" />
        </div>`;
    }
    html += '</div>';
    return html;
}

/**
 * Render items editor for drag-drop/sequencing
 */
function renderItemsEditor(items) {
    let html = '<div class="edit-items">';
    for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const text = typeof item === 'string' ? item : (item.text || item.id || JSON.stringify(item));
        html += `<div class="edit-item" data-index="${i}">
            <span class="item-index">${i + 1}.</span>
            <input type="text" name="item-${i}" value="${escapeHtml(text)}" />
        </div>`;
    }
    html += '</div>';
    return html;
}

/**
 * Render zones editor for drag-drop questions
 */
function renderZonesEditor(zones) {
    let html = '<div class="edit-zones">';
    for (let i = 0; i < zones.length; i++) {
        const zone = zones[i];
        const id = typeof zone === 'string' ? zone : (zone.id || '');
        const label = typeof zone === 'string' ? zone : (zone.label || zone.text || zone.id || '');
        html += `<div class="edit-zone" data-index="${i}">
            <input type="text" name="zone-id-${i}" value="${escapeHtml(id)}" placeholder="Zone ID" class="zone-id" />
            <input type="text" name="zone-label-${i}" value="${escapeHtml(label)}" placeholder="Zone Label" class="zone-label" />
        </div>`;
    }
    html += '</div>';
    return html;
}

/**
 * Render scale editor for likert questions
 */
function renderScaleEditor(scale) {
    let html = '<div class="edit-scale">';
    for (let i = 0; i < scale.length; i++) {
        const point = scale[i];
        html += `<div class="edit-scale-point" data-index="${i}">
            <input type="text" name="scale-value-${i}" value="${escapeHtml(point.value || String(i + 1))}" class="scale-value" />
            <input type="text" name="scale-label-${i}" value="${escapeHtml(point.label || '')}" class="scale-label" placeholder="Label" />
        </div>`;
    }
    html += '</div>';
    return html;
}

/**
 * Render sub-questions editor for likert (multi-statement)
 */
function renderSubQuestionsEditor(questions) {
    let html = '<div class="edit-subquestions">';
    for (let i = 0; i < questions.length; i++) {
        const q = questions[i];
        html += `<div class="edit-subquestion" data-index="${i}">
            <span class="subq-index">${i + 1}.</span>
            <input type="text" name="subq-${i}" value="${escapeHtml(q.text || q)}" />
        </div>`;
    }
    html += '</div>';
    return html;
}

/**
 * Legacy fallback for when no schema is available
 */
function renderLegacyEditForm(item) {
    let html = '<div class="edit-form">';

    // Label field
    if (item.label !== undefined) {
        html += `<div class="edit-field">
            <label>Label</label>
            <input type="text" name="label" value="${escapeHtml(item.label)}" />
        </div>`;
    }

    // Prompt field
    if (item.prompt !== undefined) {
        html += `<div class="edit-field">
            <label>Prompt</label>
            <textarea name="prompt" rows="2">${escapeHtml(item.prompt)}</textarea>
        </div>`;
    }

    // Correct answer field (for T/F, text input, numeric - not MC)
    if (item.correctAnswer !== undefined && item.type !== 'multiple-choice') {
        if (item.type === 'true-false') {
            const isTrue = item.correctAnswer === true || item.correctAnswer === 'true';
            html += `<div class="edit-field">
                <label>Correct Answer</label>
                <select name="correctAnswer">
                    <option value="true" ${isTrue ? 'selected' : ''}>True</option>
                    <option value="false" ${!isTrue ? 'selected' : ''}>False</option>
                </select>
            </div>`;
        } else {
            html += `<div class="edit-field">
                <label>Correct Answer</label>
                <input type="text" name="correctAnswer" value="${escapeHtml(item.correctAnswer)}" />
            </div>`;
        }
    }

    // Choices field (for multiple-choice)
    if (item.choices && item.choices.length > 0) {
        html += '<div class="edit-field"><label>Choices</label>';
        html += renderChoicesEditor(item.choices, item.correctAnswer);
        html += '</div>';
    }

    // Pairs field (for matching)
    if (item.pairs && item.pairs.length > 0) {
        html += '<div class="edit-field"><label>Pairs</label>';
        html += renderPairsEditor(item.pairs);
        html += '</div>';
    }

    html += `<div class="edit-actions">
        <button class="edit-save-btn">💾 Save</button>
        <button class="edit-cancel-btn">Cancel</button>
    </div>`;

    html += '</div>';
    return html;
}

/**
 * Save edits by posting to the server
 * @param {string} endpoint - API endpoint (e.g., '/__edit-interaction')
 * @param {Element} form - The form DOM element
 * @param {string} slideId - Slide identifier
 * @param {string} itemId - Interaction or question ID
 * @returns {Promise<boolean>} Success status
 */
export async function saveItemEdits(endpoint, form, slideId, itemId) {
    const edits = {};

    // 1. Label
    const labelInput = form.querySelector('[name="label"]');
    if (labelInput) edits.label = labelInput.value;

    // 2. Prompt
    const promptInput = form.querySelector('[name="prompt"]');
    if (promptInput) edits.prompt = promptInput.value;

    // 3. Choices (Array)
    const choiceInputs = form.querySelectorAll('[name^="choice-"]');
    if (choiceInputs.length > 0) {
        // Collect choices by finding container elements to ensure we get value+text pairs
        const choiceContainers = form.querySelectorAll('.edit-choice');
        const choices = [];

        choiceContainers.forEach(container => {
            const textInput = container.querySelector('.choice-text');
            // The radio value typically holds the choice ID/Value
            const radio = container.querySelector('input[type="radio"]');

            if (textInput && radio) {
                choices.push({
                    value: radio.value,
                    text: textInput.value
                });
            }
        });

        if (choices.length > 0) edits.choices = choices;
    }

    // 4. Pairs (Matching)
    const pairContainers = form.querySelectorAll('.edit-pair');
    if (pairContainers.length > 0) {
        const pairs = [];
        pairContainers.forEach(container => {
            const textInput = container.querySelector('input[placeholder="Item"]');
            const matchInput = container.querySelector('input[placeholder="Match"]');
            if (textInput && matchInput) {
                pairs.push({
                    text: textInput.value,
                    match: matchInput.value
                });
            }
        });
        if (pairs.length > 0) edits.pairs = pairs;
    }

    // 5. Correct Answer
    // Handle Boolean (True/False)
    const correctSelect = form.querySelector('select[name="correctAnswer"]');
    if (correctSelect) {
        edits.correctAnswer = correctSelect.value === 'true';
    } else {
        // Handle Text Input
        const correctInput = form.querySelector('input[name="correctAnswer"]');
        if (correctInput) {
            edits.correctAnswer = correctInput.value;
        } else {
            // Handle Choice Radio
            const correctRadio = form.querySelector('input[name="correctChoice"]:checked');
            if (correctRadio) {
                edits.correctAnswer = correctRadio.value;
            }
        }
    }

    // 6. Generic Loop for other simple fields
    const otherInputs = form.querySelectorAll('input:not([name^="choice-"]):not([name^="pair-"]):not([name^="item-"]):not([name="correctAnswer"]):not([name="correctChoice"]), select:not([name="correctAnswer"])');
    otherInputs.forEach(input => {
        if (input.type === 'radio' || input.type === 'checkbox' || input.type === 'submit' || input.type === 'button') return;
        if (input.name && !edits[input.name]) {
            // Basic type conversion
            edits[input.name] = input.type === 'number' ? parseFloat(input.value) : input.value;
        }
    });

    try {
        const res = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ slideId, interactionId: itemId, edits })
        });

        if (!res.ok) {
            const data = await res.json();
            console.error('Edit failed:', data.error);
            alert('Failed to save: ' + (data.error || 'Unknown error'));
            return false;
        }
        return true;
    } catch (err) {
        console.error('Edit error:', err);
        alert('Error saving edits: ' + err.message);
        return false;
    }
}
