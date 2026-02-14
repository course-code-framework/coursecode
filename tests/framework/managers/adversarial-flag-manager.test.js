/**
 * @file adversarial-flag-manager.test.js
 * @description Adversarial tests for flag-manager.js
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

import flagManager from '../../../framework/js/managers/flag-manager.js';

describe('BUG PROBE: Flag Manager Reference Leaks', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        flagManager.flags = {};
        flagManager.isInitialized = false;
    });

    it('BUG: getFlag returns a direct reference to object values', () => {
        flagManager.isInitialized = true;
        const complexFlag = { active: true, config: { level: 5 } };
        flagManager.flags = { 'complex': complexFlag };

        const retrieved = flagManager.getFlag('complex');
        retrieved.config.level = 999; 

        // Fix verification: internal state should NOT be mutated
        expect(flagManager.flags.complex.config.level).toBe(5);
    });

    it('getAllFlags returns a deep clone (safe)', () => {
        flagManager.isInitialized = true;
        const complexFlag = { active: true };
        flagManager.flags = { 'complex': complexFlag };

        const allFlags = flagManager.getAllFlags();
        allFlags.complex.active = false;

        expect(flagManager.flags.complex.active).toBe(true);
    });
});
