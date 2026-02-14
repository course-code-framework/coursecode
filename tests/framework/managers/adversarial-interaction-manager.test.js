/**
 * @file adversarial-interaction-manager.test.js
 * @description Adversarial tests for interaction-manager.js
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
    stateManager: {
        getDomainState: vi.fn(),
        setDomainState: vi.fn()
    }
}));

vi.mock('../../../framework/js/state/index.js', () => ({
    default: mocks.stateManager
}));

vi.mock('../../../framework/js/validation/scorm-validators.js', async (importOriginal) => {
    const actual = await importOriginal();
    return {
        ...actual,
        generateScormTimestamp: () => '2023-01-01T00:00:00Z',
        validateInteractionType: (type) => ({ valid: type !== 'invalid', error: 'Invalid type' }),
    };
});

import interactionManager from '../../../framework/js/managers/interaction-manager.js';

describe('BUG PROBE: Interaction Manager Edge Cases', () => {
    
    beforeEach(() => {
        vi.clearAllMocks();
        interactionManager.isInitialized = false;
        interactionManager.interactions = [];
    });

    it('addLikertInteraction accepts string "0" ', () => {
        interactionManager.isInitialized = true;
        
        expect(() => interactionManager.addLikertInteraction({ 
            id: 'likert1', 
            response: "0", 
            description: 'Rate 0-5' 
        })).not.toThrow();
    });

    it('FIXED: addLikertInteraction accepts numeric 0 response', () => {
        interactionManager.isInitialized = true;
        
        // Fix verification: 0 is falsy but valid response, should NOT throw
        expect(() => interactionManager.addLikertInteraction({ 
            id: 'likert2', 
            response: 0, 
            description: 'Rate 0-5' 
        })).not.toThrow();
    });

    it('BUG: addLikertInteraction rejects empty string response', () => {
        interactionManager.isInitialized = true;
        // Confirms bug (or intended behavior): empty string throws
        expect(() => interactionManager.addLikertInteraction({ 
            id: 'likert3', 
            response: "", 
            description: 'Comment' 
        })).toThrowError(/likert interaction response is required/); 
    });
});
