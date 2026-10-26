/**
 * @file assessment-results.js
 * @description Pure helpers shared by the assessment Actions, Factory and UI
 * layers for scoring and results-screen decisions. Keeping them in one place
 * guarantees that live results (just submitted) and resumed results (rebuilt
 * from suspend_data) apply identical pass/fail and retake rules.
 */

/**
 * Rounds a percentage to 2 decimals. Removes binary floating-point noise
 * such as (29 / 50) * 100 === 57.99999999999999 before it is compared with a
 * passing score or persisted.
 * @param {number} value
 * @returns {number}
 */
export function roundPercentage(value) {
    if (!Number.isFinite(value)) return 0;
    return Math.round(value * 100) / 100;
}

/**
 * Resolves the passing score as a percentage. An LMS-provided cmi5
 * masteryScore (0-1 scaled) overrides the authored settings.passingScore.
 * @param {object} settings - Assessment settings
 * @param {object|null} launchData - LMS launch data (may contain masteryScore)
 * @returns {number}
 */
export function resolvePassingScore(settings, launchData) {
    const masteryScore = launchData?.masteryScore;
    if (masteryScore !== null && masteryScore !== undefined) {
        return roundPercentage(masteryScore * 100);
    }
    return settings?.passingScore || 0;
}

/**
 * Formats a score for display without contradicting the pass/fail outcome.
 * Whole numbers are shown unless rounding would cross the passing score
 * (e.g. 79.6 against 80 would read "80% Failed"); then up to 2 decimals are
 * shown instead.
 * @param {number} scorePercentage
 * @param {number} [passingScore]
 * @returns {string}
 */
export function formatScoreForDisplay(scorePercentage, passingScore) {
    const score = roundPercentage(scorePercentage);
    const whole = Math.round(score);
    if (!Number.isFinite(passingScore) || (whole >= passingScore) === (score >= passingScore)) {
        return String(whole);
    }
    return String(score);
}

/**
 * Returns the configured remedial slide IDs (supports legacy remedialSlideId).
 * @param {object} settings
 * @returns {string[]}
 */
export function getRemedialSlideIds(settings) {
    if (Array.isArray(settings?.remedialSlideIds)) return settings.remedialSlideIds;
    return settings?.remedialSlideId ? [settings.remedialSlideId] : [];
}

/**
 * Determines the action button shown on the results screen (retake,
 * remedial review or course restart). Used for both live and resumed results.
 * @param {object} settings - Assessment settings
 * @param {object} context
 * @param {boolean} context.passed - Whether the last attempt passed
 * @param {number} context.currentAttempts - Number of submitted attempts
 * @param {string[]} [context.visitedSlides] - Visited slide IDs
 * @returns {object|null} Action button descriptor, or null for no action
 */
export function buildResultsActionButton(settings = {}, { passed, currentAttempts, visitedSlides = [] }) {
    const { attemptsBeforeRemedial, attemptsBeforeRestart } = settings;
    // allowRetake is documented as defaulting to true
    const allowRetake = settings.allowRetake !== false;

    if (passed || !allowRetake) {
        return null;
    }

    const remedialSlideIds = getRemedialSlideIds(settings);
    const hasRemedialSlides = remedialSlideIds.length > 0;
    const remedialViewed = hasRemedialSlides && remedialSlideIds.every(id => visitedSlides.includes(id));

    if (attemptsBeforeRestart && currentAttempts >= attemptsBeforeRestart) {
        return {
            type: 'restart',
            action: 'restart-course',
            label: 'Restart Course',
            message: `You have completed ${currentAttempts} attempts. To try again, you must restart the entire course. This will erase all progress.`,
            messageType: 'warning'
        };
    }

    if (attemptsBeforeRemedial && currentAttempts >= attemptsBeforeRemedial && !remedialViewed) {
        return {
            type: 'remedial',
            action: hasRemedialSlides ? 'go-to-remedial' : 'retake',
            label: hasRemedialSlides ? 'Review Content' : 'Retake Assessment',
            message: hasRemedialSlides
                ? 'Please review the recommended content before attempting the assessment again. This will help strengthen your understanding of key concepts.'
                : 'Please take time to review the course material before attempting the assessment again.',
            messageType: 'info'
        };
    }

    // Standard retake
    let attemptsMessage = null;

    // Check remedial warning first (if applicable and not passed)
    if (attemptsBeforeRemedial) {
        const remaining = attemptsBeforeRemedial - currentAttempts;
        if (remaining > 0) {
            attemptsMessage = remaining > 1
                ? `${remaining} more attempts before review is recommended.`
                : 'Content review will be recommended after your next attempt.';
        }
    }

    // If no remedial warning (either not configured, or we passed it and viewed content), check restart warning
    if (!attemptsMessage && attemptsBeforeRestart) {
        const remaining = attemptsBeforeRestart - currentAttempts;
        if (remaining > 0) {
            attemptsMessage = remaining > 1
                ? `${remaining} attempts remaining before course restart is required.`
                : 'This is your final attempt before course restart is required.';
        }
    }

    return {
        type: 'retake',
        action: 'retake',
        label: 'Retake Assessment',
        attemptsMessage
    };
}
