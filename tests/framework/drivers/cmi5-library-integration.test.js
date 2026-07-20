import { describe, it, expect, vi } from 'vitest';
import Cmi5 from '@xapi/cmi5';

describe('@xapi/cmi5 production package integration', () => {
    it('completes the real library initialization lifecycle with the expected API surface', async () => {
        const parameters = {
            fetch: 'https://lms.example.com/cmi5/fetch',
            endpoint: 'https://lms.example.com/xapi',
            actor: { mbox: 'mailto:learner@example.com' },
            registration: '00000000-0000-4000-8000-000000000001',
            activityId: 'https://example.com/course/au/1'
        };
        const launchData = {
            launchMode: 'Normal',
            moveOn: 'Completed',
            contextTemplate: {}
        };
        const cmi5 = new Cmi5(parameters);
        cmi5.getAuthTokenFromLMS = vi.fn().mockResolvedValue('temporary-auth-token');
        cmi5.getLaunchDataFromLMS = vi.fn().mockResolvedValue(launchData);
        cmi5.getLearnerPreferencesFromLMS = vi.fn().mockResolvedValue({ languagePreference: 'en-US' });
        cmi5.sendXapiStatement = vi.fn().mockResolvedValue(undefined);

        await cmi5.initialize();

        expect(cmi5.getAuthTokenFromLMS).toHaveBeenCalledWith(parameters.fetch);
        expect(cmi5.getAuthToken()).toBe('temporary-auth-token');
        expect(cmi5.getLaunchData()).toEqual(launchData);
        expect(cmi5.getLaunchParameters()).toEqual(parameters);
        expect(cmi5.sendXapiStatement).toHaveBeenCalledWith(expect.objectContaining({
            actor: parameters.actor,
            verb: expect.objectContaining({
                id: 'http://adlnet.gov/expapi/verbs/initialized'
            }),
            object: { objectType: 'Activity', id: parameters.activityId }
        }));
    });
});
