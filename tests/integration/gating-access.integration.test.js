/**
 * Integration Tests: Gating & Access Control
 * 
 * Verifies that:
 * - Engagement requirements block progression (isSlideComplete)
 * - Gating conditions block access (validateSlideAccess)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createIntegrationRuntime } from './setup/integration-wiring.js';

describe('Integration: Gating & Access Control', () => {
    let runtime;
    let engagementManager, stateManager, mockLMSData, eventBus;
    let validateSlideAccess;

    beforeEach(async () => {
        runtime = await createIntegrationRuntime();
        ({ engagementManager, stateManager, mockLMSData, eventBus } = runtime);

        // Import validator dynamically to ensure it uses the runtime's mocked modules
        ({ validateSlideAccess } = await import('../../framework/js/navigation/navigation-validators.js'));
    });

    // ─── Scenarios ───────────────────────────────────────────────────────────

    it('Scenario 1 (Linear Progression): Engagement requirements only block LEAVING (sequence flow)', async () => {
        // Setup: S1 requires completion.
        runtime.initialize({
            structure: [
                { id: 's1', engagement: { required: true } },
                { id: 's2', engagement: { required: true } }
            ]
        });

        // 1. Start at S1
        stateManager.setDomainState('navigation', { currentSlideId: 's1', visitedSlides: ['s1'] });
        
        // Check S1 complete status
        expect(engagementManager.isSlideComplete('s1')).toBe(false);
        
        // NOTE: In the UI, the "Next" button would be disabled here.

        // 2. Complete S1
        // Manually set the complete flag in state which EngagementManager respects
        stateManager.setDomainState('engagement', {
            s1: { complete: true }
        });
        
        expect(engagementManager.isSlideComplete('s1')).toBe(true);
    });

    it('Scenario 2 (Explicit Gating): Section B locked until Section A passed', async () => {
        // Setup: S3 is gated by "assessment:quiz-a" passing
        const s3 = { 
            id: 's3', 
            navigation: {
                gating: {
                    conditions: [{
                        type: 'assessmentStatus',
                        assessmentId: 'quiz-a',
                        requires: 'passed'
                    }]
                }
            }
        };

        runtime.initialize({
            structure: [
                { id: 's1' },
                { id: 's2' }, 
                s3
            ]
        });

        // 1. Visit S2 (where quiz is)
        stateManager.setDomainState('navigation', { currentSlideId: 's2', visitedSlides: ['s1', 's2'] });
        
        // S3 should be LOCKED
        let access = validateSlideAccess(s3, stateManager, new Map());
        expect(access.allowed).toBe(false);

        // 2. Fail Quiz A
        stateManager.setDomainState('assessment_quiz-a', {
            summary: { submitted: true, lastResults: { passed: false, scorePercentage: 40 } }
        });

        access = validateSlideAccess(s3, stateManager, new Map());
        expect(access.allowed).toBe(false);

        // 3. Pass Quiz A
        stateManager.setDomainState('assessment_quiz-a', {
             summary: { submitted: true, lastResults: { passed: true, scorePercentage: 80 } }
        });

        access = validateSlideAccess(s3, stateManager, new Map());
        expect(access.allowed).toBe(true);
    });

    it('Scenario 3 (Global Pre-reqs): Course pre-test lockout', async () => {
        // Condition: Objective 'pre-test' must be completed (regardless of score)
        const module1 = { 
            id: 'module1',
            navigation: {
                gating: {
                    conditions: [{
                        type: 'objectiveStatus',
                        objectiveId: 'obj-pretest',
                        completion_status: 'completed' 
                    }]
                }
            }
        };

        runtime.initialize({
            structure: [ { id: 'intro' }, module1 ],
            objectives: [{ id: 'obj-pretest' }]
        });

        // 1. Verify Module 1 locked
        let access = validateSlideAccess(module1, stateManager, new Map());
        expect(access.allowed).toBe(false);

        // 2. Complete Intro (which fulfills obj-pretest)
        stateManager.setDomainState('objectives', {
            'obj-pretest': { completion_status: 'completed', success_status: 'unknown', score: 0 }
        });
        
        // Verify Module 1 unlocked
        access = validateSlideAccess(module1, stateManager, new Map());
        expect(access.allowed).toBe(true);
    });

    it('Scenario 4 (Remediation Loop): Failing post-test locks cert, unlocks review', async () => {
        const s_cert = {
            id: 's_cert',
            navigation: {
                gating: {
                    conditions: [{ type: 'assessmentStatus', assessmentId: 'exam', requires: 'passed' }]
                }
            }
        };
        
        const s_review = {
            id: 's_review',
            navigation: {
                gating: {
                    conditions: [{ type: 'assessmentStatus', assessmentId: 'exam', requires: 'failed' }]
                }
            }
        };

        runtime.initialize({ structure: [ s_cert, s_review ] });

        // 1. Initial State (Exam not taken)
        let certAccess = validateSlideAccess(s_cert, stateManager, new Map());
        let reviewAccess = validateSlideAccess(s_review, stateManager, new Map());
        
        expect(certAccess.allowed).toBe(false);
        expect(reviewAccess.allowed).toBe(false);

        // 2. Fail Exam
        stateManager.setDomainState('assessment_exam', {
            summary: { submitted: true, lastResults: { passed: false } }
        });

        certAccess = validateSlideAccess(s_cert, stateManager, new Map());
        reviewAccess = validateSlideAccess(s_review, stateManager, new Map());

        expect(certAccess.allowed).toBe(false);
        expect(reviewAccess.allowed).toBe(true);

        // 3. Pass Exam (Retry)
        stateManager.setDomainState('assessment_exam', {
             summary: { submitted: true, lastResults: { passed: true } }
        });

        certAccess = validateSlideAccess(s_cert, stateManager, new Map());
        expect(certAccess.allowed).toBe(true);
    });
});
