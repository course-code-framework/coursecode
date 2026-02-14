import { describe, it, expect } from 'vitest';
import { Scorm12Driver } from '../framework/js/drivers/scorm-12-driver.js';

/**
 * Tests for Strict Diet Mode — the 4KB suspend_data pruning for SCORM 1.2.
 *
 * _createDietState reads this._cache.bookmark, so we create a real instance
 * and seed the cache with a test bookmark value.
 */
function createTestDriver(currentSlide = 'slide-intro') {
    const driver = new Scorm12Driver();
    driver._cache.bookmark = currentSlide;
    return driver;
}

const FULL_STATE = {
    navigation: {
        currentSlide: 'slide-intro',
        visitedSlides: ['slide-intro', 'slide-topic1', 'slide-topic2']
    },
    accessibility: {
        fontSize: 'large',
        highContrast: true
    },
    flags: {
        showWelcome: false
    },
    engagement: {
        'slide-intro': {
            complete: true,
            tracked: { tab1: true, tab2: true },
            timeSpent: 45000
        },
        'slide-topic1': {
            complete: false,
            tracked: { accordion1: true },
            timeSpent: 12000
        }
    },
    interactionResponses: {
        'slide-intro': { q1: 'answer-a' },
        'slide-topic1': { q2: 'answer-b' }
    },
    assessment_quiz1: {
        attempts: 1,
        score: 85,
        passed: true,
        responses: { q1: 'a', q2: 'b' }
    },
    audioPositions: {
        'slide-intro': 12.5
    }
};

describe('Diet Mode: _createDietState', () => {
    const driver = createTestDriver('slide-intro');

    it('preserves navigation with abbreviated keys', () => {
        const diet = driver._createDietState(FULL_STATE);
        expect(diet.nav).toBeDefined();
        expect(diet.nav.cur).toBe('slide-intro');
        expect(diet.nav.vis).toEqual(['slide-intro', 'slide-topic1', 'slide-topic2']);
    });

    it('preserves accessibility untouched', () => {
        const diet = driver._createDietState(FULL_STATE);
        expect(diet.acc).toEqual({ fontSize: 'large', highContrast: true });
    });

    it('preserves flags', () => {
        const diet = driver._createDietState(FULL_STATE);
        expect(diet.flg).toEqual({ showWelcome: false });
    });

    it('drops engagement detail, keeps only completion flag', () => {
        const diet = driver._createDietState(FULL_STATE);
        expect(diet.eng['slide-intro']).toEqual({ c: 1 });
        expect(diet.eng['slide-topic1']).toEqual({ c: 0 });
        // No tracked data, no timeSpent
        expect(diet.eng['slide-intro'].tracked).toBeUndefined();
        expect(diet.eng['slide-intro'].timeSpent).toBeUndefined();
    });

    it('keeps interaction responses for current slide only', () => {
        const diet = driver._createDietState(FULL_STATE);
        expect(diet.int).toBeDefined();
        expect(diet.int['slide-intro']).toEqual({ q1: 'answer-a' });
        expect(diet.int['slide-topic1']).toBeUndefined();
    });

    it('preserves assessment state with abbreviated key', () => {
        const diet = driver._createDietState(FULL_STATE);
        expect(diet.as_quiz1).toBeDefined();
        expect(diet.as_quiz1.score).toBe(85);
        expect(diet.as_quiz1.passed).toBe(true);
    });

    it('drops audio positions', () => {
        const diet = driver._createDietState(FULL_STATE);
        expect(diet.audioPositions).toBeUndefined();
    });

    it('omits flags key when empty', () => {
        const noFlags = { ...FULL_STATE, flags: {} };
        const diet = driver._createDietState(noFlags);
        expect(diet.flg).toBeUndefined();
    });
});

describe('Diet Mode: _expandDietState', () => {
    const driver = createTestDriver();

    const DIET_STATE = {
        nav: { cur: 'slide-intro', vis: ['slide-intro', 'slide-topic1'] },
        acc: { fontSize: 'large' },
        flg: { showWelcome: false },
        eng: {
            'slide-intro': { c: 1 },
            'slide-topic1': { c: 0 }
        },
        int: { 'slide-intro': { q1: 'answer-a' } },
        as_quiz1: { attempts: 1, score: 85 }
    };

    it('restores navigation domain', () => {
        const expanded = driver._expandDietState(DIET_STATE);
        expect(expanded.navigation.currentSlide).toBe('slide-intro');
        expect(expanded.navigation.visitedSlides).toEqual(['slide-intro', 'slide-topic1']);
    });

    it('restores accessibility', () => {
        const expanded = driver._expandDietState(DIET_STATE);
        expect(expanded.accessibility).toEqual({ fontSize: 'large' });
    });

    it('restores flags', () => {
        const expanded = driver._expandDietState(DIET_STATE);
        expect(expanded.flags).toEqual({ showWelcome: false });
    });

    it('restores engagement with boolean complete', () => {
        const expanded = driver._expandDietState(DIET_STATE);
        expect(expanded.engagement['slide-intro'].complete).toBe(true);
        expect(expanded.engagement['slide-topic1'].complete).toBe(false);
    });

    it('restores engagement with empty tracked object', () => {
        const expanded = driver._expandDietState(DIET_STATE);
        expect(expanded.engagement['slide-intro'].tracked).toEqual({});
    });

    it('restores interaction responses', () => {
        const expanded = driver._expandDietState(DIET_STATE);
        expect(expanded.interactionResponses['slide-intro']).toEqual({ q1: 'answer-a' });
    });

    it('restores assessment state with full key name', () => {
        const expanded = driver._expandDietState(DIET_STATE);
        expect(expanded.assessment_quiz1).toBeDefined();
        expect(expanded.assessment_quiz1.score).toBe(85);
    });
});

describe('Diet Mode: Roundtrip', () => {
    const driver = createTestDriver('slide-intro');

    it('preserves essential navigation through roundtrip', () => {
        const diet = driver._createDietState(FULL_STATE);
        const expanded = driver._expandDietState(diet);
        expect(expanded.navigation.visitedSlides).toEqual(FULL_STATE.navigation.visitedSlides);
    });

    it('preserves assessment state through roundtrip', () => {
        const diet = driver._createDietState(FULL_STATE);
        const expanded = driver._expandDietState(diet);
        expect(expanded.assessment_quiz1.score).toBe(85);
        expect(expanded.assessment_quiz1.passed).toBe(true);
    });

    it('drops engagement detail (expected data loss)', () => {
        const diet = driver._createDietState(FULL_STATE);
        const expanded = driver._expandDietState(diet);
        // Tracked data is intentionally lost
        expect(expanded.engagement['slide-intro'].tracked).toEqual({});
        // Completion is preserved
        expect(expanded.engagement['slide-intro'].complete).toBe(true);
    });
});
