/**
 * stub-player/outline-mode.js - Status Dashboard
 * 
 * General-purpose project status dashboard showing authoring stage,
 * progress checklist, and stage-specific guidance/content.
 * 
 * Auto-shows at stages 1-2 (before course is built).
 * Always accessible via header button or ?dashboard URL param.
 */

const STAGES = [
    { num: 1, id: 'source-ingestion', label: 'Ingest', title: 'Source Ingestion', desc: 'Add reference files and convert them to markdown for AI processing.' },
    { num: 2, id: 'outline-creation', label: 'Outline', title: 'Outline Creation', desc: 'Generate or write a course outline from your reference materials.' },
    { num: 3, id: 'course-building', label: 'Build', title: 'Course Building', desc: 'Create slide content and configure course structure.' },
    { num: 4, id: 'preview-polish', label: 'Polish', title: 'Preview & Polish', desc: 'Iterate on visual quality, fix issues, and refine interactions.' },
    { num: 5, id: 'export-ready', label: 'Export', title: 'Export Ready', desc: 'Lint passes — ready for LMS deployment.' }
];

/**
 * Generate dashboard overlay HTML
 */
export function generateOutlineMode() {
    return `
    <div id="stub-player-outline-mode">
        <div id="stub-player-outline-content">
            <div class="outline-loading">Checking project stage...</div>
        </div>
    </div>
    `;
}

/**
 * Initialize Dashboard Handlers
 */
export function createOutlineModeHandlers(context) {
    const outlineMode = document.getElementById('stub-player-outline-mode');
    const outlineContent = document.getElementById('stub-player-outline-content');
    const courseFrame = document.getElementById('stub-player-course-frame');

    let stageData = null;
    let isVisible = false;
    let courseLoaded = false;
    let viewingStage = null; // Which stage the dashboard is showing

    async function checkStage() {
        const params = new URLSearchParams(window.location.search);

        // MCP headless browser sets ?headless — never show the dashboard
        if (params.has('headless')) return false;

        // Desktop companion app manages its own workflow — skip auto-show
        const stubConfig = window.STUB_CONFIG || {};
        if (stubConfig.isDesktop) return false;

        const urlForce = params.has('dashboard');
        const stageParam = params.has('stage') ? parseInt(params.get('stage'), 10) : null;
        const skipPref = localStorage.getItem('coursecode-skipOutline') === 'true';

        try {
            const res = await fetch('/__stage');
            if (!res.ok) return false;
            stageData = await res.json();
            viewingStage = stageParam || stageData.stageNumber;

            if (urlForce || stageParam) {
                show();
                return true;
            }
            // Auto-show for early stages and freshly imported presentations
            const isImport = stageData.checklist?.source === 'powerpoint-import';
            if ((stageData.stageNumber < 3 || (isImport && stageData.stageNumber === 4)) && !skipPref) {
                show();
                return true;
            }
            return false;
        } catch {
            return false;
        }
    }

    function toggle() {
        if (isVisible) {
            hide();
            if (!courseLoaded && context.loadCourse) {
                context.loadCourse();
                courseLoaded = true;
            }
        } else {
            fetchAndShow();
        }
    }

    async function fetchAndShow() {
        show();
        try {
            const res = await fetch('/__stage');
            if (res.ok) {
                stageData = await res.json();
                viewingStage = stageData.stageNumber;
            }
        } catch { /* use cached */ }
        renderDashboard();
    }

    function show() {
        if (!outlineMode || !courseFrame) return;
        isVisible = true;
        outlineMode.classList.add('visible');
        courseFrame.style.display = 'none';
        if (stageData) renderDashboard();
    }

    function hide() {
        if (!outlineMode || !courseFrame) return;
        isVisible = false;
        outlineMode.classList.remove('visible');
        courseFrame.style.display = '';
    }

    // ── Rendering ────────────────────────────────────────────

    async function renderDashboard() {
        if (!stageData) return;
        const detectedStage = stageData.stageNumber;
        const stage = STAGES[viewingStage - 1];
        if (!stage) return;

        const parts = [];

        // Close button (pinned top-left)
        parts.push('<button id="outline-close-btn" class="outline-close-btn" title="Close dashboard">×</button>');

        // Stage stepper
        parts.push(renderStepper(detectedStage, viewingStage));

        // Stage header — contextual button text
        const hasSlides = stageData.checklist?.hasSlides;
        let skipLabel;
        if (courseLoaded) {
            skipLabel = '← Back to Course';
        } else if (hasSlides) {
            skipLabel = 'View Course ▸';
        } else {
            skipLabel = 'Skip to Course ▸';
        }

        parts.push(`
            <div class="outline-stage-header">
                <h1>${stage.title}</h1>
                <p class="outline-stage-desc">${stage.desc}</p>
                <button id="stub-player-skip-outline-btn" class="outline-skip-btn">
                    ${skipLabel}
                </button>
            </div>
        `);

        // Stage-specific content
        parts.push(await renderStageContent(viewingStage));

        outlineContent.innerHTML = parts.join('');
        attachHandlers();
    }

    function renderStepper(detected, viewing) {
        const steps = STAGES.map(s => {
            const classes = [];
            if (s.num < detected) classes.push('completed');
            if (s.num === detected) classes.push('current');
            if (s.num === viewing) classes.push('viewing');

            let dotContent;
            if (s.num < detected) {
                dotContent = '✓';
            } else if (s.num === detected && s.num === viewing) {
                dotContent = s.num;
            } else {
                dotContent = s.num;
            }

            return `<button class="stepper-step ${classes.join(' ')}" data-stage="${s.num}">
                <span class="stepper-dot">${dotContent}</span>
                <span class="stepper-label">${s.label}</span>
            </button>`;
        });

        // Color connector lines between completed steps
        const connectors = [];
        for (let i = 0; i < STAGES.length - 1; i++) {
            const filled = STAGES[i].num < detected;
            connectors.push(`<span class="stepper-line${filled ? ' stepper-line-filled' : ''}"></span>`);
        }

        // Interleave steps and connectors
        const html = steps.map((step, i) => step + (connectors[i] || '')).join('');
        return `<div class="outline-stepper">${html}</div>`;
    }

    async function renderStageContent(stageNum) {
        switch (stageNum) {
            case 1: return await renderStage1();
            case 2: return await renderStage2();
            case 3: return await renderStage3();
            case 4: return await renderStage4();
            case 5: return await renderStage5();
            default: return '';
        }
    }

    // ── Stage 1: Source Ingestion ─────────────────────────────

    async function renderStage1() {
        let refs = null;
        try {
            const res = await fetch('/__refs');
            if (res.ok) refs = await res.json();
        } catch { /* ignore */ }

        const hasRefs = refs && !refs.isEmpty;

        if (!hasRefs) {
            // No refs — dropzone is the primary view, with pptx branch below
            return `
                <div class="outline-card">
                    <h2>📋 What to do</h2>
                    <ol class="outline-steps">
                        <li>Add reference documents (PDF, DOCX, PPTX) to <code>course/references/</code></li>
                        <li>Click <strong>Convert to Markdown</strong> below, or run <code>coursecode convert</code> from the CLI</li>
                        <li>Review converted files in <code>course/references/converted/</code></li>
                    </ol>
                </div>
                <div class="outline-card outline-refs-card" id="outline-refs-dropzone">
                    <h2>📁 Reference Files</h2>
                    <div class="outline-dropzone-empty">
                        <div class="outline-dropzone-icon">📂</div>
                        <div class="outline-dropzone-text">Drop reference files here to get started</div>
                        <div class="outline-dropzone-hint">PDF, DOCX, PPTX, MD — or copy them to <code>course/references/</code></div>
                    </div>
                </div>
                <div class="outline-or-divider"><span class="outline-or-line"></span><span class="outline-or-text">or</span><span class="outline-or-line"></span></div>
                <button class="outline-branch-btn" id="branch-convert">
                    <span class="outline-branch-icon">📊</span>
                    <div>
                        <strong>Convert PowerPoint to Course</strong>
                        <span>Each slide becomes a page — then enhance with AI</span>
                    </div>
                </button>
                ${renderChecklist()}
            `;
        }

        // Has refs — show normal flow (no pptx branch needed)
        return `
            <div class="outline-card">
                <h2>📋 What to do</h2>
                <ol class="outline-steps">
                    <li>Add reference documents (PDF, DOCX, PPTX) to <code>course/references/</code></li>
                    <li>Click <strong>Convert to Markdown</strong> below, or run <code>coursecode convert</code> from the CLI</li>
                    <li>Review converted files in <code>course/references/converted/</code></li>
                </ol>
            </div>
            ${renderRefsWithDropzone(refs)}
            ${renderChecklist()}
        `;
    }

    function renderConvertView() {
        return `
            <button class="outline-back-btn" id="convert-back-btn">← Back</button>
            <div class="outline-card outline-convert-dropzone" id="outline-convert-dropzone">
                <h2>📊 Convert PowerPoint to Course</h2>
                <div class="outline-dropzone-empty">
                    <div class="outline-dropzone-icon">📊</div>
                    <div class="outline-dropzone-text">Drop a .pptx file here</div>
                    <div class="outline-dropzone-hint">Each slide becomes a page. Text is extracted as reference material.</div>
                </div>
            </div>
        `;
    }

    // ── Stage 2: Outline Creation ────────────────────────────

    async function renderStage2() {
        let outlineHtml = '';
        try {
            const res = await fetch('/__outline');
            if (res.ok) {
                const data = await res.json();
                const filePath = data.path || '';
                outlineHtml = `
                    <div class="outline-card">
                        <div class="outline-card-header">
                            <h2>📝 Course Outline</h2>
                            <button class="outline-open-file-btn" id="outline-open-file-btn" data-path="${filePath}" title="Open in editor">
                                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
                                    <path d="M6 2H3a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-3"/>
                                    <path d="M8 8L14 2M10 2h4v4"/>
                                </svg>
                                Open File
                            </button>
                        </div>
                        <div class="outline-markdown-scroll">
                            <div class="outline-markdown">${data.html || escapeHtml(data.raw || '')}</div>
                        </div>
                    </div>`;
            }
        } catch { /* ignore */ }

        // Fetch converted reference files for context
        let refsHtml = '';
        try {
            const refsRes = await fetch('/__refs');
            if (refsRes.ok) {
                const refs = await refsRes.json();
                const converted = refs.converted || [];
                if (converted.length > 0) {
                    const items = converted.map(f => `
                        <a class="outline-ref-link" href="/__stub-player/ref-preview?file=${encodeURIComponent(f)}" target="_blank" title="Preview ${f}">
                            <span class="outline-ref-link-icon">📄</span>
                            <span class="outline-ref-link-name">${f}</span>
                            <span class="outline-ref-link-arrow">↗</span>
                        </a>
                    `).join('');
                    refsHtml = `
                        <div class="outline-card">
                            <h2>📚 Converted Reference Materials</h2>
                            <p style="font-size:12px;color:var(--color-gray-600);margin:0 0 12px;">Use these as context when writing your outline.</p>
                            <div class="outline-ref-links">${items}</div>
                        </div>`;
                }
            }
        } catch { /* ignore */ }

        return `
            <div class="outline-card">
                <h2>📋 What to do</h2>
                <ol class="outline-steps">
                    <li>Review your converted reference materials</li>
                    <li>Create <code>COURSE_OUTLINE.md</code> in <code>course/</code></li>
                    <li>Define modules, lessons, and learning objectives</li>
                </ol>
            </div>
            ${refsHtml}
            ${outlineHtml || '<div class=\'outline-card outline-card-empty\'><h2>📝 Course Outline</h2><p>No outline found yet. Create <code>COURSE_OUTLINE.md</code> to continue.</p></div>'}
            ${renderChecklist()}
        `;
    }

    // ── Stage 3: Course Building ─────────────────────────────

    async function renderStage3() {
        let configHtml = '';
        try {
            const res = await fetch('/__config');
            if (res.ok) {
                const config = await res.json();
                const slideCount = config.slideCount || 0;
                const slideIds = config.slideIds || [];
                const assessmentCount = slideIds.filter(s => s.type === 'assessment').length;

                // Stats row
                configHtml = `
                    <div class="outline-card">
                        <h2>📊 Course Structure</h2>
                        <div class="outline-stats">
                            <div class="outline-stat"><span class="outline-stat-num">${slideCount}</span><span class="outline-stat-label">Slides</span></div>
                            <div class="outline-stat"><span class="outline-stat-num">${assessmentCount}</span><span class="outline-stat-label">Assessments</span></div>
                            <div class="outline-stat"><span class="outline-stat-num">${config.objectives?.length || 0}</span><span class="outline-stat-label">Objectives</span></div>
                        </div>
                    </div>`;

                // Slide list
                if (slideIds.length > 0) {
                    const slideItems = slideIds.map(s => {
                        const icon = s.type === 'assessment' ? '📝' : '📄';
                        const badge = s.type === 'assessment' ? '<span class="outline-slide-badge assessment">Assessment</span>' : '';
                        return `
                            <div class="outline-slide-item">
                                <span class="outline-slide-icon">${icon}</span>
                                <span class="outline-slide-id">${s.id}</span>
                                ${s.title && s.title !== s.id ? `<span class="outline-slide-title">${escapeHtml(s.title)}</span>` : ''}
                                ${badge}
                            </div>`;
                    }).join('');
                    configHtml += `
                        <div class="outline-card">
                            <h2>🗂️ Slide List</h2>
                            <div class="outline-slide-list">${slideItems}</div>
                        </div>`;
                }
            }
        } catch { /* ignore */ }

        return `
            <div class="outline-card">
                <h2>📋 What to do</h2>
                <ol class="outline-steps">
                    <li>Create slide files in <code>course/slides/</code> based on your outline</li>
                    <li>Configure <code>course/course-config.js</code> with slide order and metadata</li>
                    <li>Add assessments and interactions as needed</li>
                </ol>
            </div>
            ${configHtml}
            ${renderChecklist()}
        `;
    }

    // ── Stage 4: Preview & Polish ────────────────────────────

    async function renderStage4() {
        // Check for powerpoint-import source — show tailored post-import view
        if (stageData.checklist?.source === 'powerpoint-import') {
            return renderImportView();
        }

        let lintHtml = '';
        try {
            const runtimeErrors = window._stubPlayerState?.errorLog || [];
            const errorCount = runtimeErrors.filter(e => !e.isWarning).length;
            const warningCount = runtimeErrors.filter(e => e.isWarning).length;
            const status = errorCount === 0 && warningCount === 0 ? 'clean' : errorCount > 0 ? 'errors' : 'warnings';
                lintHtml = `
                    <div class="outline-card">
                        <h2>🔍 Build Status</h2>
                        <div class="outline-stats">
                            <div class="outline-stat ${status === 'errors' ? 'stat-error' : ''}"><span class="outline-stat-num">${errorCount}</span><span class="outline-stat-label">Errors</span></div>
                            <div class="outline-stat ${status === 'warnings' ? 'stat-warning' : ''}"><span class="outline-stat-num">${warningCount}</span><span class="outline-stat-label">Warnings</span></div>
                            <div class="outline-stat ${status === 'clean' ? 'stat-success' : ''}"><span class="outline-stat-num">${status === 'clean' ? '✓' : '—'}</span><span class="outline-stat-label">${status === 'clean' ? 'All Clear' : 'Status'}</span></div>
                        </div>
                    </div>`;
        } catch { /* ignore */ }

        return `
            <div class="outline-card">
                <h2>📋 What to do</h2>
                <ol class="outline-steps">
                    <li>Preview each slide and check layout, styling, and content</li>
                    <li>Test all interactions and verify correct/incorrect responses</li>
                    <li>Fix any lint errors or warnings shown in the Debug panel</li>
                    <li>Customize theme colors and typography in <code>course/theme.css</code></li>
                </ol>
            </div>
            ${lintHtml}
            ${renderChecklist()}
        `;
    }

    function renderImportView() {
        const slideCount = stageData.checklist?.slideCount || 0;

        return `
            <div class="outline-card outline-card-success">
                <h2>📊 Presentation Imported</h2>
                <div class="outline-stats">
                    <div class="outline-stat stat-success"><span class="outline-stat-num">${slideCount}</span><span class="outline-stat-label">Slides Imported</span></div>
                </div>
            </div>
            <div class="outline-card">
                <h2>🤖 Enhance with AI</h2>
                <p>Your presentation slides are ready. Use AI editing to transform them into an interactive course:</p>
                <ol class="outline-steps">
                    <li><strong>Add engagement tracking</strong> — require learners to interact with tabs, accordions, or other components before advancing</li>
                    <li><strong>Insert assessments</strong> — add knowledge checks between sections with multiple-choice, drag-drop, or other question types</li>
                    <li><strong>Group into sections</strong> — organize slides into logical modules with section headers</li>
                    <li><strong>Replace image slides</strong> — convert static image slides into interactive HTML with text, components, and styling</li>
                    <li><strong>Customize theme</strong> — update colors and typography in <code>course/theme.css</code></li>
                </ol>
                <p class="outline-hint">💡 Extracted text from the presentation is available in <code>course/references/converted/</code> for AI context.</p>
            </div>
            ${renderChecklist()}
        `;
    }

    // ── Stage 5: Export Ready ────────────────────────────────

    async function renderStage5() {
        const commands = [
            { cmd: 'coursecode build', label: 'cmi5 (default)' },
            { cmd: 'coursecode build --format scorm2004', label: 'SCORM 2004' },
            { cmd: 'coursecode build --format scorm1.2', label: 'SCORM 1.2' },
            { cmd: 'coursecode build --format lti', label: 'LTI 1.3' },
            { cmd: 'coursecode deploy', label: 'Deploy to Cloud' }
        ];

        const cmdRows = commands.map(c => `
            <div class="outline-cmd">
                <code>${c.cmd}</code>
                <span class="outline-cmd-label">${c.label}</span>
                <button class="outline-copy-btn" data-cmd="${c.cmd}" title="Copy to clipboard">📋</button>
            </div>
        `).join('');

        return `
            <div class="outline-card outline-card-success">
                <h2>🎉 Ready for Export</h2>
                <p>Your course is complete and passing all checks. Export it for your LMS:</p>
                <div class="outline-build-actions">
                    <button class="outline-build-btn" id="outline-build-btn">▶ Build Now (cmi5)</button>
                    <select class="outline-build-format" id="outline-build-format">
                        <option value="cmi5">cmi5</option>
                        <option value="scorm2004">SCORM 2004</option>
                        <option value="scorm1.2">SCORM 1.2</option>
                        <option value="lti">LTI 1.3</option>
                    </select>
                </div>
                <div id="outline-build-status" class="outline-build-status" style="display:none;"></div>
                <div class="outline-export-cmds">
                    ${cmdRows}
                </div>
            </div>
            ${renderChecklist()}
        `;
    }

    // ── Shared Components ────────────────────────────────────

    function renderChecklist() {
        if (!stageData?.checklist) return '';
        const c = stageData.checklist;
        const items = [
            { label: 'Reference files', done: c.hasRawRefs, detail: c.hasRawRefs ? `${c.rawRefCount || '—'} file(s)` : 'None yet' },
            { label: 'Converted to markdown', done: c.hasConvertedRefs, detail: c.hasConvertedRefs ? `${c.convertedRefCount || '—'} file(s)` : 'Pending' },
            { label: 'Course outline', done: c.hasOutline, detail: c.hasOutline ? 'COURSE_OUTLINE.md' : 'Not created' },
            { label: 'Slide files', done: c.hasSlides, detail: c.hasSlides ? `${c.slideCount || '—'} slide(s)` : 'Not created' },
            { label: 'Course config', done: c.hasCourseConfig, detail: c.hasCourseConfig ? 'course-config.js' : 'Not created' }
        ];

        return `<div class="outline-card outline-checklist">
            <h2>✅ Progress</h2>
            ${items.map(i => `
                <div class="outline-checklist-item ${i.done ? 'done' : ''}">
                    <span class="outline-check">${i.done ? '✓' : ''}</span>
                    <span class="outline-check-label">${i.label}</span>
                    <span class="outline-check-detail">${i.detail}</span>
                </div>
            `).join('')}
        </div>`;
    }

    function renderRefsWithDropzone(refs) {
        // Has refs — show list with convert action bar and drop bar
        const pendingCount = (refs.needsConversion || []).length;

        let html = '<div class="outline-card outline-refs-card"><h2>📁 Reference Files</h2>';
        for (const file of (refs.raw || [])) {
            const converted = !(refs.needsConversion || []).includes(file);
            html += `<div class="outline-ref-item ${converted ? 'converted' : 'pending'}">
                <span class="outline-ref-status">${converted ? '✓' : '⚠'}</span>
                <span class="outline-ref-name">${file}</span>
                <span class="outline-ref-badge">${converted ? 'Converted' : 'Needs conversion'}</span>
            </div>`;
        }

        // Convert action bar
        html += `<div class="outline-convert-bar">
            <label class="outline-convert-overwrite">
                <input type="checkbox" id="outline-convert-overwrite" checked>
                <span>Overwrite existing conversions</span>
            </label>
            <button class="outline-convert-btn" id="outline-convert-btn">
                ${pendingCount > 0 ? `Convert ${pendingCount} File${pendingCount > 1 ? 's' : ''} to Markdown` : 'Re-convert All to Markdown'}
            </button>
        </div>`;

        html += `<div class="outline-dropzone-bar" id="outline-refs-dropzone">
            <span class="outline-dropzone-bar-text">📂 Drop more files here</span>
        </div>`;
        html += '</div>';
        return html;
    }

    // ── Event Handlers ───────────────────────────────────────

    function attachHandlers() {
        // Close button (pinned ×)
        const dismissDashboard = () => {
            if (stageData && stageData.stageNumber < 3) {
                localStorage.setItem('coursecode-skipOutline', 'true');
            }
            hide();
            if (!courseLoaded && context.loadCourse) {
                context.loadCourse();
                courseLoaded = true;
            }
        };
        document.getElementById('outline-close-btn')?.addEventListener('click', dismissDashboard);

        // Skip / Back button
        document.getElementById('stub-player-skip-outline-btn')?.addEventListener('click', dismissDashboard);

        // Stepper clicks
        outlineContent.querySelectorAll('.stepper-step').forEach(btn => {
            btn.addEventListener('click', () => {
                viewingStage = parseInt(btn.dataset.stage, 10);
                renderDashboard();
            });
        });

        // Open file in editor
        const openBtn = document.getElementById('outline-open-file-btn');
        if (openBtn) {
            openBtn.addEventListener('click', () => {
                const filePath = openBtn.dataset.path;
                if (filePath) window.open('vscode://file' + filePath, '_blank');
            });
        }

        // Convert button
        const convertBtn = document.getElementById('outline-convert-btn');
        if (convertBtn) {
            convertBtn.addEventListener('click', async () => {
                const overwrite = document.getElementById('outline-convert-overwrite')?.checked ?? true;
                convertBtn.disabled = true;
                convertBtn.textContent = 'Converting…';
                convertBtn.classList.add('converting');

                try {
                    const res = await fetch(`/__refs-convert?overwrite=${overwrite}`, { method: 'POST' });
                    const result = await res.json();
                    if (result.success) {
                        convertBtn.textContent = '✅ Conversion complete';
                        setTimeout(async () => {
                            try {
                                const stageRes = await fetch('/__stage');
                                if (stageRes.ok) stageData = await stageRes.json();
                            } catch { /* ignore */ }
                            renderDashboard();
                        }, 1500);
                    } else {
                        convertBtn.textContent = '❌ Conversion failed';
                        convertBtn.disabled = false;
                        convertBtn.classList.remove('converting');
                    }
                } catch {
                    convertBtn.textContent = '❌ Conversion failed';
                    convertBtn.disabled = false;
                    convertBtn.classList.remove('converting');
                }
            });
        }

        // Dropzone for reference files (the card itself is the drop target)
        const dropzone = document.getElementById('outline-refs-dropzone');
        if (dropzone) {
            setupRefsDropzone(dropzone);
        }

        // Branch option: Convert PowerPoint to Course
        document.getElementById('branch-convert')?.addEventListener('click', () => {
            showConvertSubView();
        });

        // Convert view back button
        document.getElementById('convert-back-btn')?.addEventListener('click', () => {
            renderDashboard();
        });

        // Convert-to-course dropzone
        const convertZone = document.getElementById('outline-convert-dropzone');
        if (convertZone) {
            setupConvertDropzone(convertZone);
        }

        // Copy-to-clipboard buttons
        outlineContent.querySelectorAll('.outline-copy-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                const cmd = btn.dataset.cmd;
                try {
                    await navigator.clipboard.writeText(cmd);
                    btn.textContent = '✓';
                    setTimeout(() => { btn.textContent = '📋'; }, 1500);
                } catch {
                    btn.textContent = '✗';
                    setTimeout(() => { btn.textContent = '📋'; }, 1500);
                }
            });
        });

        // Build Now button
        const buildBtn = document.getElementById('outline-build-btn');
        const buildFormat = document.getElementById('outline-build-format');
        const buildStatus = document.getElementById('outline-build-status');
        if (buildBtn) {
            buildBtn.addEventListener('click', async () => {
                const format = buildFormat?.value || 'cmi5';
                buildBtn.disabled = true;
                buildBtn.textContent = `Building (${format})…`;
                if (buildStatus) {
                    buildStatus.style.display = 'block';
                    buildStatus.textContent = 'Build in progress…';
                    buildStatus.className = 'outline-build-status building';
                }

                try {
                    const res = await fetch(`/__build?format=${format}`, { method: 'POST' });
                    const result = await res.json();
                    if (result.success) {
                        buildBtn.textContent = '✅ Build Complete';
                        if (buildStatus) {
                            buildStatus.textContent = `Built ${format} in ${result.duration}. Output: dist/`;
                            buildStatus.className = 'outline-build-status success';
                        }
                    } else {
                        buildBtn.textContent = '❌ Build Failed';
                        if (buildStatus) {
                            buildStatus.textContent = result.error || result.errors?.join(', ') || 'Build failed';
                            buildStatus.className = 'outline-build-status error';
                        }
                    }
                } catch (err) {
                    buildBtn.textContent = '❌ Build Failed';
                    if (buildStatus) {
                        buildStatus.textContent = err.message;
                        buildStatus.className = 'outline-build-status error';
                    }
                }

                setTimeout(() => {
                    buildBtn.disabled = false;
                    buildBtn.textContent = '▶ Build Now (cmi5)';
                }, 3000);
            });

            // Sync button label with format dropdown
            buildFormat?.addEventListener('change', () => {
                const f = buildFormat.value;
                buildBtn.textContent = `▶ Build Now (${f})`;
            });
        }
    }


    function showConvertSubView() {
        const stageContentStart = outlineContent.querySelector('.outline-stage-header');
        if (!stageContentStart) return;

        const siblings = [];
        let el = stageContentStart.nextElementSibling;
        while (el) { siblings.push(el); el = el.nextElementSibling; }
        siblings.forEach(s => s.remove());

        const convertHtml = document.createElement('div');
        convertHtml.innerHTML = renderConvertView();
        stageContentStart.after(convertHtml);

        document.getElementById('convert-back-btn')?.addEventListener('click', () => renderDashboard());
        const convertZone = document.getElementById('outline-convert-dropzone');
        if (convertZone) setupConvertDropzone(convertZone);
    }

    function setupRefsDropzone(dropzone) {
        const ALLOWED = ['.pdf', '.docx', '.doc', '.pptx', '.ppt', '.md'];
        const card = dropzone.closest('.outline-refs-card') || dropzone;

        card.addEventListener('dragover', e => {
            e.preventDefault();
            card.classList.add('dragover');
        });
        card.addEventListener('dragleave', (e) => {
            if (!card.contains(e.relatedTarget)) card.classList.remove('dragover');
        });
        card.addEventListener('drop', async (e) => {
            e.preventDefault();
            card.classList.remove('dragover');

            const files = [...e.dataTransfer.files].filter(f =>
                ALLOWED.some(ext => f.name.toLowerCase().endsWith(ext))
            );

            const textEl = card.querySelector('.outline-dropzone-text') || card.querySelector('.outline-dropzone-bar-text');
            if (files.length === 0) {
                if (textEl) textEl.textContent = 'No supported files found';
                setTimeout(() => renderDashboard(), 2000);
                return;
            }

            card.classList.add('uploading');
            if (textEl) textEl.textContent = `Uploading ${files.length} file(s)...`;

            const formData = new FormData();
            for (const file of files) formData.append('files', file, file.name);

            try {
                const res = await fetch('/__refs-upload', { method: 'POST', body: formData });
                const result = await res.json();
                if (result.success) {
                    if (textEl) textEl.textContent = `✅ Uploaded ${files.length} file(s)`;
                    setTimeout(async () => {
                        try {
                            const stageRes = await fetch('/__stage');
                            if (stageRes.ok) stageData = await stageRes.json();
                        } catch { /* ignore */ }
                        renderDashboard();
                    }, 1500);
                } else {
                    if (textEl) textEl.textContent = '❌ Upload failed';
                }
            } catch {
                if (textEl) textEl.textContent = '❌ Upload failed';
            }
            card.classList.remove('uploading');
        });
    }

    function setupConvertDropzone(convertZone) {
        convertZone.addEventListener('dragover', e => {
            e.preventDefault();
            convertZone.classList.add('dragover');
        });
        convertZone.addEventListener('dragleave', (e) => {
            if (!convertZone.contains(e.relatedTarget)) convertZone.classList.remove('dragover');
        });
        convertZone.addEventListener('drop', async (e) => {
            e.preventDefault();
            convertZone.classList.remove('dragover');

            const pptxFiles = [...e.dataTransfer.files].filter(f =>
                f.name.toLowerCase().endsWith('.pptx')
            );

            const textEl = convertZone.querySelector('.outline-dropzone-text');
            if (pptxFiles.length === 0) {
                if (textEl) textEl.textContent = 'Only .pptx files can be converted';
                setTimeout(() => renderDashboard(), 2000);
                return;
            }

            convertZone.classList.add('uploading');
            if (textEl) textEl.textContent = `Converting ${pptxFiles[0].name}…`;

            const formData = new FormData();
            formData.append('file', pptxFiles[0], pptxFiles[0].name);

            try {
                const res = await fetch('/__import', { method: 'POST', body: formData });
                const result = await res.json();
                if (result.success) {
                    if (textEl) textEl.textContent = `✅ ${result.slideCount} slides converted`;
                    setTimeout(async () => {
                        try {
                            const stageRes = await fetch('/__stage');
                            if (stageRes.ok) {
                                stageData = await stageRes.json();
                                viewingStage = stageData.stageNumber;
                            }
                        } catch { /* ignore */ }
                        renderDashboard();
                    }, 1500);
                } else {
                    if (textEl) textEl.textContent = `❌ Conversion failed: ${result.error || 'Unknown error'}`;
                }
            } catch {
                if (textEl) textEl.textContent = '❌ Conversion failed';
            }
            convertZone.classList.remove('uploading');
        });
    }

    function escapeHtml(str) {
        return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    return { checkStage, toggle, hide, isVisible: () => isVisible };
}
