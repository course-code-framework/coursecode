import { describe, expect, it } from 'vitest';
import {
    getComponentMetadata,
    getEngagementTrackingMap,
    getSchema
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

    it('keeps matching schema fields aligned with the runtime pair contract', () => {
        expect(getSchema('matching')?.properties?.pairs?.itemSchema).toEqual({
            id: { type: 'string', required: true },
            text: { type: 'string', required: true },
            match: { type: 'string', required: true }
        });
    });

    it('keeps drag-drop schema fields aligned with the runtime item contract', () => {
        expect(getSchema('drag-drop')?.properties?.items?.itemSchema).toEqual({
            id: { type: 'string', required: true },
            content: { type: 'string', required: true }
        });
        expect(getSchema('drag-drop')?.properties?.dropZones?.itemSchema?.accepts).toEqual({
            type: 'array', required: true, minItems: 1
        });
    });
});
