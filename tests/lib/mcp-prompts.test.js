import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { buildInstructions } from '../../lib/mcp-prompts.js';

describe('MCP instructions outside a project', () => {
    const originalCwd = process.cwd();
    const originalPlugin = process.env.COURSECODE_PLUGIN;
    let dir;

    beforeEach(() => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'coursecode-mcp-prompts-'));
        process.chdir(dir);
    });

    afterEach(() => {
        process.chdir(originalCwd);
        fs.rmSync(dir, { recursive: true, force: true });
        if (originalPlugin === undefined) delete process.env.COURSECODE_PLUGIN;
        else process.env.COURSECODE_PLUGIN = originalPlugin;
    });

    it('suggests plain create commands for a standalone server', async () => {
        delete process.env.COURSECODE_PLUGIN;
        const instructions = await buildInstructions(4173);
        expect(instructions).toContain('npx coursecode create . --blank ');
        expect(instructions).not.toContain('--plugin');
    });

    it('adds --plugin when the plugin launcher started the server', async () => {
        process.env.COURSECODE_PLUGIN = '1';
        const instructions = await buildInstructions(4173);
        expect(instructions).toContain('npx coursecode create . --plugin ');
        expect(instructions).toContain('npx coursecode create . --blank --plugin ');
    });
});
