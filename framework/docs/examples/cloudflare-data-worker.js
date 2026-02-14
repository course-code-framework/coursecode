/**
 * Cloudflare Worker - Course Data Reporting Endpoint
 * 
 * Receives batched learning records (assessments, objectives, interactions) 
 * from courses and stores them for analytics or forwards to your data warehouse.
 * Self-hosted/manual endpoint example: on CourseCode Cloud, runtime endpoints/API key are injected
 * by the platform and override course-config.js endpoint values.
 * Use this either for self-hosted telemetry, or as a downstream target if Cloud fans out records server-side.
 * 
 * SETUP:
 * 1. Create a Cloudflare account and go to Workers & Pages
 * 2. Create a new Worker and paste this code
 * 3. (Optional) Add KV namespace for storage, or forward to your API
 * 4. Add COURSE_API_KEY secret in Settings > Variables (optional, for auth)
 * 5. Deploy and copy your worker URL
 * 6. Add the URL to course-config.js:
 *    environment: {
 *        dataReporting: {
 *            endpoint: 'https://your-worker.your-subdomain.workers.dev',
 *            apiKey: 'your-shared-secret',  // Must match COURSE_API_KEY secret
 *            batchSize: 10,
 *            flushInterval: 30000
 *        }
 *    }
 * 
 * PAYLOAD FORMAT:
 * {
 *   records: [
 *     { type: 'assessment', data: { assessmentId, score, passed, ... }, timestamp },
 *     { type: 'objective', data: { objectiveId, completion_status, ... }, timestamp },
 *     { type: 'interaction', data: { interactionId, type, result, ... }, timestamp }
 *   ],
 *   course: { title, version, id },
 *   sentAt: '2024-01-15T10:30:00.000Z'
 * }
 * 
 * FREE TIER LIMITS:
 * - Cloudflare Workers: 100,000 requests/day
 * - KV Storage: 100,000 reads/day, 1,000 writes/day
 */

export default {
    async fetch(request, env) {
        const corsHeaders = {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        };

        if (request.method === 'OPTIONS') {
            return new Response(null, { headers: corsHeaders });
        }

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

            // Log for debugging (visible in Cloudflare dashboard)
            console.warn(`[Data Worker] Received ${data.records?.length || 0} records from ${data.course?.title || 'Unknown Course'}`);

            // Option 1: Store in KV (simple, built-in)
            // Uncomment and bind a KV namespace called DATA_STORE
            // const key = `${data.course?.id || 'unknown'}_${Date.now()}`;
            // await env.DATA_STORE.put(key, JSON.stringify(data), { expirationTtl: 86400 * 30 });

            // Option 2: Forward to your API/webhook
            // await fetch('https://your-api.com/learning-data', {
            //     method: 'POST',
            //     headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${env.API_KEY}` },
            //     body: JSON.stringify(data)
            // });

            // Option 3: Insert into D1 database (Cloudflare's SQLite)
            // await env.DB.prepare('INSERT INTO records (course_id, data, created_at) VALUES (?, ?, ?)')
            //     .bind(data.course?.id, JSON.stringify(data.records), data.sentAt)
            //     .run();

            return new Response(JSON.stringify({ success: true, count: data.records?.length }), {
                status: 200,
                headers: { 'Content-Type': 'application/json', ...corsHeaders }
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
