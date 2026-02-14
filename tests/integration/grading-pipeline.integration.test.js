/**
 * Integration Tests: Grading Pipeline
 * 
 * Verifies the complete chain from Assessment -> Objective -> Score -> State -> LMS.
 * This covers the "money flow" of the course - if this breaks, users don't get credit.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createIntegrationRuntime } from './setup/integration-wiring.js';

describe('Integration: Grading Pipeline (Assessment -> Score -> LMS)', () => {
    let runtime;
    let stateManager, scoreManager, objectiveManager, assessmentManager, eventBus, mockLMSData;

    beforeEach(async () => {
        runtime = await createIntegrationRuntime();
        ({ stateManager, scoreManager, objectiveManager, assessmentManager, eventBus, mockLMSData } = runtime);

        // Usage Note:
        // do NOT call runtime.initialize() here. 
        // Individual tests must call it with their specific config.
    });

    // ─── Happy Path ──────────────────────────────────────────────────────────

    it('Scenario 1 (Baseline): Assessment pass updates objective, recalculates score, and reports to LMS', async () => {
        // 1. Setup: Create an assessment linked to the objective
        const assessmentId = 'quiz1';
        
        // Let's test the "Direct Assessment Source" mode for ScoreManager first.
        runtime.initialize({
            structure: [],
            objectives: [],
            scoring: {
                type: 'average',
                sources: [`assessment:${assessmentId}`]
            }
        });

        // 2. Action: Submit assessment
        const results = { scorePercentage: 85, passed: true };
        
        // Simulate assessment saving state
        stateManager.setDomainState(`assessment_${assessmentId}`, {
            summary: { submitted: true, lastResults: results }
        });

        // Simulate event emission (which ScoreManager listens to)
        eventBus.emit('assessment:submitted', { assessmentId, results });

        // 3. Assert: LMS received the score
        expect(mockLMSData.sentScores).toHaveLength(1);
        expect(mockLMSData.sentScores[0]).toEqual({
            raw: 85,
            scaled: 0.85,
            min: 0,
            max: 100
        });
    });

    it('Scenario 1.5 (Linked Objective): Assessment -> Objective -> Score', async () => {
        // This is the more complex chain: Assessment updates Objective, Objective updates Score
        const objId = 'obj-linked';
        
        runtime.initialize({
            structure: [],
            objectives: [{ id: objId }],
            scoring: {
                type: 'average',
                sources: [`objective:${objId}`]
            }
        });

        const assessmentId = 'quiz-linked';
        const score = 90;

        // Simulate "Glue Code" (Runtime logic often found in slides)
        eventBus.on('assessment:submitted', (data) => {
            if (data.assessmentId === assessmentId) {
                objectiveManager.setScore(objId, data.results.scorePercentage);
                objectiveManager.setSuccessStatus(objId, data.results.passed ? 'passed' : 'failed');
            }
        });

        // Action
        eventBus.emit('assessment:submitted', {
            assessmentId,
            results: { scorePercentage: score, passed: true }
        });

        await new Promise(r => setTimeout(r, 0)); // tick

        // Assert
        expect(objectiveManager.getObjective(objId).score).toBe(90);
        expect(mockLMSData.sentScores[0]).toEqual({
            raw: 90,
            scaled: 0.9,
            min: 0,
            max: 100
        });
    });

    // ─── Failure Scenarios ───────────────────────────────────────────────────

    it('Scenario 2 (Concurrency): Two assessments submit in same tick', async () => {
        runtime.initialize({
            structure: [],
            objectives: [],
            scoring: {
                type: 'average',
                sources: ['assessment:q1', 'assessment:q2']
            }
        });

        // Emit both immediately
        eventBus.emit('assessment:submitted', { assessmentId: 'q1', results: { scorePercentage: 100 } });
        eventBus.emit('assessment:submitted', { assessmentId: 'q2', results: { scorePercentage: 50 } });

        // Should average to 75
        await new Promise(r => setTimeout(r, 10));

        const lastReport = mockLMSData.sentScores[mockLMSData.sentScores.length - 1];
        expect(lastReport.raw).toBe(75);
    });

    it('Scenario 3 (Falsy Score): Assessment score of 0% is not skipped', async () => {
        runtime.initialize({
            structure: [],
            objectives: [],
            scoring: {
                type: 'average', // Average of 0 and 100 should be 50
                sources: ['assessment:q1', 'assessment:q2']
            }
        });

        // Initialize q2 with 100 (so we have at least one score)
        eventBus.emit('assessment:submitted', { assessmentId: 'q2', results: { scorePercentage: 100 } });
        
        expect(mockLMSData.sentScores[mockLMSData.sentScores.length - 1].raw).toBe(100);

        // Submit q1 = 0
        eventBus.emit('assessment:submitted', { assessmentId: 'q1', results: { scorePercentage: 0 } });

        // Should be (100 + 0) / 2 = 50
        const finalReport = mockLMSData.sentScores[mockLMSData.sentScores.length - 1];
        expect(finalReport.raw).toBe(50);
    });

    it('Scenario 4 (Config Mismatch): Typos in source IDs result in valid no-ops, not crashes', async () => {
        runtime.initialize({
            structure: [],
            objectives: [],
            scoring: {
                type: 'average',
                sources: ['assessment:final-exam'] // Hyphen
            }
        });

        // Emit with underscore
        expect(() => {
            eventBus.emit('assessment:submitted', { 
                assessmentId: 'final_exam', 
                results: { scorePercentage: 100 } 
            });
        }).not.toThrow();

        // Should NOT have updated score (cache remains empty, so no report)
        expect(mockLMSData.sentScores).toHaveLength(0);
    });

    it('Scenario 5 (Weighted Scoring): Missing source data normalizes remaining weights', async () => {
        // If we have 3 sources with w=0.33, and only 2 submitted, 
        // Standard behavior: (s1*w1 + s2*w2) / (w1 + w2)
        
        runtime.initialize({
            structure: [],
            objectives: [],
            scoring: {
                type: 'weighted',
                sources: [
                    { id: 'assessment:q1', weight: 0.5 },
                    { id: 'assessment:q2', weight: 0.5 }
                ]
            }
        });

        // Submit only q1 = 80
        eventBus.emit('assessment:submitted', { assessmentId: 'q1', results: { scorePercentage: 80 } });

        // Weighted: 80 * 0.5 = 40. Total weight so far = 0.5.
        // Result: 40 / 0.5 = 80. (Normalized)
        
        const report = mockLMSData.sentScores[0];
        expect(report.raw).toBe(80);
    });

    it('Scenario 6 (Data Loss): Stale cache on init vs new live events', async () => {
        // Scenario: 
        // 1. Session 1: User gets 50% on quiz. State saved.
        // 2. Session 2: Init loads 50%. User retakes quiz -> 90%.
        
        // Setup initial state in mockLMS
        mockLMSData.stored = JSON.parse(JSON.stringify({
            assessment_quiz1: { 
                summary: { 
                    submitted: true, 
                    lastResults: { scorePercentage: 50 },
                } 
            }
        }));

        // Initialize session 1 (must be initialized to terminate/restart)
        runtime.initialize({
            structure: [],
            objectives: [],
            scoring: {
                type: 'average',
                sources: ['assessment:quiz1'] // Need config to init state
            }
        });

        // Re-init (simulating session 2)
        const session2 = await runtime.simulateSessionRestart();
        
        // Init session 2
        session2.initialize({
            structure: [],
            objectives: [],
            scoring: {
                type: 'average',
                sources: ['assessment:quiz1']
            }
        });

        // Verify initial load
        let currentScore = session2.scoreManager.getCurrentScore();
        expect(currentScore.raw).toBe(50);

        // Retake assessment
        session2.eventBus.emit('assessment:submitted', { 
            assessmentId: 'quiz1', 
            results: { scorePercentage: 90 } 
        });

        // Verify update
        currentScore = session2.scoreManager.getCurrentScore();
        expect(currentScore.raw).toBe(90);
        
        // Check LMS report
        const lastReport = session2.mockLMSData.sentScores.pop();
        expect(lastReport.raw).toBe(90);
    });
});
