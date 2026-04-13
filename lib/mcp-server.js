#!/usr/bin/env node

/**
 * MCP Server for CourseCode
 * 
 * Standalone Model Context Protocol server with persistent headless browser.
 * Runtime tools (state, navigate, interact, screenshot) execute directly in
 * a headless Chrome via puppeteer. Authoring tools work on the filesystem.
 * 
 * The MCP never starts its own preview server — it connects to one that's
 * already running (started by the human or via `coursecode preview`).
 * 
 * Tool definitions and instructions live in mcp-prompts.js.
 * 
 * Usage: coursecode mcp [--port 4173]
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
    CallToolRequestSchema,
    ListToolsRequestSchema
} from '@modelcontextprotocol/sdk/types.js';
import {
    getCssCatalog,
    getPreviewStatus,
    getComponentCatalog,
    getInteractionCatalog,
    getIconCatalog,
    lintCourse,
    buildCourse
} from './authoring-api.js';
import { getContentExport } from './export-content.js';
import headless from './headless-browser.js';
import { TOOLS, buildInstructions, getWorkflowStatusWithInstructions } from './mcp-prompts.js';

const DEFAULT_PORT = 4173;

/**
 * Ensure headless browser is connected to preview server.
 * Fails fast if preview is not running — humans own the preview lifecycle.
 */
async function ensureHeadless(port) {
    if (!headless.isRunning()) {
        const status = await getPreviewStatus(port);
        if (!status.running) {
            throw new Error(
                'Preview server not running. Start it first:\n' +
                '  • Human: run `coursecode preview` in a terminal\n' +
                '  • AI agent: use your terminal/command execution tool to run `coursecode preview`\n' +
                'Then retry this tool call.'
            );
        }
        await headless.launch(port);
    }
}

/**
 * Create and run the MCP server
 */
export async function startMcpServer(options = {}) {
    const port = options.port || DEFAULT_PORT;
    
    // Build dynamic instructions for current authoring stage
    const instructions = await buildInstructions(port);

    const server = new Server(
        {
            name: 'coursecode',
            version: '2.0.0',
            instructions
        },
        {
            capabilities: {
                tools: {}
            }
        }
    );

    // ========================================
    // Tool Request Handlers
    // ========================================
    server.setRequestHandler(ListToolsRequestSchema, async () => {
        return { tools: TOOLS };
    });

    server.setRequestHandler(CallToolRequestSchema, async (request) => {
        const { name, arguments: args } = request.params;
        
        try {
            let result;
            
            switch (name) {
                // === Runtime tools (headless browser) ===
                case 'coursecode_state':
                    await ensureHeadless(port);
                    result = await headless.evaluate(() => {
                        const api = window.CourseCodeAutomation;
                        return {
                            slide: api.getCurrentSlide(),
                            toc: api.getToc(),
                            interactions: api.listInteractions(),
                            engagement: api.getEngagementState(),
                            frameworkLogs: api.getFrameworkLogs(),
                            lmsState: api.getLmsState()
                        };
                    });
                    // Read API log and error log from preview server (same data user sees in debug panel)
                    try {
                        const [logResp, errResp] = await Promise.all([
                            fetch(`http://localhost:${port}/__lms/log`),
                            fetch(`http://localhost:${port}/__lms/errors`)
                        ]);
                        result.apiLog = logResp.ok ? (await logResp.json()).entries?.slice(0, 20) || [] : [];
                        if (errResp.ok) {
                            const errData = await errResp.json();
                            result.errors = [...(errData.errors || []), ...(errData.warnings || [])];
                        } else {
                            result.errors = [];
                        }
                    } catch {
                        result.apiLog = [];
                        result.errors = [];
                    }
                    // Append console errors/warnings captured from the page
                    result.consoleLogs = headless.getConsoleLogs();
                    break;

                case 'coursecode_navigate':
                    if (!args?.slideId) throw new Error('slideId is required');
                    await ensureHeadless(port);
                    // Apply accessibility preferences before navigation
                    if (args.theme || args.highContrast !== undefined) {
                        await headless.evaluate(({ theme, highContrast }) => {
                            const api = window.CourseCodeAutomation;
                            if (theme) api.setAccessibilityPreference('theme', theme);
                            if (highContrast !== undefined) api.setAccessibilityPreference('highContrast', highContrast);
                        }, { theme: args.theme, highContrast: args.highContrast });
                        // Allow DOM to update after preference change
                        await new Promise(resolve => setTimeout(resolve, 50));
                    }
                    // Validate slide ID exists before navigating (avoids EventBus error cascades)
                    {
                        const validSlide = await headless.evaluate((slideId) => {
                            const toc = window.CourseCodeAutomation.getToc();
                            return toc.some(item => item.id === slideId);
                        }, args.slideId);
                        if (!validSlide) {
                            throw new Error(`Slide "${args.slideId}" not found. Use coursecode_state to get valid slide IDs.`);
                        }
                    }
                    await headless.evaluate((slideId) => {
                        window.CourseCodeAutomation.goToSlide(slideId);
                    }, args.slideId);
                    // State updates asynchronously after navigation
                    await new Promise(resolve => setTimeout(resolve, 50));
                    result = await headless.evaluate(() => {
                        const api = window.CourseCodeAutomation;
                        return {
                            slide: api.getCurrentSlide(),
                            interactions: api.listInteractions(),
                            engagement: api.getEngagementState(),
                            accessibility: api.getAccessibilityState()
                        };
                    });
                    break;

                case 'coursecode_interact':
                    if (!args?.interactionId) throw new Error('interactionId is required');
                    if (args.response === undefined) throw new Error('response is required');
                    await ensureHeadless(port);
                    result = await headless.evaluate(({ interactionId, response }) => {
                        const api = window.CourseCodeAutomation;
                        api.setResponse(interactionId, response);
                        const checkResult = api.checkAnswer(interactionId);
                        return {
                            ...checkResult,
                            state: {
                                slide: api.getCurrentSlide(),
                                interactions: api.listInteractions()
                            }
                        };
                    }, { interactionId: args.interactionId, response: args.response });
                    break;

                case 'coursecode_reset':
                    await ensureHeadless(port);
                    await headless.evaluate(() => {
                        localStorage.clear();
                    });
                    // Full browser restart to ensure clean state
                    await headless.shutdown();
                    await headless.launch(port);
                    result = { reset: true };
                    break;

                case 'coursecode_screenshot':
                    await ensureHeadless(port);
                    // Validate slide ID if provided (same guard as navigate)
                    if (args?.slideId) {
                        const validSlide = await headless.evaluate((slideId) => {
                            const toc = window.CourseCodeAutomation.getToc();
                            return toc.some(item => item.id === slideId);
                        }, args.slideId);
                        if (!validSlide) {
                            throw new Error(`Slide "${args.slideId}" not found. Use coursecode_state to get valid slide IDs.`);
                        }
                    }
                    result = await headless.screenshot({
                        slideId: args?.slideId,
                        fullPage: args?.fullPage,
                        detailed: args?.detailed,
                        scrollY: args?.scrollY
                    });
                    return {
                        content: [{
                            type: 'image',
                            data: result.data,
                            mimeType: result.mimeType
                        }]
                    };

                case 'coursecode_viewport':
                    await ensureHeadless(port);
                    if (args?.breakpoint) {
                        result = await headless.setViewport(args.breakpoint);
                    } else if (args?.width && args?.height) {
                        result = await headless.setViewport({ width: args.width, height: args.height });
                    } else {
                        throw new Error('Provide either a breakpoint name or both width and height.');
                    }
                    break;

                // === Workflow & build tools ===
                case 'coursecode_workflow_status':
                    result = await getWorkflowStatusWithInstructions(port);
                    break;

                case 'coursecode_build':
                    result = await buildCourse(args || {});
                    break;

                // === Catalog & validation tools (filesystem, no preview needed) ===
                case 'coursecode_css_catalog':
                    result = getCssCatalog(args?.category);
                    break;

                case 'coursecode_component_catalog':
                    result = getComponentCatalog(args?.type);
                    break;
                case 'coursecode_interaction_catalog':
                    result = getInteractionCatalog(args?.type);
                    break;
                case 'coursecode_icon_catalog':
                    result = getIconCatalog(args?.name);
                    break;
                case 'coursecode_lint':
                    result = await lintCourse();
                    break;

                case 'coursecode_export_content':
                    result = await getContentExport(args || {});
                    if (result === null) {
                        throw new Error('Failed to export content. Ensure course-config.js exists in course/');
                    }
                    return {
                        content: [{
                            type: 'text',
                            text: result
                        }]
                    };

                default:
                    throw new Error(`Unknown tool: ${name}`);
            }
            
            return {
                content: [{
                    type: 'text',
                    text: JSON.stringify(result, null, 2)
                }]
            };
        } catch (error) {
            return {
                content: [{
                    type: 'text',
                    text: `Error: ${error.message}`
                }],
                isError: true
            };
        }
    });

    // Graceful shutdown — clean up headless browser only.
    // browser.close() tears down the entire Chrome process tree (parent + all
    // child processes like GPU, renderer, utility). No manual PID hunting needed.
    let cleaningUp = false;
    const cleanup = async () => {
        if (cleaningUp) return;
        cleaningUp = true;
        if (headless.isRunning()) {
            await headless.shutdown();
        }
    };

    process.on('SIGINT', async () => { await cleanup(); process.exit(0); });
    process.on('SIGTERM', async () => { await cleanup(); process.exit(0); });

    // Detect MCP host disconnect — when the IDE/editor drops the stdio pipe,
    // stdin emits 'close'. This is the primary cleanup signal since SIGINT/SIGTERM
    // are NOT sent when the host simply closes the transport.
    process.stdin.on('close', async () => { await cleanup(); process.exit(0); });

    process.on('uncaughtException', async (err) => {
        process.stderr.write(`MCP uncaught exception: ${err.message}\n`);
        await cleanup();
        process.exit(1);
    });
    process.on('unhandledRejection', async (err) => {
        process.stderr.write(`MCP unhandled rejection: ${err}\n`);
        await cleanup();
        process.exit(1);
    });

    // Start the server
    const transport = new StdioServerTransport();
    await server.connect(transport);
}

// CLI entry point
if (process.argv[1]?.endsWith('mcp-server.js')) {
    const args = process.argv.slice(2);
    const portArg = args.find(a => a.startsWith('--port='));
    const port = portArg ? parseInt(portArg.split('=')[1], 10) : DEFAULT_PORT;
    startMcpServer({ port });
}
