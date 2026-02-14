/**
 * Cloudflare Worker + Durable Object - Generic Pub/Sub Channel Relay
 * 
 * Content-agnostic message fan-out. Receives JSON via POST, broadcasts to all
 * connected SSE clients on the same channel. Does not parse or interpret messages.
 * Self-hosted/manual relay example: on CourseCode Cloud, runtime channel endpoint/id are injected
 * by the platform and override course-config.js endpoint values.
 * Use this either for self-hosted relay infrastructure, or as a cloud-managed relay implementation/reference.
 * 
 * SETUP:
 * 1. Create a Cloudflare account and go to Workers & Pages
 * 2. Create a new Worker and paste this code
 * 3. Add Durable Object binding in wrangler.toml:
 *    [[durable_objects.bindings]]
 *    name = "CHANNEL"
 *    class_name = "ChannelRelay"
 *    
 *    [[migrations]]
 *    tag = "v1"
 *    new_classes = ["ChannelRelay"]
 * 4. Add COURSE_API_KEY secret in Settings > Variables (optional, for auth)
 * 5. Deploy and copy your worker URL
 * 6. Add the URL to course-config.js:
 *    environment: {
 *        channel: {
 *            endpoint: 'https://your-worker.your-subdomain.workers.dev',
 *            apiKey: 'your-shared-secret',  // Must match COURSE_API_KEY secret
 *            channelId: 'my-session-123'
 *        }
 *    }
 * 
 * ENDPOINTS:
 *   POST /:channelId  — publish a JSON message to all listeners
 *   GET  /:channelId  — SSE stream, receive all messages on that channel
 * 
 * FREE TIER LIMITS:
 * - Cloudflare Workers: 100,000 requests/day
 * - Durable Objects: 1M requests/month (paid plan required for production)
 */

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export default {
    async fetch(request, env) {
        if (request.method === 'OPTIONS') {
            return new Response(null, { headers: corsHeaders });
        }

        // Extract channelId from URL path
        const url = new URL(request.url);
        const channelId = url.pathname.replace(/^\/+/, '');

        if (!channelId) {
            return new Response('Missing channelId in URL path', {
                status: 400,
                headers: corsHeaders
            });
        }

        // Validate API key if configured
        if (env.COURSE_API_KEY) {
            // POST uses Authorization header; SSE GET uses ?token= param (EventSource can't send headers)
            const auth = request.method === 'GET'
                ? url.searchParams.get('token')
                : request.headers.get('Authorization')?.replace('Bearer ', '');
            if (!auth || auth !== env.COURSE_API_KEY) {
                return new Response('Unauthorized', { status: 401, headers: corsHeaders });
            }
        }

        // Route to Durable Object for this channel
        const id = env.CHANNEL.idFromName(channelId);
        const stub = env.CHANNEL.get(id);
        return stub.fetch(request);
    }
};

/**
 * Durable Object — one instance per channelId
 * Holds connected SSE clients and fans out messages.
 */
export class ChannelRelay {
    constructor() {
        this.clients = new Set();
    }

    async fetch(request) {
        if (request.method === 'GET') {
            return this.handleSSE();
        }

        if (request.method === 'POST') {
            return this.handlePublish(request);
        }

        return new Response('Method not allowed', {
            status: 405,
            headers: corsHeaders
        });
    }

    /**
     * SSE connection — client listens for messages
     */
    handleSSE() {
        const { readable, writable } = new TransformStream();
        const writer = writable.getWriter();
        const encoder = new TextEncoder();

        // Track this client
        const client = { writer, encoder };
        this.clients.add(client);

        // Send keepalive comment every 30s to prevent timeout
        const keepalive = setInterval(() => {
            writer.write(encoder.encode(': keepalive\n\n')).catch(() => {
                clearInterval(keepalive);
                this.clients.delete(client);
            });
        }, 30000);

        // Clean up when client disconnects
        request?.signal?.addEventListener?.('abort', () => {
            clearInterval(keepalive);
            this.clients.delete(client);
            writer.close().catch(() => {});
        });

        return new Response(readable, {
            status: 200,
            headers: {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive',
                ...corsHeaders
            }
        });
    }

    /**
     * Publish — fan out message to all connected SSE clients
     */
    async handlePublish(request) {
        const data = await request.text();

        // Fan out to all connected clients
        const message = `data: ${data}\n\n`;
        const dead = [];

        for (const client of this.clients) {
            try {
                await client.writer.write(client.encoder.encode(message));
            } catch {
                dead.push(client);
            }
        }

        // Clean up disconnected clients
        for (const client of dead) {
            this.clients.delete(client);
        }

        return new Response(JSON.stringify({ success: true, listeners: this.clients.size }), {
            status: 200,
            headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
    }
}
