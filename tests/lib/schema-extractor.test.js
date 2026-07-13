import { describe, expect, it } from 'vitest';
import {
    getComponentMetadata,
    getEngagementTrackingMap
} from '../../lib/schema-extractor.js';

describe('component schema metadata', () => {
    it('maps each built-in engagement requirement to its component type', () => {
        expect(getEngagementTrackingMap()).toMatchObject({
            viewAllTabs: 'tabs',
            viewAllPanels: 'accordion',
            viewAllFlipCards: 'flip-card',
            viewAllHotspots: 'interactive-image',
            viewAllModals: 'modal-trigger',
            viewAllLightboxes: 'lightbox',
            viewAllTimelineEvents: 'interactive-timeline'
        });
    });

    it('keeps lightbox metadata aligned with the requirement strategy name', () => {
        expect(getComponentMetadata('lightbox')?.engagementTracking)
            .toBe('viewAllLightboxes');
    });
});
