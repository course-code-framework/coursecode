/**
 * @file adversarial-navigation-helpers.test.js
 * @description Adversarial tests for navigation-helpers.js
 */

import { describe, it, expect, vi } from 'vitest';

// Mock course-config.js — navigation-helpers.js hard-imports it
vi.mock('../../../course/course-config.js', () => ({
    courseConfig: { environment: {} }
}));

import { evaluateGatingCondition } from '../../../framework/js/navigation/navigation-helpers.js';

// Mock dependencies
const mockStateManager = {
    getDomainState: vi.fn()
};

const mockAssessmentConfigs = new Map();

describe('BUG PROBE: Navigation Helpers Gating Logic', () => {

    it('timeOnSlide condition is blocked if minSeconds is 0 or undefined', () => {
        // Setup state: current slide duration is 0
        mockStateManager.getDomainState.mockReturnValue({
            slideDurations: { 'slide1': 0 }
        });

        // Condition 1: minSeconds explicitly 0
        const resultExplicit = evaluateGatingCondition(
            { type: 'timeOnSlide', slideId: 'slide1', minSeconds: 0 },
            mockStateManager,
            mockAssessmentConfigs
        );
        expect(resultExplicit).toBe(false);

        // Condition 2: minSeconds undefined -> defaults to 0
        const resultImplicit = evaluateGatingCondition(
            { type: 'timeOnSlide', slideId: 'slide1' },
            mockStateManager,
            mockAssessmentConfigs
        );
        expect(resultImplicit).toBe(false);
    });

    it('stateFlag condition behavior', () => {
        mockStateManager.getDomainState.mockReturnValue({}); // No flags

        const result = evaluateGatingCondition(
            { type: 'stateFlag', key: 'missing' },
            mockStateManager,
            mockAssessmentConfigs
        );
        expect(result).toBe(false); 
    });

    it('assessmentConfig safe usage', () => {
       mockAssessmentConfigs.set('a1', { settings: { attempts: 3 } });
       
       const result = evaluateGatingCondition(
           { type: 'assessmentConfig', assessmentId: 'a1', property: 'settings.attempts', equals: 3 },
           mockStateManager,
           mockAssessmentConfigs
       );
       expect(result).toBe(true);
    });
});
