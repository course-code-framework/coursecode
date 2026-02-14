/**
 * Integration Test Wiring Helper
 * 
 * Creates isolated instances of the framework managers wired together.
 * Uses vi.resetModules() and vi.doMock() to bypass singleton caching.
 */

import { vi } from 'vitest';

export async function createIntegrationRuntime(options = {}) {
    // 1. Reset modules to clear singleton cache
    vi.resetModules();

    // 1.5. Mock minimal DOM for Node environment (framework modules expect window/document)
    if (typeof document === 'undefined') {
        const mkEl = () => {
             const el = {
                classList: { 
                    add: vi.fn(), 
                    remove: vi.fn(), 
                    contains: vi.fn(), 
                    toggle: vi.fn() 
                },
                setAttribute: vi.fn(),
                getAttribute: vi.fn(),
                addEventListener: vi.fn(),
                removeEventListener: vi.fn(),
                appendChild: vi.fn(),
                removeChild: vi.fn(),
                style: { display: 'block', visibility: 'visible' },
                dataset: {},
                contains: vi.fn(),
                getBoundingClientRect: vi.fn(() => ({ top: 0, left: 0, width: 0, height: 0 })),
                // Traversal
                querySelector: vi.fn(), 
                querySelectorAll: vi.fn(),
                getElementsByClassName: vi.fn(),
                getElementsByTagName: vi.fn(),
                closest: vi.fn(),
                matches: vi.fn(() => false),
             };
             // Self-reference for traversal to return similar mocks
             el.querySelector = vi.fn(() => mkEl()); 
             el.querySelectorAll = vi.fn(() => [mkEl()]);
             el.getElementsByClassName = vi.fn(() => [mkEl()]);
             el.getElementsByTagName = vi.fn(() => [mkEl()]);
             el.closest = vi.fn(() => mkEl());
             return el;
        };

        // specific mock for body 
        const mkBody = mkEl();

        global.document = {
            readyState: 'complete',
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
            querySelector: vi.fn(() => mkEl()),
            querySelectorAll: vi.fn(() => [mkEl()]),
            getElementById: vi.fn(() => mkEl()),
            createElement: vi.fn(() => mkEl()),
            body: mkBody,
            documentElement: mkEl(),
            location: { href: 'http://test.com', search: '' },
            cookie: ''
        };
    }
    
    if (typeof window === 'undefined') {
        global.window = {
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
            CourseCode: {},
            location: { href: 'http://test.com', search: '', reload: vi.fn() },
            navigator: { userAgent: 'node-test' },
            document: global.document,
            setTimeout: setTimeout,
            clearTimeout: clearTimeout,
            setInterval: setInterval,
            clearInterval: clearInterval,
            requestAnimationFrame: ((cb) => setTimeout(cb, 16)),
            cancelAnimationFrame: clearTimeout,
            localStorage: {
                getItem: vi.fn(),
                setItem: vi.fn(),
                removeItem: vi.fn(),
                clear: vi.fn()
            },
            matchMedia: vi.fn(() => ({ matches: false, addListener: vi.fn(), removeListener: vi.fn() }))
        };
    }

    if (typeof MutationObserver === 'undefined') {
        global.MutationObserver = class {
            constructor(cb) {}
            disconnect() {}
            observe() {}
        };
    }
    
    if (typeof IntersectionObserver === 'undefined') {
        global.IntersectionObserver = class {
            constructor(cb) {}
            disconnect() {}
            observe() {}
            unobserve() {}
        };
    }

    if (typeof ResizeObserver === 'undefined') {
        global.ResizeObserver = class {
            constructor(cb) {}
            disconnect() {}
            observe() {}
            unobserve() {}
        };
    }

    // 2. Create the mock LMS data holder
    const mockLMSData = { 
        stored: null, 
        commitCount: 0, 
        sentScores: [],
        sentCompletions: [],
        sentSuccesses: [],
        sentObjectives: [],
        sentInteractions: [],
        sessionTime: null
    };

    // 3. Define the mock LMS object
    const mockLMS = {
        initialize: vi.fn().mockResolvedValue(true),
        
        // Storage
        setSuspendData: vi.fn((data) => { 
            // Simulate JSON serialization boundary
            mockLMSData.stored = JSON.parse(JSON.stringify(data)); 
            return true;
        }),
        getSuspendData: vi.fn(() => {
            return mockLMSData.stored ? JSON.parse(JSON.stringify(mockLMSData.stored)) : null;
        }),
        
        // Lifecycle
        commit: vi.fn(() => { mockLMSData.commitCount++; return true; }),
        getEntryMode: vi.fn(() => mockLMSData.stored ? 'resume' : 'ab-initio'),
        getBookmark: vi.fn(() => options.bookmark || ''),
        setBookmark: vi.fn(),
        
        // Capabilities
        getCapabilities: vi.fn(() => ({ 
            supportsObjectives: true, 
            supportsInteractions: true,
            supportsComments: false,
            supportsEmergencySave: false,
            maxSuspendDataBytes: 4096, // SCORM 1.2 typical limit for stress testing
            asyncCommit: false
        })),
        getFormat: vi.fn(() => options.format || 'scorm2004'),
        
        // Reporting
        reportInteraction: vi.fn((data) => { mockLMSData.sentInteractions.push(data); }),
        reportObjective: vi.fn((data) => { mockLMSData.sentObjectives.push(data); }),
        reportScore: vi.fn((data) => { mockLMSData.sentScores.push(data); }),
        reportCompletion: vi.fn((status) => { mockLMSData.sentCompletions.push(status); }),
        reportSuccess: vi.fn((status) => { mockLMSData.sentSuccesses.push(status); }),
        reportSessionTime: vi.fn((time) => { mockLMSData.sessionTime = time; }),
        reportProgress: vi.fn(),
        
        // Exit
        setExitMode: vi.fn(),
        terminate: vi.fn().mockResolvedValue(true),
        setupLifecycleHandlers: vi.fn(),
        
        // Driver Access
        getDriver: vi.fn(() => ({ on: vi.fn() })),
        
        // Internal
        get sessionStart() { return Date.now(); }
    };

    // 4. Mock lms-connection to return our mock LMS
    //    MUST be done before importing managers
    vi.doMock('../../../framework/js/state/lms-connection.js', () => ({
        default: mockLMS
    }));

    // 4.5. Mock AssessmentFactory to avoid importing UI layers (DOM) and interaction-catalog (glob issues)
    vi.doMock('../../../framework/js/assessment/AssessmentFactory.js', () => ({
        createAssessmentInstance: vi.fn(() => ({
            render: vi.fn(),
            persistToSCORM: vi.fn(),
            restoreFromSCORM: vi.fn()
        }))
    }));

    // 4.6. Mock course-config.js — navigation-helpers.js hard-imports this
    vi.doMock('../../../course/course-config.js', () => ({
        courseConfig: { environment: {} }
    }));

    // 5. Import managers (re-evaluated due to resetModules)
    const { default: stateManager } = await import('../../../framework/js/state/state-manager.js');
    const { default: engagementManager } = await import('../../../framework/js/engagement/engagement-manager.js');
    const { default: objectiveManager } = await import('../../../framework/js/managers/objective-manager.js');
    const { default: scoreManager } = await import('../../../framework/js/managers/score-manager.js');
    const { default: flagManager } = await import('../../../framework/js/managers/flag-manager.js');
    const assessmentManager = await import('../../../framework/js/managers/assessment-manager.js');
    const { eventBus } = await import('../../../framework/js/core/event-bus.js');

    // 6. Initialize connection (required by StateManager)
    await stateManager.initializeConnection();

    return {
        // Instances
        stateManager,
        engagementManager,
        objectiveManager,
        scoreManager,
        flagManager,
        assessmentManager,
        eventBus,
        
        // Mock LMS access
        mockLMS,
        mockLMSData,
        
        // Helpers
        initialize: (config) => {
            // Standard init sequence
            stateManager.setCourseValidationConfig(config);
            stateManager.initialize();
            
            // Init managers
            if (config.objectives) objectiveManager.initialize(config.objectives);
            if (config.scoring) scoreManager.initialize(config.scoring);
            flagManager.initialize();
            engagementManager.initialize(config);
        },
        
        simulateSessionRestart: async () => {
            // Commit current state
            await stateManager.terminate();
            
            // Create NEW runtime but keep existing mockLMSData (simulating persistence)
            const newRuntime = await createIntegrationRuntime(options);
            
            // Inject the PREVIOUS data into the NEW mockLMS
            newRuntime.mockLMSData.stored = mockLMSData.stored;
            
            return newRuntime;
        }
    };
}
