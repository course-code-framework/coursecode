/**
 * stub-player/interactions-panel.js - Interactions panel component and handlers
 * 
 * Shows standalone interaction definitions from slide files (NOT assessment questions).
 * Provides viewing and inline editing of interaction properties.
 */

import { escapeHtml, renderEditForm, saveItemEdits } from './edit-utils.js';

const PANEL_ICON_PATHS = {
    interactions: '<path d="M12 7v14"/><path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z"/>',
    list: '<path d="M3 5h.01"/><path d="M3 12h.01"/><path d="M3 19h.01"/><path d="M8 5h13"/><path d="M8 12h13"/><path d="M8 19h13"/>',
    target: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
    slide: '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M3 9h18"/><path d="M9 21V9"/>',
    navigate: '<path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"/><circle cx="12" cy="10" r="3"/>',
    edit: '<path d="M13 21h8"/><path d="m15 5 4 4"/><path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/>',
    close: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>'
};

function renderPanelIcon(name, className = 'panel-icon') {
    const path = PANEL_ICON_PATHS[name];
    if (!path) return '';
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="${className}" aria-hidden="true">${path}</svg>`;
}


/**
 * Generate the Interactions Panel HTML container
 */
export function generateInteractionsPanel() {
    return `
    <div id="stub-player-interactions-panel">
        <div id="stub-player-interactions-panel-header">
            <h3>${renderPanelIcon('interactions')} Interactions</h3>
            <button id="stub-player-interactions-panel-close">&times;</button>
        </div>
        <div id="stub-player-interactions-tabs">
            <button class="active" data-tab="all">${renderPanelIcon('list', 'tab-icon')} <span>Interactions</span></button>
            <button data-tab="assessments">${renderPanelIcon('target', 'tab-icon')} <span>Assessments</span></button>
            <button data-tab="slide">${renderPanelIcon('slide', 'tab-icon')} <span>This Slide</span></button>
        </div>
        <div id="stub-player-interactions-body">
            <div class="interactions-loading">Loading...</div>
        </div>
    </div>
    `;
}

/**
 * Create interactions panel handlers
 * @param {Object} context - Shared context containing cmiData, navigateToSlide, etc.
 * @returns {Object} Panel handler methods
 */
export function createInteractionsPanelHandlers(context) {
    const { getCmiData, navigateToSlide } = context;

    let interactionsData = null;
    let assessmentsData = null;
    let interactionSchemas = {};
    let currentTab = 'all';
    let editingInteractionId = null;
    let currentAssessmentId = null;

    const interactionsPanel = document.getElementById('stub-player-interactions-panel');
    const interactionsTabs = document.getElementById('stub-player-interactions-tabs');
    const interactionsBody = document.getElementById('stub-player-interactions-body');
    const closeBtn = document.getElementById('stub-player-interactions-panel-close');

    // Setup tab handlers
    function setupTabs() {
        if (!interactionsTabs) return;
        interactionsTabs.querySelectorAll('button').forEach(btn => {
            btn.addEventListener('click', () => {
                interactionsTabs.querySelectorAll('button').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                setTab(btn.dataset.tab);
            });
        });
    }

    // Close button handler
    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            interactionsPanel?.classList.remove('visible');
        });
    }

    // Initialize tabs on creation
    setupTabs();

    async function loadInteractions() {
        if (!interactionsBody) return;
        interactionsBody.innerHTML = '<div class="interactions-loading">Loading...</div>';
        try {
            // Load manifest (contains slides & interactions) and assessments
            const [manifestResponse, assessResponse, schemaResponse] = await Promise.all([
                fetch('/_content-manifest.json'),
                fetch('/__assessments'),
                fetch('/__interaction-schemas')
            ]);

            if (schemaResponse.ok) {
                const schemaData = await schemaResponse.json();
                interactionSchemas = schemaData?.schemas || {};
            }
            
            if (manifestResponse.ok) {
                const manifest = await manifestResponse.json();
                
                // Flatten interactions from slides structure
                const interactions = [];
                if (manifest && manifest.slides) {
                    for (const [slideId, slideData] of Object.entries(manifest.slides)) {
                        if (slideData.interactions) {
                            for (const interaction of slideData.interactions) {
                                interactions.push({
                                    ...interaction,
                                    schema: interaction.schema || interactionSchemas[interaction.type] || null,
                                    slideId // Ensure slideId is attached
                                });
                            }
                        }
                    }
                }
                
                interactionsData = { interactions };
            }
            
            if (assessResponse.ok) {
                const data = await assessResponse.json();
                assessmentsData = data.assessments || [];
            }
            render();
        } catch (err) {
            interactionsBody.innerHTML = '<div class="interactions-empty">Error: ' + err.message + '</div>';
        }
    }

    function setTab(tab) {
        currentTab = tab;
        editingInteractionId = null;
        render();
    }

    function render() {
        if (!interactionsBody) return;

        if (currentTab === 'slide') {
            renderSlideTab();
        } else if (currentTab === 'all') {
            renderInteractionsTab();
        } else if (currentTab === 'assessments') {
            renderAssessmentsTab();
        }
    }

    // =========================================================================
    // THIS SLIDE TAB - Context-aware
    // =========================================================================
    function renderSlideTab() {
        const cmiData = getCmiData();
        const currentSlide = cmiData['cmi.location'] || '';

        // Check if current slide is an assessment
        const assessment = assessmentsData?.find(a => a.id === currentSlide);

        if (assessment) {
            // Show assessment details for this slide
            renderSingleAssessment(assessment);
        } else {
            // Show interactions for this slide
            const interactions = (interactionsData?.interactions || []).filter(i => i.slideId === currentSlide);

            if (interactions.length === 0) {
                interactionsBody.innerHTML = '<div class="interactions-empty">No interactions on current slide</div>';
                return;
            }

            renderInteractionsList(interactions);
        }
    }

    // =========================================================================
    // INTERACTIONS TAB - All interactions
    // =========================================================================
    function renderInteractionsTab() {
        const interactions = interactionsData?.interactions || [];

        if (interactions.length === 0) {
            interactionsBody.innerHTML = '<div class="interactions-empty">No standalone interactions found in course</div>';
            return;
        }

        const grouped = new Map();
        for (const interaction of interactions) {
            const key = interaction.slideId || 'unknown-slide';
            if (!grouped.has(key)) grouped.set(key, []);
            grouped.get(key).push(interaction);
        }

        const slideIds = Array.from(grouped.keys()).sort((a, b) => a.localeCompare(b));
        let html = '<div class="interaction-groups">';

        for (const slideId of slideIds) {
            const groupInteractions = grouped.get(slideId);
            html += `
                <section class="interaction-group">
                    <div class="interaction-group-header">
                        <div class="interaction-group-title-wrap">
                            ${renderPanelIcon('slide', 'group-icon')}
                            <h4 class="interaction-group-title">${escapeHtml(slideId)}</h4>
                            <span class="interaction-group-count">${groupInteractions.length}</span>
                        </div>
                        <button class="interaction-nav-btn with-label" data-slide="${escapeHtml(slideId)}" title="Go to slide">${renderPanelIcon('navigate', 'action-icon')} <span>Open</span></button>
                    </div>
                    <div class="interactions-list">
                        ${groupInteractions.map(interaction => renderInteractionCard(interaction)).join('')}
                    </div>
                </section>
            `;
        }

        html += '</div>';
        interactionsBody.innerHTML = html;
        attachInteractionHandlers();
    }

    function renderInteractionsList(interactions) {
        let html = '<div class="interactions-list">';

        for (const interaction of interactions) {
            html += renderInteractionCard(interaction);
        }

        html += '</div>';
        interactionsBody.innerHTML = html;
        attachInteractionHandlers();
    }

    function attachInteractionHandlers() {
        interactionsBody.querySelectorAll('.interaction-nav-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                navigateToSlide(btn.dataset.slide);
            });
        });

        interactionsBody.querySelectorAll('.interaction-edit-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const id = btn.dataset.id;
                editingInteractionId = (editingInteractionId === id) ? null : id;
                render();
            });
        });

        interactionsBody.querySelectorAll('.edit-save-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const card = btn.closest('.interaction-card');
                const form = card.querySelector('.edit-form');
                const interactionId = card.dataset.interactionId;
                const slideId = card.dataset.slideId;
                await saveItemEdits('/__edit-interaction', form, slideId, interactionId);
                editingInteractionId = null;
                await loadInteractions();
            });
        });

        interactionsBody.querySelectorAll('.edit-cancel-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                editingInteractionId = null;
                render();
            });
        });
    }

    // =========================================================================
    // ASSESSMENTS TAB - All assessments
    // =========================================================================
    function renderAssessmentsTab() {
        if (!assessmentsData || assessmentsData.length === 0) {
            interactionsBody.innerHTML = '<div class="interactions-empty">No assessments found</div>';
            return;
        }

        // Ensure current selection is valid
        if (!currentAssessmentId || !assessmentsData.find(a => a.id === currentAssessmentId)) {
            currentAssessmentId = assessmentsData[0].id;
        }

        // Render assessment sub-tabs
        let tabsHtml = '<div class="assessment-sub-tabs">';
        for (const assessment of assessmentsData) {
            const active = assessment.id === currentAssessmentId ? 'active' : '';
            const title = assessment.title || assessment.id;
            tabsHtml += `<button class="${active}" data-assessment-id="${escapeHtml(assessment.id)}">${escapeHtml(title)}</button>`;
        }
        tabsHtml += '</div>';

        const assessment = assessmentsData.find(a => a.id === currentAssessmentId);
        let bodyHtml = '';
        if (assessment) {
            bodyHtml = renderAssessmentDetails(assessment);
        }

        interactionsBody.innerHTML = tabsHtml + bodyHtml;

        // Attach assessment sub-tab handlers
        interactionsBody.querySelectorAll('.assessment-sub-tabs button').forEach(btn => {
            btn.addEventListener('click', () => {
                currentAssessmentId = btn.dataset.assessmentId;
                editingInteractionId = null; // Clear editing state when switching tabs
                renderAssessmentsTab();
            });
        });

        // Attach all assessment handlers (nav, settings)
        if (assessment) {
            attachAssessmentHandlers(assessment);
            attachInteractionHandlers(); // For question editing
        }
    }

    function renderSingleAssessment(assessment) {
        interactionsBody.innerHTML = renderAssessmentDetails(assessment);
        attachAssessmentHandlers(assessment);
        attachInteractionHandlers(); // For question editing
    }

    function attachAssessmentHandlers(assessment) {
        const assessmentId = assessment.id;

        // Attach navigation handler
        interactionsBody.querySelectorAll('.interaction-nav-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                navigateToSlide(btn.dataset.slide);
            });
        });

        // Toggle click handlers (save immediately)
        interactionsBody.querySelectorAll('.assessment-config-toggle[data-field]').forEach(toggle => {
            toggle.addEventListener('click', async function () {
                const isOn = this.classList.contains('on');
                this.classList.toggle('on');
                const field = this.dataset.field;
                await saveAssessmentValue(assessmentId, field, !isOn);
            });
        });

        // Input handlers (save with debounce)
        interactionsBody.querySelectorAll('.assessment-config-input[data-field]').forEach(input => {
            let timeout;
            input.addEventListener('input', function () {
                clearTimeout(timeout);
                timeout = setTimeout(async () => {
                    const field = this.dataset.field;
                    const isArray = this.dataset.type === 'array';
                    let value;

                    if (isArray) {
                        const trimmed = this.value.trim();
                        value = trimmed ? trimmed.split(',').map(s => s.trim()).filter(Boolean) : [];
                    } else if (this.type === 'number') {
                        if (this.value === '' || this.value === 'null') {
                            value = null;
                        } else {
                            value = parseInt(this.value, 10);
                        }
                    } else {
                        value = this.value;
                    }

                    await saveAssessmentValue(assessmentId, field, value);
                }, 500);
            });
        });
    }

    async function saveAssessmentValue(assessmentId, field, value) {
        try {
            const response = await fetch('/__edit-assessment', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ assessmentId, field, value })
            });
            if (!response.ok) {
                const error = await response.json();
                console.error('Assessment save error:', error);
            }
        } catch (err) {
            console.error('Failed to save assessment setting:', err);
        }
    }

    function renderAssessmentDetails(assessment) {
        const settings = assessment.settings || assessment.config || {};
        const questions = assessment.questions || [];

        let html = `
            <div class="assessment-info" data-assessment-id="${escapeHtml(assessment.id)}">
                <h4>${escapeHtml(assessment.title || assessment.id)}</h4>
                <div class="assessment-meta">
                    <span class="meta-item">ID: ${escapeHtml(assessment.id)}</span>
                    <button class="interaction-nav-btn with-label" data-slide="${escapeHtml(assessment.id)}" title="Go to start slide">${renderPanelIcon('navigate', 'action-icon')} <span>Go to Slide</span></button>
                </div>
            `;

        // Settings section - always editable (inline pattern)
        html += `<div class="config-section">
                <div class="config-section-header">Settings</div>
                <div class="config-row">
                    <span class="config-label">Passing Score</span>
                    <input type="number" class="config-input assessment-config-input assessment-config-score-input" data-field="passingScore" value="${settings.passingScore ?? 80}" min="0" max="100">
                    <span class="config-hint-inline">%</span>
                </div>
                <div class="config-row">
                    <span class="config-label">Allow Retake</span>
                    <div class="config-toggle assessment-config-toggle ${settings.allowRetake !== false ? 'on' : ''}" data-field="allowRetake"></div>
                </div>
                <div class="config-row">
                    <span class="config-label">Allow Review</span>
                    <div class="config-toggle assessment-config-toggle ${settings.allowReview !== false ? 'on' : ''}" data-field="allowReview"></div>
                </div>
                <div class="config-row">
                    <span class="config-label">Randomize Questions</span>
                    <div class="config-toggle assessment-config-toggle ${settings.randomizeQuestions ? 'on' : ''}" data-field="randomizeQuestions"></div>
                </div>
                <div class="config-row">
                    <span class="config-label">Randomize on Retake</span>
                    <div class="config-toggle assessment-config-toggle ${settings.randomizeOnRetake !== false ? 'on' : ''}" data-field="randomizeOnRetake"></div>
                </div>
                <div class="config-row">
                    <span class="config-label">Show Progress</span>
                    <div class="config-toggle assessment-config-toggle ${settings.showProgress !== false ? 'on' : ''}" data-field="showProgress"></div>
                </div>
                <div class="config-row">
                    <span class="config-label">Attempts Before Remedial</span>
                    <input type="number" class="config-input assessment-config-input assessment-config-attempts-input" data-field="attemptsBeforeRemedial" value="${settings.attemptsBeforeRemedial ?? ''}" min="1" placeholder="unlimited">
                </div>
                <div class="config-row">
                    <span class="config-label">Attempts Before Restart</span>
                    <input type="number" class="config-input assessment-config-input assessment-config-attempts-input" data-field="attemptsBeforeRestart" value="${settings.attemptsBeforeRestart ?? ''}" min="1" placeholder="unlimited">
                </div>
                <div class="config-row">
                    <span class="config-label">Remedial Slides</span>
                    <input type="text" class="config-input assessment-config-input assessment-config-remedial-input" data-field="remedialSlideIds" data-type="array" value="${settings.remedialSlideIds ? settings.remedialSlideIds.join(', ') : ''}" placeholder="slide-1, slide-2">
                </div>
            </div>`;

        // Questions List - reuse interaction card components
        if (questions.length > 0) {
            html += `
                <section class="interaction-group assessment-interactions-section">
                    <div class="interaction-group-header">
                        <div class="interaction-group-title-wrap">
                            ${renderPanelIcon('list', 'group-icon')}
                            <h4 class="interaction-group-title">Questions</h4>
                            <span class="interaction-group-count">${questions.length}</span>
                        </div>
                    </div>
                    <div class="interactions-list assessment-interactions-list">
            `;

            for (const q of questions) {
                // Preserve full question payload so schema editors can bind correctly.
                const interaction = {
                    ...q,
                    schema: q.schema || interactionSchemas[q.type] || null,
                    slideId: assessment.id,
                };
                html += renderInteractionCard(interaction, q.weight);
            }

            html += '</div></section>';
        } else {
            html += '<div class="interactions-empty">No questions defined</div>';
        }

        html += '</div>'; // End assessment-info
        return html;
    }

    // Shared helper for rendering a single interaction/question card
    function renderInteractionCard(interaction, weight = null) {
        const isEditing = editingInteractionId === interaction.id;

        let html = `<div class="interaction-card${isEditing ? ' editing' : ''}" data-interaction-id="${interaction.id}" data-slide-id="${interaction.slideId}">
            <div class="interaction-header">
                <div class="interaction-header-left">
                    <span class="interaction-type">${interaction.type}</span>
                    <span class="interaction-id">${interaction.id}</span>
                    ${weight !== null ? `<span class="interaction-weight">Weight: ${weight}</span>` : ''}
                </div>
                <div class="interaction-header-right">
                    <button class="interaction-edit-btn icon-btn" data-id="${interaction.id}" title="${isEditing ? 'Cancel edit' : 'Edit interaction'}">${isEditing ? renderPanelIcon('close', 'action-icon') : renderPanelIcon('edit', 'action-icon')}</button>
                    <button class="interaction-nav-btn icon-btn" data-slide="${interaction.slideId}" title="Go to slide">${renderPanelIcon('navigate', 'action-icon')}</button>
                </div>
            </div>`;

        if (isEditing) {
            const schema = interaction.schema;
            if (!schema) {
                console.warn(
                    '[InteractionsPanel] Schema not found for interaction type "' + interaction.type + '". ' +
                    'Falling back to legacy editor for interaction "' + interaction.id + '" on slide "' + interaction.slideId + '".'
                );
            }
            html += renderEditForm(interaction, schema || null);
        } else {
            if (interaction.label) {
                html += `<div class="interaction-label">${escapeHtml(interaction.label)}</div>`;
            }

            if (interaction.prompt) {
                html += `<div class="interaction-prompt">${escapeHtml(interaction.prompt)}</div>`;
            }

            if (interaction.correctAnswer !== undefined && interaction.correctAnswer !== null) {
                html += `<div class="interaction-detail">
                    <span class="detail-label">Correct Answer:</span>
                    <span class="detail-value">${escapeHtml(String(interaction.correctAnswer))}</span>
                </div>`;
            }

            if (interaction.choices && interaction.choices.length > 0) {
                html += '<div class="interaction-choices">';
                html += '<span class="detail-label">Choices:</span><ul>';
                for (const c of interaction.choices) {
                    const marker = c.correct ? ' ✓' : '';
                    html += `<li>${escapeHtml(c.value)}: ${escapeHtml(c.text)}${marker}</li>`;
                }
                html += '</ul></div>';
            }

            if (interaction.pairs && interaction.pairs.length > 0) {
                html += '<div class="interaction-pairs">';
                html += '<span class="detail-label">Pairs:</span><ul>';
                for (const p of interaction.pairs) {
                    html += `<li>${escapeHtml(p.text)} → ${escapeHtml(p.match)}</li>`;
                }
                html += '</ul></div>';
            }
        }

        html += '</div>';
        return html;
    }

    function onLocationChange() {
        // Re-render if on "This Slide" tab
        if (currentTab === 'slide' && (interactionsData || assessmentsData)) {
            render();
        }
    }

    return {
        loadInteractions,
        render,
        setTab,
        onLocationChange,
        get data() { return interactionsData; }
    };
}
