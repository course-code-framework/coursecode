/**
 * Cloudflare Worker - Course Error & Issue Report Email Notifications
 * 
 * Deploy this worker to receive error reports and user issue reports from courses
 * and send email alerts. The API key stays server-side, so it's never exposed in the course.
 * Self-hosted/manual endpoint example: on CourseCode Cloud, runtime endpoints/API key are injected
 * by the platform and override course-config.js endpoint values.
 * Use this either for self-hosted telemetry, or as a downstream target if Cloud fans out reports server-side.
 * 
 * SETUP:
 * 1. Create a Cloudflare account and go to Workers & Pages
 * 2. Create a new Worker and paste this code
 * 3. Add these secrets in Settings > Variables:
 *    - RESEND_API_KEY: Your Resend API key
 *    - ALERT_EMAIL: Email address to receive alerts
 *    - FROM_EMAIL: Verified sender email (e.g., errors@yourdomain.com)
 *    - COURSE_API_KEY: Shared secret for authenticating course requests (optional)
 * 4. Deploy and copy your worker URL
 * 5. Add the URL to course-config.js:
 *    environment: {
 *        errorReporting: {
 *            endpoint: 'https://your-worker.your-subdomain.workers.dev',
 *            apiKey: 'your-shared-secret',  // Must match COURSE_API_KEY secret
 *            enableUserReports: true
 *        }
 *    }
 * 
 * FREE TIER LIMITS:
 * - Cloudflare Workers: 100,000 requests/day
 * - Resend: 3,000 emails/month
 */

export default {
    async fetch(request, env) {
        // CORS headers for cross-origin requests from courses
        const corsHeaders = {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        };

        // Handle CORS preflight (must be checked BEFORE POST check)
        if (request.method === 'OPTIONS') {
            return new Response(null, { headers: corsHeaders });
        }

        // Only accept POST requests
        if (request.method !== 'POST') {
            return new Response('Method not allowed', { 
                status: 405,
                headers: corsHeaders 
            });
        }

        // Validate API key if configured
        if (env.COURSE_API_KEY) {
            const auth = request.headers.get('Authorization');
            if (!auth || auth !== `Bearer ${env.COURSE_API_KEY}`) {
                return new Response('Unauthorized', { status: 401, headers: corsHeaders });
            }
        }

        try {
            const data = await request.json();
            
            // Determine if this is a user report or automatic error
            const isUserReport = data.type === 'user_report';
            
            // Build email content
            const subject = isUserReport 
                ? `[User Report] Issue reported in ${data.course?.title || 'Course'}`
                : `[Course Error] ${data.domain}: ${data.operation}`;
            const text = isUserReport 
                ? formatUserReportEmail(data) 
                : formatErrorEmail(data);

            // Send via Resend
            const emailResponse = await fetch('https://api.resend.com/emails', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${env.RESEND_API_KEY}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    from: env.FROM_EMAIL || 'Course Errors <errors@yourdomain.com>',
                    to: env.ALERT_EMAIL,
                    subject: subject,
                    text: text
                })
            });

            if (!emailResponse.ok) {
                const errorText = await emailResponse.text();
                console.error('Resend error:', errorText);
                return new Response('Failed to send email', { 
                    status: 500,
                    headers: corsHeaders 
                });
            }

            return new Response(JSON.stringify({ success: true }), {
                status: 200,
                headers: {
                    'Content-Type': 'application/json',
                    ...corsHeaders
                }
            });

        } catch (error) {
            console.error('Worker error:', error);
            return new Response('Internal error', { 
                status: 500,
                headers: corsHeaders 
            });
        }
    }
};

/**
 * Format user-submitted issue report into email
 */
function formatUserReportEmail(data) {
    const lines = [
        '=== USER ISSUE REPORT ===',
        '',
        `Time: ${data.timestamp}`,
        ''
    ];
    
    if (data.course) {
        lines.push(
            '--- Course ---',
            `Title: ${data.course.title || 'N/A'}`,
            `Version: ${data.course.version || 'N/A'}`,
            ''
        );
    }
    
    if (data.currentSlide) {
        lines.push(
            '--- Location ---',
            `Current Slide: ${data.currentSlide}`,
            ''
        );
    }
    
    lines.push(
        '--- User Description ---',
        data.description || '(No description provided)',
        '',
        '--- Environment ---',
        `URL: ${data.url}`,
        `User Agent: ${data.userAgent}`,
        ''
    );
    
    return lines.join('\n');
}

/**
 * Format error data into a readable email.
 * Handles both single errors and batched errors (data.errors array).
 */
function formatErrorEmail(data) {
    const lines = [
        '=== COURSE ERROR REPORT ===',
        '',
        `Time: ${data.timestamp}`,
    ];

    // Batched errors: the payload contains an `errors` array
    if (Array.isArray(data.errors) && data.errors.length > 1) {
        lines.push(`Errors: ${data.errors.length}`, '');
        for (let i = 0; i < data.errors.length; i++) {
            const err = data.errors[i];
            lines.push(
                `--- Error ${i + 1} ---`,
                `Domain: ${err.domain || 'unknown'}`,
                `Operation: ${err.operation || 'unknown'}`,
                err.message || '(no message)',
                ''
            );
            if (err.stack) lines.push('Stack:', err.stack, '');
        }
    } else {
        // Single error (backward-compatible flat format)
        lines.push(
            `Domain: ${data.domain}`,
            `Operation: ${data.operation}`,
            '',
            '--- Message ---',
            data.message,
            ''
        );

        if (data.stack) {
            lines.push(
                '--- Stack Trace ---',
                data.stack,
                ''
            );
        }

        if (data.context) {
            lines.push(
                '--- Context ---',
                JSON.stringify(data.context, null, 2),
                ''
            );
        }
    }

    if (data.course) {
        lines.push(
            '--- Course ---',
            `Title: ${data.course.title || 'N/A'}`,
            `Version: ${data.course.version || 'N/A'}`,
            `ID: ${data.course.id || 'N/A'}`,
            ''
        );
    }

    lines.push(
        '--- Environment ---',
        `URL: ${data.url}`,
        `User Agent: ${data.userAgent}`,
        ''
    );

    return lines.join('\n');
}
