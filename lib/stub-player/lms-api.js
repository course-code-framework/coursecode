/**
 * stub-player/lms-api.js - SCORM/cmi5/LTI API implementation with strict mode
 * 
 * Handles the LMS State (cmiData), persistence to localStorage,
 * and implements window.API (SCORM 1.2), window.API_1484_11 (SCORM 2004),
 * window.cmi5, and window.lti.
 * 
 * STRICT MODE (enabled via CI=true, ?strict=true, or /__lms/configure):
 * Enforces real LMS behavior — lifecycle violations return 'false' with proper
 * error codes, read-only elements reject SetValue, and format-specific rules
 * are enforced. This catches bugs that silently pass in dev but explode in
 * production LMSs like SCORM Cloud, Moodle, Cornerstone, etc.
 */

const isBrowser = typeof window !== 'undefined';
const CONFIG = (isBrowser && window.STUB_CONFIG) ? window.STUB_CONFIG : {};
const STORAGE_KEY = CONFIG.storageKey || 'scorm_stub_default';

const SUSPEND_DATA_LIMITS = {
    scorm12: 4096,       // SCORM 1.2: 4KB
    scorm2004: 64000,    // SCORM 2004: 64KB
    cmi5: Infinity,      // cmi5: No limit (LRS dependent)
    lti: Infinity        // LTI: No limit (host dependent)
};

// ========================================
// SCORM Error Codes (2004 4th Edition)
// ========================================
const SCORM_ERRORS = {
    0:   'No Error',
    101: 'General Exception',
    102: 'General Initialization Failure',
    103: 'Already Initialized',
    104: 'Content Instance Terminated',
    111: 'General Termination Failure',
    112: 'Termination Before Initialization',
    113: 'Termination After Termination',
    122: 'Retrieve Data Before Initialization',
    123: 'Retrieve Data After Termination',
    132: 'Store Data Before Initialization',
    133: 'Store Data After Termination',
    142: 'Commit Before Initialization',
    143: 'Commit After Termination',
    201: 'General Argument Error',
    301: 'General Get Failure',
    351: 'General Set Failure',
    391: 'General Commit Failure',
    401: 'Undefined Data Model Element',
    402: 'Unimplemented Data Model Element',
    403: 'Data Model Element Value Not Initialized',
    404: 'Data Model Element Is Read Only',
    405: 'Data Model Element Is Write Only',
    406: 'Data Model Element Type Mismatch',
    407: 'Data Model Element Value Out Of Range',
    408: 'Data Model Dependency Not Established'
};

// SCORM 1.2 error codes (different numbering)
const SCORM12_ERRORS = {
    0:   'No Error',
    101: 'General Exception',
    201: 'Invalid argument error',
    202: 'Element cannot have children',
    203: 'Element not an array - cannot have count',
    301: 'Not initialized',
    401: 'Not implemented error',
    402: 'Invalid set value, element is a keyword',
    403: 'Element is read only',
    404: 'Element is write only',
    405: 'Incorrect Data Type'
};

// Read-only CMI elements (SCORM 2004)
const READ_ONLY_2004 = new Set([
    'cmi.learner_id', 'cmi.learner_name', 'cmi.mode', 'cmi.credit',
    'cmi.entry', 'cmi.total_time', 'cmi.launch_data',
    'cmi.objectives._count', 'cmi.interactions._count',
    'cmi.comments_from_lms._count'
]);

// Read-only CMI elements (SCORM 1.2)
const READ_ONLY_12 = new Set([
    'cmi.core.student_id', 'cmi.core.student_name', 'cmi.core.credit',
    'cmi.core.entry', 'cmi.core.total_time', 'cmi.core.lesson_mode',
    'cmi.launch_data', 'cmi.core.score._children',
    'cmi.comments_from_lms._count'
]);

// Valid SCORM 1.2 lesson_status values
const SCORM12_LESSON_STATUS = new Set([
    'passed', 'completed', 'failed', 'incomplete', 'browsed', 'not attempted'
]);

// Valid cmi5 verbs (AU-allowed)
const CMI5_ALLOWED_VERBS = new Set([
    'http://adlnet.gov/expapi/verbs/initialized',
    'http://adlnet.gov/expapi/verbs/terminated',
    'http://adlnet.gov/expapi/verbs/completed',
    'http://adlnet.gov/expapi/verbs/passed',
    'http://adlnet.gov/expapi/verbs/failed',
    'https://w3id.org/xapi/adl/verbs/waived',
    'http://adlnet.gov/expapi/verbs/experienced'
]);

// ========================================
// UI Callbacks
// ========================================
let uiCallbacks = {
    onStateChange: null,
    onApiLog: null,
    onErrorLog: null,
    onXapiLog: null,
    onSlideNavigation: null
};

export function setUiCallbacks(callbacks) {
    uiCallbacks = { ...uiCallbacks, ...callbacks };
}

// ========================================
// State
// ========================================
export let cmiData = loadState() || getDefaultCMI();
export let apiLog = [];
export let errorLog = [];
export let xapiLog = [];
export let activeFormat = 'scorm2004';
export let isInitialized = false;
export let isTerminated = false;
export let strictMode = false;

let lastErrorCode = 0;
let sessionStartTime = null;
let resumeSnapshot = null;
let cmi5VerbSequence = []; // Track verb ordering for cmi5 strict mode
let syncDebounceTimer = null;

// ========================================
// Default CMI Data Model
// ========================================
export function getDefaultCMI() {
    return {
        'cmi.completion_status': 'unknown',
        'cmi.success_status': 'unknown',
        'cmi.entry': 'ab-initio',
        'cmi.exit': '',
        'cmi.suspend_data': '',
        'cmi.location': '',
        'cmi.score.raw': '',
        'cmi.score.scaled': '',
        'cmi.score.min': '',
        'cmi.score.max': '',
        'cmi.session_time': 'PT0H0M0S',
        'cmi.total_time': 'PT0H0M0S',
        'cmi.learner_id': 'preview_user',
        'cmi.learner_name': 'Preview User',
        'cmi.mode': 'normal',
        'cmi.credit': 'credit',
        '_objectives': {},
        '_interactions': []
    };
}

// ========================================
// Strict Mode Control
// ========================================
export function setStrictMode(enabled) {
    strictMode = enabled;
    if (enabled) {
        logApiCall('StrictMode', 'enabled', 'LMS will enforce real error codes and lifecycle rules');
    }
}

function detectStrictMode() {
    if (!isBrowser) return false;
    // CI environment (E2E tests)
    if (CONFIG.isCI) return true;
    // URL parameter
    const params = new URLSearchParams(window.location.search);
    if (params.get('strict') === 'true') return true;
    return false;
}

// ========================================
// Error Code Management
// ========================================
function setError(code) {
    lastErrorCode = code;
    return code;
}

function clearError() {
    lastErrorCode = 0;
}

// ========================================
// Format Detection
// ========================================
function setActiveFormat(format) {
    if (activeFormat === format) return;
    activeFormat = format;
    if (uiCallbacks.onStateChange) uiCallbacks.onStateChange('format', format);
}

// ========================================
// State Persistence
// ========================================
export function loadState() {
    if (!isBrowser) return null;
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
            const data = JSON.parse(stored);
            data['cmi.entry'] = 'resume';
            return data;
        }
    } catch (_e) { }
    return null;
}

export function saveState() {
    if (!isBrowser) return;
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(cmiData));
    } catch (_e) {
        logError('Storage Error', 'Failed to save state to localStorage', 'Check browser storage limits');
    }
    // Sync to server for HTTP API access
    syncToServer();
}

// ========================================
// Server Sync (for HTTP API access)
// ========================================
function syncToServer() {
    if (!isBrowser || !CONFIG.isLive) return;
    // Debounce to avoid flooding
    clearTimeout(syncDebounceTimer);
    syncDebounceTimer = setTimeout(() => {
        try {
            const payload = {
                cmiData,
                activeFormat,
                isInitialized,
                isTerminated,
                strictMode,
                apiLog: apiLog.slice(0, 50), // Last 50 entries
                errorLog: errorLog.slice(0, 50),
                xapiLog: xapiLog.slice(0, 50),
                sessionStartTime
            };
            fetch('/__lms/sync', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            }).catch(() => { /* server may not be running (static export) */ });
        } catch (_e) { /* graceful no-op */ }
    }, 200);
}

// ========================================
// Logging
// ========================================
export function logApiCall(method, args, result, isError = false) {
    const entry = {
        timestamp: new Date().toLocaleTimeString(),
        method,
        args: args ? String(args).substring(0, 100) : '',
        result: typeof result === 'string' ? result.substring(0, 50) : JSON.stringify(result).substring(0, 50),
        isError
    };
    apiLog.unshift(entry);
    if (apiLog.length > 100) apiLog.pop();
    if (uiCallbacks.onApiLog) uiCallbacks.onApiLog();
}

export function logError(type, message, hint = '', isWarning = false) {
    errorLog.unshift({ type, message, hint, isWarning, timestamp: new Date().toLocaleTimeString() });
    if (uiCallbacks.onErrorLog) uiCallbacks.onErrorLog();
}

export function clearErrorLog() {
    errorLog.length = 0;
    if (uiCallbacks.onErrorLog) uiCallbacks.onErrorLog();
}

// ========================================
// Session Time Helpers
// ========================================
function calculateSessionDuration() {
    if (!sessionStartTime) return null;
    const elapsed = Date.now() - sessionStartTime;
    const seconds = Math.floor(elapsed / 1000);
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `PT${hours}H${minutes}M${secs}S`;
}

function addDurations(d1, d2) {
    // Parse ISO 8601 durations and add them
    const parse = (d) => {
        const match = (d || '').match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?/);
        if (!match) return 0;
        return (parseInt(match[1] || 0) * 3600) + (parseInt(match[2] || 0) * 60) + parseFloat(match[3] || 0);
    };
    const total = parse(d1) + parse(d2);
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const secs = Math.round(total % 60);
    return `PT${hours}H${minutes}M${secs}S`;
}

// ========================================
// Initialization
// ========================================
export function initializeLMS() {
    if (!isBrowser) return;

    // Detect strict mode from environment
    strictMode = detectStrictMode();

    // Intercept console
    interceptConsole();

    // Initialize cmiData from restored cmi5 state (for proper resume display)
    const cmi5State = cmiData._cmi5State?.cmi5_state;
    if (cmi5State) {
        if (cmi5State.bookmark !== undefined) cmiData['cmi.location'] = cmi5State.bookmark || '';
        if (cmi5State.completionStatus !== undefined) cmiData['cmi.completion_status'] = cmi5State.completionStatus;
        if (cmi5State.successStatus !== undefined) cmiData['cmi.success_status'] = cmi5State.successStatus;
        if (cmi5State.score !== undefined && cmi5State.score !== null) cmiData['cmi.score.scaled'] = String(cmi5State.score);
    }

    // Expose APIs to window
    window.API_1484_11 = API_1484_11;
    window.API = API;
    window.cmi5 = cmi5;
    window.lti = lti;

    // Expose stub player utilities for HMR
    window.stubPlayer = { clearErrors: clearErrorLog };

    // Expose live state for MCP headless browser access
    window._stubPlayerState = { cmiData, apiLog, errorLog, xapiLog };

    // Initial sync to server
    syncToServer();
}

function interceptConsole() {
    if (!isBrowser) return;

    const originalError = console.error;
    const originalWarn = console.warn;

    console.error = function (...args) {
        const message = args.map(a => {
            if (a instanceof Error) return a.message + (a.stack ? '\n' + a.stack.split('\n').slice(0, 3).join('\n') : '');
            if (typeof a === 'object') try { return JSON.stringify(a); } catch { return String(a); }
            return String(a);
        }).join(' ');
        logError('Console Error', message.substring(0, 500), '', false);
        originalError.apply(console, args);
    };

    console.warn = function (...args) {
        const message = args.map(a => {
            if (typeof a === 'object') try { return JSON.stringify(a); } catch { return String(a); }
            return String(a);
        }).join(' ');
        logError('Console Warning', message.substring(0, 500), '', true);
        originalWarn.apply(console, args);
    };

    window.addEventListener('error', function (event) {
        const hint = event.filename ? event.filename.split('/').pop() + ':' + event.lineno : '';
        logError('Uncaught Error', event.message || 'Unknown error', hint, false);
    });

    window.addEventListener('unhandledrejection', function (event) {
        const message = event.reason?.message || String(event.reason);
        logError('Unhandled Promise', message.substring(0, 500), '', false);
    });
}

// ========================================
// CMI Validation & Checks
// ========================================
const CMI_VALIDATION = {
    'cmi.completion_status': { values: ['completed', 'incomplete', 'not attempted', 'unknown'] },
    'cmi.success_status': { values: ['passed', 'failed', 'unknown'] },
    'cmi.exit': { values: ['', 'time-out', 'suspend', 'logout', 'normal'] },
    'cmi.score.scaled': { type: 'decimal', min: -1, max: 1 },
    'cmi.score.raw': { type: 'number' },
    'cmi.score.min': { type: 'number' },
    'cmi.score.max': { type: 'number' }
};

function validateSetValue(element, value) {
    const validation = CMI_VALIDATION[element];
    if (!validation) return true;

    if (validation.values && !validation.values.includes(value)) {
        logError('Invalid Value', element + ' = "' + value + '"', 'Valid values: ' + validation.values.join(', '), !strictMode);
        if (strictMode) {
            setError(407);
            return false;
        }
    }

    if (validation.type === 'number' && value !== '' && isNaN(Number(value))) {
        logError('Type Error', element + ' expects a number, got "' + value + '"', 'Convert to number before setting', !strictMode);
        if (strictMode) {
            setError(406);
            return false;
        }
    }

    if (validation.type === 'decimal') {
        const num = Number(value);
        if (isNaN(num) || num < validation.min || num > validation.max) {
            logError('Range Error', element + ' = ' + value + ' (must be ' + validation.min + ' to ' + validation.max + ')', '', !strictMode);
            if (strictMode) {
                setError(407);
                return false;
            }
        }
    }
    return true;
}

function checkSuspendDataSize(value) {
    const size = value ? value.length : 0;
    const limit = SUSPEND_DATA_LIMITS[activeFormat] || 64000;
    const percentUsed = (size / limit) * 100;

    if (limit !== Infinity) {
        if (size > limit) {
            logError('Suspend Data Exceeded', 'Size: ' + (size / 1024).toFixed(1) + 'KB exceeds ' + (limit / 1024) + 'KB limit', 'Real LMS will fail. Reduce data or switch to SCORM 2004/cmi5.', false);
            if (strictMode) {
                setError(405);
                return false;
            }
        } else if (percentUsed > 75) {
            logError('Suspend Data Warning', 'Size: ' + (size / 1024).toFixed(1) + 'KB (' + percentUsed.toFixed(0) + '% of ' + (limit / 1024) + 'KB limit)', 'Getting close to ' + activeFormat.toUpperCase() + ' limit.', true);
        }
    }
    return true;
}

// ========================================
// Lifecycle Enforcement
// ========================================
function checkLifecycleGet() {
    if (!isInitialized && !isTerminated) {
        logError('Before Initialize', 'GetValue called before Initialize', 'Real LMS will fail. Call Initialize first.', !strictMode);
        if (strictMode) { setError(122); return false; }
    }
    if (isTerminated) {
        logError('After Terminate', 'GetValue called after Terminate', 'Real LMS will fail.', !strictMode);
        if (strictMode) { setError(123); return false; }
    }
    return true;
}

function checkLifecycleSet() {
    if (!isInitialized && !isTerminated) {
        logError('Before Initialize', 'SetValue called before Initialize', 'Real LMS will fail. Call Initialize first.', !strictMode);
        if (strictMode) { setError(132); return false; }
    }
    if (isTerminated) {
        logError('After Terminate', 'SetValue called after Terminate', 'Real LMS will fail.', !strictMode);
        if (strictMode) { setError(133); return false; }
    }
    return true;
}

function checkLifecycleCommit() {
    if (!isInitialized && !isTerminated) {
        logError('Before Initialize', 'Commit called before Initialize', 'Real LMS will fail.', !strictMode);
        if (strictMode) { setError(142); return false; }
    }
    if (isTerminated) {
        logError('After Terminate', 'Commit called after Terminate', 'Real LMS will fail.', !strictMode);
        if (strictMode) { setError(143); return false; }
    }
    return true;
}

function checkReadOnly2004(element) {
    if (READ_ONLY_2004.has(element)) {
        logError('Read Only', 'SetValue on read-only element: ' + element, 'Real LMS will reject this.', !strictMode);
        if (strictMode) { setError(404); return false; }
    }
    return true;
}

function checkReadOnly12(element) {
    if (READ_ONLY_12.has(element)) {
        logError('Read Only', 'LMSSetValue on read-only element: ' + element, 'Real LMS will reject this.', !strictMode);
        if (strictMode) { setError(403); return false; }
    }
    return true;
}

function checkTerminateCompatibility() {
    if (!cmiData['cmi.exit'] || cmiData['cmi.exit'] === '') {
        logError('Missing cmi.exit', 'cmi.exit not set before Terminate', 'Set cmi.exit to "suspend" for resume, "" to discard, or "logout"/"normal" to finish.', true);
    }
    if (cmiData['cmi.exit'] === 'suspend' && cmiData['cmi.completion_status'] === 'unknown') {
        logError('Suspend Without Progress', 'Suspending with completion_status = "unknown"', 'Consider setting to "incomplete".', true);
    }

    // Auto-calculate session time if not set
    if ((!cmiData['cmi.session_time'] || cmiData['cmi.session_time'] === 'PT0H0M0S') && sessionStartTime) {
        const duration = calculateSessionDuration();
        if (duration) {
            cmiData['cmi.session_time'] = duration;
            logApiCall('Auto', 'cmi.session_time = ' + duration, 'calculated');
        }
    }

    // Accumulate total_time
    if (cmiData['cmi.session_time'] && cmiData['cmi.session_time'] !== 'PT0H0M0S') {
        cmiData['cmi.total_time'] = addDurations(cmiData['cmi.total_time'], cmiData['cmi.session_time']);
    }
}

function captureResumeSnapshot() {
    if (cmiData['cmi.entry'] === 'resume') {
        resumeSnapshot = {
            location: cmiData['cmi.location'] || null,
            completion: cmiData['cmi.completion_status'],
            success: cmiData['cmi.success_status'],
            suspendDataLength: (cmiData['cmi.suspend_data'] || '').length,
            exit: cmiData['cmi.exit']
        };
        if (resumeSnapshot.location) logApiCall('Resume', 'location=' + resumeSnapshot.location, 'restored', false);
        if (resumeSnapshot.suspendDataLength > 0) logApiCall('Resume', 'suspend_data=' + (resumeSnapshot.suspendDataLength / 1024).toFixed(1) + 'KB', 'restored', false);
        if (resumeSnapshot.completion !== 'unknown') logApiCall('Resume', 'completion=' + resumeSnapshot.completion, 'restored', false);
    }
}

function notifySlideChange(slideId) {
    if (uiCallbacks.onSlideNavigation) uiCallbacks.onSlideNavigation(slideId);
    if (uiCallbacks.onStateChange) uiCallbacks.onStateChange('slide', slideId);
}

// ========================================
// SCORM 2004 API (API_1484_11)
// ========================================
const API_1484_11 = {
    Initialize: function () {
        clearError();
        setActiveFormat('scorm2004');

        if (isInitialized && !isTerminated) {
            logError('Already Initialized', 'Initialize called when already initialized', 'Real LMS returns false.', !strictMode);
            if (strictMode) { setError(103); logApiCall('Initialize', null, 'false', true); return 'false'; }
        }
        if (isTerminated) {
            logError('After Termination', 'Initialize called after Terminate', 'Content instance terminated.', !strictMode);
            if (strictMode) { setError(104); logApiCall('Initialize', null, 'false', true); return 'false'; }
        }

        isInitialized = true;
        isTerminated = false;
        sessionStartTime = Date.now();
        captureResumeSnapshot();
        logApiCall('Initialize', null, 'true');
        syncToServer();
        return 'true';
    },
    Terminate: function () {
        clearError();

        if (!isInitialized) {
            logError('Before Initialize', 'Terminate called before Initialize', 'Real LMS returns false.', !strictMode);
            if (strictMode) { setError(112); logApiCall('Terminate', null, 'false', true); return 'false'; }
        }
        if (isTerminated) {
            logError('After Termination', 'Terminate called after already terminated', 'Real LMS returns false.', !strictMode);
            if (strictMode) { setError(113); logApiCall('Terminate', null, 'false', true); return 'false'; }
        }

        checkTerminateCompatibility();
        saveState();
        isTerminated = true;
        logApiCall('Terminate', null, 'true');
        syncToServer();
        return 'true';
    },
    GetValue: function (element) {
        clearError();

        if (!checkLifecycleGet()) {
            logApiCall('GetValue', element, '', true);
            return '';
        }

        let value = '';
        if (element.startsWith('cmi.objectives.')) value = handleObjectiveGet(element);
        else if (element.startsWith('cmi.interactions.')) value = handleInteractionGet(element);
        else if (element === 'cmi.objectives._count') value = String(Object.keys(cmiData._objectives || {}).length);
        else if (element === 'cmi.interactions._count') value = String((cmiData._interactions || []).length);
        else if (cmiData[element] !== undefined) value = cmiData[element];
        else {
            // Unknown element
            if (strictMode) {
                setError(401);
                logApiCall('GetValue', element, '', true);
                return '';
            }
        }

        logApiCall('GetValue', element, value);
        return value;
    },
    SetValue: function (element, value) {
        clearError();

        if (!checkLifecycleSet()) {
            logApiCall('SetValue', element + ' = ' + value, 'false', true);
            return 'false';
        }

        if (!checkReadOnly2004(element)) {
            logApiCall('SetValue', element + ' = ' + value, 'false (read-only)', true);
            return 'false';
        }

        if (!validateSetValue(element, value)) {
            logApiCall('SetValue', element + ' = ' + value, 'false (invalid)', true);
            return 'false';
        }

        if (element === 'cmi.suspend_data') {
            if (!checkSuspendDataSize(value)) {
                logApiCall('SetValue', element + ' = [' + value.length + ' chars]', 'false (too large)', true);
                return 'false';
            }
        }

        // Format-specific: reject cmi.score.scaled in strict mode for SCORM 1.2
        // (shouldn't happen via API_1484_11, but guard anyway)

        if (element.startsWith('cmi.objectives.')) handleObjectiveSet(element, value);
        else if (element.startsWith('cmi.interactions.')) handleInteractionSet(element, value);
        else {
            cmiData[element] = value;
            if (element === 'cmi.location') notifySlideChange(value);
        }

        logApiCall('SetValue', element + ' = ' + value, 'true');
        if (uiCallbacks.onStateChange) uiCallbacks.onStateChange('data');
        return 'true';
    },
    Commit: function () {
        clearError();
        if (!checkLifecycleCommit()) {
            logApiCall('Commit', null, 'false', true);
            return 'false';
        }
        saveState();
        logApiCall('Commit', null, 'true');
        return 'true';
    },
    GetLastError: function () {
        return String(lastErrorCode);
    },
    GetErrorString: function (code) {
        return SCORM_ERRORS[Number(code)] || 'Unknown Error';
    },
    GetDiagnostic: function (code) {
        const numCode = Number(code);
        if (numCode === 0) return 'No error condition exists.';
        const base = SCORM_ERRORS[numCode] || 'Unknown error';
        return `Error ${numCode}: ${base}. Check API call sequence and element validity.`;
    }
};

// ========================================
// SCORM 1.2 API
// ========================================
const API = {
    LMSInitialize: function () {
        clearError();
        setActiveFormat('scorm12');

        if (isInitialized && !isTerminated) {
            logError('Already Initialized', 'LMSInitialize called when already initialized', 'Real LMS returns false.', !strictMode);
            if (strictMode) { setError(101); logApiCall('LMSInitialize', null, 'false', true); return 'false'; }
        }

        isInitialized = true;
        isTerminated = false;
        sessionStartTime = Date.now();
        captureResumeSnapshot();
        logApiCall('LMSInitialize', null, 'true');
        syncToServer();
        return 'true';
    },
    LMSFinish: function () {
        clearError();

        if (!isInitialized) {
            logError('Before Initialize', 'LMSFinish called before LMSInitialize', 'Real LMS returns false.', !strictMode);
            if (strictMode) { setError(301); logApiCall('LMSFinish', null, 'false', true); return 'false'; }
        }
        if (isTerminated) {
            logError('After Termination', 'LMSFinish called after already terminated', 'Real LMS returns false.', !strictMode);
            if (strictMode) { setError(101); logApiCall('LMSFinish', null, 'false', true); return 'false'; }
        }

        checkTerminateCompatibility();
        saveState();
        isTerminated = true;
        logApiCall('LMSFinish', null, 'true');
        syncToServer();
        return 'true';
    },
    LMSGetValue: function (element) {
        clearError();

        if (!isInitialized) {
            logError('Before Initialize', 'LMSGetValue called before LMSInitialize', 'Real LMS returns empty.', !strictMode);
            if (strictMode) { setError(301); logApiCall('LMSGetValue', element, '', true); return ''; }
        }
        if (isTerminated) {
            logError('After Terminate', 'LMSGetValue called after LMSFinish', 'Real LMS returns empty.', !strictMode);
            if (strictMode) { setError(301); logApiCall('LMSGetValue', element, '', true); return ''; }
        }

        if (element === 'cmi.core.lesson_status') {
            const completion = cmiData['cmi.completion_status'] || '';
            const success = cmiData['cmi.success_status'] || '';
            let status = '';
            if (success === 'passed') status = 'passed';
            else if (success === 'failed') status = 'failed';
            else if (completion === 'completed') status = 'completed';
            else if (completion === 'incomplete') status = 'incomplete';
            else status = 'not attempted';
            logApiCall('LMSGetValue', element, status);
            return status;
        }

        // Strict: reject SCORM 2004 elements in SCORM 1.2 context
        if (strictMode && !element.startsWith('cmi.core.') && !element.startsWith('cmi.suspend_data') && !element.startsWith('cmi.launch_data') && !element.startsWith('cmi.objectives.') && !element.startsWith('cmi.interactions.') && !element.startsWith('cmi.student_data.') && !element.startsWith('cmi.comments')) {
            logError('Wrong Format', 'SCORM 1.2 does not support element: ' + element, 'Use SCORM 1.2 element names (cmi.core.*).');
            setError(201);
            logApiCall('LMSGetValue', element, '', true);
            return '';
        }

        const mapped = mapScorm12Element(element);
        let value = cmiData[mapped] !== undefined ? cmiData[mapped] : '';
        logApiCall('LMSGetValue', element, value);
        return value;
    },
    LMSSetValue: function (element, value) {
        clearError();

        if (!isInitialized) {
            logError('Before Initialize', 'LMSSetValue called before LMSInitialize', 'Real LMS returns false.', !strictMode);
            if (strictMode) { setError(301); logApiCall('LMSSetValue', element + ' = ' + value, 'false', true); return 'false'; }
        }
        if (isTerminated) {
            logError('After Terminate', 'LMSSetValue called after LMSFinish', 'Real LMS returns false.', !strictMode);
            if (strictMode) { setError(301); logApiCall('LMSSetValue', element + ' = ' + value, 'false', true); return 'false'; }
        }

        if (!checkReadOnly12(element)) {
            logApiCall('LMSSetValue', element + ' = ' + value, 'false (read-only)', true);
            return 'false';
        }

        if (element === 'cmi.suspend_data') {
            if (!checkSuspendDataSize(value)) {
                logApiCall('LMSSetValue', element + ' = [' + value.length + ' chars]', 'false (too large)', true);
                return 'false';
            }
        }

        if (element === 'cmi.core.lesson_status') {
            // Strict: validate lesson_status values
            if (strictMode && !SCORM12_LESSON_STATUS.has(value)) {
                logError('Invalid Value', 'cmi.core.lesson_status = "' + value + '"', 'Valid: ' + [...SCORM12_LESSON_STATUS].join(', '));
                setError(405);
                logApiCall('LMSSetValue', element + ' = ' + value, 'false', true);
                return 'false';
            }

            if (value === 'passed') { cmiData['cmi.completion_status'] = 'completed'; cmiData['cmi.success_status'] = 'passed'; }
            else if (value === 'failed') { cmiData['cmi.completion_status'] = 'completed'; cmiData['cmi.success_status'] = 'failed'; }
            else if (value === 'completed') { cmiData['cmi.completion_status'] = 'completed'; }
            else if (value === 'incomplete') { cmiData['cmi.completion_status'] = 'incomplete'; }
            else { cmiData['cmi.completion_status'] = value; }
            logApiCall('LMSSetValue', element + ' = ' + value, 'true');
            if (uiCallbacks.onStateChange) uiCallbacks.onStateChange('data');
            return 'true';
        }

        // Strict: validate session_time format (SCORM 1.2 uses HHHH:MM:SS, not ISO 8601)
        if (strictMode && element === 'cmi.core.session_time') {
            if (!/^\d{2,4}:\d{2}:\d{2}(\.\d+)?$/.test(value)) {
                logError('Format Error', 'cmi.core.session_time = "' + value + '"', 'SCORM 1.2 requires HHHH:MM:SS format, not ISO 8601.');
                setError(405);
                logApiCall('LMSSetValue', element + ' = ' + value, 'false', true);
                return 'false';
            }
        }

        // Strict: reject SCORM 2004-only elements in SCORM 1.2 context
        if (strictMode && !element.startsWith('cmi.core.') && !element.startsWith('cmi.suspend_data') && !element.startsWith('cmi.launch_data') && !element.startsWith('cmi.objectives.') && !element.startsWith('cmi.interactions.') && !element.startsWith('cmi.student_data.') && !element.startsWith('cmi.comments')) {
            logError('Wrong Format', 'SCORM 1.2 does not support element: ' + element, 'Use SCORM 1.2 element names (cmi.core.*).');
            setError(201);
            logApiCall('LMSSetValue', element + ' = ' + value, 'false', true);
            return 'false';
        }

        const mapped = mapScorm12Element(element);
        cmiData[mapped] = value;
        if (element === 'cmi.core.lesson_location') notifySlideChange(value);
        logApiCall('LMSSetValue', element + ' = ' + value, 'true');
        if (uiCallbacks.onStateChange) uiCallbacks.onStateChange('data');
        return 'true';
    },
    LMSCommit: function () {
        clearError();
        if (!isInitialized) {
            if (strictMode) { setError(301); logApiCall('LMSCommit', null, 'false', true); return 'false'; }
        }
        if (isTerminated) {
            logError('After Terminate', 'LMSCommit called after LMSFinish', 'Real LMS returns false.', !strictMode);
            if (strictMode) { setError(301); logApiCall('LMSCommit', null, 'false', true); return 'false'; }
        }
        saveState();
        logApiCall('LMSCommit', null, 'true');
        return 'true';
    },
    LMSGetLastError: function () {
        return String(lastErrorCode);
    },
    LMSGetErrorString: function (code) {
        return SCORM12_ERRORS[Number(code)] || 'Unknown Error';
    },
    LMSGetDiagnostic: function (code) {
        const numCode = Number(code);
        if (numCode === 0) return 'No error condition exists.';
        return SCORM12_ERRORS[numCode] || `Error ${numCode}`;
    }
};

function mapScorm12Element(element) {
    const mappings = {
        'cmi.core.student_id': 'cmi.learner_id',
        'cmi.core.student_name': 'cmi.learner_name',
        'cmi.core.lesson_location': 'cmi.location',
        'cmi.core.lesson_status': 'cmi.completion_status',
        'cmi.core.score.raw': 'cmi.score.raw',
        'cmi.core.score.min': 'cmi.score.min',
        'cmi.core.score.max': 'cmi.score.max',
        'cmi.core.session_time': 'cmi.session_time',
        'cmi.core.total_time': 'cmi.total_time',
        'cmi.core.exit': 'cmi.exit',
        'cmi.core.entry': 'cmi.entry',
        'cmi.core.credit': 'cmi.credit',
        'cmi.core.mode': 'cmi.mode',
        'cmi.suspend_data': 'cmi.suspend_data',
        'cmi.launch_data': 'cmi.launch_data'
    };
    return mappings[element] || element;
}

// ========================================
// cmi5 API
// ========================================
const cmi5 = {
    initialized: false,
    state: cmiData._cmi5State || {},
    initialize: function () {
        setActiveFormat('cmi5');
        this.initialized = true;
        isInitialized = true;
        isTerminated = false;
        sessionStartTime = Date.now();
        cmi5VerbSequence = [];
        captureResumeSnapshot();
        logApiCall('cmi5.initialize', null, 'true');
        syncToServer();
        return true;
    },
    getState: function (key) {
        setActiveFormat('cmi5');
        const value = this.state[key] || null;
        logApiCall('cmi5.getState', key, value ? 'object' : 'null');
        return value;
    },
    setState: function (key, data) {
        setActiveFormat('cmi5');
        this.state[key] = data;
        cmiData._cmi5State = this.state;

        if (key === 'cmi5_state' && data) {
            cmiData['cmi.location'] = data.bookmark || '';
            cmiData['cmi.completion_status'] = data.completionStatus || 'unknown';
            cmiData['cmi.success_status'] = data.successStatus || 'unknown';
            if (data.score !== undefined && data.score !== null) {
                cmiData['cmi.score.scaled'] = String(data.score);
                // Derive SCORM-compatible raw/min/max from cmi5 scaled (0-1) score
                cmiData['cmi.score.raw'] = String(Math.round(data.score * 100 * 100) / 100);
                cmiData['cmi.score.min'] = '0';
                cmiData['cmi.score.max'] = '100';
            }
            if (data.bookmark) notifySlideChange(data.bookmark);
        }
        if (key === 'suspend_data') {
            try { cmiData['cmi.suspend_data'] = JSON.stringify(data); } catch (_e) { }
        }
        saveState();
        logApiCall('cmi5.setState', key, 'saved');
        if (uiCallbacks.onStateChange) uiCallbacks.onStateChange('data');
    },
    sendStatement: function (statement) {
        // cmi5 xAPI statement handling
        if (statement?.verb?.id) {
            // Track verb sequence for strict mode validation
            cmi5VerbSequence.push(statement.verb.id);

            if (strictMode) {
                // Validate allowed verbs
                if (!CMI5_ALLOWED_VERBS.has(statement.verb.id) && !statement.verb.id.includes('experienced')) {
                    logError('cmi5 Verb', 'Verb not allowed by cmi5 spec: ' + statement.verb.id, 'Only cmi5-defined verbs may be sent by the AU.', false);
                }

                // Validate sequence: initialized must come first
                if (cmi5VerbSequence.length === 1 && !statement.verb.id.endsWith('initialized')) {
                    logError('cmi5 Sequence', 'First statement must use "initialized" verb', 'Got: ' + statement.verb.id, false);
                }

                // Validate: completed/passed/failed cannot come after terminated
                const terminatedIdx = cmi5VerbSequence.findIndex(v => v.endsWith('terminated'));
                if (terminatedIdx >= 0 && terminatedIdx < cmi5VerbSequence.length - 1) {
                    logError('cmi5 Sequence', 'Statement sent after "terminated"', 'No statements allowed after terminated.', false);
                }
            }

        }

        logXapiStatement(statement);
        logApiCall('cmi5.sendStatement', statement?.verb?.display?.['en-US'] || statement?.verb?.id || 'unknown', 'sent');
    },
    recordInteraction: function (data) {
        // Direct interaction recording for mock mode — bypasses strict cmi5 verb validation
        if (!cmiData._interactions) cmiData._interactions = [];
        cmiData._interactions.push({
            id: data.id || '',
            type: data.type || 'other',
            result: data.correct ? 'correct' : 'incorrect',
            response: String(data.response ?? ''),
            description: data.description || ''
        });
        saveState();
        logApiCall('cmi5.recordInteraction', data.id, 'saved');
    },
    terminate: function () {
        checkTerminateCompatibility();
        saveState();
        isTerminated = true;
        this.initialized = false;
        logApiCall('cmi5.terminate', null, 'sent');
        syncToServer();
    }
};

// ========================================
// LTI API
// ========================================
const lti = {
    initialized: false,
    state: cmiData._ltiState || {},
    launchData: {
        userId: 'preview_user',
        name: 'Preview User',
        roles: ['Learner'],
        resourceLinkId: 'preview-resource',
        contextId: 'preview-context'
    },
    initialize: function () {
        setActiveFormat('lti');
        this.initialized = true;
        isInitialized = true;
        isTerminated = false;
        sessionStartTime = Date.now();
        captureResumeSnapshot();
        logApiCall('lti.initialize', null, 'true');
        syncToServer();
        return true;
    },
    getState: function (key) {
        setActiveFormat('lti');
        const value = this.state[key] || null;
        logApiCall('lti.getState', key, value ? 'object' : 'null');
        return value;
    },
    setState: function (key, data) {
        setActiveFormat('lti');
        this.state[key] = data;
        cmiData._ltiState = this.state;

        if (key === 'lti_state' && data) {
            cmiData['cmi.location'] = data.bookmark || '';
            cmiData['cmi.completion_status'] = data.completionStatus || 'unknown';
            cmiData['cmi.success_status'] = data.successStatus || 'unknown';
            if (data.score !== undefined && data.score !== null) cmiData['cmi.score.scaled'] = String(data.score);
            if (data.bookmark) notifySlideChange(data.bookmark);
        }
        if (key === 'suspend_data') {
            try { cmiData['cmi.suspend_data'] = JSON.stringify(data); } catch (_e) { }
        }

        // Strict: validate score range for AGS
        if (strictMode && key === 'lti_state' && data?.score !== undefined) {
            if (data.score < 0 || data.score > 1) {
                logError('LTI Score Range', 'Score ' + data.score + ' out of range', 'AGS requires scoreGiven / scoreMaximum to be 0-1 normalized.', false);
            }
        }

        saveState();
        logApiCall('lti.setState', key, 'saved');
        if (uiCallbacks.onStateChange) uiCallbacks.onStateChange('data');
    },
    getLaunchData: function () {
        return this.launchData;
    },
    terminate: function () {
        checkTerminateCompatibility();
        saveState();
        isTerminated = true;
        this.initialized = false;
        logApiCall('lti.terminate', null, 'sent');
        syncToServer();
    }
};

// ========================================
// Objective & Interaction Handlers
// ========================================
function handleObjectiveGet(element) {
    const match = element.match(/cmi\.objectives\.(\d+)\.(.+)/);
    if (!match) return '';
    const [, index, prop] = match;
    const objectives = Object.values(cmiData._objectives || {});
    return objectives[index]?.[prop] || '';
}

function handleObjectiveSet(element, value) {
    const match = element.match(/cmi\.objectives\.(\d+)\.(.+)/);
    if (!match) return;
    const [, index, prop] = match;
    if (!cmiData._objectives) cmiData._objectives = {};
    if (prop === 'id') {
        if (!cmiData._objectives[value]) cmiData._objectives[value] = { id: value };
    } else {
        const objectives = Object.values(cmiData._objectives);
        if (objectives[index]) objectives[index][prop] = value;
    }
}

function handleInteractionGet(element) {
    const match = element.match(/cmi\.interactions\.(\d+)\.(.+)/);
    if (!match) return '';
    const [, index, prop] = match;
    return cmiData._interactions?.[index]?.[prop] || '';
}

function handleInteractionSet(element, value) {
    const match = element.match(/cmi\.interactions\.(\d+)\.(.+)/);
    if (!match) return;
    const [, index, prop] = match;
    if (!cmiData._interactions) cmiData._interactions = [];
    while (cmiData._interactions.length <= index) cmiData._interactions.push({});
    cmiData._interactions[index][prop] = value;
}

// ========================================
// xAPI Logging
// ========================================
export function logXapiStatement(statement) {
    xapiLog.unshift({ ...statement, receivedAt: new Date().toLocaleTimeString() });
    if (xapiLog.length > 100) xapiLog.pop();
    if (uiCallbacks.onXapiLog) uiCallbacks.onXapiLog();
}
