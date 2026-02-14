/**
 * stub-player/debug-panel.js - Debug panel component
 * 
 * Generates the debug panel HTML with tabs for state, API log, xAPI, and errors.
 */

/**
 * Generate debug panel HTML
 */
export function generateDebugPanel() {
    return `
    <div id="stub-player-debug-panel">
        <div id="stub-player-debug-panel-header">
            <h3>LMS Debug <span id="stub-player-format-badge" class="format-badge"></span></h3>
            <button id="stub-player-debug-panel-close">&times;</button>
        </div>
        <div id="stub-player-debug-tabs">
            <button class="active" data-tab="state">State</button>
            <button data-tab="api-log">API Log</button>
            <button id="stub-player-xapi-tab" data-tab="xapi">xAPI <span id="stub-player-xapi-badge"></span></button>
            <button data-tab="errors">Errors <span id="stub-player-error-badge"></span></button>
        </div>
        <div id="stub-player-debug-content">
            <div id="tab-state">
                <div class="debug-section" id="section-resume">
                    <div class="debug-section-header" onclick="this.parentElement.classList.toggle('collapsed')">
                        <span class="toggle-icon">▼</span>
                        <h4>Resume State</h4>
                    </div>
                    <div class="debug-section-content">
                        <table class="debug-table" id="stub-player-resume-data"></table>
                    </div>
                </div>
                <div class="debug-section" id="section-score">
                    <div class="debug-section-header" onclick="this.parentElement.classList.toggle('collapsed')">
                        <span class="toggle-icon">▼</span>
                        <h4>Score</h4>
                    </div>
                    <div class="debug-section-content">
                        <table class="debug-table" id="stub-player-score-data"></table>
                    </div>
                </div>
                <div class="debug-section collapsed" id="section-objectives">
                    <div class="debug-section-header" onclick="this.parentElement.classList.toggle('collapsed')">
                        <span class="toggle-icon">▼</span>
                        <h4>Objectives</h4>
                        <span class="count-badge" id="stub-player-objectives-count">0</span>
                    </div>
                    <div class="debug-section-content">
                        <div id="stub-player-objectives-data"></div>
                    </div>
                </div>
                <div class="debug-section collapsed" id="section-interactions">
                    <div class="debug-section-header" onclick="this.parentElement.classList.toggle('collapsed')">
                        <span class="toggle-icon">▼</span>
                        <h4>Interactions</h4>
                        <span class="count-badge" id="stub-player-interactions-count">0</span>
                    </div>
                    <div class="debug-section-content">
                        <div id="stub-player-interactions-data"></div>
                    </div>
                </div>
                <div class="debug-section" id="section-suspend">
                    <div class="debug-section-header" onclick="this.parentElement.classList.toggle('collapsed')">
                        <span class="toggle-icon">▼</span>
                        <h4>Suspend Data</h4>
                    </div>
                    <div class="debug-section-content">
                        <div class="suspend-info" id="stub-player-suspend-info"></div>
                        <pre id="stub-player-suspend-data" style="background:#252542;padding:8px;border-radius:4px;overflow-x:auto;font-size:10px;max-height:200px;overflow-y:auto;"></pre>
                    </div>
                </div>
                <div class="debug-section-actions">
                    <button id="stub-player-resume-test-btn" class="debug-action-btn" title="Simulate session end and test resume">🔄 Test Resume</button>
                </div>
            </div>
            <div id="tab-api-log" style="display:none;">
                <div id="stub-player-api-log"></div>
            </div>
            <div id="tab-xapi" style="display:none;">
                <div id="stub-player-xapi-log">
                    <div id="stub-player-no-statements">No xAPI statements yet. Navigate through the course to see statements.</div>
                </div>
            </div>
            <div id="tab-errors" style="display:none;">
                <div id="stub-player-error-actions" style="display:none;"><button id="stub-player-copy-all-errors" class="debug-action-btn" title="Copy all errors to clipboard">📋 Copy All</button></div>
                <div id="stub-player-error-log">
                    <div id="stub-player-no-errors">✓ No errors or warnings</div>
                </div>
            </div>
        </div>
    </div>
    `;
}

/**
 * Initialize Client-Side Handlers
 */
import { cmiData, apiLog, errorLog, xapiLog, saveState, logApiCall, logError, setUiCallbacks } from './lms-api.js';

function escapeHtmlInline(str) {
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function createDebugPanelHandlers() {
    // Tab switching
    const tabs = document.querySelectorAll('#stub-player-debug-tabs button');
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');

            const target = tab.dataset.tab;
            ['state', 'api-log', 'xapi', 'errors'].forEach(id => {
                document.getElementById('tab-' + id).style.display = id === target ? 'block' : 'none';
            });
        });
    });

    // Event delegation for xAPI entry expansion
    const xapiContainer = document.getElementById('stub-player-xapi-log');
    if (xapiContainer) {
        xapiContainer.addEventListener('click', function (e) {
            const entry = e.target.closest('.xapi-entry');
            if (entry) entry.classList.toggle('expanded');
        });
    }

    // Register callbacks with LMS API to update UI on changes
    setUiCallbacks({
        onStateChange: (type, data) => {
            if (type === 'format') updateFormatBadge(data);
            else updateDebugDisplay();
        },
        onApiLog: updateApiLogDisplay,
        onErrorLog: updateErrorDisplay,
        onXapiLog: updateXapiDisplay
    });

    // Test Resume Button
    document.getElementById('stub-player-resume-test-btn')?.addEventListener('click', () => {
        // Ensure exit is set to suspend
        if (!cmiData['cmi.exit'] || cmiData['cmi.exit'] === '') {
            logError('Resume Warning', 'cmi.exit was empty - setting to "suspend".', 'Course should set cmi.exit before Terminate', true);
            cmiData['cmi.exit'] = 'suspend';
        }

        // Clear session time and set entry to resume
        cmiData['cmi.session_time'] = 'PT0H0M0S';
        cmiData['cmi.entry'] = 'resume';

        saveState();

        logApiCall('LMS Commit', 'Session ended', JSON.stringify({
            location: cmiData['cmi.location'],
            completion: cmiData['cmi.completion_status'],
            exit: cmiData['cmi.exit']
        }));

        // Reload page to simulate new session
        setTimeout(() => {
            const frame = document.getElementById('stub-player-course-frame');
            frame.src = 'about:blank';
            setTimeout(() => {
                window.location.reload();
            }, 100);
        }, 200);
    });

    // Close button handler
    document.getElementById('stub-player-debug-panel-close')?.addEventListener('click', () => {
        document.getElementById('stub-player-debug-panel')?.classList.remove('visible');
    });

    // Initial render
    updateDebugDisplay();
    updateApiLogDisplay();
    updateErrorDisplay();
    updateXapiDisplay();
}

function updateFormatBadge(format) {
    const badge = document.getElementById('stub-player-format-badge');
    const xapiTab = document.getElementById('stub-player-xapi-tab');
    if (badge) {
        badge.className = 'format-badge' + (format === 'scorm12' ? ' scorm12' : format === 'cmi5' ? ' cmi5' : format === 'lti' ? ' lti' : '');
        badge.textContent = { scorm2004: 'SCORM 2004', 'scorm12': 'SCORM 1.2', cmi5: 'cmi5', lti: 'LTI' }[format] || format;
    }
    if (xapiTab) {
        xapiTab.classList.toggle('visible', format === 'cmi5');
    }
}

function getValueClass(key, value) {
    if (!value || value === '-') return 'value-empty';
    if (key === 'cmi.entry') return value === 'resume' ? 'value-resume' : 'value-ab-initio';
    if (key === 'cmi.completion_status') return value === 'completed' ? 'value-completed' : value === 'incomplete' ? 'value-incomplete' : 'value-unknown';
    if (key === 'cmi.success_status') return value === 'passed' ? 'value-passed' : value === 'failed' ? 'value-failed' : 'value-unknown';
    return '';
}

function formatBytes(bytes) {
    if (bytes < 1024) return bytes + ' B';
    return (bytes / 1024).toFixed(1) + ' KB';
}

function updateDebugDisplay() {
    const resumeTable = document.getElementById('stub-player-resume-data');
    const scoreTable = document.getElementById('stub-player-score-data');
    const objectivesData = document.getElementById('stub-player-objectives-data');
    const interactionsData = document.getElementById('stub-player-interactions-data');
    const suspendPre = document.getElementById('stub-player-suspend-data');
    const suspendInfo = document.getElementById('stub-player-suspend-info');

    if (!resumeTable) return;

    // Resume State section
    const resumeKeys = [
        { key: 'cmi.entry', label: 'entry' },
        { key: 'cmi.exit', label: 'exit' },
        { key: 'cmi.location', label: 'location' },
        { key: 'cmi.completion_status', label: 'completion' },
        { key: 'cmi.success_status', label: 'success' },
        { key: 'cmi.session_time', label: 'session_time' },
        { key: 'cmi.total_time', label: 'total_time' }
    ];
    resumeTable.innerHTML = resumeKeys.map(({ key, label }) => {
        const value = cmiData[key] || '-';
        const cls = getValueClass(key, value);
        return '<tr><td>' + label + '</td><td class="' + cls + '">' + (value || '<span class="value-empty">(empty)</span>') + '</td></tr>';
    }).join('');

    // Score section
    const scoreKeys = [
        { key: 'cmi.score.raw', label: 'raw' },
        { key: 'cmi.score.scaled', label: 'scaled' },
        { key: 'cmi.score.min', label: 'min' },
        { key: 'cmi.score.max', label: 'max' }
    ];
    scoreTable.innerHTML = scoreKeys.map(({ key, label }) => {
        const value = cmiData[key];
        return '<tr><td>' + label + '</td><td>' + (value !== '' && value !== undefined ? value : '<span class="value-empty">-</span>') + '</td></tr>';
    }).join('');

    // Objectives section
    const objectives = cmiData._objectives || {};
    const objList = Object.values(objectives);
    document.getElementById('stub-player-objectives-count').textContent = objList.length;
    if (objList.length === 0) {
        objectivesData.innerHTML = '<span class="value-empty">No objectives recorded</span>';
    } else {
        objectivesData.innerHTML = '<table class="data-table"><thead><tr><th>ID</th><th>Completion</th><th>Success</th><th>Score</th></tr></thead><tbody>' +
            objList.map(obj => {
                const completion = obj.completion_status || '-';
                const success = obj.success_status || '-';
                const score = obj.score_scaled !== undefined ? obj.score_scaled : '-';
                return '<tr><td>' + (obj.id || '-') + '</td><td>' + completion + '</td><td>' + success + '</td><td>' + score + '</td></tr>';
            }).join('') + '</tbody></table>';
    }

    // Interactions section
    const interactions = cmiData._interactions || [];
    document.getElementById('stub-player-interactions-count').textContent = interactions.length;
    if (interactions.length === 0) {
        interactionsData.innerHTML = '<span class="value-empty">No interactions recorded</span>';
    } else {
        interactionsData.innerHTML = '<table class="data-table"><thead><tr><th>ID</th><th>Type</th><th>Response</th><th>Result</th></tr></thead><tbody>' +
            interactions.map(int => {
                const result = int.result || '-';
                const resultClass = result === 'correct' ? 'result-correct' : result === 'incorrect' || result === 'wrong' ? 'result-incorrect' : '';
                return '<tr><td title="' + escapeHtmlInline(int.id || '') + '">' + escapeHtmlInline((int.id || '-').substring(0, 20)) + '</td><td>' +
                    (int.type || '-') + '</td><td title="' + escapeHtmlInline(int.learner_response || int.student_response || '') + '">' +
                    escapeHtmlInline(((int.learner_response || int.student_response || '-') + '').substring(0, 15)) + '</td><td class="' + resultClass + '">' + result + '</td></tr>';
            }).join('') + '</tbody></table>';
    }

    // Suspend Data section
    try {
        const suspend = cmiData['cmi.suspend_data'];
        if (suspend) {
            const rawBytes = suspend.length;
            let decoded;
            try { decoded = JSON.parse(suspend); } catch { decoded = null; }

            if (decoded) {
                const prettyJson = JSON.stringify(decoded, null, 2);
                suspendInfo.innerHTML = 'Size: <span class="size">' + formatBytes(rawBytes) + '</span>';
                suspendPre.textContent = prettyJson;
            } else {
                suspendInfo.innerHTML = 'Size: <span class="size">' + formatBytes(rawBytes) + '</span> <span style="color:#f59e0b">(raw/non-JSON)</span>';
                suspendPre.textContent = suspend;
            }
        } else {
            suspendInfo.innerHTML = '';
            suspendPre.textContent = '(empty)';
        }
    } catch {
        suspendInfo.innerHTML = '';
        suspendPre.textContent = cmiData['cmi.suspend_data'] || '(empty)';
    }
}

function updateApiLogDisplay() {
    const logEl = document.getElementById('stub-player-api-log');
    if (!logEl) return;
    logEl.innerHTML = apiLog.map(entry =>
        '<div class="log-entry' + (entry.isError ? ' error' : '') + '">' +
        '<span class="timestamp">' + entry.timestamp + '</span>' +
        '<span class="method">' + entry.method + '</span>' +
        (entry.args ? '<span class="args">' + escapeHtmlInline(entry.args) + '</span>' : '') +
        '<span class="result">→ ' + escapeHtmlInline(entry.result) + '</span>' +
        '</div>'
    ).join('');
}

function updateErrorDisplay() {
    const logEl = document.getElementById('stub-player-error-log');
    const badge = document.getElementById('stub-player-error-badge');
    const inlineBadge = document.getElementById('stub-player-header-error-badge-inline');
    if (!logEl) return;

    const errors = errorLog.filter(e => !e.isWarning);
    const warnings = errorLog.filter(e => e.isWarning);
    const totalCount = errorLog.length;
    if (inlineBadge) {
        if (totalCount > 0) {
            inlineBadge.textContent = totalCount > 99 ? '99+' : totalCount;
            inlineBadge.classList.add('visible');
            inlineBadge.classList.toggle('has-warnings', errors.length === 0 && warnings.length > 0);
        } else {
            inlineBadge.classList.remove('visible');
        }
    }

    // Show/hide Copy All button
    const actionsEl = document.getElementById('stub-player-error-actions');
    if (actionsEl) actionsEl.style.display = errorLog.length > 0 ? 'flex' : 'none';

    if (errorLog.length === 0) {
        logEl.innerHTML = '<div id="stub-player-no-errors">✓ No errors or warnings</div>';
        badge.innerHTML = '';
    } else {
        logEl.innerHTML = errorLog.map((entry, index) => {
            return '<div class="error-entry' + (entry.isWarning ? ' warning' : '') + '">' +
                '<button class="error-copy-btn" data-error-index="' + index + '" title="Copy to clipboard">📋</button>' +
                '<div class="error-type">' + escapeHtmlInline(entry.type) + '</div>' +
                '<div class="error-message">' + escapeHtmlInline(entry.message) + '</div>' +
                (entry.hint ? '<div class="error-hint">' + escapeHtmlInline(entry.hint) + '</div>' : '') +
                '</div>';
        }).join('');

        // Add click handlers for individual copy buttons
        logEl.querySelectorAll('.error-copy-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const idx = parseInt(btn.dataset.errorIndex, 10);
                const entry = errorLog[idx];
                if (entry) {
                    const text = `${entry.type}: ${entry.message}${entry.hint ? '\nHint: ' + entry.hint : ''}`;
                    navigator.clipboard.writeText(text).then(() => {
                        btn.textContent = '✓';
                        setTimeout(() => { btn.textContent = '📋'; }, 1500);
                    });
                }
            });
        });

        // Copy All button handler
        const copyAllBtn = document.getElementById('stub-player-copy-all-errors');
        if (copyAllBtn) {
            copyAllBtn.onclick = () => {
                const allText = errorLog.map(entry => {
                    const prefix = entry.isWarning ? 'WARNING' : 'ERROR';
                    return `[${prefix}] ${entry.type}: ${entry.message}${entry.hint ? '\nHint: ' + entry.hint : ''}`;
                }).join('\n\n');
                navigator.clipboard.writeText(allText).then(() => {
                    copyAllBtn.textContent = '✓ Copied';
                    setTimeout(() => { copyAllBtn.textContent = '📋 Copy All'; }, 1500);
                });
            };
        }

        let badgeHtml = '';
        if (errors.length > 0) badgeHtml += '<span class="error-count-badge">' + errors.length + '</span>';
        if (warnings.length > 0) badgeHtml += '<span class="warning-count-badge">' + warnings.length + '</span>';
        badge.innerHTML = badgeHtml;
    }
}

function updateXapiDisplay() {
    const logEl = document.getElementById('stub-player-xapi-log');
    const badge = document.getElementById('stub-player-xapi-badge');
    if (!logEl) return;

    if (xapiLog.length === 0) {
        logEl.innerHTML = '<div id="stub-player-no-statements">No xAPI statements yet. Navigate through the course to see statements.</div>';
        if (badge) badge.innerHTML = '';
    } else {
        logEl.innerHTML = xapiLog.map(entry => {
            const verb = entry.type || 'unknown';
            const data = entry.data || {};
            const objectId = data.id || data.objectiveId || data.assessmentId || '-';
            const details = JSON.stringify(data, null, 2);

            return '<div class="xapi-entry verb-' + verb + '" data-expandable>' +
                '<div class="xapi-header">' +
                '<span class="xapi-timestamp">' + escapeHtmlInline(entry.receivedAt) + '</span>' +
                '<span class="xapi-verb">' + escapeHtmlInline(verb) + '</span>' +
                '<span class="xapi-type">' + escapeHtmlInline(entry.type || '') + '</span>' +
                '</div>' +
                '<div class="xapi-object">' + escapeHtmlInline(objectId) + '</div>' +
                '<div class="xapi-details">' + escapeHtmlInline(details) + '</div>' +
                '</div>';
        }).join('');

        if (badge) {
            badge.innerHTML = '<span class="xapi-count-badge">' + xapiLog.length + '</span>';
        }
    }
}
