/**
 * Test Data Reporting
 * 
 * Sends test data records to the configured endpoint to verify the setup works.
 */

import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';

/**
 * Send a test data record to the configured endpoint
 * @param {Object} options - Command options
 * @param {string} options.type - Type of test: 'assessment', 'objective', 'interaction'
 * @param {string} options.message - Custom message to include
 */
export async function testDataReporting(options = {}) {
    const cwd = process.cwd();
    const configPath = path.join(cwd, 'course', 'course-config.js');

    // Check if we're in a course project
    if (!fs.existsSync(configPath)) {
        console.error('❌ Error: course/course-config.js not found.');
        console.error('   Run this command from the root of a coursecode project.');
        process.exit(1);
    }

    // Load course config
    let courseConfig;
    try {
        const configModule = await import(pathToFileURL(configPath).href);
        courseConfig = configModule.courseConfig;
    } catch (error) {
        console.error('❌ Error loading course-config.js:', error.message);
        process.exit(1);
    }

    // Check if data reporting is configured
    const endpoint = courseConfig.environment?.dataReporting?.endpoint;
    if (!endpoint) {
        console.error('❌ Data reporting is not configured.');
        console.error('');
        console.error('   Add to course-config.js:');
        console.error('');
        console.error('   environment: {');
        console.error('       dataReporting: {');
        console.error("           endpoint: 'https://your-endpoint.workers.dev/data'");
        console.error('       }');
        console.error('   }');
        process.exit(1);
    }

    // Validate URL has protocol (must match production behavior)
    if (!endpoint.startsWith('http://') && !endpoint.startsWith('https://')) {
        console.error('❌ Invalid endpoint URL: missing protocol.');
        console.error('');
        console.error(`   Found:    ${endpoint}`);
        console.error(`   Expected: https://${endpoint}`);
        console.error('');
        console.error('   The endpoint must include the full URL with https:// protocol.');
        console.error('   Update your course-config.js dataReporting.endpoint.');
        process.exit(1);
    }

    console.log('📊 Testing data reporting endpoint...');
    console.log(`   Endpoint: ${endpoint}`);
    console.log('');

    const recordType = options.type || 'assessment';
    const testId = `cli-test-${Date.now()}`;

    // Build test record based on type
    let record;
    switch (recordType) {
        case 'objective':
            record = {
                type: 'objective',
                data: {
                    objectiveId: testId,
                    completion_status: 'completed',
                    success_status: 'passed',
                    score: { scaled: 1.0 }
                },
                timestamp: new Date().toISOString()
            };
            break;
        case 'interaction':
            record = {
                type: 'interaction',
                data: {
                    interactionId: testId,
                    type: 'choice',
                    result: 'correct',
                    learner_response: 'a'
                },
                timestamp: new Date().toISOString()
            };
            break;
        case 'assessment':
        default:
            record = {
                type: 'assessment',
                data: {
                    assessmentId: testId,
                    score: 100,
                    passed: true,
                    attemptNumber: 1,
                    totalQuestions: 5,
                    correctCount: 5,
                    timeSpent: 120
                },
                timestamp: new Date().toISOString()
            };
            break;
    }

    // Build payload matching data-reporter.js format
    const payload = {
        records: [record],
        sentAt: new Date().toISOString(),
        course: {
            title: courseConfig.metadata?.title || 'Unknown Course',
            version: courseConfig.metadata?.version || '0.0.0',
            id: courseConfig.metadata?.id
        },
        _test: {
            source: 'coursecode-cli',
            message: options.message || 'Test data record from coursecode CLI'
        }
    };

    console.log(`   Record type: ${recordType}`);
    console.log('');

    try {
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        if (response.ok) {
            console.log(`✅ Success! Test ${recordType} record sent.`);
            console.log('');
            console.log('   Payload sent:');
            console.log(`   - Record type: ${recordType}`);
            console.log(`   - Course: ${courseConfig.metadata?.title || 'Unknown'}`);
            console.log(`   - Test ID: ${testId}`);
        } else {
            const errorText = await response.text();
            console.error(`❌ Failed with status ${response.status}`);
            console.error(`   Response: ${errorText}`);
            console.error('');
            console.error('   Check your endpoint logs for details.');
            process.exit(1);
        }
    } catch (error) {
        console.error('❌ Network error:', error.message);
        if (error.cause) {
            console.error('   Cause:', error.cause.message || error.cause);
        }
        console.error('');
        console.error('   Make sure:');
        console.error('   - The endpoint URL is correct');
        console.error('   - Your endpoint is deployed and accessible');
        console.error('   - You have internet connectivity');
        process.exit(1);
    }
}
