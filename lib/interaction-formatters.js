/**
 * Interaction Formatters
 * Type-specific formatters for converting interaction configs to Markdown/JSON
 */

/**
 * Format feedback using GitHub-style alerts for better visual presentation
 * @param {Object} feedback - Feedback object with correct/incorrect messages
 * @returns {string} Formatted markdown with alerts
 */
function formatFeedbackBlock(feedback) {
  if (!feedback) return '';

  let md = '\n';
  if (feedback.correct) {
    md += `> [!TIP] ✓ Correct\n> ${feedback.correct}\n\n`;
  }
  if (feedback.incorrect) {
    md += `> [!CAUTION] ✗ Incorrect\n> ${feedback.incorrect}\n\n`;
  }
  return md;
}

/**
 * Format a multiple-choice interaction
 * @param {Object} interaction - The interaction config
 * @param {Object} options - Formatting options
 * @returns {string} Formatted Markdown
 */
export function formatMultipleChoice(interaction, options = {}) {
  const { includeAnswers = false, includeFeedback = false, skipHeader = false } = options;

  let md = '';
  if (!skipHeader) {
    md += `#### ${interaction.id}\n`;
    md += '**Type:** Multiple Choice\n';
    if (interaction.weight) {
      md += `**Weight:** ${interaction.weight}\n`;
    }
  }

  md += `\n**Prompt:** ${interaction.prompt || '*No prompt*'}\n\n`;

  const choices = interaction.choices || [];
  if (choices.length > 0) {
    md += `| Choice | Text |${includeAnswers ? ' Correct |' : ''}\n`;
    md += `|--------|------|${includeAnswers ? '---------|' : ''}\n`;

    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    choices.forEach((choice, i) => {
      const letter = letters[i] || `${i + 1}`;
      const correctMark = includeAnswers && choice.correct ? ' ✓ ' : '';
      md += `| ${letter} | ${choice.text || choice.value || ''} |${includeAnswers ? correctMark + '|' : ''}\n`;
    });
  } else {
    md += '*No choices configured*\n';
  }

  if (includeFeedback && interaction.feedback) {
    md += formatFeedbackBlock(interaction.feedback);
  }

  return md;
}

/**
 * Format a true/false interaction
 * @param {Object} interaction - The interaction config
 * @param {Object} options - Formatting options
 * @returns {string} Formatted Markdown
 */
export function formatTrueFalse(interaction, options = {}) {
  const { includeAnswers = false, includeFeedback = false, skipHeader = false } = options;

  let md = '';
  if (!skipHeader) {
    md += `#### ${interaction.id}\n`;
    md += '**Type:** True/False\n';
    if (interaction.weight) {
      md += `**Weight:** ${interaction.weight}\n`;
    }
  }

  md += `\n**Prompt:** ${interaction.prompt}\n`;

  if (includeAnswers) {
    md += `\n**Correct Answer:** ${interaction.correctAnswer === true || interaction.correctAnswer === 'true' ? 'True' : 'False'}\n`;
  }

  if (includeFeedback && interaction.feedback) {
    md += formatFeedbackBlock(interaction.feedback);
  }

  return md;
}

/**
 * Format a fill-in-the-blank interaction
 * @param {Object} interaction - The interaction config
 * @param {Object} options - Formatting options
 * @returns {string} Formatted Markdown
 */
export function formatFillInBlank(interaction, options = {}) {
  const { includeAnswers = false, includeFeedback = false, skipHeader = false } = options;

  let md = '';
  if (!skipHeader) {
    md += `#### ${interaction.id}\n`;
    md += '**Type:** Fill-in-the-Blank\n';
    if (interaction.weight) {
      md += `**Weight:** ${interaction.weight}\n`;
    }
  }

  // Show template if present
  if (interaction.template) {
    md += `\n**Template:** ${interaction.template}\n\n`;
  } else if (interaction.prompt) {
    md += `\n**Prompt:** ${interaction.prompt}\n\n`;
  }

  // Handle both object-style ({ answer: {...} }) and array-style blanks
  const blanks = interaction.blanks || {};
  const blanksArray = Array.isArray(blanks)
    ? blanks
    : Object.entries(blanks).map(([key, config]) => ({ label: key, ...config }));

  if (blanksArray.length > 0) {
    md += `| Blank | Placeholder |${includeAnswers ? ' Answer |' : ''}\n`;
    md += `|-------|-------------|${includeAnswers ? '--------|' : ''}\n`;

    blanksArray.forEach(blank => {
      const label = blank.label || '';
      const placeholder = blank.placeholder || '';
      // Handle array-style correct answers
      const correctAnswer = Array.isArray(blank.correct) ? blank.correct.join(', ') : (blank.correct || '');
      const answer = includeAnswers ? ` \`${correctAnswer}\` |` : '';
      md += `| ${label} | ${placeholder} |${answer}\n`;
    });
  } else {
    md += '*No blanks configured*\n';
  }

  if (includeFeedback && interaction.feedback) {
    md += formatFeedbackBlock(interaction.feedback);
  }

  return md;
}

/**
 * Format a drag-and-drop interaction
 * @param {Object} interaction - The interaction config
 * @param {Object} options - Formatting options
 * @returns {string} Formatted Markdown
 */
export function formatDragDrop(interaction, options = {}) {
  const { includeAnswers = false, includeFeedback = false, skipHeader = false } = options;

  let md = '';
  if (!skipHeader) {
    md += `#### ${interaction.id}\n`;
    md += '**Type:** Drag & Drop\n';
    if (interaction.weight) {
      md += `**Weight:** ${interaction.weight}\n`;
    }
  }

  md += `\n**Prompt:** ${interaction.prompt || '*No prompt*'}\n\n`;

  const items = interaction.items || [];
  if (items.length > 0) {
    md += '**Draggable Items:**\n';
    items.forEach((item, index) => {
      md += `${index + 1}. ${item.content || item.text || item.id}\n`;
    });
  } else {
    md += '**Draggable Items:** *None configured*\n';
  }

  const dropZones = interaction.dropZones || [];
  if (dropZones.length > 0) {
    md += '\n**Drop Zones:**\n';
    md += `| Zone | ${includeAnswers ? 'Accepts | ' : ''}Max Items |\n`;
    md += `|------|${includeAnswers ? '---------|' : ''}-----------|\n`;

    dropZones.forEach(zone => {
      const accepts = includeAnswers && zone.accepts ? zone.accepts.join(', ') : '';
      const maxItems = zone.maxItems || '-';
      md += `| ${zone.label || zone.id} |${includeAnswers ? ` ${accepts} |` : ''} ${maxItems} |\n`;
    });
  } else {
    md += '\n**Drop Zones:** *None configured*\n';
  }

  if (includeFeedback && interaction.feedback) {
    md += formatFeedbackBlock(interaction.feedback);
  }

  return md;
}

/**
 * Format a numeric input interaction
 * @param {Object} interaction - The interaction config
 * @param {Object} options - Formatting options
 * @returns {string} Formatted Markdown
 */
export function formatNumeric(interaction, options = {}) {
  const { includeAnswers = false, includeFeedback = false, skipHeader = false } = options;

  let md = '';
  if (!skipHeader) {
    md += `#### ${interaction.id}\n`;
    md += '**Type:** Numeric\n';
    if (interaction.weight) {
      md += `**Weight:** ${interaction.weight}\n`;
    }
  }

  md += `\n**Prompt:** ${interaction.prompt}\n`;

  if (includeAnswers) {
    let correctValue = '';
    if (interaction.correctRange) {
      if (interaction.correctRange.exact !== undefined) {
        correctValue = interaction.correctRange.exact;
      } else if (interaction.correctRange.min !== undefined && interaction.correctRange.max !== undefined) {
        correctValue = `${interaction.correctRange.min} to ${interaction.correctRange.max}`;
      }
    } else if (interaction.correctAnswer !== undefined) {
      correctValue = interaction.correctAnswer;
    }

    md += `\n- **Correct Answer:** ${correctValue}\n`;
    if (interaction.tolerance !== undefined) {
      md += `- **Tolerance:** ±${interaction.tolerance}\n`;
    }
  }

  if (interaction.units) {
    md += `- **Units:** ${interaction.units}\n`;
  }

  if (includeFeedback && interaction.feedback) {
    md += formatFeedbackBlock(interaction.feedback);
  }

  return md;
}

/**
 * Format a sequencing interaction
 * @param {Object} interaction - The interaction config
 * @param {Object} options - Formatting options
 * @returns {string} Formatted Markdown
 */
export function formatSequencing(interaction, options = {}) {
  const { includeAnswers = false, includeFeedback = false, skipHeader = false } = options;

  let md = '';
  if (!skipHeader) {
    md += `#### ${interaction.id}\n`;
    md += '**Type:** Sequencing\n';
    if (interaction.weight) {
      md += `**Weight:** ${interaction.weight}\n`;
    }
  }

  md += `\n**Prompt:** ${interaction.prompt}\n\n`;

  md += '**Items:**\n';
  (interaction.items || []).forEach((item, _i) => {
    const label = item.content || item.text || item.id;
    if (includeAnswers) {
      const correctOrder = (interaction.correctOrder || []).indexOf(item.id) + 1;
      md += `- ${label} ${correctOrder > 0 ? `(Correct Position: ${correctOrder})` : ''}\n`;
    } else {
      md += `- ${label}\n`;
    }
  });

  if (includeFeedback && interaction.feedback) {
    md += formatFeedbackBlock(interaction.feedback);
  }

  return md;
}

/**
 * Format a matching interaction
 * @param {Object} interaction - The interaction config
 * @param {Object} options - Formatting options
 * @returns {string} Formatted Markdown
 */
export function formatMatching(interaction, options = {}) {
  const { includeAnswers = false, includeFeedback = false, skipHeader = false } = options;

  let md = '';
  if (!skipHeader) {
    md += `#### ${interaction.id}\n`;
    md += '**Type:** Matching\n';
    if (interaction.weight) {
      md += `**Weight:** ${interaction.weight}\n`;
    }
  }

  md += `\n**Prompt:** ${interaction.prompt}\n\n`;

  md += '**Pairs:**\n';
  md += `| Item | ${includeAnswers ? 'Match |' : ''}\n`;
  md += `|------|${includeAnswers ? '-------|' : ''}\n`;

  const pairs = interaction.pairs || [];
  if (pairs.length > 0) {
    pairs.forEach(pair => {
      // Use 'text' (actual property name) or fallback to 'item'/'left'
      const item = pair.text || pair.item || pair.left || pair.id || '';
      const match = includeAnswers ? (pair.match || pair.right || '') : '';
      md += `| ${item} |${includeAnswers ? ` ${match} |` : ''}\n`;
    });
  } else {
    md += '*No pairs configured*\n';
  }

  if (includeFeedback && interaction.feedback) {
    md += formatFeedbackBlock(interaction.feedback);
  }

  return md;
}

/**
 * Format a Likert scale interaction
 * @param {Object} interaction - The interaction config
 * @param {Object} options - Formatting options
 * @returns {string} Formatted Markdown
 */
export function formatLikert(interaction, options = {}) {
  const { skipHeader = false } = options;

  let md = '';
  if (!skipHeader) {
    md += `#### ${interaction.id}\n`;
    md += '**Type:** Likert Scale\n';
  }

  md += `\n**Prompt:** ${interaction.prompt || ''}\n\n`;

  if (interaction.scale) {
    md += '**Scale Options:**\n';
    (interaction.scale || []).forEach(option => {
      md += `- ${option.label || option.text || option.value}\n`;
    });
  }

  if (interaction.questions && interaction.questions.length > 0) {
    md += '\n**Questions:**\n';
    interaction.questions.forEach((q, idx) => {
      md += `${idx + 1}. ${q.text || q.prompt || q}\n`;
    });
  }

  return md;
}

/**
 * Format a hotspot interaction
 * @param {Object} interaction - The interaction config
 * @param {Object} options - Formatting options
 * @returns {string} Formatted Markdown
 */
export function formatHotspot(interaction, options = {}) {
  const { skipHeader = false } = options;

  let md = '';
  if (!skipHeader) {
    md += `#### ${interaction.id}\n`;
    md += '**Type:** Hotspot (Visual Interaction)\n';
  }

  if (interaction.image) {
    md += `\n**Image:** \`${interaction.image}\`\n`;
  }

  md += '\n**Hotspots:**\n';
  (interaction.hotspots || []).forEach((hotspot, idx) => {
    const label = hotspot.label || hotspot.id || `Hotspot ${idx + 1}`;
    const description = hotspot.description || hotspot.content || '';
    md += `- **${label}**${description ? `: ${description}` : ''}\n`;
  });

  md += '\n*Note: This is a visual interaction - layout positions are not exported.*\n';

  return md;
}

/**
 * Format any interaction based on its type
 * @param {Object} interaction - The interaction config
 * @param {Object} options - Formatting options
 * @returns {string} Formatted Markdown
 */
export function formatInteraction(interaction, options = {}) {
  const type = (interaction.type || '').toLowerCase().replace(/-/g, '').replace(/_/g, '');

  switch (type) {
    case 'multiplechoice':
    case 'mcq':
      return formatMultipleChoice(interaction, options);

    case 'truefalse':
    case 'tf':
      return formatTrueFalse(interaction, options);

    case 'fillin':
    case 'fillinblank':
    case 'fillintheblank':
    case 'fillintheblanks':
    case 'blank':
      return formatFillInBlank(interaction, options);

    case 'dragdrop':
    case 'draganddrop':
    case 'dd':
      return formatDragDrop(interaction, options);

    case 'numeric':
    case 'number':
      return formatNumeric(interaction, options);

    case 'sequencing':
    case 'sequence':
    case 'ordering':
      return formatSequencing(interaction, options);

    case 'matching':
    case 'match':
      return formatMatching(interaction, options);

    case 'likert':
    case 'likertscale':
      return formatLikert(interaction, options);

    case 'hotspot':
    case 'hotspots':
      return formatHotspot(interaction, options);

    default:
      // Generic fallback
      const { skipHeader: skip = false } = options;
      let md = '';
      if (!skip) {
        md += `#### ${interaction.id}\n`;
        md += `**Type:** ${interaction.type || 'Unknown'}\n`;
      }
      if (interaction.prompt) {
        md += `\n**Prompt:** ${interaction.prompt}\n`;
      }
      return md;
  }
}

/**
 * Convert interaction to JSON format
 * @param {Object} interaction - The interaction config
 * @param {Object} options - Formatting options
 * @returns {Object} JSON representation
 */
export function interactionToJson(interaction, options = {}) {
  const { includeAnswers = false, includeFeedback = false } = options;

  const result = {
    id: interaction.id,
    type: interaction.type,
    prompt: interaction.prompt
  };

  if (interaction.weight) {
    result.weight = interaction.weight;
  }

  // Type-specific fields
  switch ((interaction.type || '').toLowerCase().replace(/-/g, '')) {
    case 'multiplechoice':
    case 'mcq':
      result.choices = (interaction.choices || []).map(c => ({
        value: c.value,
        text: c.text,
        ...(includeAnswers && { correct: c.correct })
      }));
      break;

    case 'truefalse':
      if (includeAnswers) {
        result.correctAnswer = interaction.correctAnswer;
      }
      break;

    case 'fillin':
    case 'fillinblank':
      result.blanks = (interaction.blanks || []).map(b => ({
        label: b.label,
        placeholder: b.placeholder,
        ...(includeAnswers && { correct: b.correct })
      }));
      break;

    case 'dragdrop':
    case 'draganddrop':
      result.items = (interaction.items || []).map(i => ({
        id: i.id,
        content: i.content || i.text
      }));
      result.dropZones = (interaction.dropZones || []).map(z => ({
        id: z.id,
        label: z.label,
        maxItems: z.maxItems,
        ...(includeAnswers && { accepts: z.accepts })
      }));
      break;

    case 'numeric':
      if (includeAnswers) {
        result.correctValue = interaction.correctRange?.exact ?? interaction.correctAnswer;
        result.tolerance = interaction.tolerance;
      }
      result.units = interaction.units;
      break;

    case 'sequencing':
      result.items = (interaction.items || []).map(i => ({
        id: i.id,
        content: i.content || i.text
      }));
      if (includeAnswers) {
        result.correctOrder = interaction.correctOrder;
      }
      break;

    case 'matching':
      result.pairs = (interaction.pairs || []).map(p => ({
        item: p.item || p.left,
        ...(includeAnswers && { match: p.match || p.right })
      }));
      break;

    case 'likert':
      result.scale = interaction.scale;
      result.questions = interaction.questions;
      break;

    case 'hotspot':
      result.image = interaction.image;
      result.hotspots = (interaction.hotspots || []).map(h => ({
        id: h.id,
        label: h.label,
        description: h.description
      }));
      break;
  }

  if (includeFeedback && interaction.feedback) {
    result.feedback = interaction.feedback;
  }

  return result;
}
