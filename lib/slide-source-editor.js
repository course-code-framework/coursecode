/**
 * Slide Source Editor
 * 
 * Pure functions for editing content inside slide .js source files and theme.css.
 * Operates at the source-text level using regex and template parsing.
 * No HTTP concerns — takes inputs, returns results or throws.
 * 
 * For config-object edits (course-config.js), use course-writer.js instead.
 */

import fs from 'fs';
import path from 'path';

// =============================================================================
// THEME EDITING
// =============================================================================

/**
 * Edit or reset a CSS custom property in theme.css
 * @param {string} coursePath - Path to course directory
 * @param {string} token - CSS custom property name (e.g., '--color-primary')
 * @param {string|null} value - New value, or null/empty to reset (remove)
 * @returns {{ action: 'updated'|'reset' }}
 */
export function editThemeToken(coursePath, token, value) {
    if (!token) throw new Error('Missing required field: token');

    const themePath = path.join(coursePath, 'theme.css');
    let content = fs.existsSync(themePath) ? fs.readFileSync(themePath, 'utf-8') : '';

    if (!value) {
        const removeRegex = new RegExp(`\\s*${token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}:[^;]+;`, 'g');
        content = content.replace(removeRegex, '');
        fs.writeFileSync(themePath, content, 'utf-8');
        return { action: 'reset' };
    }

    const tokenRegex = new RegExp(`(${token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}:\\s*)([^;]+)(;)`);
    const match = content.match(tokenRegex);

    if (match) {
        content = content.replace(tokenRegex, `$1${value}$3`);
    } else {
        const rootMatch = content.match(/:root\s*\{/);
        if (rootMatch) {
            const insertPos = rootMatch.index + rootMatch[0].length;
            const newLine = `\n    ${token}: ${value};`;
            content = content.slice(0, insertPos) + newLine + content.slice(insertPos);
        } else {
            const insertion = `\n:root {\n    ${token}: ${value};\n}\n`;
            const headerEnd = content.indexOf('============ */');
            if (headerEnd !== -1) {
                const insertPos = content.indexOf('\n', headerEnd) + 1;
                content = content.slice(0, insertPos) + insertion + content.slice(insertPos);
            } else {
                content = insertion + content;
            }
        }
    }

    fs.writeFileSync(themePath, content, 'utf-8');
    return { action: 'updated' };
}

// =============================================================================
// ASSESSMENT EDITING
// =============================================================================

/**
 * Edit a field in an assessment's settings block
 * @param {string} coursePath - Path to course directory
 * @param {string} assessmentId - Assessment slide ID
 * @param {string} field - Settings field name
 * @param {*} value - New value
 */
export function editAssessmentSetting(coursePath, assessmentId, field, value) {
    if (!assessmentId || !field || value === undefined) {
        throw new Error('Missing required fields: assessmentId, field, value');
    }

    const filePath = path.join(coursePath, 'slides', `${assessmentId}.js`);
    if (!fs.existsSync(filePath)) {
        throw new FileNotFoundError(`Assessment file not found: ${assessmentId}.js`);
    }

    let content = fs.readFileSync(filePath, 'utf-8');
    const settingsMatch = /settings:\s*\{/.exec(content);
    if (!settingsMatch) {
        throw new Error('No settings block found in assessment config');
    }

    let settingsStart = settingsMatch.index + settingsMatch[0].length - 1;
    let settingsEnd = settingsStart;
    let depth = 1;
    while (settingsEnd < content.length && depth > 0) {
        settingsEnd++;
        if (content[settingsEnd] === '{') depth++;
        if (content[settingsEnd] === '}') depth--;
    }

    const settingsBlock = content.slice(settingsStart, settingsEnd + 1);
    let newSettingsBlock = settingsBlock;

    const formatValue = (val) => {
        if (val === null || val === 'null') return 'null';
        if (typeof val === 'boolean') return String(val);
        if (val === 'true' || val === 'false') return val;
        if (typeof val === 'number') return String(val);
        if (!isNaN(val) && val !== '') return String(val);
        if (Array.isArray(val)) return JSON.stringify(val).replace(/"/g, "'");
        return `'${val}'`;
    };

    const valueStr = formatValue(value);
    const esc = field.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const boolRegex = new RegExp(`(${esc}:\\s*)(true|false)`);
    const numRegex = new RegExp(`(${esc}:\\s*)(\\d+(?:\\.\\d+)?|null)`);
    const stringRegex = new RegExp(`(${esc}:\\s*)(['"\`])([^'"\`]*?)\\2`);
    const arrayRegex = new RegExp(`(${esc}:\\s*)\\[[^\\]]*\\]`);

    let updated = false;

    if (typeof value === 'boolean' || value === 'true' || value === 'false') {
        if (boolRegex.test(settingsBlock)) {
            newSettingsBlock = settingsBlock.replace(boolRegex, `$1${valueStr}`);
            updated = true;
        }
    } else if (value === null || value === 'null' || typeof value === 'number' || (!isNaN(value) && value !== '')) {
        if (numRegex.test(settingsBlock)) {
            newSettingsBlock = settingsBlock.replace(numRegex, `$1${valueStr}`);
            updated = true;
        }
    } else if (Array.isArray(value)) {
        if (arrayRegex.test(settingsBlock)) {
            newSettingsBlock = settingsBlock.replace(arrayRegex, `$1${valueStr}`);
            updated = true;
        }
    } else {
        if (stringRegex.test(settingsBlock)) {
            newSettingsBlock = settingsBlock.replace(stringRegex, `$1'${value}'`);
            updated = true;
        }
    }

    if (!updated) {
        throw new Error(`Could not find property: ${field} in settings block`);
    }

    content = content.slice(0, settingsStart) + newSettingsBlock + content.slice(settingsEnd + 1);
    fs.writeFileSync(filePath, content, 'utf-8');
}

// =============================================================================
// INTERACTION EDITING
// =============================================================================

/**
 * Edit a field in an interaction config block within a slide file
 * @param {string} coursePath - Path to course directory
 * @param {string} slideId - Slide ID
 * @param {string} interactionId - Interaction ID
 * @param {string} field - Field name (supports 'choices[N].prop' syntax)
 * @param {*} value - New value
 */
export function editInteractionField(coursePath, slideId, interactionId, field, value) {
    if (!slideId || !interactionId || !field || value === undefined) {
        throw new Error('Missing required fields: slideId, interactionId, field, value');
    }

    const filePath = path.join(coursePath, 'slides', `${slideId}.js`);
    if (!fs.existsSync(filePath)) {
        throw new FileNotFoundError(`Slide file not found: ${slideId}.js`);
    }

    let content = fs.readFileSync(filePath, 'utf-8');

    const idPattern = new RegExp(`id:\\s*['"]${interactionId}['"]`);
    const idMatch = idPattern.exec(content);
    if (!idMatch) {
        throw new FileNotFoundError(`Interaction not found: ${interactionId}`);
    }

    let startBrace = idMatch.index;
    while (startBrace > 0 && content[startBrace] !== '{') startBrace--;

    let endBrace = idMatch.index;
    let depth = 1;
    while (endBrace < content.length && depth > 0) {
        endBrace++;
        if (content[endBrace] === '{') depth++;
        if (content[endBrace] === '}') depth--;
    }

    const configStr = content.slice(startBrace, endBrace + 1);
    let newConfigStr = configStr;
    const stringFields = ['prompt', 'label', 'template'];
    const valueFields = ['correctAnswer', 'tolerance', 'correctValue'];

    const arrayFieldMatch = field.match(/^choices\[(\d+)\]\.(\w+)$/);

    if (arrayFieldMatch) {
        newConfigStr = editChoiceField(configStr, arrayFieldMatch, value);
    } else if (stringFields.includes(field)) {
        newConfigStr = editStringField(configStr, field, value);
    } else if (valueFields.includes(field)) {
        newConfigStr = editValueField(configStr, field, value);
    } else {
        throw new Error(`Unrecognized interaction field: ${field}`);
    }

    const newContent = content.slice(0, startBrace) + newConfigStr + content.slice(endBrace + 1);
    fs.writeFileSync(filePath, newContent, 'utf-8');
}

/** Edit a choice[N].prop field within an interaction config */
function editChoiceField(configStr, match, value) {
    const choiceIndex = parseInt(match[1], 10);
    const choiceProp = match[2];

    const choicesStart = configStr.indexOf('choices:');
    if (choicesStart === -1) {
        throw new Error('No choices array found in interaction config');
    }

    let bracketStart = configStr.indexOf('[', choicesStart);
    let bracketEnd = bracketStart;
    let d = 1;
    while (bracketEnd < configStr.length && d > 0) {
        bracketEnd++;
        if (configStr[bracketEnd] === '[') d++;
        if (configStr[bracketEnd] === ']') d--;
    }

    const choicesStr = configStr.slice(bracketStart, bracketEnd + 1);

    let choiceCount = 0;
    let choiceObjStart = -1;
    let choiceObjEnd = -1;
    let i = 1;
    while (i < choicesStr.length && choiceCount <= choiceIndex) {
        if (choicesStr[i] === '{') {
            if (choiceCount === choiceIndex) {
                choiceObjStart = i;
                let objDepth = 1;
                choiceObjEnd = i;
                while (choiceObjEnd < choicesStr.length && objDepth > 0) {
                    choiceObjEnd++;
                    if (choicesStr[choiceObjEnd] === '{') objDepth++;
                    if (choicesStr[choiceObjEnd] === '}') objDepth--;
                }
                break;
            }
            choiceCount++;
        }
        i++;
    }

    if (choiceObjStart === -1) {
        throw new Error(`Choice index ${choiceIndex} not found`);
    }

    const choiceObjStr = choicesStr.slice(choiceObjStart, choiceObjEnd + 1);
    const propPattern = new RegExp(`(${choiceProp}:\\s*)(['"\`])([^'"\`]*?)\\2`);
    const propMatch = choiceObjStr.match(propPattern);

    if (!propMatch) {
        throw new Error(`Property ${choiceProp} not found in choice ${choiceIndex}`);
    }

    const quote = propMatch[2];
    const escaped = value.replace(/\\/g, '\\\\').replace(new RegExp(quote, 'g'), '\\' + quote);
    const newChoiceObjStr = choiceObjStr.replace(propPattern, `$1${quote}${escaped}${quote}`);
    const newChoicesStr = choicesStr.slice(0, choiceObjStart) + newChoiceObjStr + choicesStr.slice(choiceObjEnd + 1);
    return configStr.slice(0, bracketStart) + newChoicesStr + configStr.slice(bracketEnd + 1);
}

/** Edit a string field (prompt, label, template) */
function editStringField(configStr, field, value) {
    const esc = field.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const fieldPattern = new RegExp(`(${esc}:\\s*)(['"\`])([^'"\`]*?)\\2`);
    const fieldMatch = configStr.match(fieldPattern);
    if (fieldMatch) {
        const quote = fieldMatch[2];
        const escaped = value.replace(/\\/g, '\\\\').replace(new RegExp(quote, 'g'), '\\' + quote);
        return configStr.replace(fieldPattern, `$1${quote}${escaped}${quote}`);
    }
    // Field doesn't exist yet — insert after id
    const idPart = configStr.match(/id:\s*['"][^'"]+['"]/);
    if (idPart) {
        return configStr.replace(idPart[0], `${idPart[0]},\n      ${field}: '${value}'`);
    }
    return configStr;
}

/** Edit a value field (correctAnswer, tolerance, correctValue) */
function editValueField(configStr, field, value) {
    const esc = field.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const fieldPattern = new RegExp(`(${esc}:\\s*)([^,}\\n]+)`);
    const fieldMatch = configStr.match(fieldPattern);

    let replacement = value;
    if (typeof value === 'string' && value !== 'true' && value !== 'false' && isNaN(value)) {
        replacement = `'${value}'`;
    }

    if (fieldMatch) {
        return configStr.replace(fieldPattern, `$1${replacement}`);
    }
    return configStr;
}

// =============================================================================
// TEMPLATE CONTENT EDITING
// =============================================================================

/**
 * Edit inner text content of an element within a slide's innerHTML template
 * @param {string} coursePath - Path to course directory
 * @param {string} slideFile - Slide filename (e.g., 'intro.js')
 * @param {string} editPath - Element path within HTML
 * @param {string} newText - New inner text
 * @param {Function} findElementByPath - HTML element path resolver
 * @returns {{ file: string }}
 */
export function editContent(coursePath, slideFile, editPath, newText, findElementByPath) {
    if (!slideFile || !editPath || newText === undefined) {
        throw new Error('Missing required fields: slideFile, editPath, newText');
    }

    const sourceFilePath = path.join(coursePath, 'slides', slideFile);
    if (!fs.existsSync(sourceFilePath)) {
        throw new FileNotFoundError(`Slide file not found: ${slideFile}`);
    }

    let sourceContent = fs.readFileSync(sourceFilePath, 'utf-8');
    const { templateStart, templateContent } = findTemplate(sourceContent);

    if (templateStart === -1) {
        throw new Error('No innerHTML template found in file');
    }

    const element = findElementByPath(templateContent, editPath);
    if (!element) {
        throw new FileNotFoundError(`Element not found for path: ${editPath}`);
    }

    const absStart = templateStart + element.innerStart;
    const absEnd = templateStart + element.innerEnd;
    const originalContent = sourceContent.slice(absStart, absEnd);

    let leadingExpressions = extractLeadingExpressions(originalContent);
    let trailingExpressions = extractTrailingExpressions(originalContent);

    // Reconcile rendered SVG output from iconManager.getIcon() expressions.
    // If the SVG is present in newText → strip it (the source ${...} is preserved).
    // If the SVG is absent → user deleted the icon, so remove the source ${...} too.
    // Only applies to getIcon expressions — literal <svg> in source is left untouched.
    let cleanedText = newText;
    const sourceTextPortion = originalContent.slice(
        leadingExpressions.length,
        originalContent.length - trailingExpressions.length
    );
    const hasLiteralSvg = /<svg\b/i.test(sourceTextPortion);

    if (!hasLiteralSvg && leadingExpressions && /\bgetIcon\b/.test(leadingExpressions)) {
        const svgMatch = cleanedText.match(/^(\s*<svg\b[^>]*>[\s\S]*?<\/svg>\s*)+/i);
        if (svgMatch) {
            cleanedText = cleanedText.slice(svgMatch[0].length);
        } else {
            leadingExpressions = '';
        }
    }
    if (!hasLiteralSvg && trailingExpressions && /\bgetIcon\b/.test(trailingExpressions)) {
        const svgMatch = cleanedText.match(/(\s*<svg\b[^>]*>[\s\S]*?<\/svg>\s*)+$/i);
        if (svgMatch) {
            cleanedText = cleanedText.slice(0, -svgMatch[0].length);
        } else {
            trailingExpressions = '';
        }
    }

    const finalContent = leadingExpressions + cleanedText + trailingExpressions;
    sourceContent = sourceContent.slice(0, absStart) + finalContent + sourceContent.slice(absEnd);
    fs.writeFileSync(sourceFilePath, sourceContent, 'utf-8');

    return { file: sourceFilePath };
}

/**
 * Edit an element's tag and classes within a slide's innerHTML template
 * @param {string} coursePath - Path to course directory
 * @param {string} slideFile - Slide filename
 * @param {string} editPath - Element path within HTML
 * @param {string} newTag - New HTML tag name
 * @param {string} [newClasses] - New CSS classes
 * @param {Function} findElementByPath - HTML element path resolver
 * @returns {{ file: string, undo: object }}
 */
export function editTag(coursePath, slideFile, editPath, newTag, newClasses, findElementByPath) {
    if (!slideFile || !editPath || !newTag) {
        throw new Error('Missing required fields: slideFile, editPath, newTag');
    }

    const VOID_ELEMENTS = new Set(['br', 'hr', 'img', 'input', 'meta', 'link', 'area', 'base', 'col', 'embed', 'source', 'track', 'wbr']);
    if (VOID_ELEMENTS.has(newTag.toLowerCase())) {
        throw new Error(`Cannot change to void element <${newTag}>. Void elements cannot contain content.`);
    }

    const sourceFilePath = path.join(coursePath, 'slides', slideFile);
    if (!fs.existsSync(sourceFilePath)) {
        throw new FileNotFoundError(`Source file not found: ${slideFile}`);
    }

    let sourceContent = fs.readFileSync(sourceFilePath, 'utf-8');
    const { templateStart, templateContent } = findTemplate(sourceContent);

    if (templateStart === -1) {
        throw new Error('Could not find innerHTML template literal');
    }

    const element = findElementByPath(templateContent, editPath);
    if (!element) {
        throw new FileNotFoundError(`Element not found for path: ${editPath}`);
    }

    const origOpeningTag = templateContent.slice(element.startOffset, element.innerStart);
    const origClosingTag = templateContent.slice(element.innerEnd, element.endOffset);
    const tagMatch = origOpeningTag.match(/^<(\w+)([^>]*)>/);
    const origAttrsString = tagMatch ? tagMatch[2] : '';

    const attrMatches = origAttrsString.matchAll(/(\w+(?:-\w+)*)(?:="([^"]*)"|='([^']*)')?/g);
    const preservedAttrs = [];
    for (const match of attrMatches) {
        const attrName = match[1];
        const attrValue = match[2] || match[3] || '';
        if (attrName !== 'class' && attrName) {
            preservedAttrs.push(attrValue ? `${attrName}="${attrValue}"` : attrName);
        }
    }

    let newOpeningTag = `<${newTag}`;
    if (newClasses && newClasses.trim()) {
        newOpeningTag += ` class="${newClasses.trim()}"`;
    }
    if (preservedAttrs.length > 0) {
        newOpeningTag += ' ' + preservedAttrs.join(' ');
    }
    newOpeningTag += '>';
    const newClosingTag = `</${newTag}>`;
    const innerContent = templateContent.slice(element.innerStart, element.innerEnd);
    const newElement = newOpeningTag + innerContent + newClosingTag;
    const _originalElement = origOpeningTag + innerContent + origClosingTag;

    const absStart = templateStart + element.startOffset;
    const absEnd = templateStart + element.endOffset;
    sourceContent = sourceContent.slice(0, absStart) + newElement + sourceContent.slice(absEnd);
    fs.writeFileSync(sourceFilePath, sourceContent, 'utf-8');

    return { file: sourceFilePath };
}


// =============================================================================
// TEMPLATE EXPRESSION EXTRACTION (brace-balanced)
// =============================================================================

/**
 * Extract consecutive leading ${...} expressions (with surrounding whitespace).
 * Uses brace-balanced parsing to handle nested braces inside expressions
 * like ${fn({ key: 'val' })}.
 */
function extractLeadingExpressions(content) {
    let end = 0;
    let i = 0;

    // Skip whitespace then try to match ${...}
    while (i < content.length) {
        // Skip whitespace
        while (i < content.length && /\s/.test(content[i])) i++;
        // Check for ${
        if (i + 1 < content.length && content[i] === '$' && content[i + 1] === '{') {
            i += 2; // skip past ${
            let depth = 1;
            while (i < content.length && depth > 0) {
                if (content[i] === '{') depth++;
                else if (content[i] === '}') depth--;
                i++;
            }
            // Skip trailing whitespace after the expression
            while (i < content.length && /\s/.test(content[i])) i++;
            end = i;
        } else {
            break;
        }
    }

    return content.slice(0, end);
}

/**
 * Extract consecutive trailing ${...} expressions (with surrounding whitespace).
 * Scans backward from the end using brace-balanced parsing.
 */
function extractTrailingExpressions(content) {
    let start = content.length;
    let i = content.length - 1;

    while (i >= 0) {
        // Skip trailing whitespace
        while (i >= 0 && /\s/.test(content[i])) i--;
        // Check for closing } of a ${...} expression
        if (i >= 0 && content[i] === '}') {
            // Walk backward with brace balancing to find the matching ${
            let depth = 1;
            i--;
            while (i >= 0 && depth > 0) {
                if (content[i] === '}') depth++;
                else if (content[i] === '{') depth--;
                i--;
            }
            // i now points one before the '{'. Check for '$'
            if (i >= 0 && content[i] === '$') {
                // Skip preceding whitespace
                i--;
                while (i >= 0 && /\s/.test(content[i])) i--;
                start = i + 1;
            } else {
                break; // Not a template expression
            }
        } else {
            break;
        }
    }

    return content.slice(start);
}

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Find innerHTML template literal boundaries in source content.
 * @param {string} sourceContent - Full file content
 * @returns {{ templateStart: number, templateEnd: number, templateContent: string }}
 */
function findTemplate(sourceContent) {
    const innerHtmlMatch = sourceContent.match(/innerHTML\s*(?::|=)\s*`/);
    if (!innerHtmlMatch) {
        return { templateStart: -1, templateEnd: -1, templateContent: '' };
    }

    const templateStart = innerHtmlMatch.index + innerHtmlMatch[0].length;

    let depth = 0;
    let templateEnd = -1;
    for (let i = templateStart; i < sourceContent.length; i++) {
        const char = sourceContent[i];
        if (char === '\\') { i++; continue; }
        if (depth === 0 && char === '`') { templateEnd = i; break; }
        if (char === '$' && sourceContent[i + 1] === '{') { depth++; i++; continue; }
        if (depth > 0 && char === '{') depth++;
        else if (depth > 0 && char === '}') depth--;
    }

    if (templateEnd === -1) {
        return { templateStart: -1, templateEnd: -1, templateContent: '' };
    }

    return {
        templateStart,
        templateEnd,
        templateContent: sourceContent.slice(templateStart, templateEnd)
    };
}

/**
 * Custom error for 404-style "not found" cases.
 * Route handlers check `instanceof FileNotFoundError` to send 404 vs 400.
 */
export class FileNotFoundError extends Error {
    constructor(message) {
        super(message);
        this.name = 'FileNotFoundError';
    }
}
