import {
  validateAgainstSchema,
  createInteractionEventHandler,
  renderInteractionControls,
  displayFeedback,
  clearFeedback,
  validateContainer,
  parseResponse,
  recordInteractionResult,
  registerCoreInteraction
} from './interaction-base.js';
import { logger } from '../../utilities/logger.js';

// Default appearance themes for hotspots
const HOTSPOT_DEFAULTS = {
  appearance: {
    correct: {
      default: { fill: 'rgba(187, 247, 208, 0.3)', stroke: '#15803d', strokeWidth: 3 },
      hover: { fill: 'rgba(187, 247, 208, 0.5)', stroke: '#15803d', strokeWidth: 4 },
      selected: { fill: 'rgba(0, 200, 0, 0.3)', stroke: '#00cc00', strokeWidth: 4 }
    },
    incorrect: {
      default: { fill: 'rgba(254, 205, 211, 0.3)', stroke: '#be123c', strokeWidth: 3 },
      hover: { fill: 'rgba(254, 205, 211, 0.5)', stroke: '#be123c', strokeWidth: 4 },
      selected: { fill: 'rgba(255, 0, 0, 0.3)', stroke: '#cc0000', strokeWidth: 4 }
    },
    primary: {
      default: { fill: 'rgba(199, 210, 254, 0.3)', stroke: '#4338ca', strokeWidth: 3 },
      hover: { fill: 'rgba(199, 210, 254, 0.5)', stroke: '#4338ca', strokeWidth: 4 },
      selected: { fill: 'rgba(0, 200, 0, 0.3)', stroke: '#00cc00', strokeWidth: 4 }
    },
    accent: {
      default: { fill: 'rgba(186, 230, 253, 0.3)', stroke: '#0369a1', strokeWidth: 3 },
      hover: { fill: 'rgba(186, 230, 253, 0.5)', stroke: '#0369a1', strokeWidth: 4 },
      selected: { fill: 'rgba(0, 200, 0, 0.3)', stroke: '#00cc00', strokeWidth: 4 }
    }
  }
};

/**
 * Expands minimal hotspot syntax into full configuration.
 * Supports shorthand properties with the ability to override any detail.
 * 
 * Minimal syntax:
 *   { id, pos: [x, y, width, height], correct, label, feedback }
 * 
 * Override examples:
 *   { id, pos: [x, y, w, h], correct, label, feedback, theme: 'primary' }
 *   { id, pos: [x, y, w, h], correct, label, feedback, appearance: { ... } }
 *   { id, position: { x, y, width, height }, ... } // Full syntax still works
 */
export function expandHotspot(hotspot) {
  // If already using full syntax, return as-is
  if (hotspot.position && !hotspot.pos) {
    return hotspot;
  }

  // Convert pos array to position object if provided
  const position = hotspot.pos
    ? { x: hotspot.pos[0], y: hotspot.pos[1], width: hotspot.pos[2], height: hotspot.pos[3] }
    : hotspot.position;

  // Determine appearance theme
  let appearance;
  if (hotspot.appearance) {
    // Use explicit appearance override
    appearance = hotspot.appearance;
  } else if (hotspot.theme && HOTSPOT_DEFAULTS.appearance[hotspot.theme]) {
    // Use named theme
    appearance = HOTSPOT_DEFAULTS.appearance[hotspot.theme];
  } else {
    // Use default based on correctness
    appearance = hotspot.correct
      ? HOTSPOT_DEFAULTS.appearance.correct
      : HOTSPOT_DEFAULTS.appearance.incorrect;
  }

  // Expand feedback shorthand
  const feedback = typeof hotspot.feedback === 'string'
    ? { onSelect: hotspot.feedback, onDeselect: null }
    : hotspot.feedback || { onSelect: null, onDeselect: null };

  return {
    id: hotspot.id,
    shape: hotspot.shape || 'rectangle',
    position,
    correct: hotspot.correct,
    label: hotspot.label,
    appearance,
    feedback
  };
}

// Metadata for hotspot interaction type
export const metadata = {
  creator: 'createHotspotQuestion',
  scormType: 'other',
  showCheckAnswer: true,
  isAnswered: (response) => {
    return Array.isArray(response) && response.length > 0;
  },
  getCorrectAnswer: (config) => {
    const normalizedHotspots = normalizeHotspots(config?.hotspots, config?.id);
    if (!normalizedHotspots.length) {
      return '';
    }
    const correctIds = normalizedHotspots.filter(h => h.correct).map(h => h.id);
    return correctIds.length ? JSON.stringify(correctIds) : '';
  },
  formatCorrectAnswer: (question, correctAnswer) => {
    const normalizedHotspots = normalizeHotspots(question?.hotspots, question?.id);
    const byId = new Map(normalizedHotspots.map(spot => [spot.id, spot]));
    const validIds = new Set(byId.keys());
    const providedCorrectIds = sanitizeSelection(correctAnswer, validIds);
    const resolvedSpots = (providedCorrectIds.length ? providedCorrectIds : normalizedHotspots.filter(h => h.correct))
      .map(id => byId.get(id))
      .filter(Boolean);

    if (!resolvedSpots.length) {
      return '<p class="correct-item">No correct hotspots configured</p>';
    }

    return '<ul class="list-disc pl-4 m-0">' + resolvedSpots.map(spot => `<li class="correct-item">${spot.label}</li>`).join('') + '</ul>';
  },
  formatUserResponse: (question, response) => {
    const normalizedHotspots = normalizeHotspots(question?.hotspots, question?.id);
    const byId = new Map(normalizedHotspots.map(spot => [spot.id, spot]));
    const selections = sanitizeSelection(response, new Set(byId.keys()));

    if (!selections.length) {
      return '<p class="response-item">No hotspots selected</p>';
    }

    return '<ul class="list-disc pl-4 m-0">' + selections.map(id => {
      const spot = byId.get(id);
      return `<li class="response-item">${spot ? spot.label : id}</li>`;
    }).join('') + '</ul>';
  }
};

// Schema for validation, linting, and AI-assisted authoring
export const schema = {
  type: 'hotspot',
  description: 'Image-based click-to-select regions',
  scormType: 'other',
  example: `<div class="interaction hotspot" data-interaction-id="demo-hotspot">
  <div class="question-prompt"><h3>Click the correct regions</h3></div>
  <div class="hotspot-container">
    <div class="image-container relative" style="position: relative; display: inline-block;">
      <img src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='500' height='300' fill='%23f1f5f9'%3E%3Crect width='500' height='300' rx='8'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' fill='%2394a3b8' font-family='system-ui' font-size='14'%3EHotspot Image%3C/text%3E%3C/svg%3E" alt="Hotspot image" style="width: 100%; height: auto;">
      <button type="button" role="checkbox" class="hotspot-area" aria-label="Region A" aria-checked="false" style="position: absolute; left: 15%; top: 20%; width: 20%; height: 30%; background: rgba(199,210,254,0.3); border: 3px solid #4338ca; border-radius: 4px; cursor: pointer;"></button>
      <button type="button" role="checkbox" class="hotspot-area selected" aria-label="Region B" aria-checked="true" style="position: absolute; left: 60%; top: 40%; width: 25%; height: 35%; background: rgba(0,200,0,0.3); border: 3px solid #00cc00; border-radius: 4px; cursor: pointer;"></button>
    </div>
  </div>
</div>`,
  properties: {
    image: {
      type: 'object',
      required: true,
      description: 'Background image',
      valueSchema: {
        src: { type: 'string', required: true },
        alt: { type: 'string' }
      }
    },
    hotspots: {
      type: 'array',
      required: true,
      minItems: 1,
      description: 'Clickable regions',
      itemSchema: {
        id: { type: 'string', required: true },
        pos: { type: 'array', description: '[x, y, width, height] in %' },
        correct: { type: 'boolean', required: true },
        label: { type: 'string' }
      }
    }
  },
  notes: 'Use pos shorthand [x, y, w, h] or expanded position object'
};

export function createHotspotQuestion(config) {
  validateAgainstSchema(config, schema);

  const {
    id,
    prompt,
    image = {},
    hotspots = [],
    feedback,
    controlled = false
  } = config;

  if (!image?.src) {
    throw new Error(`Hotspot question "${id}" is missing an image source.`);
  }

  if (!Array.isArray(hotspots) || hotspots.length === 0) {
    throw new Error(`Hotspot question "${id}" has no hotspot regions configured.`);
  }

  // Expand minimal hotspot syntax before normalization
  const expandedHotspots = hotspots.map(expandHotspot);
  const normalizedHotspots = ensureUniqueHotspotIds(normalizeHotspots(expandedHotspots, id));
  const hotspotMap = new Map(normalizedHotspots.map(spot => [spot.id, spot]));
  const validSpotIds = new Set(hotspotMap.keys());
  const correctSpots = normalizedHotspots.filter(spot => spot.correct).map(spot => spot.id);

  let _container = null;

  const questionObj = {
    id,
    type: 'hotspot',
    render: (container, initialResponse = null) => {
      validateContainer(container, id);
      _container = container;

      const initialSelections = sanitizeSelection(initialResponse, validSpotIds);
      if (initialSelections.length) {
        logger.debug(`[Hotspot] Initializing with ${initialSelections.length} saved selection(s)`);
      }

      container._hotspotState = {
        selectedSpots: initialSelections
      };

      const hotspotButtons = normalizedHotspots.map((spot, index) => {
        const isSelected = initialSelections.includes(spot.id);
        const baseClasses = ['hotspot-area'];
        if (isSelected) baseClasses.push('selected');

        const inlineStyles = [
          'position: absolute',
          `left: ${spot.cssLeft}`,
          `top: ${spot.cssTop}`,
          `width: ${spot.cssWidth}`,
          `height: ${spot.cssHeight}`,
          `background: ${isSelected ? spot.selectedBackgroundColor : spot.backgroundColor}`,
          `border-color: ${isSelected ? spot.selectedBorderColor : spot.borderColor}`,
          `border-width: ${(isSelected ? spot.selectedBorderWidth : spot.borderWidth)}px`,
          `border-style: ${isSelected ? (spot.selectedBorderStyle || spot.borderStyle || 'solid') : (spot.borderStyle || 'solid')}`,
          `border-radius: ${spot.borderRadius}`,
          'cursor: pointer',
          'z-index: 10'
        ];

        if (spot.style) {
          inlineStyles.push(spot.style);
        }

        return `
          <button
            type="button"
            role="checkbox"
            class="${baseClasses.join(' ')}"
            data-hotspot-id="${spot.id}"
            data-correct="${spot.correct}"
            data-default-bg="${spot.backgroundColor}"
            data-selected-bg="${spot.selectedBackgroundColor}"
            data-default-border="${spot.borderColor}"
            data-selected-border="${spot.selectedBorderColor}"
            data-default-border-width="${spot.borderWidth}"
            data-selected-border-width="${spot.selectedBorderWidth}"
            data-default-border-style="${spot.borderStyle || 'solid'}"
            data-selected-border-style="${spot.selectedBorderStyle || spot.borderStyle || 'solid'}"
            data-hover="false"
            aria-label="${spot.label}"
            aria-checked="${isSelected}"
            title="${spot.label}"
            style="${inlineStyles.join('; ')}"
            data-testid="${id}-hotspot-${spot.id}"
          >
            <span class="sr-only">${spot.label || `Hotspot ${index + 1}`}</span>
          </button>`;
      }).join('');

      const html = `
        <div class="interaction hotspot" data-interaction-id="${id}">
          <div class="question-prompt">
            <h3>${prompt}</h3>
          </div>
          <div class="hotspot-container">
            <div class="image-container relative">
              <img
                src="${image.src}"
                alt="${image.alt || ''}"
                class="w-full h-auto"
                id="${id}_image"
              />
              ${hotspotButtons}
            </div>
          </div>
          <div class="hotspot-feedback" id="${id}_feedback" aria-live="polite"></div>
          ${renderInteractionControls(id, controlled)}
        </div>`;

      container.innerHTML = html;

      if (initialSelections.length) {
        questionObj.setResponse(initialSelections);
      }

      setupHotspotInteraction(container, questionObj, { controlled, validSpotIds, hotspotMap });
    },

    evaluate: (selectedSpots) => {
      const selections = sanitizeSelection(Array.isArray(selectedSpots) ? selectedSpots : [], validSpotIds);
      const correctSpots = normalizedHotspots.filter(spot => spot.correct).map(spot => spot.id);
      const correctSet = new Set(correctSpots);
      const allCorrectPresent = correctSpots.every(idValue => selections.includes(idValue));
      const noIncorrectSelected = selections.every(idValue => correctSet.has(idValue));
      const correct = selections.length > 0 && allCorrectPresent && noIncorrectSelected;
      const score = correct ? 1 : 0;

      return {
        score,
        correct,
        results: { selected: selections, correct: correctSpots },
        response: JSON.stringify(selections)
      };
    },

    checkAnswer: (container = null) => {
      const targetContainer = container || _container;
      validateContainer(targetContainer, id);

      const selections = questionObj.getResponse(targetContainer) || [];

      if (!selections.length) {
        displayFeedback(
          targetContainer,
          'Select at least one hotspot before checking your answer.',
          'error'
        );
        return null;
      }

      const evaluation = questionObj.evaluate(selections);

      if (evaluation.correct) {
        displayFeedback(
          targetContainer,
          '✓ Excellent! You found all the correct areas.',
          'correct'
        );
      } else {
        const correctCount = evaluation.results.correct.length;
        const selectedCount = selections.length;
        displayFeedback(
          targetContainer,
          `✗ Keep trying. ${selectedCount} selected / ${correctCount} required.`,
          'incorrect'
        );
      }

      recordInteractionResult(
        id,
        'other',
        evaluation.response,
        evaluation.correct,
        JSON.stringify(normalizedHotspots.filter(h => h.correct).map(h => h.id)),
        prompt,
        controlled
      );

      return evaluation;
    },

    reset: (container = null) => {
      const targetContainer = container || _container;
      validateContainer(targetContainer, id);

      questionObj.setResponse([], targetContainer);
      clearFeedback(targetContainer);
    },

    setResponse: (response, container = null) => {
      const targetContainer = container || _container;
      validateContainer(targetContainer, id);

      const selections = sanitizeSelection(response, validSpotIds);

      if (!targetContainer._hotspotState) {
        targetContainer._hotspotState = { selectedSpots: [] };
      }
      targetContainer._hotspotState.selectedSpots = selections;

      const allSpots = targetContainer.querySelectorAll('.hotspot-area');
      allSpots.forEach(spotEl => {
        const spotId = spotEl.dataset.hotspotId;
        const isSelected = selections.includes(spotId);
        const spotConfig = hotspotMap.get(spotId);

        spotEl.classList.toggle('selected', isSelected);
        spotEl.setAttribute('aria-checked', isSelected ? 'true' : 'false');

        if (spotConfig) {
          const hover = spotEl.dataset.hover === 'true';
          applyVisualState(spotEl, spotConfig, { selected: isSelected, hover });
        }
      });
    },

    getResponse: (container = null) => {
      const targetContainer = container || _container;
      validateContainer(targetContainer, id);

      if (!targetContainer._hotspotState) {
        return [];
      }
      return targetContainer._hotspotState.selectedSpots.slice();
    },

    getCorrectAnswer: () => {
      return correctSpots.slice();
    },

    hotspots: normalizedHotspots,
    prompt,
    feedback,
    controlled
  };

  // For uncontrolled interactions, register with the central registry for lifecycle mgmt
  if (!controlled) {
    registerCoreInteraction(config, questionObj);
  }

  return questionObj;
}

function setupHotspotInteraction(container, questionObj, { controlled, validSpotIds, hotspotMap }) {
  // Click handler: toggle hotspot selection
  container.addEventListener('click', (event) => {
    const spot = event.target.closest('.hotspot-area');
    if (!spot || spot.disabled) return;

    const spotId = spot.dataset.hotspotId;
    if (!validSpotIds.has(spotId)) return;

    const state = container._hotspotState;
    if (!state) return;

    const isSelected = state.selectedSpots.includes(spotId);

    if (isSelected) {
      state.selectedSpots = state.selectedSpots.filter(id => id !== spotId);
    } else {
      state.selectedSpots.push(spotId);
    }

    const spotConfig = hotspotMap.get(spotId);
    spot.classList.toggle('selected', !isSelected);
    spot.setAttribute('aria-checked', !isSelected ? 'true' : 'false');
    if (spotConfig) {
      applyVisualState(spot, spotConfig, { selected: !isSelected, hover: spot.dataset.hover === 'true' });
    }

    // Show per-hotspot feedback if configured
    const feedbackConfig = spotConfig?.feedback;
    if (feedbackConfig) {
      const msg = !isSelected ? feedbackConfig.onSelect : feedbackConfig.onDeselect;
      if (msg) {
        const feedbackEl = container.querySelector('.hotspot-feedback');
        if (feedbackEl) feedbackEl.textContent = msg;
      }
    }
  });

  // Hover handlers for visual feedback
  container.addEventListener('pointerenter', (event) => {
    const spot = event.target.closest('.hotspot-area');
    if (!spot || spot.disabled) return;
    spot.dataset.hover = 'true';
    const spotConfig = hotspotMap.get(spot.dataset.hotspotId);
    if (spotConfig) {
      applyVisualState(spot, spotConfig, { selected: spot.classList.contains('selected'), hover: true });
    }
  }, true);

  container.addEventListener('pointerleave', (event) => {
    const spot = event.target.closest('.hotspot-area');
    if (!spot || spot.disabled) return;
    spot.dataset.hover = 'false';
    const spotConfig = hotspotMap.get(spot.dataset.hotspotId);
    if (spotConfig) {
      applyVisualState(spot, spotConfig, { selected: spot.classList.contains('selected'), hover: false });
    }
  }, true);

  // Attach standard check/reset button handler in uncontrolled mode
  if (!controlled) {
    container.addEventListener('click', createInteractionEventHandler(questionObj, {
      id: questionObj.id,
      scormType: 'other',
      controlled
    }));
  }
}

function applyVisualState(element, config, { selected, hover }) {
  if (!element || !config) {
    return;
  }

  const background = hover && config.hoverBackgroundColor
    ? config.hoverBackgroundColor
    : (selected ? config.selectedBackgroundColor : config.backgroundColor);

  const borderColor = hover && config.hoverBorderColor
    ? config.hoverBorderColor
    : (selected ? config.selectedBorderColor : config.borderColor);

  const borderWidth = hover && config.hoverBorderWidth !== undefined
    ? config.hoverBorderWidth
    : (selected ? config.selectedBorderWidth : config.borderWidth);

  const borderStyle = hover && config.hoverBorderStyle
    ? config.hoverBorderStyle
    : (selected ? config.selectedBorderStyle : config.borderStyle);

  element.style.background = background;
  element.style.borderColor = borderColor;
  element.style.borderWidth = `${Math.max(0, toNumber(borderWidth, config.borderWidth))}px`;
  element.style.borderStyle = borderStyle || 'solid';
}

function sanitizeSelection(selections, validIds) {
  const unique = new Set();
  const parsedSelections = parseResponse(selections, 'array') || [];
  parsedSelections.forEach(id => {
    if (validIds.has(String(id))) {
      unique.add(String(id));
    }
  });
  return Array.from(unique);
}

function _normalizeIdAndLabel(spot, questionId, index) {
  const generatedId = `${questionId || 'hotspot'}_${index + 1}`;
  spot.id = typeof spot.id === 'string' && spot.id.trim() ? spot.id.trim() : generatedId;
  spot.label = typeof spot.label === 'string' && spot.label.trim() ? spot.label.trim() : `Hotspot ${index + 1}`;
}

function _normalizePosition(spot) {
  const position = (typeof spot.position === 'object' && spot.position !== null) ? spot.position : {};
  const usesPositionObject = Object.keys(position).length > 0;

  const leftUnit = resolveUnit(position.xUnit || position.unit || spot.xUnit, usesPositionObject ? 'px' : '%');
  const topUnit = resolveUnit(position.yUnit || position.unit || spot.yUnit, usesPositionObject ? 'px' : '%');
  const widthUnit = resolveUnit(position.widthUnit || position.unit || spot.widthUnit, usesPositionObject ? 'px' : '%');
  const heightUnit = resolveUnit(position.heightUnit || position.unit || spot.heightUnit, usesPositionObject ? 'px' : '%');

  spot.cssLeft = toCssValue(position.x ?? spot.x, { fallback: 0, unit: leftUnit, clampToPercent: leftUnit === '%', min: 0 });
  spot.cssTop = toCssValue(position.y ?? spot.y, { fallback: 0, unit: topUnit, clampToPercent: topUnit === '%', min: 0 });
  spot.cssWidth = toCssValue(position.width ?? spot.width, { fallback: usesPositionObject ? 80 : 5, unit: widthUnit, clampToPercent: widthUnit === '%', min: 1 });
  spot.cssHeight = toCssValue(position.height ?? spot.height, { fallback: usesPositionObject ? 80 : 5, unit: heightUnit, clampToPercent: heightUnit === '%', min: 1 });

  spot.x = Number.parseFloat(spot.cssLeft) || 0;
  spot.y = Number.parseFloat(spot.cssTop) || 0;
  spot.width = Number.parseFloat(spot.cssWidth) || (usesPositionObject ? 80 : 5);
  spot.height = Number.parseFloat(spot.cssHeight) || (usesPositionObject ? 80 : 5);
}

function _normalizeAppearance(spot) {
  const appearance = spot.appearance || {};
  const defaultAppearance = appearance.default || {};
  const selectedAppearance = appearance.selected || {};
  const hoverAppearance = appearance.hover || {};

  spot.backgroundColor = defaultAppearance.fill || spot.backgroundColor || 'rgba(255, 0, 0, 0.3)';
  spot.selectedBackgroundColor = selectedAppearance.fill || spot.selectedBackgroundColor || 'rgba(0, 150, 255, 0.5)';
  spot.hoverBackgroundColor = hoverAppearance.fill || spot.hoverBackgroundColor || '';

  spot.borderColor = defaultAppearance.stroke || spot.borderColor || '#ff0000';
  spot.borderWidth = toNumber(defaultAppearance.strokeWidth ?? spot.borderWidth, 2);
  spot.selectedBorderColor = selectedAppearance.stroke || spot.selectedBorderColor || spot.borderColor;
  spot.selectedBorderWidth = toNumber(selectedAppearance.strokeWidth ?? spot.selectedBorderWidth, spot.borderWidth);
  spot.hoverBorderColor = hoverAppearance.stroke || spot.hoverBorderColor || '';
  spot.hoverBorderWidth = toNumber(hoverAppearance.strokeWidth ?? spot.hoverBorderWidth, spot.borderWidth);
  spot.borderStyle = defaultAppearance.strokeStyle || spot.borderStyle || 'solid';
  spot.selectedBorderStyle = selectedAppearance.strokeStyle || spot.selectedBorderStyle || spot.borderStyle;
  spot.hoverBorderStyle = hoverAppearance.strokeStyle || spot.hoverBorderStyle || spot.borderStyle;
}

function _normalizeMisc(spot) {
  spot.borderRadius = typeof spot.borderRadius === 'string'
    ? spot.borderRadius
    : (spot.shape && spot.shape.toLowerCase() === 'rectangle' ? '0' : '50%');
  spot.correct = spot.correct === true || spot.correct === 'true' || spot.correct === 1;
  spot.style = typeof spot.style === 'string' ? spot.style : '';
}

function normalizeHotspots(hotspots, questionId) {
  if (!Array.isArray(hotspots)) {
    return [];
  }

  return hotspots.map((spot = {}, index) => {
    const normalized = { ...spot };

    _normalizeIdAndLabel(normalized, questionId, index);
    _normalizePosition(normalized);
    _normalizeAppearance(normalized);
    _normalizeMisc(normalized);

    return normalized;
  });
}
function ensureUniqueHotspotIds(hotspots) {
  const usedIds = new Set();
  return hotspots.map((spot, index) => {
    let spotId = spot.id;
    if (!spotId) {
      spotId = `hotspot_${index + 1}`;
    }

    let suffix = 1;
    while (usedIds.has(spotId)) {
      suffix += 1;
      spotId = `${spot.id || `hotspot_${index + 1}`}_${suffix}`;
    }

    usedIds.add(spotId);
    return { ...spot, id: spotId };
  });
}

function resolveUnit(unit, fallback = '%') {
  if (!unit && unit !== 0) {
    return fallback;
  }

  const normalized = String(unit).trim().toLowerCase();
  if (!normalized) {
    return fallback;
  }

  if (normalized === '%' || normalized === 'percent' || normalized === 'percentage') {
    return '%';
  }

  if (normalized === 'px' || normalized === 'pixel' || normalized === 'pixels') {
    return 'px';
  }

  return normalized;
}

function toCssValue(value, { fallback = 0, unit = '%', clampToPercent = false, min = null, max = null } = {}) {
  const resolvedUnit = resolveUnit(unit, '%');

  if (typeof value === 'string' && value.trim()) {
    return value.trim();
  }

  const numeric = Number.parseFloat(value);
  if (Number.isFinite(numeric)) {
    return formatNumericCssValue(numeric, resolvedUnit, { clampToPercent, min, max });
  }

  if (typeof fallback === 'string' && fallback.trim()) {
    return fallback.trim();
  }

  const fallbackNumeric = Number.parseFloat(fallback);
  if (Number.isFinite(fallbackNumeric)) {
    return formatNumericCssValue(fallbackNumeric, resolvedUnit, { clampToPercent, min, max });
  }

  return formatNumericCssValue(0, resolvedUnit, { clampToPercent, min, max });
}

function formatNumericCssValue(value, unit, { clampToPercent, min, max }) {
  let output = value;

  if (typeof min === 'number') {
    output = Math.max(min, output);
  }
  if (typeof max === 'number') {
    output = Math.min(max, output);
  }

  if (clampToPercent) {
    output = Math.min(100, Math.max(0, output));
  }

  return `${output}${unit}`;
}

function toNumber(value, fallback = 0) {
  const numeric = Number.parseFloat(value);
  if (Number.isFinite(numeric)) {
    return Math.max(0, numeric);
  }
  const fallbackNumeric = Number.parseFloat(fallback);
  if (Number.isFinite(fallbackNumeric)) {
    return Math.max(0, fallbackNumeric);
  }
  return 0;
}

