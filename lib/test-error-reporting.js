/**
 * Test Error Reporting
 * 
 * Sends a test error to the configured endpoint to verify the setup works.
 */

import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';

/**
 * Send a test error/report to the configured endpoint
 * @param {Object} options - Command options
 * @param {string} options.type - Type of test: 'error' or 'report'
 * @param {string} options.message - Custom message to include
 */
export async function testErrorReporting(options = {}) {
    // Handle TLS certificate issues (corporate proxies)
    if (options.insecure) {
        process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
    }
    
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
    
    // Check if error reporting is configured
    const endpoint = courseConfig.environment?.errorReporting?.endpoint;
    if (!endpoint) {
        console.error('❌ Error reporting is not configured.');
        console.error('');
        console.error('   Add to course-config.js:');
        console.error('');
        console.error('   environment: {');
        console.error('       errorReporting: {');
        console.error("           endpoint: 'https://your-worker.workers.dev'");
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
        console.error('   Update your course-config.js errorReporting.endpoint.');
        process.exit(1);
    }
    
    console.log('📧 Testing error reporting endpoint...');
    console.log(`   Endpoint: ${endpoint}`);
    console.log('');
    
    const isUserReport = options.type === 'report';
    
    // Build test payload
    const payload = isUserReport ? {
        type: 'user_report',
        description: options.message || 'This is a test user report from the coursecode CLI.',
        timestamp: new Date().toISOString(),
        url: 'cli://coursecode/test-error',
        userAgent: `coursecode-cli/${process.env.npm_package_version || '1.0.0'}`,
        currentSlide: 'test-slide',
        course: {
            title: courseConfig.metadata?.title || 'Unknown Course',
            version: courseConfig.metadata?.version || '0.0.0',
            id: courseConfig.metadata?.id
        }
    } : {
        domain: 'cli-test',
        operation: 'testErrorReporting',
        message: options.message || 'This is a test error from the coursecode CLI. If you received this email, error reporting is working correctly!',
        timestamp: new Date().toISOString(),
        url: 'cli://coursecode/test-error',
        userAgent: `coursecode-cli/${process.env.npm_package_version || '1.0.0'}`,
        course: {
            title: courseConfig.metadata?.title || 'Unknown Course',
            version: courseConfig.metadata?.version || '0.0.0',
            id: courseConfig.metadata?.id
        },
        context: {
            testType: 'cli-verification',
            nodeVersion: process.version
        }
    };
    
    try {
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });
        
        if (response.ok) {
            console.log('✅ Success! Test ' + (isUserReport ? 'report' : 'error') + ' sent.');
            console.log('');
            console.log('   Check your email inbox for the notification.');
            console.log('   Subject will be:');
            if (isUserReport) {
                console.log(`   "[User Report] Issue reported in ${courseConfig.metadata?.title || 'Course'}"`);
            } else {
                console.log('   "[Course Error] cli-test: testErrorReporting"');
            }
        } else {
            const errorText = await response.text();
            console.error(`❌ Failed with status ${response.status}`);
            console.error(`   Response: ${errorText}`);
            console.error('');
            console.error('   Check your Cloudflare Worker logs for details.');
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
        console.error('   - The Cloudflare Worker is deployed');
        console.error('   - You have internet connectivity');
        process.exit(1);
    }
}
