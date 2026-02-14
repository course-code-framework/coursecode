/**
 * @file score-manager.js
 * @description Manages top-level course score (cmi.score.raw/scaled/min/max) based on configurable formulas.
 * 
 * ARCHITECTURE:
 * - Singleton manager (like ObjectiveManager)
 * - Initialized once with course scoring config from course-config.js
 * - Listens to assessment completion and objective score updates
 * - Calculates and reports cmi.score.raw based on configured formula
 * - Supports: average, weighted average, minimum, maximum, custom functions
 *
 * CONFIGURATION:
 * USAGE (by course authors in course-config.js):
 * scoring: {
 *   type: 'average',
 *   sources: ['assessment:final-exam', 'assessment:midterm']
 * }
 * 
 * Or weighted:
 * scoring: {
 *   type: 'weighted',
 *   sources: [
 *     { id: 'assessment:final-exam', weight: 0.6 },
 *     { id: 'objective:practical-mastery', weight: 0.4 }
 *   ]
 * }
 * 
 * Or custom:
 * scoring: {
 *   type: 'custom',
 *   calculate: (scores) => {
 *     const exam = scores['assessment:final-exam'];
 *     const midterm = scores['assessment:midterm'];
 *     return exam && midterm ? Math.max(exam, midterm) : null;
 *   }
 * }
 */

import { logger } from '../utilities/logger.js';
import { eventBus } from '../core/event-bus.js';
import stateManager from '../state/index.js';
import objectiveManager from './objective-manager.js';

class ScoreManager {
    constructor() {
        this.isInitialized = false;
        this.config = null;
        this.cachedScores = {}; // Cache of source scores
    }

    /**
     * Initializes the score manager with course scoring configuration.
     * @param {Object} config - Scoring configuration from course-config.js
     * @param {string} config.type - Scoring formula type: 'average', 'weighted', 'minimum', 'maximum', 'custom', or null to disable
     * @param {Array} config.sources - Array of source IDs (strings) or source objects {id, weight}
     * @param {Function} config.calculate - Custom calculation function (required if type='custom')
     * @throws {Error} If configuration is invalid
     */
    initialize(config) {
        if (this.isInitialized) {
            throw new Error('[ScoreManager] Already initialized. Do not call initialize() more than once.');
        }

        // If no scoring config or explicitly disabled, skip initialization
        if (!config || config.type === null || config.type === 'none') {
            this.isInitialized = true;
            logger.debug('[ScoreManager] Course scoring disabled. cmi.score.raw will not be set.');
            return;
        }

        // Validate configuration
        this._validateConfig(config);
        this.config = config;

        // Subscribe to events
        this._subscribeToEvents();

        // Load existing scores from state
        this._loadExistingScores();

        this.isInitialized = true;
        logger.debug('[ScoreManager] Initialized with scoring type:', config.type);
    }

    /**
     * Validates scoring configuration.
     * @private
     */
    _validateConfig(config) {
        if (!config.type) {
            throw new Error('[ScoreManager] Configuration must include "type" field');
        }

        const validTypes = ['average', 'weighted', 'minimum', 'maximum', 'custom'];
        if (!validTypes.includes(config.type)) {
            throw new Error(`[ScoreManager] Invalid scoring type "${config.type}". Must be one of: ${validTypes.join(', ')}`);
        }

        if (!config.sources || !Array.isArray(config.sources) || config.sources.length === 0) {
            throw new Error('[ScoreManager] Configuration must include non-empty "sources" array');
        }

        // Validate weighted sources
        if (config.type === 'weighted') {
            const hasInvalidSources = config.sources.some(source => 
                typeof source !== 'object' || !source.id || typeof source.weight !== 'number'
            );
            if (hasInvalidSources) {
                throw new Error('[ScoreManager] Weighted scoring requires sources with {id, weight} format');
            }

            // Validate weights sum - must equal 1.0
            const totalWeight = config.sources.reduce((sum, s) => sum + s.weight, 0);
            if (Math.abs(totalWeight - 1.0) > 0.001) {
                throw new Error(`[ScoreManager] Weights sum to ${totalWeight}, not 1.0. Weights must sum exactly to 1.0. Current weights: ${JSON.stringify(config.sources.map(s => ({id: s.id, weight: s.weight})))}`);
            }
        }

        // Validate custom function
        if (config.type === 'custom') {
            if (typeof config.calculate !== 'function') {
                throw new Error('[ScoreManager] Custom scoring type requires "calculate" function');
            }
        }
    }

    /**
     * Subscribes to assessment and objective events.
     * @private
     */
    _subscribeToEvents() {
        // Listen for assessment completions (emitted after onComplete callback)
        eventBus.on('assessment:submitted', (data) => {
            const { assessmentId, results } = data;
            if (results && typeof results.scorePercentage === 'number') {
                this._updateSourceScore(`assessment:${assessmentId}`, results.scorePercentage);
            }
        });

        // Listen for objective score updates
        eventBus.on('objective:score:updated', (data) => {
            const { objectiveId, score } = data;
            if (typeof score === 'number') {
                this._updateSourceScore(`objective:${objectiveId}`, score);
            }
        });
    }

    /**
     * Loads existing scores from state (objectives and assessments).
     * @private
     */
    _loadExistingScores() {
        if (!this.config) return;

        // Extract source IDs from config
        const sourceIds = this.config.sources.map(source => 
            typeof source === 'string' ? source : source.id
        );

        sourceIds.forEach(sourceId => {
            const colonIndex = sourceId.indexOf(':');
            const type = sourceId.substring(0, colonIndex);
            const id = sourceId.substring(colonIndex + 1);
            
            if (type === 'objective') {
                // Load objective score from ObjectiveManager
                try {
                    const objective = objectiveManager.getObjective(id);
                    if (objective && typeof objective.score === 'number') {
                        this.cachedScores[sourceId] = objective.score;
                    }
                } catch (_error) {
                    // Objective might not exist yet - that's OK
                }
            } else if (type === 'assessment') {
                // Load assessment score from state
                try {
                    const domainKey = `assessment_${id}`;
                    const assessmentState = stateManager.getDomainState(domainKey);
                    const summary = assessmentState?.summary;
                    if (summary && summary.lastResults && typeof summary.lastResults.scorePercentage === 'number') {
                        this.cachedScores[sourceId] = summary.lastResults.scorePercentage;
                    }
                } catch (_error) {
                    // Assessment might not be completed yet - that's OK
                }
            }
        });

        logger.debug('[ScoreManager] Loaded existing scores:', this.cachedScores);
    }

    /**
     * Updates a source score and recalculates course score.
     * @private
     * @param {string} sourceId - Source identifier (e.g., 'assessment:final-exam')
     * @param {number} score - Score value (0-100)
     */
    _updateSourceScore(sourceId, score) {
        if (!this.isInitialized) return;

        // Check if this source is configured
        const sourceIds = this.config.sources.map(source => 
            typeof source === 'string' ? source : source.id
        );
        
        if (!sourceIds.includes(sourceId)) {
            return; // Not a configured source, ignore
        }

        // Update cache
        const oldScore = this.cachedScores[sourceId];
        this.cachedScores[sourceId] = score;
        
        logger.debug(`[ScoreManager] Score updated: ${sourceId} = ${score} (was ${oldScore || 'none'})`);

        // Recalculate and report course score
        this._calculateAndReportScore();
    }

    /**
     * Calculates course score based on configured formula and reports to SCORM.
     * @private
     */
    _calculateAndReportScore() {
        if (!this.isInitialized || !this.config) return;

        const calculatedScore = this._calculateScore();

        if (calculatedScore === null) {
            logger.debug('[ScoreManager] Insufficient data to calculate course score');
            return;
        }

        // Validate score range
        if (calculatedScore < 0 || calculatedScore > 100 || isNaN(calculatedScore)) {
            throw new Error(`[ScoreManager] Calculated score ${calculatedScore} is out of range [0-100]. This indicates a bug in the scoring calculation.`);
        }

        // Report to SCORM
        try {
            const rawScore = Math.round(calculatedScore * 100) / 100; // Round to 2 decimals
            const scaledScore = rawScore / 100;

            stateManager.reportScore({
                raw: rawScore,
                scaled: scaledScore,
                min: 0,
                max: 100
            });

            logger.debug(`[ScoreManager] Course score updated: ${rawScore}% (scaled: ${scaledScore})`);

            // Emit event for other systems to react
            eventBus.emit('course:score:updated', {
                raw: rawScore,
                scaled: scaledScore,
                sources: { ...this.cachedScores }
            });

            // Flush immediately — scores are critical data that must survive browser close
            stateManager.flush();
        } catch (error) {
            logger.error(`[ScoreManager] Failed to report score to SCORM: ${error.message}`, { domain: 'score', operation: 'reportScore', stack: error.stack, calculatedScore });
            throw error;
        }
    }

    /**
     * Calculates score based on configured formula.
     * @private
     * @returns {number|null} Calculated score (0-100) or null if insufficient data
     */
    _calculateScore() {
        const { type, sources } = this.config;

        // Extract scores from cache
        const scores = {};
        const sourceIds = sources.map(source => typeof source === 'string' ? source : source.id);
        
        sourceIds.forEach(sourceId => {
            if (this.cachedScores[sourceId] !== undefined) {
                scores[sourceId] = this.cachedScores[sourceId];
            }
        });

        // Check if we have any scores
        const availableCount = Object.keys(scores).length;

        if (availableCount === 0) {
            return null; // No scores available yet
        }

        switch (type) {
            case 'average':
                return this._calculateAverage(scores);

            case 'weighted':
                return this._calculateWeighted(scores, sources);

            case 'minimum':
                return this._calculateMinimum(scores);

            case 'maximum':
                return this._calculateMaximum(scores);

            case 'custom':
                return this._calculateCustom(scores);

            default:
                throw new Error(`[ScoreManager] Unknown scoring type: ${type}. Valid types: average, weighted, custom.`);
        }
    }

    /**
     * Calculates simple average of available scores.
     * @private
     */
    _calculateAverage(scores) {
        const values = Object.values(scores);
        if (values.length === 0) return null;
        
        const sum = values.reduce((acc, val) => acc + val, 0);
        return sum / values.length;
    }

    /**
     * Calculates weighted average, normalizing weights for available scores.
     * @private
     */
    _calculateWeighted(scores, sources) {
        let weightedSum = 0;
        let totalWeight = 0;

        sources.forEach(source => {
            const score = scores[source.id];
            if (score !== undefined) {
                weightedSum += score * source.weight;
                totalWeight += source.weight;
            }
        });

        if (totalWeight === 0) return null;

        // Normalize by actual total weight (handles partial completion)
        return weightedSum / totalWeight;
    }

    /**
     * Returns minimum of available scores.
     * @private
     */
    _calculateMinimum(scores) {
        const values = Object.values(scores);
        if (values.length === 0) return null;
        
        return Math.min(...values);
    }

    /**
     * Returns maximum of available scores.
     * @private
     */
    _calculateMaximum(scores) {
        const values = Object.values(scores);
        if (values.length === 0) return null;
        
        return Math.max(...values);
    }

    /**
     * Executes custom calculation function.
     * @private
     */
    _calculateCustom(scores) {
        try {
            const result = this.config.calculate(scores);
            
            if (result === null || result === undefined) {
                return null;
            }

            if (typeof result !== 'number' || isNaN(result)) {
                throw new Error(`[ScoreManager] Custom calculate function must return a number or null. Got: ${typeof result}`);
            }

            return result;
        } catch (error) {
            throw new Error(`[ScoreManager] Error in custom calculate function: ${error.message}`);
        }
    }

    /**
     * Manually triggers score recalculation (for testing or edge cases).
     * @public
     */
    recalculate() {
        if (!this.isInitialized) {
            throw new Error('[ScoreManager] Cannot recalculate: not initialized. Call initialize() first.');
        }

        this._calculateAndReportScore();
    }

    /**
     * Gets current course score without recalculating.
     * @public
     * @returns {Object|null} {raw, scaled, sources} or null if not available
     */
    getCurrentScore() {
        if (!this.isInitialized) {
            return null;
        }

        const calculatedScore = this._calculateScore();
        if (calculatedScore === null) {
            return null;
        }

        const rawScore = Math.round(calculatedScore * 100) / 100;
        return {
            raw: rawScore,
            scaled: rawScore / 100,
            sources: { ...this.cachedScores }
        };
    }

    /**
     * Gets all cached source scores.
     * @public
     * @returns {Object} Map of sourceId => score
     */
    getSourceScores() {
        return { ...this.cachedScores };
    }
}

// Export singleton instance
const scoreManager = new ScoreManager();
export default scoreManager;
