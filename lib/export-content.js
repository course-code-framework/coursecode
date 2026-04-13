/**
 * Export Content Command v2
 * Extracts text content from SCORM course source files into structured Markdown.
 * Uses source-based extraction (not HTML parsing) for reliable, clean output.
 */

import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';
import { parseSlideSource, extractAssessment } from './course-parser.js';
import {
  formatInteraction
} from './interaction-formatters.js';

/**
 * Validate that we're in a valid SCORM project directory
 * @param {string} coursePath - Path to course directory
 * @param {boolean} [silent=false] - If true, return null instead of exiting on error
 */
function validateProject(coursePath, silent = false) {
  const cwd = process.cwd();
  const fullCoursePath = path.isAbsolute(coursePath) ? coursePath : path.join(cwd, coursePath);

  const hasConfigFile = fs.existsSync(path.join(fullCoursePath, 'course-config.js'));

  if (!hasConfigFile) {
    if (silent) {
      return null;
    }
    console.error(`
❌ Could not find course-config.js in ${fullCoursePath}

   Make sure you're running this command from a SCORM project root,
   or specify the correct path with --course-path.
`);
    process.exit(1);
  }

  return fullCoursePath;
}

/**
 * Load course configuration
 * @param {string} coursePath - Path to course directory
 * @returns {Object} Course configuration
 */
async function loadCourseConfig(coursePath) {
  const configPath = path.join(coursePath, 'course-config.js');
  const configUrl = pathToFileURL(configPath).href;

  try {
    const module = await import(configUrl);
    return module.courseConfig || module.default;
  } catch (error) {
    console.error(`\n❌ Failed to load course-config.js: ${error.message}\n`);
    process.exit(1);
  }
}

/**
 * Read slide file source code
 * @param {string} componentPath - Component path
 * @param {string} coursePath - Base course path
 * @returns {string} File contents
 */
function readSlideSource(componentPath, coursePath) {
  try {
    let resolvedPath = componentPath;
    if (componentPath.startsWith('@slides/')) {
      resolvedPath = path.join(coursePath, 'slides', componentPath.replace('@slides/', ''));
    } else if (!path.isAbsolute(componentPath)) {
      resolvedPath = path.join(coursePath, componentPath);
    }
    return fs.readFileSync(resolvedPath, 'utf-8');
  } catch (_error) {
    console.warn(`  ⚠ Could not read: ${componentPath}`);
    return '';
  }
}

/**
 * Convert header to Markdown
 * @param {Object} header - Parsed header with title and description
 * @returns {string} Markdown
 */
function headerToMarkdown(header) {
  const lines = [];
  if (header?.title) {
    lines.push(`**${header.title}**`);
  }
  if (header?.description) {
    lines.push(header.description);
  }
  if (lines.length > 0) lines.push('');
  return lines.join('\n');
}

/**
 * Format element as Markdown based on semantic type
 * @param {object} el - Parsed element
 * @returns {string|null}
 */
function formatElementAsMarkdown(el) {
  if (el.tag === 'pre' && el.innerText) {
    return `\`\`\`\n${el.innerText}\n\`\`\`\n`;
  }

  // pre handles block code; skip nested <code> to avoid duplicates.
  if (el.tag === 'code' && el.parentPath?.includes('/pre.')) {
    return null;
  }

  switch (el.semantic) {
    case 'title':
      return el.innerText ? `**${el.innerText}**\n` : null;
    case 'description':
      return el.innerText ? `${el.innerText}\n` : null;
    case 'heading':
      return el.innerText ? `## ${el.innerText}\n` : null;
    case 'subheading':
      return el.innerText ? `### ${el.innerText}\n` : null;
    case 'paragraph':
      return el.innerText ? `${el.innerText}\n` : null;
    case 'callout':
      // Structured callouts (headings/lists/paragraphs) render better via child elements.
      if (el.children && el.children.length > 0) {
        return null;
      }
      return el.innerText ? `> ${el.innerText}\n` : null;
    case 'list-item':
      return el.innerText ? `- ${el.innerText}` : null;

    // Pattern layouts - format for readable review
    case 'intro-cards':
    case 'features':
      return formatPatternCards(el);
    case 'steps':
      return formatPatternSteps(el);
    case 'timeline':
      return formatPatternTimeline(el);
    case 'comparison':
      return formatPatternComparison(el);
    case 'stats':
      return formatPatternStats(el);
    case 'checklist':
      return formatPatternChecklist(el);
    case 'hero':
      return formatPatternHero(el);
    case 'quote':
      return el.innerText ? `> *"${el.innerText}"*\n` : null;
    case 'content-image':
      return el.innerText ? `${el.innerText}\n` : null;
    case 'tabs':
      return formatPatternTabs(el);

    case 'accordion':
      if (!el.children || el.children.length === 0) return null;
      {
        let md = '';
        for (const panel of el.children) {
          const title = panel.attributes?.['data-title'] || 'Untitled';
          const content = panel.innerText || '';
          md += `<details>\n<summary>${title}</summary>\n\n${content}\n\n</details>\n\n`;
        }
        return md;
      }
    case 'accordion-panel':
      return null; // Handled by parent
    case 'card':
    case 'flip-card':
      return null; // Handled by parent
    default:
      return null;
  }
}

// Helper functions for extracting child content from patterns
function getChildHeading(el) {
  const heading = el.children?.find(c => ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(c.tag));
  return heading?.innerText || '';
}

function getChildParagraph(el) {
  const para = el.children?.find(c => c.tag === 'p');
  return para?.innerText || '';
}

function getChildListItems(el) {
  return el.children?.filter(c => c.tag === 'li').map(c => c.innerText || '') || [];
}

/**
 * Format intro-cards/features as bullet list
 */
function formatPatternCards(el) {
  if (!el.children || el.children.length === 0) return null;

  let md = '';
  for (const child of el.children) {
    if (child.className?.includes('card') || child.className?.includes('intro-card') || child.className?.includes('feature')) {
      const title = getChildHeading(child);
      const content = getChildParagraph(child);
      if (title) {
        md += `- **${title}**`;
        if (content) md += ` - ${content}`;
        md += '\n';
      } else if (content) {
        md += `- ${content}\n`;
      }
    }
  }
  return md || null;
}

/**
 * Format steps as numbered list
 */
function formatPatternSteps(el) {
  if (!el.children || el.children.length === 0) return null;

  let md = '';
  let stepNum = 1;
  for (const child of el.children) {
    if (child.className?.includes('step')) {
      const title = getChildHeading(child);
      const content = getChildParagraph(child);
      if (title || content) {
        md += `${stepNum}. `;
        if (title) md += `**${title}**`;
        if (title && content) md += ' - ';
        if (content) md += content;
        md += '\n';
        stepNum++;
      }
    }
  }
  return md || null;
}

/**
 * Format timeline as dated entries
 */
function formatPatternTimeline(el) {
  if (!el.children || el.children.length === 0) return null;

  let md = '';
  for (const child of el.children) {
    if (child.className?.includes('event') || child.className?.includes('timeline')) {
      const date = child.attributes?.['data-date'] || child.attributes?.['data-year'] || '';
      const title = getChildHeading(child);
      const content = getChildParagraph(child);
      if (date || title || content) {
        md += '- ';
        if (date) md += `**${date}**: `;
        if (title) md += title;
        if (title && content) md += ' - ';
        if (content) md += content;
        md += '\n';
      }
    }
  }
  return md || null;
}

/**
 * Format comparison as columns
 */
function formatPatternComparison(el) {
  if (!el.children || el.children.length < 2) return null;

  let md = '';
  for (const child of el.children) {
    const title = getChildHeading(child);
    const items = getChildListItems(child);
    if (title) md += `**${title}**\n`;
    for (const item of items) {
      md += `- ${item}\n`;
    }
    md += '\n';
  }
  return md || null;
}

/**
 * Format stats as key metrics
 */
function formatPatternStats(el) {
  if (!el.children || el.children.length === 0) return null;

  let md = '';
  for (const child of el.children) {
    if (child.className?.includes('stat')) {
      const title = getChildHeading(child);
      const content = getChildParagraph(child);
      if (title || content) {
        md += `- **${title || ''}**`;
        if (content) md += ` - ${content}`;
        md += '\n';
      }
    }
  }
  return md || null;
}

/**
 * Format checklist as checked items
 */
function formatPatternChecklist(el) {
  const items = getChildListItems(el);
  if (items.length === 0) return null;

  let md = '';
  for (const item of items) {
    md += `- [x] ${item}\n`;
  }
  return md;
}

/**
 * Format hero section
 */
function formatPatternHero(el) {
  const title = getChildHeading(el);
  const content = getChildParagraph(el);
  if (!title && !content) return null;

  let md = '';
  if (title) md += `### ${title}\n\n`;
  if (content) md += `${content}\n`;
  return md;
}

/**
 * Format tabs as expandable sections
 */
function formatPatternTabs(el) {
  if (!el.children || el.children.length === 0) return null;

  let md = '';
  for (const child of el.children) {
    const title = child.attributes?.['data-tab'] || child.attributes?.['data-title'] || 'Tab';
    const content = child.innerText || '';
    md += `<details>\n<summary>${title}</summary>\n\n${content}\n\n</details>\n\n`;
  }
  return md;
}

/**
 * Convert elements to Markdown
 * @param {Array} elements - Parsed elements from course-parser
 * @param {object} options - { skipHeader: true to skip title/description }
 * @returns {string}
 */
function elementsToMarkdown(elements, options = {}) {
  const { skipHeader = true } = options;
  const lines = [];
  const containerPaths = [];

  const containerSemantics = new Set([
    'intro-cards',
    'features',
    'steps',
    'timeline',
    'comparison',
    'stats',
    'checklist',
    'hero',
    'tabs',
    'accordion',
  ]);

  const isInsideHandledContainer = (path) => {
    for (const containerPath of containerPaths) {
      if (path.startsWith(containerPath + '/')) {
        return true;
      }
    }
    return false;
  };

  for (const el of elements) {
    // Skip header elements if they're handled separately
    if (skipHeader && (el.semantic === 'title' || el.semantic === 'description')) {
      continue;
    }

    if (isInsideHandledContainer(el.path)) {
      continue;
    }

    const md = formatElementAsMarkdown(el);
    if (md) {
      lines.push(md);
      if (containerSemantics.has(el.semantic)) {
        containerPaths.push(el.path);
      }
    }
  }

  return lines.join('\n');
}

/**
 * Format course metadata section
 * @param {Object} config - Course configuration
 * @returns {string} Markdown
 */
function formatMetadata(config) {
  const meta = config.metadata || {};
  let md = `# ${meta.title || 'Untitled Course'}\n`;

  if (meta.description) {
    md += `> ${meta.description}\n`;
  }

  md += '\n';

  if (meta.version) md += `**Version:** ${meta.version}  \n`;
  if (meta.author) md += `**Author:** ${meta.author}  \n`;
  if (meta.language) md += `**Language:** ${meta.language}\n`;

  return md;
}

/**
 * Generate structure overview with markdown links and filenames
 * @param {Array} structure - Course structure
 * @param {number} depth - Current nesting depth
 * @returns {string} Structure tree
 */
function generateStructureOverview(structure, depth = 0) {
  const lines = [];
  const indent = '    '.repeat(depth);

  structure.forEach(item => {
    const menu = item.menu || {};
    // Note: menu.icon contains icon identifiers (e.g., 'refresh-cw', 'user') meant for 
    // rendering with an icon library - we don't include these in markdown output since
    // they can't be rendered and the type indicators (📄, 📂, 📝) already serve this purpose
    const label = menu.label || item.title || item.id;

    let notes = [];
    if (menu.hidden) notes.push('hidden');
    if (item.engagement?.required) notes.push('engagement required');
    if (item.navigation?.gating) notes.push('gated');
    if (item.navigation?.sequence?.includeByDefault === false) notes.push('conditional');

    const notesStr = notes.length > 0 ? ` *(${notes.join(', ')})*` : '';

    // Extract filename from component path for display
    const filename = item.component ? item.component.replace(/^@slides\//, '') : null;
    const filenameStr = filename ? ` \`${filename}\`` : '';

    if (item.type === 'section') {
      // Sections link to their section header using ID
      const sectionAnchor = `#section-${item.id}`;
      lines.push(`${indent}- **📂 [${label}](${sectionAnchor})**`);
      if (item.children) {
        lines.push(generateStructureOverview(item.children, depth + 1));
      }
    } else if (item.type === 'assessment') {
      // Assessments link to their slide header
      const assessmentAnchor = `#slide-${item.id}`;
      lines.push(`${indent}- 📝 [${label}](${assessmentAnchor})${filenameStr}${notesStr}`);
    } else {
      // Regular slides link to their slide header
      const slideAnchor = `#slide-${item.id}`;
      lines.push(`${indent}- 📄 [${label}](${slideAnchor})${filenameStr}${notesStr}`);
    }
  });

  return lines.join('\n');
}

/**
 * Format engagement requirements
 * @param {Object} engagement - Engagement config
 * @returns {string} Human-readable description
 */
function formatEngagementDescription(engagement) {
  if (!engagement?.required || !engagement.requirements?.length) {
    return '';
  }

  const descriptions = engagement.requirements.map(req => {
    switch (req.type) {
      case 'viewAllTabs': return 'View all tabs';
      case 'viewAllPanels': return 'View all accordion panels';
      case 'viewAllFlipCards': return 'View all flip cards';
      case 'viewAllHotspots': return 'View all hotspots';
      case 'interactionComplete': return `Complete: ${req.interactionId}`;
      case 'allInteractionsComplete': return 'Complete all interactions';
      case 'slideAudioComplete': return 'Listen to slide audio';
      case 'audioComplete': return `Listen to audio: ${req.audioId}`;
      case 'modalAudioComplete': return `Listen to modal audio: ${req.modalId}`;
      case 'scrollDepth': return `Scroll to ${req.percentage}%`;
      case 'timeOnSlide': return `Spend ${req.minSeconds}s on slide`;
      case 'flag': return `Flag: ${req.key}`;
      default: return req.message || req.type;
    }
  });

  return descriptions.join(', ');
}

/**
 * Format gating conditions
 * @param {Object} gating - Gating config
 * @returns {string} Human-readable description
 */
function formatGatingDescription(gating) {
  if (!gating?.conditions?.length) return '';

  const descriptions = gating.conditions.map(cond => {
    switch (cond.type) {
      case 'objectiveStatus':
        return `Objective "${cond.objectiveId}" ${cond.completion_status || cond.success_status || 'completed'}`;
      case 'assessmentStatus':
        return `Assessment "${cond.assessmentId}" ${cond.requires}`;
      case 'timeOnSlide':
        return `${cond.minSeconds}s on slide "${cond.slideId}"`;
      case 'flag':
        return `Flag "${cond.key}" = ${cond.equals ?? true}`;
      default:
        return JSON.stringify(cond);
    }
  });

  const mode = gating.mode === 'any' ? 'any of' : 'all of';
  return `Requires ${mode}: ${descriptions.join('; ')}`;
}

/**
 * Format a slide for export
 * @param {Object} item - Slide item from structure
 * @param {string} coursePath - Course path
 * @param {Object} options - Export options
 * @returns {string} Markdown for slide
 */
function formatSlide(item, coursePath, options) {
  const { includeAnswers, includeNarration, includeFeedback, excludeInteractions, includeAnchors } = options;

  const menu = item.menu || {};
  const title = item.title || menu.label || item.id;
  const anchor = includeAnchors ? `<a id="slide-${item.id}"></a>\n\n` : '';
  let md = `\n---\n\n${anchor}# ${title}\n`;
  md += `**ID:** \`${item.id}\` | **Component:** \`${item.component || 'N/A'}\`\n\n`;

  // Menu info (only if different from title or has special properties)
  if (menu.hidden) {
    md += '**Menu:** *(hidden)*\n';
  } else if (menu.icon) {
    md += `**Menu:** ${menu.icon} ${menu.label || title}\n`;
  }

  // Audio
  if (item.audio?.src) {
    md += `**Audio:** \`${item.audio.src}\`\n`;
  }

  // Engagement
  const engagementDesc = formatEngagementDescription(item.engagement);
  if (engagementDesc) {
    md += `**Engagement:** ${engagementDesc}\n`;
  }

  // Gating
  const gatingDesc = formatGatingDescription(item.navigation?.gating);
  if (gatingDesc) {
    md += `**Gating:** ${gatingDesc}\n`;
  }

  // Read and parse source
  const source = readSlideSource(item.component, coursePath);
  if (!source) {
    md += '\n*[Source not available]*\n';
    return md;
  }

  let parsed;
  try {
    parsed = parseSlideSource(source, item.id);
  } catch (err) {
    md += `\n*[Error parsing slide: ${err.message}]*\n`;
    return md;
  }

  // Content from parsed elements
  md += '### Content\n\n';

  const headerMd = headerToMarkdown(parsed.header);
  if (headerMd.trim()) {
    md += headerMd + '\n';
  }

  if (parsed.elements && parsed.elements.length > 0) {
    const contentMd = elementsToMarkdown(parsed.elements);
    if (contentMd.trim()) {
      md += contentMd + '\n\n';
    }
  } else if (!headerMd.trim()) {
    md += '*[No static content]*\n\n';
  }

  // Interactions
  if (!excludeInteractions && parsed.interactions && parsed.interactions.length > 0) {
    md += '### Interactions\n';
    for (const interaction of parsed.interactions) {
      md += '\n' + formatInteraction(interaction, { includeAnswers, includeFeedback }) + '\n';
    }
  }

  // Narration
  if (includeNarration && parsed.narration) {
    md += '\n### Narration\n\n';
    for (const [key, text] of Object.entries(parsed.narration)) {
      if (Object.keys(parsed.narration).length > 1 && key !== 'slide') {
        md += `**${key}:**\n`;
      }
      md += text + '\n\n';
    }
  }

  md += '\n[↑ Back to Course Structure](#course-structure)\n';

  return md;
}

/**
 * Format an assessment for export
 * @param {Object} item - Assessment item from structure
 * @param {string} coursePath - Course path
 * @param {Object} options - Export options
 * @returns {string} Markdown for assessment
 */
function formatAssessment(item, coursePath, options) {
  const { includeAnswers, includeFeedback, excludeInteractions, includeAnchors } = options;

  const menu = item.menu || {};
  const title = item.title || menu.label || item.id;
  const anchor = includeAnchors ? `<a id="slide-${item.id}"></a>\n\n` : '';
  let md = `\n---\n\n${anchor}# ${title}\n`;
  md += `**ID:** \`${item.id}\` | **Component:** \`${item.component || 'N/A'}\` | **Type:** Assessment\n\n`;

  // Menu info (only if has icon)
  if (menu.icon) {
    md += `**Menu:** ${menu.icon} ${menu.label || title}\n`;
  }

  // Read and parse source
  const source = readSlideSource(item.component, coursePath);
  if (!source) {
    md += '\n*[Source not available]*\n';
    return md;
  }

  let parsed;
  try {
    parsed = extractAssessment(source, item.id);
  } catch (err) {
    md += `\n*[Error parsing assessment: ${err.message}]*\n`;
    return md;
  }

  if (parsed) {
    if (parsed.title) {
      md += `**Title:** ${parsed.title}\n`;
    }

    // Settings table
    if (parsed.settings) {
      md += '\n## Settings\n\n';
      md += '| Setting | Value |\n';
      md += '|---------|-------|\n';

      const s = parsed.settings;
      if (s.passingScore !== undefined) md += `| Passing Score | ${s.passingScore}% |\n`;
      if (s.allowReview !== undefined) md += `| Allow Review | ${s.allowReview ? 'Yes' : 'No'} |\n`;
      if (s.showProgress !== undefined) md += `| Show Progress | ${s.showProgress ? 'Yes' : 'No'} |\n`;
      if (s.allowRetake !== undefined) md += `| Allow Retake | ${s.allowRetake ? 'Yes' : 'No'} |\n`;
      if (s.randomizeQuestions !== undefined) md += `| Randomize Questions | ${s.randomizeQuestions ? 'Yes' : 'No'} |\n`;
      if (s.randomizeOnRetake !== undefined) md += `| Randomize on Retake | ${s.randomizeOnRetake ? 'Yes' : 'No'} |\n`;
    }
  }

  // Questions
  if (!excludeInteractions && parsed.questions && parsed.questions.length > 0) {
    md += '\n## Questions\n';

    let qNum = 1;
    for (const q of parsed.questions) {
      md += `\n### Q${qNum}: ${q.id}\n`;
      md += `**Type:** ${formatTypeName(q.type)}\n`;
      if (q.weight !== undefined) md += `**Weight:** ${q.weight}\n`;
      md += '\n';
      md += formatInteraction(q, { includeAnswers, includeFeedback, skipHeader: true });
      qNum++;
    }
  }

  md += '\n[↑ Back to Course Structure](#course-structure)\n';

  return md;
}

/**
 * Format interaction type name
 */
function formatTypeName(type) {
  if (!type) return 'Unknown';
  return type.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

/**
 * Format a section for export
 * @param {Object} section - Section from structure
 * @param {string} coursePath - Course path
 * @param {Object} options - Export options
 * @returns {string} Markdown for section
 */
function formatSection(section, coursePath, options) {
  const { includeAnchors } = options;
  const menu = section.menu || {};
  const label = menu.label || section.id;

  // Use section ID as anchor target for reliable linking (when includeAnchors is true)
  const anchor = includeAnchors ? `<a id="section-${section.id}"></a>\n\n` : '';
  let md = `\n---\n\n${anchor}# ${label}\n`;
  md += `**ID:** \`${section.id}\` | **Type:** Section\n\n`;

  // Process children
  for (const child of section.children || []) {
    if (child.type === 'slide') {
      md += formatSlide(child, coursePath, options);
    } else if (child.type === 'assessment') {
      md += formatAssessment(child, coursePath, options);
    } else if (child.type === 'section') {
      md += formatSection(child, coursePath, options);
    }
  }

  md += '\n[↑ Back to Course Structure](#course-structure)\n';

  return md;
}

/**
 * Format learning objectives
 * @param {Object} config - Course configuration
 * @returns {string} Markdown
 */
function formatObjectives(config) {
  const objectives = config.objectives;
  if (!objectives || objectives.length === 0) return '';

  let md = '\n---\n\n## Learning Objectives\n\n';
  md += '| ID | Description | Criteria |\n';
  md += '|----|-------------|----------|\n';

  for (const obj of objectives) {
    let criteria = '*Manual*';
    if (obj.criteria) {
      switch (obj.criteria.type) {
        case 'slideVisited':
          criteria = `Slide \`${obj.criteria.slideId}\` visited`;
          break;
        case 'allSlidesVisited':
          criteria = `All slides visited: ${obj.criteria.slideIds.map(s => `\`${s}\``).join(', ')}`;
          break;
        case 'timeOnSlide':
          criteria = `Time on \`${obj.criteria.slideId}\` ≥ ${obj.criteria.minSeconds}s`;
          break;
        case 'flag':
          criteria = `Flag \`${obj.criteria.key}\` = ${obj.criteria.equals ?? true}`;
          break;
        case 'allFlags':
          criteria = 'All flags set';
          break;
        default:
          criteria = obj.criteria.type;
      }
    }

    md += `| \`${obj.id}\` | ${obj.description} | ${criteria} |\n`;
  }

  return md;
}

/**
 * Format branding section
 * @param {Object} config - Course configuration
 * @returns {string} Markdown
 */
function formatBranding(config) {
  const branding = config.branding;
  if (!branding) return '';

  let md = '\n---\n\n## Branding\n\n';
  md += '| Property | Value |\n';
  md += '|----------|-------|\n';

  if (branding.companyName) md += `| Company Name | ${branding.companyName} |\n`;
  if (branding.courseTitle) md += `| Course Title | ${branding.courseTitle} |\n`;
  if (branding.logo) md += `| Logo | \`${branding.logo}\` |\n`;
  if (branding.logoAlt) md += `| Logo Alt Text | ${branding.logoAlt} |\n`;

  return md;
}

/**
 * Format features section
 * @param {Object} config - Course configuration
 * @returns {string} Markdown
 */
function formatFeatures(config) {
  const features = config.features;
  if (!features) return '';

  let md = '\n---\n\n## Features\n\n';
  md += '| Feature | Enabled |\n';
  md += '|---------|--------|\n';

  if (features.accessibility) {
    const a11y = features.accessibility;
    if (a11y.darkMode !== undefined) md += `| Dark Mode | ${a11y.darkMode ? '✓' : '✗'} |\n`;
    if (a11y.fontSize !== undefined) md += `| Font Size Control | ${a11y.fontSize ? '✓' : '✗'} |\n`;
    if (a11y.highContrast !== undefined) md += `| High Contrast | ${a11y.highContrast ? '✓' : '✗'} |\n`;
    if (a11y.reducedMotion !== undefined) md += `| Reduced Motion | ${a11y.reducedMotion ? '✓' : '✗'} |\n`;
  }

  if (features.security !== undefined) md += `| Secure Assessment Mode | ${features.security ? '✓' : '✗'} |\n`;
  if (features.offline !== undefined) md += `| Offline Mode | ${features.offline ? '✓' : '✗'} |\n`;
  if (features.analytics !== undefined) md += `| Learning Analytics | ${features.analytics ? '✓' : '✗'} |\n`;

  return md;
}

/**
 * Filter structure to only include specified slide IDs
 * @param {Array} structure - Course structure
 * @param {Array} slideIds - Slide IDs to include
 * @returns {Array} Filtered structure
 */
function filterStructure(structure, slideIds) {
  const result = [];

  for (const item of structure) {
    if (item.type === 'section') {
      const filteredChildren = filterStructure(item.children || [], slideIds);
      if (filteredChildren.length > 0) {
        result.push({ ...item, children: filteredChildren });
      }
    } else if (slideIds.includes(item.id)) {
      result.push(item);
    }
  }

  return result;
}

/**
 * Collect all interactions from the course structure
 * @param {Array} structure - Course structure
 * @param {string} coursePath - Path to course directory
 * @returns {Object} Object with slideInteractions and assessmentQuestions arrays
 */
function collectAllInteractions(structure, coursePath) {
  const slideInteractions = [];
  const assessmentQuestions = [];

  function processItem(item) {
    if (item.type === 'section') {
      for (const child of item.children || []) {
        processItem(child);
      }
    } else if (item.type === 'assessment') {
      const source = readSlideSource(item.component, coursePath);
      if (source) {
        const parsed = extractAssessment(source, item.id);
        if (parsed.questions && parsed.questions.length > 0) {
          assessmentQuestions.push({
            slideId: item.id,
            slideTitle: item.title || item.id,
            assessmentId: parsed.id || item.id,
            assessmentTitle: parsed.title || item.title,
            settings: parsed.settings || {},
            questions: parsed.questions
          });
        }
      }
    } else if (item.type === 'slide') {
      const source = readSlideSource(item.component, coursePath);
      if (source) {
        const parsed = parseSlideSource(source, item.id);
        if (parsed.interactions && parsed.interactions.length > 0) {
          slideInteractions.push({
            slideId: item.id,
            slideTitle: item.title || item.id,
            interactions: parsed.interactions
          });
        }
      }
    }
  }

  for (const item of structure) {
    processItem(item);
  }

  return { slideInteractions, assessmentQuestions };
}

/**
 * Format interactions-only Markdown output
 * @param {Object} config - Course configuration
 * @param {string} coursePath - Path to course directory
 * @param {Array} structure - Course structure (possibly filtered)
 * @param {Object} options - Export options
 * @returns {string} Markdown output
 */
function formatInteractionsOnlyMarkdown(config, coursePath, structure, options) {
  const { includeAnswers, includeFeedback } = options;
  const { slideInteractions, assessmentQuestions } = collectAllInteractions(structure, coursePath);

  const meta = config.metadata || {};
  let md = `# ${meta.title || 'Untitled Course'} - Interactions Export\n\n`;
  md += '> This document contains only the interactions and assessment questions from the course.\n\n';

  // Summary counts
  const totalSlideInteractions = slideInteractions.reduce((sum, s) => sum + s.interactions.length, 0);
  const totalAssessmentQuestions = assessmentQuestions.reduce((sum, a) => sum + a.questions.length, 0);

  md += '**Summary:**\n';
  md += `- Slides with interactions: ${slideInteractions.length}\n`;
  md += `- Total slide interactions: ${totalSlideInteractions}\n`;
  md += `- Assessments: ${assessmentQuestions.length}\n`;
  md += `- Total assessment questions: ${totalAssessmentQuestions}\n`;
  md += `- **Grand total: ${totalSlideInteractions + totalAssessmentQuestions} items**\n`;

  // Table of contents
  md += '\n---\n\n## Table of Contents\n\n';

  if (slideInteractions.length > 0) {
    md += '### Slide Interactions\n\n';
    for (const slide of slideInteractions) {
      const anchor = `slide-${slide.slideId}`.toLowerCase().replace(/[^a-z0-9-]/g, '-');
      md += `- [${slide.slideTitle}](#${anchor}) (${slide.interactions.length} interaction${slide.interactions.length !== 1 ? 's' : ''})\n`;
    }
    md += '\n';
  }

  if (assessmentQuestions.length > 0) {
    md += '### Assessments\n\n';
    for (const assessment of assessmentQuestions) {
      const anchor = `assessment-${assessment.assessmentId}`.toLowerCase().replace(/[^a-z0-9-]/g, '-');
      md += `- [${assessment.assessmentTitle || assessment.slideTitle}](#${anchor}) (${assessment.questions.length} question${assessment.questions.length !== 1 ? 's' : ''})\n`;
    }
    md += '\n';
  }

  // Slide Interactions
  if (slideInteractions.length > 0) {
    md += '\n---\n\n# Slide Interactions\n\n';

    for (const slide of slideInteractions) {
      md += `## Slide: ${slide.slideId}\n`;
      md += `**Title:** ${slide.slideTitle}\n\n`;

      for (const interaction of slide.interactions) {
        md += formatInteraction(interaction, { includeAnswers, includeFeedback });
        md += '\n';
      }

      md += '---\n\n';
    }
  }

  // Assessment Questions
  if (assessmentQuestions.length > 0) {
    md += '\n---\n\n# Assessment Questions\n\n';

    for (const assessment of assessmentQuestions) {
      md += `## Assessment: ${assessment.assessmentId}\n`;
      md += `**Title:** ${assessment.assessmentTitle || assessment.slideTitle}\n`;

      // Settings summary
      const s = assessment.settings;
      if (s.passingScore !== undefined) {
        md += `**Passing Score:** ${s.passingScore}%\n`;
      }
      md += '\n';

      let qNum = 1;
      for (const q of assessment.questions) {
        md += `### Q${qNum}: ${q.id}\n`;
        md += `**Type:** ${formatTypeName(q.type)}\n`;
        if (q.weight !== undefined) md += `**Weight:** ${q.weight}\n`;
        md += '\n';
        md += formatInteraction(q, { includeAnswers, includeFeedback });
        md += '\n';
        qNum++;
      }

      md += '---\n\n';
    }
  }

  // No interactions found
  if (slideInteractions.length === 0 && assessmentQuestions.length === 0) {
    md += '\n---\n\n*No interactions or assessment questions found in the selected content.*\n';
  }

  return md;
}

/**
 * Main export function
 * @param {Object} options - Command options
 */
export async function exportContent(options = {}) {
  const {
    output = null,
    includeAnswers = true,
    includeNarration = false,
    includeFeedback = true,
    excludeInteractions = false,
    interactionsOnly = false,
    includeAnchors = true,
    slides = null,
    format = 'md',
    coursePath = './course'
  } = options;

  // Validate project
  const fullCoursePath = validateProject(coursePath);

  console.log('\n📄 Exporting course content (v2)...\n');

  // Load course config
  const config = await loadCourseConfig(fullCoursePath);

  let structure = config.structure || [];
  if (slides) {
    const slideIds = slides.split(',').map(s => s.trim());
    structure = filterStructure(structure, slideIds);
  }

  const exportOptions = {
    includeAnswers,
    includeNarration,
    includeFeedback,
    excludeInteractions,
    interactionsOnly,
    includeAnchors
  };

  let result;

  if (format === 'json') {
    // JSON output
    result = JSON.stringify(await generateJsonOutput(config, fullCoursePath, structure, exportOptions), null, 2);
  } else if (interactionsOnly) {
    // Interactions-only Markdown output
    result = formatInteractionsOnlyMarkdown(config, fullCoursePath, structure, exportOptions);
  } else {
    // Markdown output
    let md = '';

    // Metadata
    md += formatMetadata(config);

    // Structure overview
    md += '\n---\n\n## Course Structure\n\n';
    md += generateStructureOverview(structure);
    md += '\n';

    // Learning Objectives
    md += formatObjectives(config);

    // Process each item in structure
    for (const item of structure) {
      if (item.type === 'slide') {
        md += formatSlide(item, fullCoursePath, exportOptions);
      } else if (item.type === 'assessment') {
        md += formatAssessment(item, fullCoursePath, exportOptions);
      } else if (item.type === 'section') {
        md += formatSection(item, fullCoursePath, exportOptions);
      }
    }

    // Configuration sections at end
    md += '\n---\n\n# Configuration\n';
    md += formatBranding(config);
    md += formatFeatures(config);

    result = md;
  }

  // Output result
  if (output) {
    const outputPath = path.isAbsolute(output) ? output : path.join(process.cwd(), output);
    fs.writeFileSync(outputPath, result, 'utf-8');
    console.log(`✅ Content exported to: ${outputPath}\n`);
  } else {
    console.log(result);
  }
}

/**
 * Programmatic content export (for MCP, preview-server, preview-export)
 * Returns the content as a string instead of writing to files/stdout.
 *
 * @param {Object} options - Export options
 * @param {string}  [options.coursePath='./course'] - Path to course directory
 * @param {boolean} [options.includeAnswers=true]    - Include correct answers
 * @param {boolean} [options.includeNarration=false]  - Include narration text
 * @param {boolean} [options.includeFeedback=true]   - Include feedback text
 * @param {boolean} [options.excludeInteractions=false] - Exclude interactions
 * @param {boolean} [options.interactionsOnly=false]  - Only interactions/assessments
 * @param {boolean} [options.includeAnchors=true]    - HTML anchors for linking
 * @param {string}  [options.slides]                 - Comma-separated slide IDs
 * @param {string}  [options.format='md']            - Output format: 'md' or 'json'
 * @returns {Promise<string|null>} Content string (Markdown or JSON) or null on error
 */
export async function getContentExport(options = {}) {
  const {
    coursePath = './course',
    includeAnswers = true,
    includeNarration = false,
    includeFeedback = true,
    excludeInteractions = false,
    interactionsOnly = false,
    includeAnchors = true,
    slides = null,
    format = 'md'
  } = options;

  const fullCoursePath = validateProject(coursePath, true);
  if (!fullCoursePath) return null;

  // Size guard threshold — prevent unbounded context consumption.
  // Only applies to full-course exports (no slides filter).
  const MAX_UNFILTERED_SIZE = 40 * 1024; // 40KB

  try {
    const config = await loadCourseConfig(fullCoursePath);

    let structure = config.structure || [];
    if (slides) {
      const slideIds = (typeof slides === 'string' ? slides.split(',') : slides).map(s => s.trim());
      structure = filterStructure(structure, slideIds);
    }

    const exportOptions = {
      includeAnswers,
      includeNarration,
      includeFeedback,
      excludeInteractions,
      interactionsOnly,
      includeAnchors
    };

    if (format === 'json') {
      return JSON.stringify(await generateJsonOutput(config, fullCoursePath, structure, exportOptions), null, 2);
    }

    if (interactionsOnly) {
      return formatInteractionsOnlyMarkdown(config, fullCoursePath, structure, exportOptions);
    }

    let md = '';
    md += formatMetadata(config);
    md += '\n---\n\n## Course Structure\n\n';
    md += generateStructureOverview(structure);
    md += '\n';
    md += formatObjectives(config);

    for (const item of structure) {
      if (item.type === 'slide') {
        md += formatSlide(item, fullCoursePath, exportOptions);
      } else if (item.type === 'assessment') {
        md += formatAssessment(item, fullCoursePath, exportOptions);
      } else if (item.type === 'section') {
        md += formatSection(item, fullCoursePath, exportOptions);
      }
    }

    md += '\n---\n\n# Configuration\n';
    md += formatBranding(config);
    md += formatFeatures(config);

    // Size guard: if full-course export exceeds threshold, return summary instead
    if (!slides && md.length > MAX_UNFILTERED_SIZE) {
      return buildExportSummary(config, structure, fullCoursePath, md.length, exportOptions);
    }

    return md;
  } catch (error) {
    console.error('Failed to generate content export:', error.message);
    return null;
  }
}

/**
 * Build a compact summary when full export exceeds size threshold.
 * Returns structure overview + per-slide sizes so AI can scope targeted exports.
 */
function buildExportSummary(config, structure, coursePath, totalSize, exportOptions) {
  const meta = config.metadata || {};
  let summary = `# ${meta.title || 'Untitled Course'} — Export Summary\n\n`;
  summary += `> Full export is ${(totalSize / 1024).toFixed(0)}KB — too large for context. Use the \`slides\` parameter to export specific slides.\n\n`;

  summary += '## Course Structure\n\n';
  summary += generateStructureOverview(structure);
  summary += '\n\n';

  // Per-slide size estimates
  summary += '## Slide Sizes\n\n';
  summary += '| Slide ID | Title | Size |\n';
  summary += '|----------|-------|------|\n';

  function measureItems(items) {
    for (const item of items) {
      if (item.type === 'section') {
        measureItems(item.children || []);
      } else {
        let content = '';
        if (item.type === 'slide') {
          content = formatSlide(item, coursePath, exportOptions);
        } else if (item.type === 'assessment') {
          content = formatAssessment(item, coursePath, exportOptions);
        }
        const sizeKB = (content.length / 1024).toFixed(1);
        const title = item.title || item.menu?.label || item.id;
        summary += `| \`${item.id}\` | ${title} | ${sizeKB}KB |\n`;
      }
    }
  }

  measureItems(structure);
  summary += `\n**Total:** ${(totalSize / 1024).toFixed(0)}KB across all slides\n`;
  summary += '\nUse `slides: "slide-id-1,slide-id-2"` to export specific slides, or `interactionsOnly: true` for just Q&A.\n';

  return summary;
}

/**
 * Generate JSON output
 */
async function generateJsonOutput(config, coursePath, structure, options) {
  const output = {
    metadata: config.metadata || {},
    branding: config.branding || {},
    features: config.features || {},
    objectives: config.objectives || [],
    structure: []
  };

  function processItem(item) {
    const entry = {
      type: item.type,
      id: item.id,
      title: item.title,
      menu: item.menu
    };

    if (item.type === 'section') {
      entry.children = (item.children || []).map(processItem);
    } else if (item.type === 'slide' || item.type === 'assessment') {
      const source = readSlideSource(item.component, coursePath);
      if (source) {
        if (item.type === 'assessment') {
          const parsed = extractAssessment(source, item.id);
          entry.config = {
            id: parsed.id,
            title: parsed.title,
            settings: parsed.settings
          };
          entry.questions = parsed.questions;
        } else {
          const parsed = parseSlideSource(source, item.id);
          entry.content = parsed.elements || [];
          entry.interactions = parsed.interactions;
          if (options.includeNarration) {
            entry.narration = parsed.narration;
          }
        }
      }
    }

    return entry;
  }

  output.structure = structure.map(processItem);

  return output;
}
