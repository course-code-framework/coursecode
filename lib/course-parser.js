/**
 * Course Parser - Unified parsing utility for CourseCode
 * 
 * Provides a single source of truth for course data:
 * - Universal element parsing (all HTML elements with paths + offsets)
 * - Schema-driven interaction extraction
 * - Narration extraction
 * - Course config inclusion
 * 
 * Consumers: preview-server, export-content, vite-plugin, linter
 */

import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';

// =============================================================================
// PUBLIC API
// =============================================================================

/**
 * Parse an entire course
 * @param {string} coursePath - Path to course directory
 * @returns {Promise<CourseData>}
 */
export async function parseCourse(coursePath) {
    // Load config (direct import, no parsing needed)
    const configPath = path.join(coursePath, 'course-config.js');
    const configUrl = pathToFileURL(configPath).href + `?t=${Date.now()}`;
    const configModule = await import(configUrl);
    const config = configModule.courseConfig || configModule.default;



    // Parse all slides
    const slidesDir = path.join(coursePath, 'slides');
    const files = fs.existsSync(slidesDir)
        ? fs.readdirSync(slidesDir).filter(f => f.endsWith('.js'))
        : [];

    const slides = {};
    const assessments = [];

    for (const file of files) {
        const filePath = path.join(slidesDir, file);
        const slideId = path.basename(file, '.js');
        const source = fs.readFileSync(filePath, 'utf-8');

        // Check if it's an assessment
        const assessment = extractAssessment(source, slideId);
        if (assessment) {
            assessments.push(assessment);
            continue;
        }

        // Parse as regular slide
        slides[slideId] = {
            file,
            ...parseSlideSource(source, slideId)
        };
    }

    return {
        config,
        slides,
        assessments
    };
}

/**
 * Parse a single slide source (for on-demand editing)
 * @param {string} source - JavaScript source code
 * @param {string} slideId - Slide ID
 * @param {object} schemas - Interaction schemas
 * @returns {SlideData}
 */
export function parseSlideSource(source, slideId) {
    // Step 1: Extract template literals
    const templates = findTemplateAssignments(source);
    const html = templates.map(t => t.content).join('\n');

    // Step 2: Parse ALL elements universally
    const elements = parseElements(html, templates);

    // Step 3: Extract interactions (id and type only - schemas loaded at runtime)
    const interactions = extractInteractions(source, slideId);

    // Step 4: Extract narration
    const narration = extractNarration(source);

    // Step 5: Compute header convenience accessor
    const header = computeHeader(elements);

    return {
        templateHtml: templates.map(t => t.content),
        elements,
        interactions,
        narration,
        header
    };
}

/**
 * Resolve an element by its structural path
 * @param {Element[]} elements - Parsed elements array
 * @param {string} targetPath - Path like "header.0/h1.0"
 * @returns {Element|null}
 */
export function resolveElementByPath(elements, targetPath) {
    return elements.find(el => el.path === targetPath) || null;
}


// =============================================================================
// UNIVERSAL ELEMENT PARSER
// =============================================================================

/**
 * Semantic detection table - maps class/tag/attribute patterns to semantic types
 */
const SEMANTIC_PATTERNS = [
    { match: (el) => el.tag === 'h1' && el.parentPath?.includes('slide-header'), semantic: 'title' },
    { match: (el) => el.tag === 'p' && el.parentPath?.includes('slide-header'), semantic: 'description' },
    { match: (el) => el.className?.includes('callout'), semantic: 'callout' },
    { match: (el) => el.className?.includes('card') && !el.className?.includes('flip-card'), semantic: 'card' },
    { match: (el) => el.attributes?.['data-component'], semanticFn: (el) => el.attributes['data-component'] },
    { match: (el) => el.tag === 'table', semantic: 'table' },
    { match: (el) => el.className?.includes('pattern-intro-cards'), semantic: 'intro-cards' },
    { match: (el) => el.className?.includes('pattern-steps'), semantic: 'steps' },
    { match: (el) => el.className?.includes('pattern-features'), semantic: 'features' },
    { match: (el) => el.className?.includes('pattern-comparison'), semantic: 'comparison' },
    { match: (el) => el.className?.includes('pattern-stats'), semantic: 'stats' },
    { match: (el) => el.className?.includes('pattern-content-image'), semantic: 'content-image' },
    { match: (el) => el.className?.includes('pattern-hero'), semantic: 'hero' },
    { match: (el) => el.className?.includes('pattern-timeline'), semantic: 'timeline' },
    { match: (el) => el.className?.includes('pattern-quote'), semantic: 'quote' },
    { match: (el) => el.className?.includes('pattern-checklist'), semantic: 'checklist' },
    { match: (el) => el.tag === 'h2', semantic: 'heading' },
    { match: (el) => el.tag === 'h3', semantic: 'subheading' },
    { match: (el) => el.tag === 'p' && !el.parentPath?.includes('slide-header'), semantic: 'paragraph' },
    { match: (el) => el.tag === 'li', semantic: 'list-item' },
];

/**
 * Parse ALL HTML elements into a flat array with paths and offsets
 * @param {string} html - HTML content
 * @param {Array} templates - Template info with line offsets
 * @returns {Element[]}
 */
export function parseElements(html) {
    const elements = [];
    const stack = [];
    const siblingCounters = [{}];

    // Tag pattern - matches opening and closing tags
    const tagRegex = /<(\/?)([a-zA-Z][a-zA-Z0-9-]*)((?:\s+[^>]*)?)(\/?)>/g;

    // Self-closing tags
    const selfClosingTags = new Set(['br', 'hr', 'img', 'input', 'meta', 'link', 'area', 'base', 'col', 'embed', 'source', 'track', 'wbr']);

    let match;
    while ((match = tagRegex.exec(html)) !== null) {
        const [fullMatch, isClosing, tagName, attrString, isSelfClosingSlash] = match;
        const tag = tagName.toLowerCase();

        // Skip comments and non-content
        if (tag.startsWith('!')) continue;

        const isSelfClosing = isSelfClosingSlash === '/' || selfClosingTags.has(tag);

        if (isClosing) {
            // Closing tag - pop from stack and finalize element
            if (stack.length > 0) {
                const el = stack.pop();
                el.innerEnd = match.index;
                el.endOffset = match.index + fullMatch.length;
                siblingCounters.pop();
            }
        } else {
            // Opening tag - parse attributes and push to stack
            const attributes = parseAttributes(attrString);
            const className = attributes.class || '';

            // Calculate sibling index for path
            const counters = siblingCounters[siblingCounters.length - 1];
            const pathKey = className.split(' ')[0] || tag;
            counters[pathKey] = counters[pathKey] || 0;
            const siblingIndex = counters[pathKey]++;

            // Build path
            const parentPath = stack.length > 0 ? stack[stack.length - 1].path : '';
            const segment = `${pathKey}.${siblingIndex}`;
            const elementPath = parentPath ? `${parentPath}/${segment}` : segment;

            const element = {
                path: elementPath,
                parentPath,
                tag,
                className,
                attributes,
                startOffset: match.index,
                innerStart: match.index + fullMatch.length,
                innerEnd: null,
                endOffset: null,
                innerText: null,
                semantic: null
            };

            if (isSelfClosing) {
                element.innerEnd = element.innerStart;
                element.endOffset = element.innerStart;
            } else {
                stack.push(element);
                siblingCounters.push({});
            }

            elements.push(element);
        }
    }

    // Extract inner text and detect semantics for finalized elements
    for (const el of elements) {
        if (el.innerEnd !== null) {
            el.innerText = stripTags(html.slice(el.innerStart, el.innerEnd)).trim();
            el.semantic = detectSemantic(el);
        }
        el.children = []; // Initialize children array
    }

    // Build parent-child relationships
    const elementsByPath = new Map(elements.map(el => [el.path, el]));
    for (const el of elements) {
        if (el.parentPath) {
            const parent = elementsByPath.get(el.parentPath);
            if (parent) {
                parent.children.push(el);
            }
        }
    }

    return elements;
}

/**
 * Parse HTML attributes from attribute string
 * @param {string} attrString - Attribute portion of tag
 * @returns {object}
 */
function parseAttributes(attrString) {
    const attrs = {};
    if (!attrString) return attrs;

    const attrRegex = /([a-zA-Z][a-zA-Z0-9-]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
    let attrMatch;

    while ((attrMatch = attrRegex.exec(attrString)) !== null) {
        const name = attrMatch[1];
        const value = attrMatch[2] ?? attrMatch[3] ?? attrMatch[4] ?? true;
        attrs[name] = value;
    }

    return attrs;
}

/**
 * Detect semantic type for an element
 * @param {Element} el - Element to check
 * @returns {string|null}
 */
function detectSemantic(el) {
    for (const pattern of SEMANTIC_PATTERNS) {
        if (pattern.match(el)) {
            return pattern.semanticFn ? pattern.semanticFn(el) : pattern.semantic;
        }
    }
    return null;
}

/**
 * Compute header from elements (convenience accessor)
 * @param {Element[]} elements
 * @returns {{ title?: string, description?: string }}
 */
function computeHeader(elements) {
    const title = elements.find(el => el.semantic === 'title');
    const description = elements.find(el => el.semantic === 'description');

    return {
        title: title?.innerText || null,
        description: description?.innerText || null
    };
}

// =============================================================================
// TEMPLATE EXTRACTION (JS → HTML)
// =============================================================================

/**
 * Find template literal assignments (.innerHTML = `...`)
 * @param {string} source - JavaScript source code
 * @returns {Array<{start: number, end: number, content: string, lineOffset: number}>}
 */
export function findTemplateAssignments(source) {
    const templates = [];
    const pattern = /\.innerHTML\s*=\s*`/g;
    let match;

    while ((match = pattern.exec(source)) !== null) {
        const startPos = match.index + match[0].length - 1;
        const templateContent = extractTemplateLiteral(source, startPos);

        if (templateContent) {
            const lineOffset = source.substring(0, startPos).split('\n').length;
            templates.push({
                start: startPos,
                end: startPos + templateContent.length + 2,
                content: cleanTemplateString(templateContent),
                lineOffset
            });
        }
    }

    return templates;
}

/**
 * Extract a template literal starting at the opening backtick
 * @param {string} source
 * @param {number} startPos
 * @returns {string|null}
 */
function extractTemplateLiteral(source, startPos) {
    if (source[startPos] !== '`') return null;

    let i = startPos + 1;
    let depth = 0;

    while (i < source.length) {
        const char = source[i];
        const prevChar = i > 0 ? source[i - 1] : '';

        if (prevChar === '\\') { i++; continue; }
        if (char === '$' && source[i + 1] === '{') { depth++; i += 2; continue; }
        if (depth > 0) {
            if (char === '{') depth++;
            if (char === '}') depth--;
            i++;
            continue;
        }
        if (char === '`') {
            return source.slice(startPos + 1, i);
        }
        i++;
    }

    return null;
}

/**
 * Clean template string - remove ${...} expressions using brace-balanced extraction
 * @param {string} template
 * @returns {string}
 */
function cleanTemplateString(template) {
    let result = '';
    let i = 0;

    while (i < template.length) {
        if (template[i] === '$' && template[i + 1] === '{') {
            // Skip the entire ${...} expression using brace balancing
            let depth = 1;
            i += 2; // Skip past ${
            while (i < template.length && depth > 0) {
                if (template[i] === '{') depth++;
                else if (template[i] === '}') depth--;
                i++;
            }
        } else {
            result += template[i];
            i++;
        }
    }

    return result.replace(/\s+/g, ' ').trim();
}

/**
 * Strip HTML tags from string
 * @param {string} html
 * @returns {string}
 */
function stripTags(html) {
    return html.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
}

// =============================================================================
// INTERACTION EXTRACTION
// =============================================================================

// Use AST-based extractor to avoid importing runtime dependencies during build
import { getRegisteredTypes, getFullSchema, getFactoryName } from './schema-extractor.js';

/**
 * Extract interaction configs from slide source
 * Extracts id, type, AND full schema from the catalog
 * @param {string} content - Source code
 * @param {string} slideId - Slide ID
 * @returns {Array}
 */
export function extractInteractions(content, slideId) {
    const interactions = [];
    const types = getRegisteredTypes();

    for (const type of types) {
        const factoryName = getFactoryName(type);
        if (!factoryName) continue;
        
        const factoryRegex = new RegExp(`${factoryName}\\s*\\(\\s*([\\w]+|\\{)`, 'g');
        let match;

        while ((match = factoryRegex.exec(content)) !== null) {
            const configArg = match[1];
            let configObject = null;

            if (configArg === '{') {
                configObject = extractObjectLiteral(content, match.index + match[0].length - 1);
            } else {
                configObject = findVariableDefinition(content, configArg);
            }

            if (configObject) {
                const id = extractStringProperty(configObject, 'id');
                if (id) {
                    const schema = getFullSchema(type);
                    const config = parseSimpleObject(configObject);
                    interactions.push({ ...config, type, slideId, schema });
                }
            }
        }
    }

    return interactions;
}

// =============================================================================
// NARRATION EXTRACTION
// =============================================================================

/**
 * Extract narration from source
 * @param {string} source
 * @returns {Object|null}
 */
export function extractNarration(source) {
    const strippedSource = source.replace(/\/\*[\s\S]*?\*\//g, (m) => ' '.repeat(m.length));

    // Pattern 1: template literal
    const simplePattern = /export\s+const\s+narration\s*=\s*`([\s\S]*?)`;/;
    let match = simplePattern.exec(strippedSource);
    if (match) {
        const actualContent = extractTemplateLiteralAt(source, match.index + match[0].indexOf('`'));
        return { slide: (actualContent || match[1]).trim() };
    }

    // Pattern 2: string literal
    const simpleQuotePattern = /export\s+const\s+narration\s*=\s*(['"])([\s\S]*?)\1;/;
    match = simpleQuotePattern.exec(strippedSource);
    if (match) {
        return { slide: match[2].trim() };
    }

    // Pattern 3: object
    const objectPattern = /export\s+const\s+narration\s*=\s*\{/g;
    match = objectPattern.exec(strippedSource);
    if (match) {
        const objStr = extractObjectLiteral(source, match.index + match[0].length - 1);
        if (objStr) {
            return parseNarrationObject(objStr);
        }
    }

    return null;
}

function extractTemplateLiteralAt(source, pos) {
    while (pos < source.length && source[pos] !== '`') pos++;
    if (pos >= source.length) return null;
    return extractTemplateLiteral(source, pos);
}

function parseNarrationObject(objStr) {
    const result = {};
    const keyPattern = /(['"]?)(\w+|[\w-]+)\1\s*:\s*([`'"])([^]*?)\3/g;
    let match;

    while ((match = keyPattern.exec(objStr)) !== null) {
        const key = match[2];
        const value = match[4].trim();
        if (!['voice_id', 'stability', 'similarity_boost'].includes(key)) {
            result[key] = value;
        }
    }

    return Object.keys(result).length > 0 ? result : null;
}

// =============================================================================
// ASSESSMENT EXTRACTION
// =============================================================================

/**
 * Check if file is an assessment and extract config
 * @param {string} source
 * @param {string} slideId
 * @returns {object|null}
 */
export function extractAssessment(source, slideId) {
    if (!source.includes('export const config') || !source.includes('assessmentId:')) {
        return null;
    }

    const configMatch = source.match(/export\s+const\s+config\s*=\s*\{/);
    if (!configMatch) return null;

    const configStr = extractObjectLiteral(source, configMatch.index + configMatch[0].length - 1);
    if (!configStr) return null;

    const id = extractStringProperty(configStr, 'id');
    if (!id) return null;

    const assessment = {
        id,
        slideId,
        title: extractStringProperty(configStr, 'title') || id,
        settings: {},
        questions: [],
        questionBanks: []
    };

    const settingsMatch = configStr.match(/settings\s*:\s*\{/);
    if (settingsMatch) {
        const settingsStr = extractObjectLiteral(configStr, settingsMatch.index + settingsMatch[0].length - 1);
        if (settingsStr) {
            const rawSettings = {
                passingScore: extractNumberProperty(settingsStr, 'passingScore'),
                allowRetake: extractBooleanProperty(settingsStr, 'allowRetake'),
                allowReview: extractBooleanProperty(settingsStr, 'allowReview'),
                randomizeQuestions: extractBooleanProperty(settingsStr, 'randomizeQuestions'),
                showProgress: extractBooleanProperty(settingsStr, 'showProgress')
            };
            assessment.settings = Object.fromEntries(
                Object.entries(rawSettings).filter(([, v]) => v !== null)
            );
        }
    }

    // Extract questions array (direct questions)
    const questionsMatch = source.match(/const\s+questions\s*=\s*\[/);
    if (questionsMatch) {
        const questionsStr = extractArrayLiteral(source, questionsMatch.index + questionsMatch[0].length - 1);
        if (questionsStr) {
            assessment.questions = parseQuestionsArray(questionsStr, slideId);
        }
    }

    // Extract questionBanks array from config
    const questionBanksMatch = configStr.match(/questionBanks\s*:\s*\[/);
    if (questionBanksMatch) {
        const questionBanksStr = extractArrayLiteral(configStr, questionBanksMatch.index + questionBanksMatch[0].length - 1);
        if (questionBanksStr) {
            assessment.questionBanks = parseQuestionBanksArray(questionBanksStr, slideId);
        }
    }

    return assessment;
}

/**
 * Parse questions array - extracts full question objects with schema
 * @param {string} questionsStr - Array literal string
 * @param {string} slideId - Slide ID for context
 * @returns {Array}
 */
function parseQuestionsArray(questionsStr, slideId) {
    const questions = [];
    const content = questionsStr.slice(1, -1);
    let depth = 0;
    let objStart = -1;

    for (let i = 0; i < content.length; i++) {
        if (content[i] === '{') {
            if (depth === 0) objStart = i;
            depth++;
        } else if (content[i] === '}') {
            depth--;
            if (depth === 0 && objStart !== -1) {
                const objStr = content.slice(objStart, i + 1);
                const id = extractStringProperty(objStr, 'id');
                const type = extractStringProperty(objStr, 'type');

                if (id && type) {
                    const parsedQuestion = parseSimpleObject(objStr);
                    const normalizedType = type === 'multiple-choice-single' || type === 'multiple-choice-multiple'
                        ? 'multiple-choice'
                        : type;
                    const schema = getFullSchema(type) || getFullSchema(normalizedType);

                    questions.push({
                        ...parsedQuestion,
                        id,
                        type,
                        slideId,
                        schema
                    });
                }
                objStart = -1;
            }
        }
    }

    return questions;
}

/**
 * Parse questionBanks array - extracts bank metadata and nested questions
 * @param {string} questionBanksStr - Array literal string
 * @param {string} slideId - Slide ID for context
 * @returns {Array}
 */
function parseQuestionBanksArray(questionBanksStr, slideId) {
    const banks = [];
    const content = questionBanksStr.slice(1, -1); // Remove outer brackets
    let depth = 0;
    let bankStart = -1;

    for (let i = 0; i < content.length; i++) {
        if (content[i] === '{') {
            if (depth === 0) bankStart = i;
            depth++;
        } else if (content[i] === '}') {
            depth--;
            if (depth === 0 && bankStart !== -1) {
                const bankStr = content.slice(bankStart, i + 1);

                // Extract bank metadata
                const bankId = extractStringProperty(bankStr, 'id');
                const selectCount = extractNumberProperty(bankStr, 'selectCount');

                // Extract nested questions array
                const questionsMatch = bankStr.match(/questions\s*:\s*\[/);
                let questions = [];
                if (questionsMatch) {
                    const questionsStr = extractArrayLiteral(bankStr, questionsMatch.index + questionsMatch[0].length - 1);
                    if (questionsStr) {
                        questions = parseQuestionsArray(questionsStr, slideId);
                    }
                }

                if (bankId) {
                    banks.push({
                        id: bankId,
                        selectCount: selectCount || questions.length,
                        questions: questions
                    });
                }

                bankStart = -1;
            }
        }
    }

    return banks;
}

// =============================================================================
// LOW-LEVEL UTILITIES
// =============================================================================

/**
 * Escape special regex characters in a string
 * @param {string} str
 * @returns {string}
 */
function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function extractObjectLiteral(content, startPos) {
    if (content[startPos] !== '{') return null;

    let depth = 0;
    let inString = false;
    let stringChar = null;

    for (let i = startPos; i < content.length; i++) {
        const char = content[i];
        const prevChar = i > 0 ? content[i - 1] : '';

        if ((char === '"' || char === "'" || char === '`') && prevChar !== '\\') {
            if (!inString) { inString = true; stringChar = char; }
            else if (char === stringChar) { inString = false; stringChar = null; }
        }

        if (!inString) {
            if (char === '{' || char === '[') depth++;
            if (char === '}' || char === ']') depth--;
            if (depth === 0) return content.slice(startPos, i + 1);
        }
    }

    return null;
}

export function extractArrayLiteral(content, startPos) {
    if (content[startPos] !== '[') return null;

    let depth = 0;
    let inString = false;
    let stringChar = null;

    for (let i = startPos; i < content.length; i++) {
        const char = content[i];
        const prevChar = i > 0 ? content[i - 1] : '';

        if ((char === '"' || char === "'" || char === '`') && prevChar !== '\\') {
            if (!inString) { inString = true; stringChar = char; }
            else if (char === stringChar) { inString = false; stringChar = null; }
        }

        if (!inString) {
            if (char === '[' || char === '{') depth++;
            if (char === ']' || char === '}') depth--;
            if (depth === 0 && char === ']') return content.slice(startPos, i + 1);
        }
    }

    return null;
}

export function findVariableDefinition(content, varName) {
    const regex = new RegExp(`(?:const|let|var)\\s+${varName}\\s*=\\s*\\{`, 'g');
    const match = regex.exec(content);
    if (match) return extractObjectLiteral(content, match.index + match[0].length - 1);
    return null;
}

function extractStringProperty(configStr, propName) {
    const escapedName = escapeRegex(propName);
    const regex = new RegExp(`${escapedName}\\s*:\\s*(['"\`])([\\s\\S]*?)\\1`);
    const match = configStr.match(regex);
    return match ? match[2] : null;
}

function extractNumberProperty(configStr, propName) {
    const escapedName = escapeRegex(propName);
    const regex = new RegExp(`${escapedName}\\s*:\\s*(-?[\\d.]+)`);
    const match = configStr.match(regex);
    return match ? parseFloat(match[1]) : null;
}

function extractBooleanProperty(configStr, propName) {
    const escapedName = escapeRegex(propName);
    const regex = new RegExp(`${escapedName}\\s*:\\s*(true|false)`);
    const match = configStr.match(regex);
    return match ? match[1] === 'true' : null;
}



/**
 * Parse a simple object literal, handling strings with proper quote matching
 * @param {string} objStr - Object literal string including braces
 * @returns {object}
 */
function parseSimpleObject(objStr) {
    const result = {};
    const content = objStr.slice(1, -1); // Remove outer braces

    let i = 0;
    while (i < content.length) {
        // Skip whitespace
        while (i < content.length && /\s/.test(content[i])) i++;
        if (i >= content.length) break;

        // Parse property name (identifier)
        const nameMatch = content.slice(i).match(/^(\w+)\s*:/);
        if (!nameMatch) { i++; continue; }

        const propName = nameMatch[1];
        i += nameMatch[0].length;

        // Skip whitespace after colon
        while (i < content.length && /\s/.test(content[i])) i++;

        const char = content[i];

        // String value
        if (char === '"' || char === "'" || char === '`') {
            const quote = char;
            let value = '';
            i++; // Skip opening quote
            while (i < content.length) {
                if (content[i] === '\\' && i + 1 < content.length) {
                    // Handle escape sequences
                    value += content[i + 1];
                    i += 2;
                } else if (content[i] === quote) {
                    i++; // Skip closing quote
                    break;
                } else {
                    value += content[i];
                    i++;
                }
            }
            result[propName] = value;
        }
        // Boolean value
        else if (content.slice(i, i + 4) === 'true') {
            result[propName] = true;
            i += 4;
        }
        else if (content.slice(i, i + 5) === 'false') {
            result[propName] = false;
            i += 5;
        }
        // Number value
        else if (/[-\d]/.test(char)) {
            const numMatch = content.slice(i).match(/^-?\d+\.?\d*/);
            if (numMatch) {
                result[propName] = parseFloat(numMatch[0]);
                i += numMatch[0].length;
            }
        }
        // Array value - use brace-balanced extraction
        else if (char === '[') {
            const arrayStr = extractArrayLiteral(content, i);
            if (arrayStr) {
                result[propName] = parseSimpleArray(arrayStr);
                i += arrayStr.length;
            }
        }
        // Nested object - use brace-balanced extraction
        else if (char === '{') {
            const nestedStr = extractObjectLiteral(content, i);
            if (nestedStr) {
                result[propName] = parseSimpleObject(nestedStr);
                i += nestedStr.length;
            }
        }
        else {
            i++;
        }

        // Skip comma and whitespace
        while (i < content.length && (content[i] === ',' || /\s/.test(content[i]))) i++;
    }

    return result;
}

/**
 * Parse a simple array literal
 * @param {string} arrayStr - Array literal string including brackets
 * @returns {Array}
 */
function parseSimpleArray(arrayStr) {
    const values = [];
    const content = arrayStr.slice(1, -1); // Remove brackets

    let i = 0;
    while (i < content.length) {
        // Skip whitespace and commas
        while (i < content.length && (/\s/.test(content[i]) || content[i] === ',')) i++;
        if (i >= content.length) break;

        const char = content[i];

        // String value
        if (char === '"' || char === "'" || char === '`') {
            const quote = char;
            let value = '';
            i++;
            while (i < content.length) {
                if (content[i] === '\\' && i + 1 < content.length) {
                    value += content[i + 1];
                    i += 2;
                } else if (content[i] === quote) {
                    i++;
                    break;
                } else {
                    value += content[i];
                    i++;
                }
            }
            values.push(value);
        }
        // Number
        else if (/[-\d]/.test(char)) {
            const numMatch = content.slice(i).match(/^-?\d+\.?\d*/);
            if (numMatch) {
                values.push(parseFloat(numMatch[0]));
                i += numMatch[0].length;
            }
        }
        // Boolean
        else if (content.slice(i, i + 4) === 'true') {
            values.push(true);
            i += 4;
        }
        else if (content.slice(i, i + 5) === 'false') {
            values.push(false);
            i += 5;
        }
        // Nested object
        else if (char === '{') {
            const objStr = extractObjectLiteral(content, i);
            if (objStr) {
                values.push(parseSimpleObject(objStr));
                i += objStr.length;
            }
        }
        // Nested array
        else if (char === '[') {
            const nestedArr = extractArrayLiteral(content, i);
            if (nestedArr) {
                values.push(parseSimpleArray(nestedArr));
                i += nestedArr.length;
            }
        }
        else {
            i++;
        }
    }

    return values;
}
