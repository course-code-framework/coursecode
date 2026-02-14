/**
 * Integration Tests: LMS Reporting & Recovery
 * 
 * Verifies that the StateManager correctly persists data to the LMS,
 * handles commit scheduling (debounce), and reports session status.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createIntegrationRuntime } from './setup/integration-wiring.js';

describe('Integration: LMS Reporting & Recovery', () => {
    let runtime;
    let stateManager, mockLMSData, mockLMS, eventBus;

    beforeEach(async () => {
        vi.useFakeTimers();
        runtime = await createIntegrationRuntime();
        ({ stateManager, mockLMSData, mockLMS, eventBus } = runtime);
        runtime.initialize({ structure: [] });
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    // ─── Scenarios ───────────────────────────────────────────────────────────

    it('Scenario 1 (Persistence): Data is written to suspend_data correctly', async () => {
        // 1. Set some state
        stateManager.setDomainState('custom_data', { key: 'value' });

        // 2. Force commit (bypass debounce)
        await stateManager.flush();

        // 3. Verify LMS received data (it's already an object in our mock)
        const suspendData = mockLMSData.stored;
        expect(suspendData.custom_data).toEqual({ key: 'value' });
        expect(mockLMS.setSuspendData).toHaveBeenCalled();
    });

    it('Scenario 2 (Debounce): Multiple updates result in single commit', async () => {
        // 1. Rapid updates
        stateManager.setDomainState('data1', { v: 1 });
        stateManager.setDomainState('data2', { v: 2 });
        stateManager.setDomainState('data3', { v: 3 });

        // Verify NO commit yet (debounce is usually 500ms-2000ms)
        expect(mockLMS.commit).not.toHaveBeenCalled();

        // 2. Fast forward time
        // Use runAllTimersAsync to ensure async callbacks (promises) are processed
        await vi.runAllTimersAsync();

        // 3. Verify SINGLE commit
        expect(mockLMS.commit).toHaveBeenCalledTimes(1);
    });

    it('Scenario 3 (Session Time): exitCourseWithSuspend reports session duration', async () => {
        const startTime = Date.now();
        // Advance system time to simulate session duration
        vi.setSystemTime(startTime + 65000); // 65 seconds

        // 2. Exit course (suspend) - this should trigger session time reporting
        await stateManager.exitCourseWithSuspend();

        // 3. Verify session time reported
        expect(mockLMS.reportSessionTime).toHaveBeenCalled();
        
        const reportedTime = mockLMSData.sessionTime;
        expect(reportedTime).toBeDefined();
        // SCORM 2004 format: PT1M5S
        expect(reportedTime).toMatch(/PT.*S/); 
    });

    it('Scenario 4 (Storage Limit): Large data handling (Framework swallows setSuspendData failure)', async () => {
        // 1. Mock failure for large data
        mockLMS.setSuspendData.mockImplementation((data) => {
            const str = JSON.stringify(data);
             if (str.length > 4096) {
                 return false; // SCORM failure
             }
             mockLMSData.stored = JSON.parse(str);
             return true;
        });

        // 2. Create huge data
        const hugeString = 'a'.repeat(5000);
        stateManager.setDomainState('huge', { val: hugeString });
        
        // 3. Flush
        await expect(stateManager.flush()).resolves.not.toThrow();
        
        // 4. Verify setSuspendData WAS called
        expect(mockLMS.setSuspendData).toHaveBeenCalled();
    });

    it('Scenario 5 (Recovery): Recover from LMS commit failure', async () => {
        // 1. Simulate Commit Failure
        mockLMS.commit.mockRejectedValue(new Error('Network Error'));
        
        // Spy on event bus to detect failure
        const failureSpy = vi.fn();
        eventBus.on('state:commitFailed', failureSpy);

        stateManager.setDomainState('data', { v: 1 });
        
        // 2. Flush - StateManager should swallow the error but emit failure event
        await expect(stateManager.flush()).resolves.not.toThrow();
        
        // 3. Verify failure was reported
        expect(failureSpy).toHaveBeenCalled();
        const errorArgs = failureSpy.mock.calls[0][0];
        expect(errorArgs.error).toContain('Network Error');
    });
});
