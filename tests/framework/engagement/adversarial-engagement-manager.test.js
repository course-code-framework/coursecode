/**
 * @file adversarial-engagement-manager.test.js
 * @description Adversarial tests for engagement-manager.js
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
    stateManager: {
        getDomainState: vi.fn(),
        setDomainState: vi.fn()
    },
    eventBus: {
        emit: vi.fn(),
        on: vi.fn()
    },
    logger: {
        debug: vi.fn(),
        warn: vi.fn(),
        error: vi.fn()
    },
    strategies: {
        default: {
            'timeOnSlide': { evaluate: vi.fn(() => ({ met: true })) }
        },
        validTypes: ['timeOnSlide'],
        getTrackedFieldDefaults: () => ({})
    }
}));

vi.mock('../../../framework/js/state/index.js', () => ({
    default: mocks.stateManager
}));

vi.mock('../../../framework/js/core/event-bus.js', () => ({
    eventBus: mocks.eventBus
}));

vi.mock('../../../framework/js/utilities/logger.js', () => ({
    logger: mocks.logger
}));

vi.mock('../../../framework/js/engagement/requirement-strategies.js', () => mocks.strategies);

import engagementManager from '../../../framework/js/engagement/engagement-manager.js';

describe('BUG PROBE: Engagement Manager Error Handling', () => {
    
    beforeEach(() => {
        vi.clearAllMocks();
        vi.stubGlobal('window', { CourseCode: { interactionRegistry: {} } });
        
        engagementManager.isInitialized = false;
        engagementManager.courseConfig = {
            structure: [
                { 
                    id: 'slide1', 
                    engagement: { 
                        required: true, 
                        requirements: [{ type: 'timeOnSlide' }] 
                    } 
                },
                { 
                    id: 'slide-bad-type', 
                    engagement: { 
                        required: true, 
                        requirements: [{ type: 'UNKNOWN_TYPE' }] 
                    } 
                }
            ]
        };
        engagementManager.isInitialized = true;
    });

    it('BUG: evaluateRequirements crashes app on invalid requirement type', () => {
        mocks.stateManager.getDomainState.mockReturnValue({
            'slide-bad-type': { required: true, tracked: {}, complete: false }
        });

        // Fix verification: should NOT throw, but handle as unmet requirement
        expect(() => engagementManager.evaluateRequirements('slide-bad-type')).not.toThrow();
        
        const result = engagementManager.evaluateRequirements('slide-bad-type');
        expect(result.complete).toBe(false);
        expect(result.unmetRequirements[0].reason).toMatch(/Evaluation Error/);
    });

    it('handles missing slide state gracefully', () => {
        mocks.stateManager.getDomainState.mockReturnValue({});
        const result = engagementManager.evaluateRequirements('slide1');
        expect(result.complete).toBe(false); 
        expect(() => engagementManager.evaluateRequirements('slide1')).not.toThrow();
    });
});
