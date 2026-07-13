import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    initializer: vi.fn(),
    logger: {
        debug: vi.fn(),
        warn: vi.fn(),
        error: vi.fn()
    }
}));

vi.mock('../../../framework/js/utilities/logger.js', () => ({
    logger: mocks.logger
}));

vi.mock('../../../framework/js/core/component-catalog.js', () => ({
    getComponentInit: vi.fn(() => mocks.initializer),
    getComponentStyles: vi.fn(() => null),
    isComponentRegistered: vi.fn(() => true),
    getRegisteredComponentTypes: vi.fn(() => ['test-component'])
}));

vi.mock('../../../framework/js/components/ui-components/notifications.js', () => ({
    initNotificationTriggers: vi.fn()
}));

vi.mock('../../../framework/js/engagement/engagement-manager.js', () => ({
    default: {
        registerFlipCards: vi.fn(),
        registerModals: vi.fn(),
        registerLightbox: vi.fn()
    }
}));

vi.mock('../../../framework/js/navigation/NavigationState.js', () => ({
    getCurrentSlideId: vi.fn(() => null)
}));

import {
    cleanupDeclarativeComponents,
    initializeDeclarativeComponents
} from '../../../framework/js/utilities/ui-initializer.js';

function component(name = 'test-component') {
    return { dataset: { component: name } };
}

function container({ rootComponent = false, children = [] } = {}) {
    return {
        dataset: rootComponent ? { component: 'test-component' } : {},
        matches: vi.fn(() => rootComponent),
        querySelectorAll: vi.fn((selector) => selector === '[data-component]' ? children : [])
    };
}

describe('declarative component lifecycle', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('initializes a component declared on the rendered root element', () => {
        const root = container({ rootComponent: true });

        initializeDeclarativeComponents(root);

        expect(mocks.initializer).toHaveBeenCalledOnce();
        expect(mocks.initializer).toHaveBeenCalledWith(root);
    });

    it('destroys returned component instances exactly once', () => {
        const destroy = vi.fn();
        const root = container({ children: [component()] });
        mocks.initializer.mockReturnValue({ destroy });

        initializeDeclarativeComponents(root);
        cleanupDeclarativeComponents(root);
        cleanupDeclarativeComponents(root);

        expect(destroy).toHaveBeenCalledOnce();
    });

    it('cleans up existing instances before re-initializing the same view', () => {
        const firstDestroy = vi.fn();
        const secondDestroy = vi.fn();
        const root = container({ children: [component()] });
        mocks.initializer
            .mockReturnValueOnce({ destroy: firstDestroy })
            .mockReturnValueOnce({ destroy: secondDestroy });

        initializeDeclarativeComponents(root);
        initializeDeclarativeComponents(root);

        expect(firstDestroy).toHaveBeenCalledOnce();
        expect(secondDestroy).not.toHaveBeenCalled();
    });

    it('continues cleanup when one component destroy handler fails', () => {
        const secondDestroy = vi.fn();
        const root = container({ children: [component(), component()] });
        mocks.initializer
            .mockReturnValueOnce({ destroy: () => { throw new Error('broken cleanup'); } })
            .mockReturnValueOnce({ destroy: secondDestroy });

        initializeDeclarativeComponents(root);
        cleanupDeclarativeComponents(root);

        expect(secondDestroy).toHaveBeenCalledOnce();
        expect(mocks.logger.error).toHaveBeenCalledWith(
            expect.stringContaining('broken cleanup'),
            expect.objectContaining({ operation: 'cleanupComponent' })
        );
    });
});
