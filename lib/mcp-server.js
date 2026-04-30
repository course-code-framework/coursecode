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
    buildCourse,
    generateNarration
} from './authoring-api.js';

import headless from './headless-browser.js';
import { TOOLS, buildInstructions, getWorkflowStatusWithInstructions } from './mcp-prompts.js';

const DEFAULT_PORT = 4173;

class McpToolError extends Error {
    constructor(code, message, options = {}) {
        super(message);
        this.name = 'McpToolError';
        this.code = code;
        this.hint = options.hint;
        this.details = options.details;
    }
}

function normalizePort(port) {
    const parsed = parseInt(port ?? DEFAULT_PORT, 10);
    return Number.isFinite(parsed) ? parsed : DEFAULT_PORT;
}

function makeToolResult(result) {
    return {
        content: [{
            type: 'text',
            text: JSON.stringify(result, null, 2)
        }],
        structuredContent: result
    };
}

function normalizeToolError(error) {
    if (error instanceof McpToolError) {
        return {
            code: error.code,
            message: error.message,
            ...(error.hint ? { hint: error.hint } : {}),
            ...(error.details ? { details: error.details } : {})
        };
    }

    const message = error?.message || String(error);
    if (/Preview server not running/i.test(message)) {
        return {
            code: 'preview_not_running',
            message,
            hint: 'Start the CourseCode preview server for this project, then retry the MCP tool call.'
        };
    }

    if (/Slide ".*" not found/i.test(message)) {
        return {
            code: 'invalid_slide_id',
            message,
            hint: 'Call coursecode_state to get valid slide IDs, then retry with one of those IDs.'
        };
    }

    if (/is required|Provide either/i.test(message)) {
        return {
            code: 'invalid_arguments',
            message,
            hint: 'Check the tool input schema and retry with the required arguments.'
        };
    }

    if (/Unknown tool:/i.test(message)) {
        return {
            code: 'unknown_tool',
            message,
            hint: 'Call tools/list and retry with one of the advertised CourseCode tool names.'
        };
    }

    return {
        code: 'tool_failed',
        message,
        hint: 'Inspect the message and retry after correcting the underlying issue.'
    };
}

function makeToolErrorResult(error) {
    const normalized = normalizeToolError(error);
    const result = {
        success: false,
        error: normalized,
        code: normalized.code,
        message: normalized.message,
        ...(normalized.hint ? { hint: normalized.hint } : {}),
        ...(normalized.details ? { details: normalized.details } : {})
    };

    return {
        content: [{
            type: 'text',
            text: JSON.stringify(result, null, 2)
        }],
        structuredContent: result,
        isError: true
    };
}

function normalizeIssue(source, severity, issue) {
    const isWarning = severity === 'warning' || issue?.isWarning === true || issue?.level === 'warn';
    return {
        source,
        severity: isWarning ? 'warning' : 'error',
        isWarning,
        type: issue?.type || issue?.domain || source,
        message: issue?.message || issue?.text || String(issue),
        ...(issue?.hint ? { hint: issue.hint } : {}),
        ...(issue?.operation ? { operation: issue.operation } : {}),
        ...(issue?.time ? { time: issue.time } : {}),
        ...(issue?.timestamp ? { timestamp: issue.timestamp } : {})
    };
}

async function getLiveDiagnostics(port, frameworkLogs = []) {
    const diagnostics = {
        build: { errors: [], warnings: [] },
        runtime: { errors: [], warnings: [] },
        framework: { errors: [], warnings: [] },
        console: { errors: [], warnings: [] },
        issues: []
    };

    try {
        const buildResp = await fetch(`http://localhost:${port}/__mcp/errors`);
        if (buildResp.ok) {
            const buildData = await buildResp.json();
            diagnostics.build.errors = buildData.errors || [];
            diagnostics.build.warnings = buildData.warnings || [];
        }
    } catch {
        // Preview build diagnostics unavailable — leave empty.
    }

    try {
        const errResp = await fetch(`http://localhost:${port}/__lms/errors`);
        if (errResp.ok) {
            const errData = await errResp.json();
            diagnostics.runtime.errors = errData.errors || [];
            diagnostics.runtime.warnings = errData.warnings || [];
        }
    } catch {
        // Runtime diagnostics unavailable — leave empty.
    }

    for (const log of frameworkLogs || []) {
        if (log.level === 'warn') diagnostics.framework.warnings.push(log);
        else if (log.level === 'error' || log.level === 'fatal') diagnostics.framework.errors.push(log);
    }

    const consoleLogs = headless.getConsoleLogs();
    for (const log of consoleLogs) {
        // logger.warn/error entries are already represented as structured
        // framework diagnostics, so do not double-count their console echo.
        if (/^\[(WARN|ERROR|FATAL)\]/.test(log.text || '')) continue;
        if (log.type === 'warning') diagnostics.console.warnings.push(log);
        else diagnostics.console.errors.push(log);
    }

    diagnostics.issues = [
        ...diagnostics.build.errors.map(issue => normalizeIssue('build', 'error', issue)),
        ...diagnostics.build.warnings.map(issue => normalizeIssue('build', 'warning', issue)),
        ...diagnostics.runtime.errors.map(issue => normalizeIssue('runtime', 'error', issue)),
        ...diagnostics.runtime.warnings.map(issue => normalizeIssue('runtime', 'warning', issue)),
        ...diagnostics.framework.errors.map(issue => normalizeIssue('framework', 'error', issue)),
        ...diagnostics.framework.warnings.map(issue => normalizeIssue('framework', 'warning', issue)),
        ...diagnostics.console.errors.map(issue => normalizeIssue('console', 'error', issue)),
        ...diagnostics.console.warnings.map(issue => normalizeIssue('console', 'warning', issue))
    ];

    diagnostics.count = diagnostics.issues.length;
    diagnostics.clean = diagnostics.count === 0;
    return diagnostics;
}

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
    const port = normalizePort(options.port);
    
    // Build dynamic instructions for current authoring stage
    const instructions = await buildInstructions(port);

    const server = new Server(
        {
            name: 'coursecode',
            version: '2.0.0'
        },
        {
            instructions,
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
                    // Read API log plus a unified diagnostic rollup from the preview server/headless page.
                    try {
                        const logResp = await fetch(`http://localhost:${port}/__lms/log`);
                        result.apiLog = logResp.ok ? (await logResp.json()).entries?.slice(0, 20) || [] : [];
                    } catch {
                        result.apiLog = [];
                    }
                    result.diagnostics = await getLiveDiagnostics(port, result.frameworkLogs);
                    result.issues = result.diagnostics.issues;
                    result.errors = result.diagnostics.issues;
                    result.runtimeErrors = [
                        ...result.diagnostics.runtime.errors,
                        ...result.diagnostics.runtime.warnings
                    ];
                    result.buildErrors = result.diagnostics.build.errors;
                    result.buildWarnings = result.diagnostics.build.warnings;
                    result.consoleLogs = [
                        ...result.diagnostics.console.errors,
                        ...result.diagnostics.console.warnings
                    ];
                    break;

                case 'coursecode_navigate':
                    if (!args?.slideId) throw new McpToolError('missing_required_argument', 'slideId is required', {
                        hint: 'Call coursecode_state to get valid slide IDs, then pass one as slideId.'
                    });
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
                            throw new McpToolError('invalid_slide_id', `Slide "${args.slideId}" not found.`, {
                                hint: 'Call coursecode_state to get valid slide IDs, then retry with one of those IDs.',
                                details: { slideId: args.slideId }
                            });
                        }
                    }
                    await headless.evaluate(async (slideId) => {
                        await window.CourseCodeAutomation.goToSlide(slideId);
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
                    if (!args?.interactionId) throw new McpToolError('missing_required_argument', 'interactionId is required', {
                        hint: 'Call coursecode_state on the target slide to list valid interaction IDs.'
                    });
                    if (args.response === undefined) throw new McpToolError('missing_required_argument', 'response is required', {
                        hint: 'Pass a response value matching the interaction type.'
                    });
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
                            throw new McpToolError('invalid_slide_id', `Slide "${args.slideId}" not found.`, {
                                hint: 'Call coursecode_state to get valid slide IDs, then retry with one of those IDs.',
                                details: { slideId: args.slideId }
                            });
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
                        throw new McpToolError('missing_required_argument', 'Provide either a breakpoint name or both width and height.', {
                            hint: 'Use breakpoint: "desktop" or pass explicit width and height numbers.'
                        });
                    }
                    break;

                case 'coursecode_errors': {
                    // Live diagnostic rollup without the heavyweight state payload (TOC, interactions, etc.).
                    await ensureHeadless(port);
                    const frameworkLogs = await headless.evaluate(() => {
                        return window.CourseCodeAutomation.getFrameworkLogs();
                    });
                    const diagnostics = await getLiveDiagnostics(port, frameworkLogs);
                    result = {
                        ...diagnostics,
                        // Convenience aliases for agents that expect a flat list.
                        issues: diagnostics.issues,
                        errors: diagnostics.issues,
                        runtimeErrors: [
                            ...diagnostics.runtime.errors,
                            ...diagnostics.runtime.warnings
                        ],
                        frameworkLogs,
                        consoleLogs: [
                            ...diagnostics.console.errors,
                            ...diagnostics.console.warnings
                        ]
                    };
                    break;
                }

                // === Workflow & build tools ===
                case 'coursecode_workflow_status':
                    result = await getWorkflowStatusWithInstructions(port);
                    break;

                case 'coursecode_build':
                    result = await buildCourse(args || {});
                    break;

                // === Catalog & validation tools (filesystem, no preview needed) ===
                case 'coursecode_css_catalog':
                    result = getCssCatalog(args || {});
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

                case 'coursecode_narration':
                    result = await generateNarration({
                        dryRun: args?.dryRun === true,
                        force: args?.force === true,
                        slide: args?.slide,
                        rebuildCache: args?.rebuildCache === true
                    });
                    break;



                default:
                    throw new McpToolError('unknown_tool', `Unknown tool: ${name}`, {
                        hint: 'Call tools/list and retry with one of the advertised CourseCode tool names.',
                        details: { name }
                    });
            }

            return makeToolResult(result);
        } catch (error) {
            return makeToolErrorResult(error);
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
    const portValue = portArg ? portArg.split('=')[1] : args[args.indexOf('--port') + 1];
    const port = normalizePort(portValue);
    startMcpServer({ port });
}
