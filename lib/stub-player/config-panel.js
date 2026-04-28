/**
 * stub-player/config-panel.js - Config panel component
 * 
 * Generates the config panel HTML for viewing and editing course configuration.
 */

/**
 * Generate config panel HTML
 * Note: Content is populated dynamically by JS, this creates the container/tabs
 */
export function generateConfigPanel() {
    return `
    <div id="stub-player-config-panel">
        <div id="stub-player-config-panel-header">
            <h3>📋 Course Config</h3>
            <button id="stub-player-config-panel-close">&times;</button>
        </div>
        <div id="stub-player-config-tabs">
            <button class="active" data-tab="course">Course</button>
            <button data-tab="slide">Slide</button>
            <button data-tab="objectives">Objectives</button>
            <button data-tab="engagement">Engagement</button>
            <button data-tab="raw">Raw</button>
        </div>
        <div id="stub-player-config-body">
            <div class="config-loading">Loading config...</div>
        </div>
    </div>
    `;
}

/**
 * Initialize Client-Side Handlers
 */
import { escapeHtml } from './edit-utils.js';

export function createConfigPanelHandlers(context) {
    const { getCmiData } = context;

    let configData = null;
    let currentSlideConfig = null;
    let currentConfigTab = 'course';

    const configBody = document.getElementById('stub-player-config-body');

    // Tab switching
    const tabs = document.querySelectorAll('#stub-player-config-tabs button');
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');

            currentConfigTab = tab.dataset.tab;
            renderConfigTab();
        });
    });

    // Close button
    document.getElementById('stub-player-config-panel-close')?.addEventListener('click', () => {
        document.getElementById('stub-player-config-panel').classList.remove('visible');
    });

    async function loadConfig() {
        if (!configBody) return;

        configBody.innerHTML = '<div class="config-loading">Loading config...</div>';

        try {
            const response = await fetch('/__config');
            if (response.ok) {
                configData = await response.json();
                renderConfigTab();
            } else {
                configBody.innerHTML = '<div class="config-error">Failed to load config</div>';
            }
        } catch (err) {
            configBody.innerHTML = '<div class="config-error">Error: ' + err.message + '</div>';
        }
    }

    function renderConfigTab() {
        if (!configData || !configBody) return;

        if (currentConfigTab === 'course') {
            renderCourseTab();
        } else if (currentConfigTab === 'slide') {
            renderSlideTab();
        } else if (currentConfigTab === 'objectives') {
            renderObjectivesTab();
        } else if (currentConfigTab === 'engagement') {
            renderEngagementTab();
        } else if (currentConfigTab === 'raw') {
            renderRawTab();
        }
    }

    async function renderCourseTab() {
        const layouts = ['article', 'traditional', 'focused', 'presentation', 'canvas'];
        const widths = ['narrow', 'medium', 'wide', 'full'];
        const formats = ['cmi5', 'scorm2004', 'scorm1.2'];

        // Fetch theme data
        let themeTokens = [];
        try {
            const themeResponse = await fetch('/__theme');
            if (themeResponse.ok) {
                const themeData = await themeResponse.json();
                themeTokens = themeData.tokens || [];
            }
        } catch (e) {
            console.warn('Could not load theme data:', e);
        }

        configBody.innerHTML = `
            <div class="config-section">
                <div class="config-section-header">Course Metadata</div>
                <div class="config-row">
                    <span class="config-label">Title</span>
                    <input type="text" class="config-input" data-path="metadata.title" value="${escapeHtml(configData.metadata?.title || '')}" placeholder="Course Title">
                </div>
                <div class="config-row">
                    <span class="config-label">Description</span>
                    <input type="text" class="config-input" data-path="metadata.description" value="${escapeHtml(configData.metadata?.description || '')}" placeholder="Course description">
                </div>
                <div class="config-row">
                    <span class="config-label">Version</span>
                    <input type="text" class="config-input" data-path="metadata.version" value="${escapeHtml(configData.metadata?.version || '')}" placeholder="1.0.0">
                </div>
                <div class="config-row">
                    <span class="config-label">Author</span>
                    <input type="text" class="config-input" data-path="metadata.author" value="${escapeHtml(configData.metadata?.author || '')}" placeholder="Author name">
                </div>
                <div class="config-row">
                    <span class="config-label">Language</span>
                    <input type="text" class="config-input" data-path="metadata.language" value="${escapeHtml(configData.metadata?.language || '')}" placeholder="en">
                </div>
                <div class="config-row">
                    <span class="config-label">Total Slides</span>
                    <span class="config-value">${configData.slideCount || 0}</span>
                </div>
                <div class="config-row">
                    <span class="config-label">Output Format</span>
                    <select data-path="format">
                        ${formats.map(f => `<option value="${f}" ${configData.format === f ? 'selected' : ''}>${f}</option>`).join('')}
                    </select>
                </div>
            </div>
            
            <div class="config-divider"></div>
            
            <div class="config-section">
                <div class="config-section-header">Layout</div>
                <div class="config-row">
                    <span class="config-label">Course Layout</span>
                    <select data-path="layout">
                        ${layouts.map(l => `<option value="${l}" ${configData.layout === l ? 'selected' : ''}>${l}</option>`).join('')}
                    </select>
                </div>
                <div class="config-row">
                    <span class="config-label">Content Width</span>
                    <select data-path="slideDefaults.contentWidth" ${['focused', 'presentation', 'canvas'].includes(configData.layout) ? 'disabled' : ''}>
                        ${widths.map(w => `<option value="${w}" ${configData.slideDefaults?.contentWidth === w ? 'selected' : ''}>${w}</option>`).join('')}
                    </select>
                    ${['focused', 'presentation', 'canvas'].includes(configData.layout) ? `<span class="config-override-hint" title="${configData.layout === 'focused' ? 'Focused layout uses --focused-content-max-width' : configData.layout === 'canvas' ? 'Canvas layout has no framework chrome' : 'Presentation layout uses full viewport'}">override</span>` : ''}
                </div>
            </div>
            
            <div class="config-section">
                <div class="config-section-header">Navigation</div>
                <div class="config-row">
                    <span class="config-label">Sidebar Enabled</span>
                    <div class="config-toggle ${configData.navigation?.sidebar?.enabled ? 'on' : ''}" data-path="navigation.sidebar.enabled"></div>
                </div>
                ${configData.navigation?.sidebar?.enabled ? `
                <div class="config-row">
                    <span class="config-label">Sidebar Position</span>
                    <select data-path="navigation.sidebar.position">
                        <option value="left" ${configData.navigation?.sidebar?.position === 'left' ? 'selected' : ''}>left</option>
                        <option value="right" ${configData.navigation?.sidebar?.position === 'right' ? 'selected' : ''}>right</option>
                    </select>
                </div>
                <div class="config-row">
                    <span class="config-label">Sidebar Width</span>
                    <input type="text" class="config-input" data-path="navigation.sidebar.width" value="${configData.navigation?.sidebar?.width || '280px'}" placeholder="280px">
                </div>
                <div class="config-row">
                    <span class="config-label">Sidebar Collapsible</span>
                    <div class="config-toggle ${configData.navigation?.sidebar?.collapsible ? 'on' : ''}" data-path="navigation.sidebar.collapsible"></div>
                </div>
                <div class="config-row">
                    <span class="config-label">Sidebar Default Collapsed</span>
                    <div class="config-toggle ${configData.navigation?.sidebar?.defaultCollapsed ? 'on' : ''}" data-path="navigation.sidebar.defaultCollapsed"></div>
                </div>
                <div class="config-row">
                    <span class="config-label">Sidebar Show Progress</span>
                    <div class="config-toggle ${configData.navigation?.sidebar?.showProgress ? 'on' : ''}" data-path="navigation.sidebar.showProgress"></div>
                </div>
                ` : ''}
                <div class="config-row">
                    <span class="config-label">Breadcrumbs Enabled</span>
                    <div class="config-toggle ${configData.navigation?.breadcrumbs?.enabled ? 'on' : ''}" data-path="navigation.breadcrumbs.enabled"></div>
                </div>
            </div>
            
            <div class="config-divider"></div>
            
            <div class="config-section">
                <div class="config-section-header">Accessibility</div>
                <div class="config-row">
                    <span class="config-label">Dark Mode</span>
                    <div class="config-toggle ${configData.features?.accessibility?.darkMode ? 'on' : ''}" data-path="features.accessibility.darkMode"></div>
                </div>
                <div class="config-row">
                    <span class="config-label">Font Size Controls</span>
                    <div class="config-toggle ${configData.features?.accessibility?.fontSize ? 'on' : ''}" data-path="features.accessibility.fontSize"></div>
                </div>
                <div class="config-row">
                    <span class="config-label">High Contrast</span>
                    <div class="config-toggle ${configData.features?.accessibility?.highContrast ? 'on' : ''}" data-path="features.accessibility.highContrast"></div>
                </div>
                <div class="config-row">
                    <span class="config-label">Reduced Motion</span>
                    <div class="config-toggle ${configData.features?.accessibility?.reducedMotion ? 'on' : ''}" data-path="features.accessibility.reducedMotion"></div>
                </div>
                <div class="config-row">
                    <span class="config-label">Keyboard Shortcuts</span>
                    <div class="config-toggle ${configData.features?.accessibility?.keyboardShortcuts ? 'on' : ''}" data-path="features.accessibility.keyboardShortcuts"></div>
                </div>
            </div>
            
            <div class="config-section">
                <div class="config-section-header">Completion</div>
                <div class="config-row">
                    <span class="config-label">Prompt for Comments</span>
                    <div class="config-toggle ${configData.completion?.promptForComments ? 'on' : ''}" data-path="completion.promptForComments"></div>
                </div>
                <div class="config-row">
                    <span class="config-label">Prompt for Rating</span>
                    <div class="config-toggle ${configData.completion?.promptForRating ? 'on' : ''}" data-path="completion.promptForRating"></div>
                </div>
            </div>
            
            <div class="config-section">
                <div class="config-section-header">Scoring</div>
                <div class="config-row">
                    <span class="config-label">Scoring Type</span>
                    <select data-path="scoring.type">
                        <option value="" ${!configData.scoring?.type ? 'selected' : ''}>(disabled)</option>
                        <option value="average" ${configData.scoring?.type === 'average' ? 'selected' : ''}>average</option>
                        <option value="weighted" ${configData.scoring?.type === 'weighted' ? 'selected' : ''}>weighted</option>
                        <option value="maximum" ${configData.scoring?.type === 'maximum' ? 'selected' : ''}>maximum</option>
                        <option value="custom" ${configData.scoring?.type === 'custom' ? 'selected' : ''}>custom</option>
                    </select>
                </div>
            </div>
            
            <div class="config-divider"></div>
            
            <div class="config-section">
                <div class="config-section-header">Support</div>
                <div class="config-row">
                    <span class="config-label">Email</span>
                    <input type="text" class="config-input" data-path="support.email" value="${escapeHtml(configData.support?.email || '')}" placeholder="support@example.com">
                </div>
                <div class="config-row">
                    <span class="config-label">Phone</span>
                    <input type="text" class="config-input" data-path="support.phone" value="${escapeHtml(configData.support?.phone || '')}" placeholder="+1-800-555-0100">
                </div>
            </div>
            
            <div class="config-divider"></div>
            
            <div class="config-section">
                <div class="config-section-header">Development</div>
                <div class="config-row">
                    <span class="config-label">Show Slide Indicator</span>
                    <div class="config-toggle ${configData.environment?.development?.showSlideIndicator ? 'on' : ''}" data-path="environment.development.showSlideIndicator"></div>
                </div>
                <div class="config-row">
                    <span class="config-label">Disable Beforeunload Guard</span>
                    <div class="config-toggle ${configData.environment?.disableBeforeUnloadGuard ? 'on' : ''}" data-path="environment.disableBeforeUnloadGuard"></div>
                </div>
            </div>
            
            <div class="config-divider"></div>
            
            <div class="config-section">
                <div class="config-section-header">Theme Colors</div>
                <div class="config-hint">Override palette colors in theme.css. Changes apply after reload.</div>
                ${themeTokens.map(t => `
                <div class="config-row config-color-row" data-token="${t.name}">
                    <span class="config-label">${escapeHtml(t.label)}</span>
                    ${t.override ? '<span class="config-override-badge">override</span>' : ''}
                    <div class="config-color-controls">
                        <input type="color" class="config-color-picker" data-token="${t.name}" value="${t.override || t.default || '#808080'}">
                        <input type="text" class="config-color-hex" data-token="${t.name}" value="${t.override || t.default || ''}" placeholder="${t.default || ''}">
                        ${t.override ? `<button class="config-color-reset" data-token="${t.name}" title="Reset to default">×</button>` : ''}
                    </div>
                </div>
                `).join('')}
            </div>
        `;

        // Bind color picker changes
        configBody.querySelectorAll('.config-color-picker').forEach(picker => {
            picker.addEventListener('input', function () {
                const token = this.dataset.token;
                const hexInput = configBody.querySelector(`.config-color-hex[data-token="${token}"]`);
                if (hexInput) hexInput.value = this.value;
            });
            picker.addEventListener('change', async function () {
                const token = this.dataset.token;
                await saveThemeValue(token, this.value);
            });
        });

        // Bind hex input changes
        configBody.querySelectorAll('.config-color-hex').forEach(input => {
            let timeout;
            input.addEventListener('input', function () {
                const token = this.dataset.token;
                const picker = configBody.querySelector(`.config-color-picker[data-token="${token}"]`);
                // Only update picker if valid hex
                if (/^#[0-9A-Fa-f]{6}$/.test(this.value)) {
                    if (picker) picker.value = this.value;
                }
                clearTimeout(timeout);
                timeout = setTimeout(async () => {
                    if (/^#[0-9A-Fa-f]{6}$/.test(this.value)) {
                        await saveThemeValue(token, this.value);
                    }
                }, 500);
            });
        });

        // Bind reset buttons
        configBody.querySelectorAll('.config-color-reset').forEach(btn => {
            btn.addEventListener('click', async function () {
                const token = this.dataset.token;
                await saveThemeValue(token, null);
                // Refresh the tab to show updated state
                await renderCourseTab();
            });
        });

        // Bind select changes
        configBody.querySelectorAll('select[data-path]').forEach(sel => {
            sel.addEventListener('change', async function () {
                const path = this.dataset.path;
                const value = this.value;
                updateConfigDataLocally(path, value);
                await saveConfigValue(path, value);
            });
        });

        // Bind toggle clicks
        configBody.querySelectorAll('.config-toggle[data-path]').forEach(toggle => {
            toggle.addEventListener('click', async function () {
                const isOn = this.classList.contains('on');
                const newValue = !isOn;
                const path = this.dataset.path;
                this.classList.toggle('on');
                updateConfigDataLocally(path, newValue);
                await saveConfigValue(path, newValue);
            });
        });

        // Bind input changes (with debounce)
        configBody.querySelectorAll('.config-input[data-path]').forEach(input => {
            let timeout;
            input.addEventListener('input', function () {
                clearTimeout(timeout);
                const path = this.dataset.path;
                const value = this.value;
                timeout = setTimeout(async () => {
                    updateConfigDataLocally(path, value);
                    await saveConfigValue(path, value);
                }, 500);
            });
        });
    }

    /**
     * Update configData locally to keep it in sync with form state.
     * This prevents stale values when the panel re-renders.
     */
    function updateConfigDataLocally(path, value) {
        if (!configData) return;
        
        const parts = path.split('.');
        let current = configData;
        
        for (let i = 0; i < parts.length - 1; i++) {
            const key = parts[i];
            if (current[key] === undefined) {
                current[key] = {};
            }
            current = current[key];
        }
        
        current[parts[parts.length - 1]] = value;
    }

    async function renderSlideTab() {
        const cmiData = getCmiData ? getCmiData() : {};
        const currentSlideId = cmiData['cmi.location'];

        if (!currentSlideId) {
            configBody.innerHTML = `
                <div class="config-slide-info">
                    <div class="slide-title">No Slide Selected</div>
                    <div class="slide-id">(none)</div>
                </div>
                <div class="config-section">
                    <p style="color: #6b7280; font-size: 12px; margin: 8px 0;">
                        Navigate to a slide to see its configuration here.
                    </p>
                </div>
            `;
            return;
        }

        // Show loading state
        configBody.innerHTML = '<div class="config-loading">Loading slide config...</div>';

        try {
            const response = await fetch('/__slide-config/' + encodeURIComponent(currentSlideId));
            if (!response.ok) {
                throw new Error('Slide not found');
            }
            const slideConfig = await response.json();
            currentSlideConfig = slideConfig;

            // Build the slide tab HTML with editable fields
            let html = '';

            // === Slide Identity ===
            html += `
                <div class="config-slide-info">
                    <div class="slide-title">${escapeHtml(slideConfig.title || slideConfig.id)}</div>
                    <div class="slide-id">${escapeHtml(slideConfig.id)}</div>
                </div>
                
                <div class="config-section">
                    <div class="config-section-header">Identity</div>
                    <div class="config-row">
                        <span class="config-label">Title</span>
                        <input type="text" class="config-input slide-config-input" data-slide-path="title" value="${escapeHtml(slideConfig.title || '')}" placeholder="Slide title">
                    </div>
                    <div class="config-row">
                        <span class="config-label">Type</span>
                        <span class="config-value config-badge config-badge-${slideConfig.type || 'slide'}">${escapeHtml(slideConfig.type || 'slide')}</span>
                    </div>
                    <div class="config-row">
                        <span class="config-label">Component</span>
                        <span class="config-value config-path">${escapeHtml(slideConfig.component || '(none)')}</span>
                    </div>
                </div>
            `;

            // === Menu Configuration ===
            const menu = slideConfig.menu || {};
            html += `
                <div class="config-divider"></div>
                <div class="config-section">
                    <div class="config-section-header">Menu</div>
                    <div class="config-row">
                        <span class="config-label">Label</span>
                        <input type="text" class="config-input slide-config-input" data-slide-path="menu.label" value="${escapeHtml(menu.label || slideConfig.title || slideConfig.id)}" placeholder="Menu label">
                    </div>
                    <div class="config-row">
                        <span class="config-label">Icon</span>
                        <input type="text" class="config-input slide-config-input" data-slide-path="menu.icon" value="${escapeHtml(menu.icon || '')}" placeholder="Icon name (e.g., book-open)">
                    </div>
                    <div class="config-row">
                        <span class="config-label">Hidden</span>
                        <div class="config-toggle slide-config-toggle ${menu.hidden ? 'on' : ''}" data-slide-path="menu.hidden"></div>
                    </div>
                </div>
            `;

            // === Audio Configuration ===
            const audio = slideConfig.audio || {};
            const hasAudio = !!slideConfig.audio;
            html += `
                <div class="config-divider"></div>
                <div class="config-section">
                    <div class="config-section-header">Audio</div>
                    ${hasAudio ? `
                    <div class="config-row">
                        <span class="config-label">Source</span>
                        <input type="text" class="config-input slide-config-input" data-slide-path="audio.src" value="${escapeHtml(audio.src || '')}" placeholder="Audio source path">
                    </div>
                    <div class="config-row">
                        <span class="config-label">Autoplay</span>
                        <div class="config-toggle slide-config-toggle ${audio.autoplay ? 'on' : ''}" data-slide-path="audio.autoplay"></div>
                    </div>
                    <div class="config-row">
                        <span class="config-label">Completion Threshold</span>
                        <input type="number" class="config-input slide-config-input" data-slide-path="audio.completionThreshold" value="${audio.completionThreshold !== undefined ? audio.completionThreshold : 0.95}" min="0" max="1" step="0.05" style="width: 80px;">
                    </div>
                    ` : `
                    <div class="config-row">
                        <span class="config-label" style="color: #6b7280; font-style: italic;">No audio configured</span>
                    </div>
                    `}
                </div>
            `;

            // === Engagement Configuration ===
            const engagement = slideConfig.engagement || {};
            html += `
                <div class="config-divider"></div>
                <div class="config-section">
                    <div class="config-section-header">Engagement</div>
                    <div class="config-row">
                        <span class="config-label">Required</span>
                        <div class="config-toggle slide-config-toggle ${engagement.required ? 'on' : ''}" data-slide-path="engagement.required"></div>
                    </div>
            `;

            if (engagement.required) {
                html += `
                    <div class="config-row">
                        <span class="config-label">Mode</span>
                        <select class="slide-config-select" data-slide-path="engagement.mode">
                            <option value="all" ${(engagement.mode || 'all') === 'all' ? 'selected' : ''}>all</option>
                            <option value="any" ${engagement.mode === 'any' ? 'selected' : ''}>any</option>
                        </select>
                    </div>
                    <div class="config-row">
                        <span class="config-label">Show Indicator</span>
                        <div class="config-toggle slide-config-toggle ${engagement.showIndicator !== false ? 'on' : ''}" data-slide-path="engagement.showIndicator"></div>
                    </div>
                `;

                const reqCount = engagement.requirements?.length || 0;
                if (reqCount > 0) {
                    html += `
                        <div class="config-row">
                            <span class="config-label">Requirements</span>
                            <span class="config-value" style="color: #f18701; cursor: pointer;" onclick="document.querySelector('#stub-player-config-tabs button[data-tab=engagement]').click()">${reqCount} configured → Edit</span>
                        </div>
                    `;
                }
            }

            html += '</div>';

            // === Navigation Configuration ===
            const nav = slideConfig.navigation || {};
            const controls = nav.controls || {};
            html += `
                <div class="config-divider"></div>
                <div class="config-section">
                    <div class="config-section-header">Navigation</div>
                    <div class="config-row">
                        <span class="config-label">Sequential</span>
                        <div class="config-toggle slide-config-toggle ${nav.sequential !== false ? 'on' : ''}" data-slide-path="navigation.sequential"></div>
                    </div>
                    <div class="config-row">
                        <span class="config-label">Show Previous</span>
                        <div class="config-toggle slide-config-toggle ${controls.showPrevious !== false ? 'on' : ''}" data-slide-path="navigation.controls.showPrevious"></div>
                    </div>
                    <div class="config-row">
                        <span class="config-label">Show Next</span>
                        <div class="config-toggle slide-config-toggle ${controls.showNext !== false ? 'on' : ''}" data-slide-path="navigation.controls.showNext"></div>
                    </div>
            `;

            if (controls.exitTarget) {
                html += `
                    <div class="config-row">
                        <span class="config-label">Exit Target</span>
                        <input type="text" class="config-input slide-config-input" data-slide-path="navigation.controls.exitTarget" value="${escapeHtml(controls.exitTarget)}" placeholder="Slide ID">
                    </div>
                `;
            }
            if (controls.nextTarget) {
                html += `
                    <div class="config-row">
                        <span class="config-label">Next Target</span>
                        <input type="text" class="config-input slide-config-input" data-slide-path="navigation.controls.nextTarget" value="${escapeHtml(controls.nextTarget)}" placeholder="Slide ID">
                    </div>
                `;
            }
            if (controls.previousTarget) {
                html += `
                    <div class="config-row">
                        <span class="config-label">Previous Target</span>
                        <input type="text" class="config-input slide-config-input" data-slide-path="navigation.controls.previousTarget" value="${escapeHtml(controls.previousTarget)}" placeholder="Slide ID">
                    </div>
                `;
            }

            // === Gating Configuration ===
            const gating = nav.gating || {};
            const gatingConditions = gating.conditions || [];
            const slideIds = configData.slideIds || [];
            const objectiveIds = configData.objectiveIds || [];
            const assessmentIds = slideIds.filter(s => s.type === 'assessment');

            html += `
                <div class="config-divider"></div>
                <div class="config-section">
                    <div class="config-section-header">Gating</div>
                    <div class="config-row">
                        <span class="config-label">Mode</span>
                        <select class="slide-config-select" data-slide-path="navigation.gating.mode">
                            <option value="">None (no gating)</option>
                            <option value="all" ${gating.mode === 'all' ? 'selected' : ''}>All conditions</option>
                            <option value="any" ${gating.mode === 'any' ? 'selected' : ''}>Any condition</option>
                        </select>
                    </div>
                    <div class="config-row">
                        <span class="config-label">Message</span>
                        <input type="text" class="config-input slide-config-input" data-slide-path="navigation.gating.message" value="${escapeHtml(gating.message || '')}" placeholder="Message when gated" style="max-width: 240px;">
                    </div>
            `;

            // Render existing conditions
            if (gatingConditions.length > 0) {
                html += '<div class="gating-conditions-list">';

                for (let i = 0; i < gatingConditions.length; i++) {
                    const cond = gatingConditions[i];
                    html += `
                        <div class="gating-condition-item" data-condition-index="${i}">
                            <div class="config-row gating-condition-type-row">
                                <span class="config-label">Type</span>
                                <div class="gating-condition-type-controls">
                                    <select class="gating-condition-type" data-index="${i}">
                                        <option value="objectiveStatus" ${cond.type === 'objectiveStatus' ? 'selected' : ''}>Objective Status</option>
                                        <option value="assessmentStatus" ${cond.type === 'assessmentStatus' ? 'selected' : ''}>Assessment Status</option>
                                        <option value="stateFlag" ${cond.type === 'stateFlag' ? 'selected' : ''}>State Flag</option>
                                        <option value="timeOnSlide" ${cond.type === 'timeOnSlide' ? 'selected' : ''}>Time on Slide</option>
                                    </select>
                                    <button type="button" class="gating-remove-btn" data-index="${i}" aria-label="Remove condition">✕</button>
                                </div>
                            </div>
                    `;

                    // Type-specific fields
                    if (cond.type === 'objectiveStatus') {
                        html += `
                            <div class="config-row" style="margin-bottom: 4px;">
                                <span class="config-label" style="font-size: 10px;">Objective</span>
                                <select class="gating-condition-field" data-index="${i}" data-field="objectiveId" style="font-size: 11px;">
                                    <option value="">Select...</option>
                                    ${objectiveIds.map(o => `<option value="${escapeHtml(o.id)}" ${cond.objectiveId === o.id ? 'selected' : ''}>${escapeHtml(o.id)}</option>`).join('')}
                                </select>
                            </div>
                            <div class="config-row">
                                <span class="config-label" style="font-size: 10px;">Completion</span>
                                <select class="gating-condition-field" data-index="${i}" data-field="completion_status" style="font-size: 11px;">
                                    <option value="completed" ${cond.completion_status === 'completed' ? 'selected' : ''}>completed</option>
                                    <option value="incomplete" ${cond.completion_status === 'incomplete' ? 'selected' : ''}>incomplete</option>
                                </select>
                            </div>
                        `;
                    } else if (cond.type === 'assessmentStatus') {
                        html += `
                            <div class="config-row" style="margin-bottom: 4px;">
                                <span class="config-label" style="font-size: 10px;">Assessment</span>
                                <select class="gating-condition-field" data-index="${i}" data-field="assessmentId" style="font-size: 11px;">
                                    <option value="">Select...</option>
                                    ${assessmentIds.map(a => `<option value="${escapeHtml(a.id)}" ${cond.assessmentId === a.id ? 'selected' : ''}>${escapeHtml(a.title)}</option>`).join('')}
                                </select>
                            </div>
                            <div class="config-row">
                                <span class="config-label" style="font-size: 10px;">Requires</span>
                                <select class="gating-condition-field" data-index="${i}" data-field="requires" style="font-size: 11px;">
                                    <option value="passed" ${cond.requires === 'passed' ? 'selected' : ''}>passed</option>
                                    <option value="failed" ${cond.requires === 'failed' ? 'selected' : ''}>failed</option>
                                    <option value="attempted" ${cond.requires === 'attempted' ? 'selected' : ''}>attempted</option>
                                </select>
                            </div>
                        `;
                    } else if (cond.type === 'stateFlag') {
                        html += `
                            <div class="config-row">
                                <span class="config-label" style="font-size: 10px;">Flag Key</span>
                                <input type="text" class="gating-condition-field config-input" data-index="${i}" data-field="key" value="${escapeHtml(cond.key || '')}" placeholder="flag_key" style="font-size: 11px;">
                            </div>
                        `;
                    } else if (cond.type === 'timeOnSlide') {
                        html += `
                            <div class="config-row" style="margin-bottom: 4px;">
                                <span class="config-label" style="font-size: 10px;">Slide</span>
                                <select class="gating-condition-field" data-index="${i}" data-field="slideId" style="font-size: 11px;">
                                    <option value="">Select...</option>
                                    ${slideIds.map(s => `<option value="${escapeHtml(s.id)}" ${cond.slideId === s.id ? 'selected' : ''}>${escapeHtml(s.title)}</option>`).join('')}
                                </select>
                            </div>
                            <div class="config-row">
                                <span class="config-label" style="font-size: 10px;">Min Seconds</span>
                                <input type="number" class="gating-condition-field config-input" data-index="${i}" data-field="minSeconds" value="${cond.minSeconds || 30}" min="1" style="font-size: 11px; width: 60px;">
                            </div>
                        `;
                    }

                    html += '</div>';
                }

                html += '</div>';
            }

            // Add condition button
            html += `
                <div style="margin-top: 8px;">
                    <button type="button" class="gating-add-btn" style="background: #2d5a87; border: none; color: white; padding: 4px 12px; border-radius: 4px; cursor: pointer; font-size: 11px;">+ Add Condition</button>
                </div>
            `;

            html += '</div>';

            html += '</div>';

            configBody.innerHTML = html;

            // Bind slide config handlers
            bindSlideConfigHandlers(currentSlideId);

        } catch (err) {
            configBody.innerHTML = `
                <div class="config-slide-info">
                    <div class="slide-title">Slide</div>
                    <div class="slide-id">${escapeHtml(currentSlideId)}</div>
                </div>
                <div class="config-section">
                    <div class="config-error">Error loading slide config: ${escapeHtml(err.message)}</div>
                </div>
            `;
        }
    }

    function bindSlideConfigHandlers(slideId) {
        // Bind toggle clicks
        configBody.querySelectorAll('.slide-config-toggle[data-slide-path]').forEach(toggle => {
            toggle.addEventListener('click', async function () {
                const isOn = this.classList.contains('on');
                this.classList.toggle('on');
                await saveSlideConfigValue(slideId, this.dataset.slidePath, !isOn);
            });
        });

        // Bind select changes
        configBody.querySelectorAll('.slide-config-select[data-slide-path]').forEach(sel => {
            sel.addEventListener('change', async function () {
                await saveSlideConfigValue(slideId, this.dataset.slidePath, this.value);
            });
        });

        // Bind input changes (with debounce)
        configBody.querySelectorAll('.slide-config-input[data-slide-path]').forEach(input => {
            let timeout;
            input.addEventListener('input', function () {
                clearTimeout(timeout);
                timeout = setTimeout(async () => {
                    let value = this.value;
                    // Convert numbers
                    if (this.type === 'number') {
                        value = parseFloat(value);
                    }
                    await saveSlideConfigValue(slideId, this.dataset.slidePath, value);
                }, 500);
            });
        });

        // === Gating condition handlers ===

        // Add condition button
        configBody.querySelector('.gating-add-btn')?.addEventListener('click', async () => {
            await addGatingCondition(slideId);
        });

        // Remove condition button
        configBody.querySelectorAll('.gating-remove-btn[data-index]').forEach(btn => {
            btn.addEventListener('click', async () => {
                const index = parseInt(btn.dataset.index, 10);
                await removeGatingCondition(slideId, index);
            });
        });

        // Condition type change
        configBody.querySelectorAll('.gating-condition-type[data-index]').forEach(sel => {
            sel.addEventListener('change', async () => {
                const index = parseInt(sel.dataset.index, 10);
                await updateGatingConditionType(slideId, index, sel.value);
            });
        });

        // Condition field change
        configBody.querySelectorAll('.gating-condition-field[data-index]').forEach(field => {
            field.addEventListener('change', async () => {
                const index = parseInt(field.dataset.index, 10);
                const fieldName = field.dataset.field;
                await updateGatingConditionField(slideId, index, fieldName, field.value);
            });
        });
    }

    // === Unified write helper ===
    async function writeConfig(target, id, value) {
        try {
            const response = await fetch('/__write', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ target, id, value })
            });
            if (!response.ok) {
                const err = await response.json();
                console.error(`Write error [${target}]:`, err);
                return false;
            }
            return true;
        } catch (err) {
            console.error(`Failed to write [${target}]:`, err);
            return false;
        }
    }

    // Gating condition management — mutate locally, write full gating object
    async function addGatingCondition(slideId) {
        const gating = currentSlideConfig?.navigation?.gating;
        if (!gating?.conditions) return;
        gating.conditions.push({ type: 'objectiveStatus', objectiveId: '', completion_status: 'completed' });
        if (await writeConfig('gating', slideId, gating)) renderSlideTab();
    }

    async function removeGatingCondition(slideId, index) {
        const gating = currentSlideConfig?.navigation?.gating;
        if (!gating?.conditions) return;
        gating.conditions.splice(index, 1);
        if (await writeConfig('gating', slideId, gating)) renderSlideTab();
    }

    async function updateGatingConditionType(slideId, index, newType) {
        const gating = currentSlideConfig?.navigation?.gating;
        if (!gating?.conditions) return;
        const defaults = {
            objectiveStatus: { type: 'objectiveStatus', objectiveId: '', completion_status: 'completed' },
            assessmentStatus: { type: 'assessmentStatus', assessmentId: '', requires: 'passed' },
            slideVisited: { type: 'slideVisited', slideId: '' },
            timeOnSlide: { type: 'timeOnSlide', slideId: '', minSeconds: 30 },
            stateFlag: { type: 'stateFlag', key: '' }
        };
        gating.conditions[index] = defaults[newType] || { type: newType };
        if (await writeConfig('gating', slideId, gating)) renderSlideTab();
    }

    async function updateGatingConditionField(slideId, index, fieldName, value) {
        const gating = currentSlideConfig?.navigation?.gating;
        if (!gating?.conditions?.[index]) return;
        gating.conditions[index][fieldName] = value;
        await writeConfig('gating', slideId, gating);
    }

    async function saveSlideConfigValue(slideId, propPath, value) {
        await writeConfig('slide', slideId, { [propPath]: value });
    }

    function renderObjectivesTab() {
        const objectives = configData.objectives || [];
        const slideIds = configData.slideIds || [];

        if (objectives.length === 0) {
            configBody.innerHTML = `
                <div class="config-section">
                    <div class="config-section-header">Learning Objectives</div>
                    <p style="color: #6b7280; font-size: 12px; margin: 8px 0;">
                        No objectives defined in course-config.js
                    </p>
                </div>
            `;
            return;
        }

        // Slide options available in configData.slideIds

        let html = `
            <div class="config-section">
                <div class="config-section-header">Learning Objectives (${objectives.length})</div>
            </div>
        `;

        for (const obj of objectives) {
            const c = obj.criteria || {};
            const criteriaType = c.type || 'none';

            // Build criteria-specific fields
            let criteriaFieldsHtml = '';

            switch (criteriaType) {
                case 'slideVisited':
                    criteriaFieldsHtml = `
                        <div class="config-row objective-criteria-field" data-criteria-type="slideVisited">
                            <span class="config-label">Slide</span>
                            <select class="objective-config-select" data-obj-id="${escapeHtml(obj.id)}" data-obj-path="criteria.slideId">
                                <option value="">Select slide...</option>
                                ${slideIds.map(s =>
                        `<option value="${escapeHtml(s.id)}" ${c.slideId === s.id ? 'selected' : ''}>${escapeHtml(s.title)}</option>`
                    ).join('')}
                            </select>
                        </div>
                    `;
                    break;
                case 'allSlidesVisited':
                    criteriaFieldsHtml = `
                        <div class="config-row objective-criteria-field" data-criteria-type="allSlidesVisited">
                            <span class="config-label">Slide IDs</span>
                            <input type="text" class="config-input objective-config-input" data-obj-id="${escapeHtml(obj.id)}" data-obj-path="criteria.slideIds" value="${escapeHtml((c.slideIds || []).join(', '))}" placeholder="slide1, slide2, slide3">
                        </div>
                    `;
                    break;
                case 'timeOnSlide':
                    criteriaFieldsHtml = `
                        <div class="config-row objective-criteria-field" data-criteria-type="timeOnSlide">
                            <span class="config-label">Slide</span>
                            <select class="objective-config-select" data-obj-id="${escapeHtml(obj.id)}" data-obj-path="criteria.slideId">
                                <option value="">Select slide...</option>
                                ${slideIds.map(s =>
                        `<option value="${escapeHtml(s.id)}" ${c.slideId === s.id ? 'selected' : ''}>${escapeHtml(s.title)}</option>`
                    ).join('')}
                            </select>
                        </div>
                        <div class="config-row objective-criteria-field" data-criteria-type="timeOnSlide">
                            <span class="config-label">Min Seconds</span>
                            <input type="number" class="config-input objective-config-input" data-obj-id="${escapeHtml(obj.id)}" data-obj-path="criteria.minSeconds" value="${c.minSeconds || 30}" min="1" style="width: 80px;">
                        </div>
                    `;
                    break;
                case 'flag':
                    criteriaFieldsHtml = `
                        <div class="config-row objective-criteria-field" data-criteria-type="flag">
                            <span class="config-label">Flag Key</span>
                            <input type="text" class="config-input objective-config-input" data-obj-id="${escapeHtml(obj.id)}" data-obj-path="criteria.key" value="${escapeHtml(c.key || '')}" placeholder="flag_key">
                        </div>
                        <div class="config-row objective-criteria-field" data-criteria-type="flag">
                            <span class="config-label">Equals Value</span>
                            <input type="text" class="config-input objective-config-input" data-obj-id="${escapeHtml(obj.id)}" data-obj-path="criteria.equals" value="${c.equals !== undefined ? escapeHtml(String(c.equals)) : ''}" placeholder="true">
                        </div>
                    `;
                    break;
                case 'allFlags':
                    criteriaFieldsHtml = `
                        <div class="config-row objective-criteria-field" data-criteria-type="allFlags">
                            <span class="config-label">Flag Keys</span>
                            <input type="text" class="config-input objective-config-input" data-obj-id="${escapeHtml(obj.id)}" data-obj-path="criteria.flags" value="${escapeHtml((c.flags || []).map(f => typeof f === 'string' ? f : f.key).join(', '))}" placeholder="flag1, flag2, flag3">
                        </div>
                    `;
                    break;
            }

            html += `
                <div class="config-objective-card" data-objective-id="${escapeHtml(obj.id)}">
                    <div class="config-row" style="margin-bottom: 8px;">
                        <span class="config-label">ID</span>
                        <input type="text" class="config-input objective-id-input" data-original-id="${escapeHtml(obj.id)}" value="${escapeHtml(obj.id)}" style="font-family: 'Consolas', 'Monaco', monospace; font-weight: 600; color: #f18701;">
                    </div>
                    
                    <div class="config-row">
                        <span class="config-label">Description</span>
                        <input type="text" class="config-input objective-config-input" data-obj-id="${escapeHtml(obj.id)}" data-obj-path="description" value="${escapeHtml(obj.description || '')}" placeholder="Objective description" style="flex: 1; max-width: 260px;">
                    </div>
                    
                    <div class="config-row">
                        <span class="config-label">Initial Completion</span>
                        <select class="objective-config-select" data-obj-id="${escapeHtml(obj.id)}" data-obj-path="initialCompletion">
                            <option value="incomplete" ${(obj.initialCompletion || 'incomplete') === 'incomplete' ? 'selected' : ''}>incomplete</option>
                            <option value="completed" ${obj.initialCompletion === 'completed' ? 'selected' : ''}>completed</option>
                        </select>
                    </div>
                    
                    <div class="config-row">
                        <span class="config-label">Initial Success</span>
                        <select class="objective-config-select" data-obj-id="${escapeHtml(obj.id)}" data-obj-path="initialSuccess">
                            <option value="unknown" ${(obj.initialSuccess || 'unknown') === 'unknown' ? 'selected' : ''}>unknown</option>
                            <option value="passed" ${obj.initialSuccess === 'passed' ? 'selected' : ''}>passed</option>
                            <option value="failed" ${obj.initialSuccess === 'failed' ? 'selected' : ''}>failed</option>
                        </select>
                    </div>
                    
                    <div class="config-row">
                        <span class="config-label">Criteria Type</span>
                        <select class="objective-config-select objective-criteria-type-select" data-obj-id="${escapeHtml(obj.id)}" data-obj-path="criteria.type">
                            <option value="none" ${criteriaType === 'none' ? 'selected' : ''}>Manual (no auto-complete)</option>
                            <option value="slideVisited" ${criteriaType === 'slideVisited' ? 'selected' : ''}>slideVisited</option>
                            <option value="allSlidesVisited" ${criteriaType === 'allSlidesVisited' ? 'selected' : ''}>allSlidesVisited</option>
                            <option value="timeOnSlide" ${criteriaType === 'timeOnSlide' ? 'selected' : ''}>timeOnSlide</option>
                            <option value="flag" ${criteriaType === 'flag' ? 'selected' : ''}>flag</option>
                            <option value="allFlags" ${criteriaType === 'allFlags' ? 'selected' : ''}>allFlags</option>
                        </select>
                    </div>
                    ${criteriaFieldsHtml}
                </div>
            `;
        }

        configBody.innerHTML = html;

        // Bind objective handlers
        bindObjectiveHandlers();
    }

    function bindObjectiveHandlers() {
        // Bind objective ID rename (with debounce on blur)
        configBody.querySelectorAll('.objective-id-input[data-original-id]').forEach(input => {
            let _timeout;
            input.addEventListener('blur', async function () {
                const oldId = this.dataset.originalId;
                const newId = this.value.trim();

                if (!newId || oldId === newId) return;

                await renameObjective(oldId, newId);
            });
        });

        // Bind select changes
        configBody.querySelectorAll('.objective-config-select[data-obj-id]').forEach(sel => {
            sel.addEventListener('change', async function () {
                const objId = this.dataset.objId;
                const path = this.dataset.objPath;
                await saveObjectiveValue(objId, path, this.value);

                // If criteria type changed, re-render to show/hide appropriate fields
                if (path === 'criteria.type') {
                    // Reload objectives data and re-render
                    await loadConfig();
                    renderObjectivesTab();
                }
            });
        });

        // Bind input changes (with debounce)
        configBody.querySelectorAll('.objective-config-input[data-obj-id]').forEach(input => {
            let timeout;
            input.addEventListener('input', function () {
                clearTimeout(timeout);
                timeout = setTimeout(async () => {
                    const objId = this.dataset.objId;
                    const path = this.dataset.objPath;
                    let value = this.value;

                    if (this.type === 'number') {
                        value = parseFloat(value);
                    }

                    await saveObjectiveValue(objId, path, value);
                }, 500);
            });
        });
    }

    async function saveObjectiveValue(objectiveId, propPath, value) {
        await writeConfig('objective', objectiveId, { [propPath]: value });
    }

    async function renameObjective(oldId, newId) {
        const ok = await writeConfig('rename-objective', oldId, newId);
        if (!ok) {
            alert('Rename failed');
        }
        await loadConfig();
        renderObjectivesTab();
    }

    function renderRawTab() {
        configBody.innerHTML = `
            <div class="config-section">
                <div class="config-section-header">Raw Config (Read Only)</div>
                <pre class="config-readonly">${escapeHtml(JSON.stringify(configData, null, 2))}</pre>
            </div>
        `;
    }

    // === Engagement Tab ===

    const REQUIREMENT_TYPES = [
        { value: 'timeOnSlide', label: 'Time on Slide' },
        { value: 'scrollDepth', label: 'Scroll Depth' },
        { value: 'interactionComplete', label: 'Interaction Complete' },
        { value: 'audioComplete', label: 'Audio Complete' },
        { value: 'modalAudioComplete', label: 'Modal Audio Complete' },
        { value: 'flag', label: 'Flag' },
        { value: 'allFlags', label: 'All Flags' },
        { value: 'viewAllTabs', label: 'View All Tabs' }
    ];

    const REQUIREMENT_DEFAULTS = {
        timeOnSlide: { type: 'timeOnSlide', minSeconds: 30 },
        scrollDepth: { type: 'scrollDepth', percentage: 80 },
        interactionComplete: { type: 'interactionComplete', interactionId: '' },
        audioComplete: { type: 'audioComplete', audioId: '' },
        modalAudioComplete: { type: 'modalAudioComplete', modalId: '' },
        flag: { type: 'flag', key: '' },
        allFlags: { type: 'allFlags', flags: [] },
        viewAllTabs: { type: 'viewAllTabs', componentId: '' }
    };

    async function renderEngagementTab() {
        if (!configData) return;

        const slideIds = configData.slideIds || [];
        let html = '<div class="config-section"><div class="config-section-header">Engagement Requirements</div>';
        html += '<p class="config-description">Manage requirements across all slides. Only slides with engagement.required=true use requirements.</p>';

        // Fetch all slide configs in parallel
        const slideConfigs = await Promise.all(
            slideIds.map(async (s) => {
                try {
                    const res = await fetch('/__slide-config/' + encodeURIComponent(s.id));
                    return res.ok ? await res.json() : null;
                } catch { return null; }
            })
        );

        let hasAny = false;
        for (let si = 0; si < slideIds.length; si++) {
            const slide = slideConfigs[si];
            if (!slide) continue;
            const engagement = slide.engagement || {};
            const requirements = engagement.requirements || [];
            if (!engagement.required && requirements.length === 0) continue;

            hasAny = true;
            const title = slide.title || slide.id;
            html += `
                <div class="engagement-slide-card" data-eng-slide="${escapeHtml(slide.id)}">
                    <div class="engagement-slide-header">
                        <span class="engagement-slide-title">${escapeHtml(title)}</span>
                        <span class="engagement-slide-status ${engagement.required ? 'active' : 'inactive'}">${engagement.required ? 'Required' : 'Not required'}</span>
                    </div>
            `;

            for (let ri = 0; ri < requirements.length; ri++) {
                const req = requirements[ri];
                html += `
                    <div class="engagement-req-group" data-eng-slide="${escapeHtml(slide.id)}" data-req-index="${ri}">
                        <div class="engagement-req-header">
                            <span class="engagement-req-number">Requirement ${ri + 1}</span>
                            <button type="button" class="engagement-req-remove" data-eng-slide="${escapeHtml(slide.id)}" data-req-index="${ri}">✕</button>
                        </div>
                        <div class="config-row">
                            <span class="config-label">Type</span>
                            <select class="engagement-req-type" data-eng-slide="${escapeHtml(slide.id)}" data-req-index="${ri}">
                                ${REQUIREMENT_TYPES.map(t => `<option value="${t.value}" ${req.type === t.value ? 'selected' : ''}>${t.label}</option>`).join('')}
                            </select>
                        </div>
                        ${renderRequirementFields(req, slide.id, ri)}
                    </div>
                `;
            }

            html += `
                    <button type="button" class="engagement-req-add" data-eng-slide="${escapeHtml(slide.id)}">+ Add Requirement</button>
                </div>
            `;
        }

        if (!hasAny) {
            html += '<p class="config-empty">No slides have engagement requirements configured. Enable engagement.required on a slide first.</p>';
        }

        html += '</div>';
        configBody.innerHTML = html;
        bindEngagementHandlers();
    }

    function renderRequirementFields(req, slideId, index) {
        const prefix = `data-eng-slide="${escapeHtml(slideId)}" data-req-index="${index}"`;
        switch (req.type) {
            case 'timeOnSlide':
                return `<div class="config-row"><span class="config-label">Min Seconds</span><input type="number" class="engagement-req-field config-input" ${prefix} data-field="minSeconds" value="${req.minSeconds || 30}" min="1" style="width: 80px;"></div>`;
            case 'scrollDepth':
                return `<div class="config-row"><span class="config-label">Percentage</span><input type="number" class="engagement-req-field config-input" ${prefix} data-field="percentage" value="${req.percentage || 80}" min="1" max="100" style="width: 80px;"></div>`;
            case 'interactionComplete':
                return `<div class="config-row"><span class="config-label">Interaction ID</span><input type="text" class="engagement-req-field config-input" ${prefix} data-field="interactionId" value="${escapeHtml(req.interactionId || '')}" placeholder="interaction-id"></div>`;
            case 'audioComplete':
                return `<div class="config-row"><span class="config-label">Audio ID</span><input type="text" class="engagement-req-field config-input" ${prefix} data-field="audioId" value="${escapeHtml(req.audioId || '')}" placeholder="audio-id"></div>`;
            case 'modalAudioComplete':
                return `<div class="config-row"><span class="config-label">Modal ID</span><input type="text" class="engagement-req-field config-input" ${prefix} data-field="modalId" value="${escapeHtml(req.modalId || '')}" placeholder="modal-id"></div>`;
            case 'flag':
                return `<div class="config-row"><span class="config-label">Key</span><input type="text" class="engagement-req-field config-input" ${prefix} data-field="key" value="${escapeHtml(req.key || '')}" placeholder="flag_key"></div>`;
            case 'viewAllTabs':
                return `<div class="config-row"><span class="config-label">Component ID</span><input type="text" class="engagement-req-field config-input" ${prefix} data-field="componentId" value="${escapeHtml(req.componentId || '')}" placeholder="tabs-id"></div>`;
            default:
                return '';
        }
    }

    function bindEngagementHandlers() {
        // Add requirement
        configBody.querySelectorAll('.engagement-req-add').forEach(btn => {
            btn.addEventListener('click', async () => {
                const slideId = btn.dataset.engSlide;
                const slideRes = await fetch('/__slide-config/' + encodeURIComponent(slideId));
                if (!slideRes.ok) return;
                const slide = await slideRes.json();
                const reqs = [...(slide.engagement?.requirements || []), { ...REQUIREMENT_DEFAULTS.timeOnSlide }];
                await writeConfig('slide', slideId, { 'engagement.requirements': reqs });
                renderEngagementTab();
            });
        });

        // Remove requirement
        configBody.querySelectorAll('.engagement-req-remove').forEach(btn => {
            btn.addEventListener('click', async () => {
                const slideId = btn.dataset.engSlide;
                const index = parseInt(btn.dataset.reqIndex, 10);
                const slideRes = await fetch('/__slide-config/' + encodeURIComponent(slideId));
                if (!slideRes.ok) return;
                const slide = await slideRes.json();
                const reqs = [...(slide.engagement?.requirements || [])];
                reqs.splice(index, 1);
                await writeConfig('slide', slideId, { 'engagement.requirements': reqs });
                renderEngagementTab();
            });
        });

        // Type change
        configBody.querySelectorAll('.engagement-req-type').forEach(sel => {
            sel.addEventListener('change', async () => {
                const slideId = sel.dataset.engSlide;
                const index = parseInt(sel.dataset.reqIndex, 10);
                const slideRes = await fetch('/__slide-config/' + encodeURIComponent(slideId));
                if (!slideRes.ok) return;
                const slide = await slideRes.json();
                const reqs = [...(slide.engagement?.requirements || [])];
                reqs[index] = { ...(REQUIREMENT_DEFAULTS[sel.value] || { type: sel.value }) };
                await writeConfig('slide', slideId, { 'engagement.requirements': reqs });
                renderEngagementTab();
            });
        });

        // Field change (debounced)
        configBody.querySelectorAll('.engagement-req-field').forEach(field => {
            let timeout;
            const handler = async () => {
                const slideId = field.dataset.engSlide;
                const index = parseInt(field.dataset.reqIndex, 10);
                const fieldName = field.dataset.field;
                let value = field.value;
                if (field.type === 'number') value = parseFloat(value);

                const slideRes = await fetch('/__slide-config/' + encodeURIComponent(slideId));
                if (!slideRes.ok) return;
                const slide = await slideRes.json();
                const reqs = [...(slide.engagement?.requirements || [])];
                if (reqs[index]) {
                    reqs[index] = { ...reqs[index], [fieldName]: value };
                    await writeConfig('slide', slideId, { 'engagement.requirements': reqs });
                }
            };
            field.addEventListener('input', () => { clearTimeout(timeout); timeout = setTimeout(handler, 500); });
            field.addEventListener('change', handler);
        });
    }

    async function saveThemeValue(token, value) {
        try {
            const response = await fetch('/__theme-edit', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token, value })
            });
            if (!response.ok) {
                console.error('Theme save failed');
            }
        } catch (err) {
            console.error('Theme save error:', err);
        }
    }

    async function saveConfigValue(path, value) {
        try {
            const response = await fetch('/__write', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ target: 'config', id: path, value })
            });
            if (!response.ok) {
                const err = await response.json();
                console.error('Config save error:', err);
            }
        } catch (err) {
            console.error('Failed to save config:', err);
        }
    }

    // Expose for refresh when slide changes
    window.__refreshSlideTab = () => {
        if (currentConfigTab === 'slide' && document.getElementById('stub-player-config-panel').classList.contains('visible')) {
            renderSlideTab();
        }
    };

    return {
        loadConfig,
        render: renderConfigTab
    };
}
