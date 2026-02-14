/**
 * @file driver-interface.js
 * @description Defines the semantic interface contract for LMS drivers.
 * All drivers (SCORM 2004, SCORM 1.2, cmi5, LTI, Proxy) must implement this interface.
 *
 * The interface uses semantic methods instead of CMI keys. Each driver translates
 * to its native protocol (CMI for SCORM, xAPI for cmi5, HTTP for LTI, postMessage for Proxy).
 */

/**
 * @typedef {Object} DriverCapabilities
 * @property {boolean} supportsObjectives - Can store learning objectives
 * @property {boolean} supportsInteractions - Can store interaction records
 * @property {boolean} supportsComments - Can store learner comments
 * @property {boolean} supportsEmergencySave - Has sendBeacon fallback for page unload
 * @property {number} maxSuspendDataBytes - Max suspend_data size (0 = unlimited)
 * @property {boolean} asyncCommit - Whether commit() is async (HTTP-based)
 */

/**
 * @typedef {Object} LMSDriver
 *
 * Lifecycle:
 * @property {function(): Promise<boolean>} initialize - Initialize connection
 * @property {function(): Promise<boolean>} terminate - Terminate connection
 * @property {function(): Promise<boolean>} commit - Commit buffered writes
 * @property {function(): DriverCapabilities} getCapabilities - Declare format capabilities
 * @property {function(): 'scorm2004'|'scorm1.2'|'cmi5'|'lti'} getFormat - Get format identifier
 * @property {function(): boolean} isConnected - Check if driver is connected
 * @property {function(): boolean} isTerminated - Check if driver is terminated
 *
 * State persistence (suspend_data blob):
 * @property {function(): object|null} getSuspendData - Get parsed suspend_data object
 * @property {function(object): boolean} setSuspendData - Set suspend_data from object
 *
 * Semantic reads:
 * @property {function(): string} getEntryMode - Returns 'ab-initio' | 'resume' | ''
 * @property {function(): string} getBookmark - Returns current slide location or ''
 * @property {function(): string} getCompletion - Returns 'completed' | 'incomplete' | 'unknown'
 * @property {function(): string} getSuccess - Returns 'passed' | 'failed' | 'unknown'
 * @property {function(): {scaled: number, raw: number, min: number, max: number}|null} getScore - Returns last reported score or null
 * @property {function(): {id: string, name: string}} getLearnerInfo - Returns learner identity
 *
 * Semantic writes:
 * @property {function(string): void} setBookmark - Persist slide position
 * @property {function({raw: number, scaled: number, min: number, max: number}): void} reportScore - Report score
 * @property {function(string): void} reportCompletion - 'completed' | 'incomplete'
 * @property {function(string): void} reportSuccess - 'passed' | 'failed' | 'unknown'
 * @property {function(number): void} reportProgress - 0.0 to 1.0
 * @property {function(string): void} reportSessionTime - ISO 8601 duration string
 * @property {function(Object): void} reportObjective - Report objective status
 * @property {function(Object): void} reportInteraction - Report interaction data
 * @property {function(string): void} setExitMode - 'suspend' | 'normal'
 *
 * Optional:
 * @property {function(): void} [ping] - Keep-alive ping
 * @property {function(): void} [emergencySave] - Synchronous emergency save using sendBeacon
 *
 * Optional xAPI (cmi5 only):
 * @property {function(Object): Promise<void>} [sendObjectiveStatement] - Send objective xAPI statement
 * @property {function(Object): Promise<void>} [sendInteractionStatement] - Send interaction xAPI statement
 * @property {function(Object): Promise<void>} [sendAssessmentStatement] - Send assessment xAPI statement
 * @property {function(Object): Promise<void>} [sendSlideStatement] - Send slide experienced xAPI statement
 * @property {function(): Object|null} [getLaunchData] - Get cmi5 launch data
 */


/**
 * Creates a driver interface validator (development-time check).
 * @param {object} driver - Driver instance to validate
 * @throws {Error} If driver doesn't implement required methods
 */
export function validateDriverInterface(driver) {
    const requiredMethods = [
        // Lifecycle
        'initialize',
        'terminate',
        'commit',
        'getCapabilities',
        'getFormat',
        'isConnected',
        'isTerminated',
        // State persistence
        'getSuspendData',
        'setSuspendData',
        // Semantic reads
        'getEntryMode',
        'getBookmark',
        'getCompletion',
        'getSuccess',
        'getScore',
        'getLearnerInfo',
        // Semantic writes
        'setBookmark',
        'reportScore',
        'reportCompletion',
        'reportSuccess',
        'reportProgress',
        'reportSessionTime',
        'reportObjective',
        'reportInteraction',
        'setExitMode'
    ];

    for (const method of requiredMethods) {
        if (typeof driver[method] !== 'function') {
            throw new Error(`LMS Driver missing required method: ${method}`);
        }
    }
}
