// @vitest-environment jsdom
/**
 * Regression tests for NavigationActions:
 * - Sidebar menu can't skip past an assessment with blockNavigation unmet
 * - A slide whose render throws doesn't brick resume or desync state
 * - Focus moves to the new slide's heading after navigation (not on load)
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    domains: {},
    entryMode: 'ab-initio',
    bookmark: '',
    assessmentPassed: false,
    failingViews: new Set(),
    showNotification: vi.fn(),
    setActiveItem: vi.fn()
}));

// navigation-helpers hard-imports the course config; gating bypass is off
vi.mock('../../../framework/js/navigation/navigation-helpers.js', () => ({
    shouldBypassGating: () => false,
    shouldBypassEngagement: () => false,
    evaluateGatingCondition: () => true
}));
vi.mock('../../../framework/js/state/index.js', () => ({
    default: {
        getDomainState: (key) => mocks.domains[key],
        setDomainState: (key, value) => { mocks.domains[key] = value; },
        getEntryMode: () => mocks.entryMode,
        getBookmark: () => mocks.bookmark,
        setBookmark: vi.fn(),
        updateProgressMeasure: vi.fn()
    }
}));
vi.mock('../../../framework/js/navigation/NavigationUI.js', () => ({
    renderMenu: vi.fn(),
    setActiveItem: (...args) => mocks.setActiveItem(...args),
    updateNavButtonState: vi.fn(),
    markAsLocked: vi.fn(),
    markAsUnlocked: vi.fn(),
    markAsVisited: vi.fn(),
    markAsUnvisited: vi.fn(),
    updateSectionStates: vi.fn(),
    updateHeaderProgress: vi.fn(),
    hideEngagementIndicator: vi.fn(),
    showEngagementIndicator: vi.fn(),
    triggerEngagementCompleteAnimation: vi.fn()
}));
vi.mock('../../../framework/js/managers/assessment-manager.js', () => ({
    resolveAssessmentId: (slide) => slide.assessmentId || slide.id,
    meetsCompletionRequirements: () => mocks.assessmentPassed
}));
vi.mock('../../../framework/js/app/AppActions.js', () => ({
    showNotification: (...args) => mocks.showNotification(...args)
}));
vi.mock('../../../framework/js/app/AppUI.js', () => ({ showFooter: vi.fn() }));
vi.mock('../../../framework/js/engagement/engagement-manager.js', () => ({
    default: {
        evaluateRequirements: () => ({ complete: true, progress: {}, unmetRequirements: [] }),
        getProgress: () => null,
        cleanupSlide: vi.fn()
    }
}));
vi.mock('../../../framework/js/managers/accessibility-manager.js', () => ({ default: { announce: vi.fn() } }));
vi.mock('../../../framework/js/utilities/logger.js', () => ({
    logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), fatal: vi.fn() }
}));

const slides = [
    { id: 's1', title: 'One', type: 'slide', engagement: { required: false } },
    { id: 'broken', title: 'Broken', type: 'slide', engagement: { required: false } },
    { id: 'exam', title: 'Exam', type: 'assessment', engagement: { required: false } },
    { id: 's3', title: 'After', type: 'slide', engagement: { required: false } }
];

vi.mock('../../../framework/js/utilities/course-helpers.js', () => ({
    getSlideIndex: async (id) => {
        const index = slides.findIndex(s => s.id === id);
        return index >= 0 ? index : null;
    }
}));

const assessmentConfigs = new Map([
    ['exam', { completionRequirements: { requirePass: true, blockNavigation: true } }]
]);

function createFakeViewManager() {
    return {
        rendered: [],
        async showView(name) {
            if (mocks.failingViews.has(name)) {
                throw new Error(`Slide "${name}" render() failed: boom`);
            }
            this.rendered.push(name);
            document.getElementById('slide-container').innerHTML = `<h1>${name} heading</h1><p>content</p>`;
        }
    };
}

let NavigationActions;
let NavigationState;

async function setup() {
    vi.resetModules();
    // Fresh <body> so listeners from previous module instances are dropped
    document.documentElement.replaceChild(document.createElement('body'), document.body);
    document.body.innerHTML = '<main id="content" tabindex="-1"><div id="slide-container"></div></main>';
    // jsdom doesn't implement scrolling
    document.getElementById('content').scrollTo = () => {};
    NavigationActions = await import('../../../framework/js/navigation/NavigationActions.js');
    NavigationState = await import('../../../framework/js/navigation/NavigationState.js');
}

function menuItem(slideId) {
    const li = document.createElement('li');
    li.dataset.action = 'nav-menu-item';
    li.dataset.slideId = slideId;
    li.innerHTML = '<button type="button">item</button>';
    document.body.appendChild(li);
    return li;
}

async function settle() {
    for (let i = 0; i < 5; i++) await new Promise(resolve => setTimeout(resolve, 0));
}

beforeEach(() => {
    for (const key of Object.keys(mocks.domains)) delete mocks.domains[key];
    mocks.entryMode = 'ab-initio';
    mocks.bookmark = '';
    mocks.assessmentPassed = false;
    mocks.failingViews.clear();
    mocks.showNotification.mockReset();
    mocks.setActiveItem.mockReset();
});

afterEach(() => {
    vi.unstubAllEnvs();
});

describe('menu navigation honours assessment blockNavigation', () => {
    it('blocks forward menu navigation past an unpassed blocking assessment', async () => {
        await setup();
        const viewManager = createFakeViewManager();
        await NavigationActions.init(slides, viewManager, [], assessmentConfigs);
        await NavigationActions.goToSlide('exam');

        expect(NavigationActions.checkAllSlidesAccessibility().get('s3').allowed).toBe(false);

        menuItem('s3').click();
        await settle();
        expect(NavigationActions.getCurrentSlideId()).toBe('exam');
        expect(mocks.showNotification).toHaveBeenCalledWith('You must pass the assessment before continuing.', 'info', 3000);
    });

    it('allows backward menu navigation and forward navigation once passed', async () => {
        await setup();
        const viewManager = createFakeViewManager();
        await NavigationActions.init(slides, viewManager, [], assessmentConfigs);
        await NavigationActions.goToSlide('exam');

        menuItem('s1').click();
        await settle();
        expect(NavigationActions.getCurrentSlideId()).toBe('s1');

        await NavigationActions.goToSlide('exam');
        mocks.assessmentPassed = true;
        menuItem('s3').click();
        await settle();
        expect(NavigationActions.getCurrentSlideId()).toBe('s3');
    });
});

describe('slide render failures', () => {
    it('mid-session: reverts state to the previous slide and keeps the course usable', async () => {
        await setup();
        const viewManager = createFakeViewManager();
        await NavigationActions.init(slides, viewManager, [], assessmentConfigs);
        expect(NavigationActions.getCurrentSlideId()).toBe('s1');

        mocks.failingViews.add('broken');
        await expect(NavigationActions.goToSlide('broken')).rejects.toThrow('render() failed');

        expect(NavigationActions.getCurrentSlideId()).toBe('s1');
        expect(mocks.setActiveItem).toHaveBeenLastCalledWith('s1');
        expect(viewManager.rendered.at(-1)).toBe('s1');
        expect(mocks.showNotification).toHaveBeenCalled();

        // Navigation continues to work afterwards
        await NavigationActions.goToSlide('exam');
        expect(NavigationActions.getCurrentSlideId()).toBe('exam');
    });

    it('resume: a bookmarked slide that fails to render falls back instead of bricking (production)', async () => {
        vi.stubEnv('DEV', false);
        mocks.entryMode = 'resume';
        mocks.bookmark = 'broken';
        mocks.failingViews.add('broken');

        await setup();
        const viewManager = createFakeViewManager();
        await expect(NavigationActions.init(slides, viewManager, [], assessmentConfigs)).resolves.toBeUndefined();
        expect(NavigationActions.getCurrentSlideId()).toBe('s1');
        expect(viewManager.rendered).toContain('s1');
    });

    it('resume: still fails fast in development', async () => {
        mocks.entryMode = 'resume';
        mocks.bookmark = 'broken';
        mocks.failingViews.add('broken');

        await setup();
        await expect(NavigationActions.init(slides, createFakeViewManager(), [], assessmentConfigs)).rejects.toThrow('render() failed');
    });
});

describe('focus management', () => {
    it('does not move focus on initial load, then focuses the new slide heading', async () => {
        await setup();
        await NavigationActions.init(slides, createFakeViewManager(), [], assessmentConfigs);
        expect(document.activeElement).toBe(document.body);

        await NavigationActions.goToSlide('exam');
        const heading = document.querySelector('#slide-container h1');
        expect(document.activeElement).toBe(heading);
        expect(heading.getAttribute('tabindex')).toBe('-1');
        expect(NavigationState.getCurrentSlideId()).toBe('exam');
    });
});
