/**
 * @file requirement-strategies.js
 * @description Strategy map for engagement requirement types.
 * Each strategy encapsulates evaluate, progress, label, and fields logic
 * for a single requirement type.
 *
 * Strategy interface:
 *   fields: { key: defaultValue } — tracked state fields this strategy reads
 *   evaluate(req, tracked, ctx) → { met, type, message, ...extra }
 *   progress(req, tracked, result, ctx) → number (0–1)
 *   label(req, tracked, result, ctx) → string
 *
 * ctx: { slideId, stateManager, interactionRegistry, formatTime, formatInteractionId }
 */

// ── Helpers for "view all" pattern ──────────────────────────────────
function viewAllStrategy(trackedKey, totalKey, defaultLabel) {
    return {
        fields: { [trackedKey]: [], [totalKey]: 0 },
        evaluate(req, tracked) {
            const total = tracked[totalKey] || 0;
            const viewed = tracked[trackedKey] || [];
            return {
                met: total > 0 && viewed.length >= total,
                type: req.type,
                message: req.message,
                viewed: viewed.length,
                total
            };
        },
        progress(req, tracked) {
            const total = tracked[totalKey] || 0;
            return total > 0 ? (tracked[trackedKey]?.length || 0) / total : 0;
        },
        label(req, tracked) {
            const total = tracked[totalKey] || 0;
            const viewed = tracked[trackedKey]?.length || 0;
            return `${defaultLabel} (${viewed}/${total})`;
        }
    };
}

/** @type {Record<string, {fields?, evaluate, progress, label}>} */
const strategies = {
    viewAllTabs: viewAllStrategy('tabsViewed', 'tabsTotal', 'View all tabs'),
    viewAllPanels: viewAllStrategy('accordionPanelsViewed', 'accordionPanelsTotal', 'View all sections'),
    viewAllFlipCards: viewAllStrategy('flipCardsViewed', 'flipCardsTotal', 'Flip all cards'),
    viewAllHotspots: viewAllStrategy('interactiveImageHotspotsViewed', 'interactiveImageHotspotsTotal', 'View all hotspots'),
    viewAllModals: viewAllStrategy('modalsViewed', 'modalsTotal', 'View all modals'),
    viewAllLightboxes: viewAllStrategy('lightboxesViewed', 'lightboxesTotal', 'View all lightboxes'),
    viewAllTimelineEvents: viewAllStrategy('timelineEventsViewed', 'timelineEventsTotal', 'View all events'),

    interactionComplete: {
        fields: { interactionsCompleted: {} },
        evaluate(req, tracked) {
            const interaction = tracked.interactionsCompleted[req.interactionId];
            const completed = interaction?.completed || false;
            const correct = interaction?.correct || false;
            const met = req.requireCorrect ? (completed && correct) : completed;
            return { met, type: req.type, message: req.message, interactionId: req.interactionId, completed, correct };
        },
        progress(req, tracked, result) {
            return result.met ? 1 : 0;
        },
        label(req, _tracked, _result, ctx) {
            const registered = ctx.interactionRegistry?.getAll().find(i => i.id === req.interactionId);
            const interactionLabel = req.label || registered?.config?.label || ctx.formatInteractionId(req.interactionId);
            return `Complete: ${interactionLabel}`;
        }
    },

    allInteractionsComplete: {
        // shares interactionsCompleted field with interactionComplete
        evaluate(req, tracked, ctx) {
            const completedCount = Object.values(tracked.interactionsCompleted)
                .filter(i => req.requireCorrect ? (i.completed && i.correct) : i.completed).length;
            const registered = ctx.interactionRegistry?.getAll() || [];
            const total = registered.length;
            return { met: total > 0 && completedCount >= total, type: req.type, message: req.message, completed: completedCount, total };
        },
        progress(req, tracked, result, ctx) {
            const registered = ctx.interactionRegistry?.getAll() || [];
            const total = registered.length;
            if (total <= 0) return 0;
            const completedCount = Object.values(tracked.interactionsCompleted)
                .filter(i => req.requireCorrect ? (i.completed && i.correct) : i.completed).length;
            return completedCount / total;
        },
        label(_req, _tracked, result) {
            return `Complete all interactions (${result.completed}/${result.total})`;
        }
    },

    scrollDepth: {
        fields: { scrollDepth: 0 },
        evaluate(req, tracked) {
            const required = req.percentage || req.minPercentage || 95;
            return { met: tracked.scrollDepth >= required, type: req.type, message: req.message, current: tracked.scrollDepth, required };
        },
        progress(req, tracked) {
            const required = req.percentage || req.minPercentage || 95;
            return Math.min(1, tracked.scrollDepth / required);
        },
        label(_req, _tracked, result) {
            return `Scroll: ${result.current}% / ${result.required}%`;
        }
    },

    timeOnSlide: {
        // No tracked fields — reads from sessionData domain, not engagement tracked state
        evaluate(req, _tracked, ctx) {
            const sessionData = ctx.stateManager.getDomainState('sessionData') || {};
            const slideDurations = sessionData.slideDurations || {};
            const slideStartTimes = sessionData.slideStartTimes || {};
            let timeSpentMs = slideDurations[ctx.slideId] || 0;
            const activeStartTime = slideStartTimes[ctx.slideId];
            if (activeStartTime) timeSpentMs += Date.now() - activeStartTime;
            const current = Math.floor(timeSpentMs / 1000);
            const required = req.minSeconds || 0;
            return { met: current >= required, type: req.type, message: req.message, current, required };
        },
        progress(req, _tracked, _result, ctx) {
            const sessionData = ctx.stateManager.getDomainState('sessionData') || {};
            const slideDurations = sessionData.slideDurations || {};
            const slideStartTimes = sessionData.slideStartTimes || {};
            let timeSpentMs = slideDurations[ctx.slideId] || 0;
            const activeStartTime = slideStartTimes[ctx.slideId];
            if (activeStartTime) timeSpentMs += Date.now() - activeStartTime;
            const minMs = (req.minSeconds || 0) * 1000;
            return minMs > 0 ? Math.min(1, timeSpentMs / minMs) : 0;
        },
        label(_req, _tracked, result, ctx) {
            return `Please spend ${ctx.formatTime(result.required)} on this slide (${ctx.formatTime(result.current)} so far)`;
        }
    },

    flag: {
        // No tracked fields — reads from flags domain via ctx.stateManager
        evaluate(req, _tracked, ctx) {
            const flags = ctx.stateManager.getDomainState('flags') || {};
            const flagValue = flags[req.key];
            const met = req.equals !== undefined ? flagValue === req.equals : !!flagValue;
            return { met, type: req.type, message: req.message || `Flag "${req.key}" must be set`, flagKey: req.key, currentValue: flagValue, requiredValue: req.equals };
        },
        progress(_req, _tracked, result) {
            return result.met ? 1 : 0;
        },
        label(req) {
            return req.message || 'Complete required step';
        }
    },

    allFlags: {
        // No tracked fields — reads from flags domain via ctx.stateManager
        evaluate(req, _tracked, ctx) {
            const flags = ctx.stateManager.getDomainState('flags') || {};
            const requiredFlags = req.flags || [];
            const results = requiredFlags.map(flagConfig => {
                const key = typeof flagConfig === 'string' ? flagConfig : flagConfig.key;
                const value = flags[key];
                const isMet = (typeof flagConfig === 'object' && flagConfig.equals !== undefined) ? value === flagConfig.equals : !!value;
                return { key, met: isMet, value };
            });
            const metCount = results.filter(r => r.met).length;
            return { met: metCount === requiredFlags.length, type: req.type, message: req.message || 'Complete all required steps', flags: results, completed: metCount, total: requiredFlags.length };
        },
        progress(_req, _tracked, result) {
            return result.total > 0 ? result.completed / result.total : 0;
        },
        label(req) {
            return req.message || 'Complete all required steps';
        }
    },

    slideAudioComplete: {
        fields: { audioComplete: false },
        evaluate(req, tracked) {
            return { met: tracked.audioComplete || false, type: req.type, message: req.message || 'Listen to the audio narration' };
        },
        progress(_req, _tracked, result) {
            return result.met ? 1 : 0;
        },
        label(req) {
            return req.message || 'Listen to the slide narration';
        }
    },

    audioComplete: {
        fields: { standaloneAudioComplete: [] },
        evaluate(req, tracked) {
            if (!req.audioId) throw new Error("[EngagementManager] audioComplete requirement requires 'audioId' property. For slide-level audio, use 'slideAudioComplete' instead.");
            const complete = (tracked.standaloneAudioComplete || []).includes(req.audioId);
            return { met: complete, type: req.type, audioId: req.audioId, message: req.message || `Listen to the audio: ${req.audioId}` };
        },
        progress(_req, _tracked, result) {
            return result.met ? 1 : 0;
        },
        label(req) {
            return req.message || 'Listen to the audio';
        }
    },

    modalAudioComplete: {
        fields: { modalsAudioComplete: [] },
        evaluate(req, tracked) {
            if (!req.modalId) throw new Error("[EngagementManager] modalAudioComplete requirement requires 'modalId' property.");
            const complete = (tracked.modalsAudioComplete || []).includes(req.modalId);
            return { met: complete, type: req.type, modalId: req.modalId, message: req.message || `Listen to the modal audio: ${req.modalId}` };
        },
        progress(_req, _tracked, result) {
            return result.met ? 1 : 0;
        },
        label(req) {
            return req.message || 'Listen to the modal audio';
        }
    },

    slideVideoComplete: {
        fields: { videoComplete: false },
        evaluate(req, tracked) {
            return { met: tracked.videoComplete || false, type: req.type, message: req.message || 'Watch the video' };
        },
        progress(_req, _tracked, result) {
            return result.met ? 1 : 0;
        },
        label(req) {
            return req.message || 'Watch the video';
        }
    },

    videoComplete: {
        fields: { standaloneVideoComplete: [] },
        evaluate(req, tracked) {
            if (!req.videoId) throw new Error("[EngagementManager] videoComplete requirement requires 'videoId' property. For slide-level video, use 'slideVideoComplete' instead.");
            const complete = (tracked.standaloneVideoComplete || []).includes(req.videoId);
            return { met: complete, type: req.type, videoId: req.videoId, message: req.message || `Watch the video: ${req.videoId}` };
        },
        progress(_req, _tracked, result) {
            return result.met ? 1 : 0;
        },
        label(req) {
            return req.message || 'Watch the video';
        }
    }
};

export default strategies;

/** All valid requirement type names */
export const validTypes = Object.keys(strategies);

// ── Core fields not owned by any single strategy ────────────────────
const CORE_FIELDS = { flipCardsRegistered: [] };

/**
 * Aggregate all tracked field defaults from strategy declarations.
 * Used by engagement-manager (initSlide) and engagement-progress (merge/strip).
 * @returns {Record<string, any>} field name → default value
 */
export function getTrackedFieldDefaults() {
    const defaults = { ...CORE_FIELDS };
    for (const strategy of Object.values(strategies)) {
        if (strategy.fields) {
            Object.assign(defaults, strategy.fields);
        }
    }
    return defaults;
}
