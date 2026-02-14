import { describe, it, expect } from 'vitest';
import {
    parseElements,
    findTemplateAssignments,
    parseSlideSource,
    resolveElementByPath,
    extractObjectLiteral,
    extractArrayLiteral,
    findVariableDefinition,
    extractNarration,
    extractAssessment
} from '../../lib/course-parser.js';

// ─── parseElements (HTML → structured model) ────────────────────────
// This is the parser that powers the preview server's content editing,
// the linter's structural checks, and the MCP server's content inspection.

describe('parseElements', () => {
    it('parses a simple element', () => {
        const elements = parseElements('<h1>Hello</h1>');
        expect(elements).toHaveLength(1);
        expect(elements[0].tag).toBe('h1');
        expect(elements[0].innerText).toBe('Hello');
    });

    it('parses nested elements with paths', () => {
        const html = '<div class="slide-header"><h1>Title</h1><p>Subtitle</p></div>';
        const elements = parseElements(html);
        expect(elements.length).toBeGreaterThanOrEqual(3);
        // First element should be the div
        expect(elements[0].tag).toBe('div');
        expect(elements[0].className).toBe('slide-header');
    });

    it('builds parent-child relationships', () => {
        const html = '<div><p>Child</p></div>';
        const elements = parseElements(html);
        const div = elements.find(el => el.tag === 'div');
        expect(div.children).toHaveLength(1);
        expect(div.children[0].tag).toBe('p');
    });

    it('handles self-closing tags (img, br, hr)', () => {
        const html = '<div><img src="test.jpg"/><p>Text</p></div>';
        const elements = parseElements(html);
        const img = elements.find(el => el.tag === 'img');
        expect(img).toBeDefined();
        expect(img.attributes.src).toBe('test.jpg');
    });

    it('detects data-component attributes as semantic type', () => {
        const html = '<div data-component="tabs"><p>Tab content</p></div>';
        const elements = parseElements(html);
        const component = elements.find(el => el.attributes['data-component']);
        expect(component.semantic).toBe('tabs');
    });

    it('detects semantic patterns for slide-header', () => {
        const html = '<section class="slide-header"><h1>My Title</h1><p>Description</p></section>';
        const elements = parseElements(html);
        const title = elements.find(el => el.semantic === 'title');
        expect(title).toBeDefined();
        expect(title.innerText).toBe('My Title');
    });

    it('returns empty array for empty HTML', () => {
        expect(parseElements('')).toEqual([]);
    });

    it('parses CSS classes and attributes', () => {
        const html = '<div class="callout warning" id="tip-1">Tip content</div>';
        const elements = parseElements(html);
        expect(elements[0].className).toBe('callout warning');
        expect(elements[0].attributes.id).toBe('tip-1');
        expect(elements[0].semantic).toBe('callout');
    });
});

// ─── resolveElementByPath ───────────────────────────────────────────

describe('resolveElementByPath', () => {
    it('finds element by exact path', () => {
        const elements = parseElements('<div class="slide-header"><h1>Title</h1></div>');
        const h1 = elements.find(el => el.tag === 'h1');
        expect(resolveElementByPath(elements, h1.path)).toBe(h1);
    });

    it('returns null for non-existent path', () => {
        const elements = parseElements('<p>Test</p>');
        expect(resolveElementByPath(elements, 'nonexistent.0')).toBeNull();
    });
});

// ─── findTemplateAssignments ────────────────────────────────────────

describe('findTemplateAssignments', () => {
    it('extracts .innerHTML template literals', () => {
        const source = `
            el.innerHTML = \`<div class="content">
                <h1>Title</h1>
            </div>\`;
        `;
        const templates = findTemplateAssignments(source);
        expect(templates).toHaveLength(1);
        expect(templates[0].content).toContain('Title');
    });

    it('handles multiple template assignments', () => {
        const source = `
            header.innerHTML = \`<h1>Header</h1>\`;
            body.innerHTML = \`<p>Body</p>\`;
        `;
        const templates = findTemplateAssignments(source);
        expect(templates).toHaveLength(2);
    });

    it('cleans ${expressions} from templates', () => {
        const source = `
            el.innerHTML = \`<p>\${someVariable}</p>\`;
        `;
        const templates = findTemplateAssignments(source);
        expect(templates[0].content).not.toContain('${');
    });

    it('returns empty array for source without templates', () => {
        expect(findTemplateAssignments('const x = 42;')).toEqual([]);
    });
});

// ─── parseSlideSource ───────────────────────────────────────────────

describe('parseSlideSource', () => {
    it('returns structured data from slide source', () => {
        const source = `
            export function mount(el) {
                el.innerHTML = \`
                    <section class="slide-header">
                        <h1>Welcome</h1>
                    </section>
                    <div class="slide-body">
                        <p>Content here</p>
                    </div>
                \`;
            }
        `;
        const result = parseSlideSource(source, 'intro');
        expect(result.templateHtml).toHaveLength(1);
        expect(result.elements.length).toBeGreaterThan(0);
        expect(result.header.title).toBe('Welcome');
    });

    it('extracts narration when present', () => {
        const source = `
            export const narration = "This is the introduction slide.";
            export function mount(el) {
                el.innerHTML = \`<p>Content</p>\`;
            }
        `;
        const result = parseSlideSource(source, 'intro');
        expect(result.narration).toBeDefined();
        expect(result.narration.slide).toBe('This is the introduction slide.');
    });

    it('returns null narration when not present', () => {
        const source = `
            export function mount(el) {
                el.innerHTML = \`<p>Simple</p>\`;
            }
        `;
        const result = parseSlideSource(source, 'simple');
        expect(result.narration).toBeNull();
    });
});

// ─── extractObjectLiteral / extractArrayLiteral ─────────────────────

describe('extractObjectLiteral', () => {
    it('extracts balanced object', () => {
        const content = '{ a: 1, b: { c: 2 } }';
        expect(extractObjectLiteral(content, 0)).toBe(content);
    });

    it('returns null when not starting with {', () => {
        expect(extractObjectLiteral('123', 0)).toBeNull();
    });

    it('handles strings with braces', () => {
        const content = '{ name: "{hello}" }';
        expect(extractObjectLiteral(content, 0)).toBe(content);
    });
});

describe('extractArrayLiteral', () => {
    it('extracts balanced array', () => {
        const content = '["a", "b", "c"]';
        expect(extractArrayLiteral(content, 0)).toBe(content);
    });

    it('handles nested arrays', () => {
        const content = '[[1, 2], [3, 4]]';
        expect(extractArrayLiteral(content, 0)).toBe(content);
    });
});

// ─── findVariableDefinition ─────────────────────────────────────────

describe('findVariableDefinition', () => {
    it('finds const declarations', () => {
        const source = 'const config = { id: "test", type: "quiz" };';
        const result = findVariableDefinition(source, 'config');
        expect(result).toContain('test');
    });

    it('returns null for undefined variable', () => {
        expect(findVariableDefinition('const x = 1;', 'config')).toBeNull();
    });
});

// ─── extractNarration ───────────────────────────────────────────────

describe('extractNarration', () => {
    it('extracts template literal narration', () => {
        const source = 'export const narration = `Welcome to the course.`;';
        const result = extractNarration(source);
        expect(result.slide).toBe('Welcome to the course.');
    });

    it('extracts string literal narration', () => {
        const source = "export const narration = 'Hello learner.';";
        const result = extractNarration(source);
        expect(result.slide).toBe('Hello learner.');
    });

    it('extracts object narration', () => {
        const source = `export const narration = {
            slide: 'Main narration text',
            voice_id: 'abc123'
        };`;
        const result = extractNarration(source);
        expect(result.slide).toBe('Main narration text');
        // voice_id should NOT be in the result
        expect(result.voice_id).toBeUndefined();
    });

    it('returns null when no narration present', () => {
        expect(extractNarration('export function mount(el) {}')).toBeNull();
    });
});

// ─── extractAssessment ──────────────────────────────────────────────

describe('extractAssessment', () => {
    it('extracts assessment config from source', () => {
        const source = `
            export const config = {
                id: 'quiz-final',
                assessmentId: 'quiz-final',
                title: 'Final Quiz',
                settings: {
                    passingScore: 80,
                    allowRetake: true
                }
            };
            const questions = [
                { id: 'q1', type: 'true-false', prompt: 'The sky is blue', weight: 1, correctAnswer: true },
                { id: 'q2', type: 'multiple-choice', prompt: 'Pick color', weight: 1 }
            ];
        `;
        const result = extractAssessment(source, 'final-quiz');
        expect(result).not.toBeNull();
        expect(result.id).toBe('quiz-final');
        expect(result.title).toBe('Final Quiz');
        expect(result.settings.passingScore).toBe(80);
        expect(result.settings.allowRetake).toBe(true);
        expect(result.questions).toHaveLength(2);
        expect(result.questions[0].id).toBe('q1');
    });

    it('returns null for non-assessment source', () => {
        const source = 'export function mount(el) { el.innerHTML = `<p>Hi</p>`; }';
        expect(extractAssessment(source, 'intro')).toBeNull();
    });

    it('returns null when no assessmentId marker', () => {
        const source = 'export const config = { id: "test" };';
        expect(extractAssessment(source, 'test')).toBeNull();
    });
});
