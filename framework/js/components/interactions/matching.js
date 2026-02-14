import {
    validateAgainstSchema,
    createInteractionEventHandler,
    renderInteractionControls,
    renderFeedbackContainer,
    displayFeedback,
    clearFeedback,
    validateContainer,
    escapeCssSelector,
    registerCoreInteraction
} from './interaction-base.js';

// Metadata for matching interaction type
export const metadata = {
    creator: 'createMatchingQuestion',
    scormType: 'matching',
    showCheckAnswer: true,
    isAnswered: (response) => {
        if (!response || typeof response !== 'object') return false;
        return Object.keys(response).length > 0 && Object.values(response).some(val => val && String(val).trim().length > 0);
    },
    getCorrectAnswer: (config) => {
        if (!config.pairs || !Array.isArray(config.pairs)) {
            return '';
        }
        return JSON.stringify(config.pairs.reduce((acc, pair) => {
            acc[pair.id] = pair.match;
            return acc;
        }, {}));
    },
    formatCorrectAnswer: (question, correctAnswer) => {
        let html = '';
        if (question.pairs && Array.isArray(question.pairs)) {
            html += '<ul class="list-disc pl-4 m-0">';
            question.pairs.forEach(pair => {
                const matchText = pair.match || '';
                html += `<li class="correct-item">${pair.text} → ${matchText}</li>`;
            });
            html += '</ul>';
        } else {
            html += `<p class="correct-item">${correctAnswer}</p>`;
        }
        return html;
    },
    formatUserResponse: (question, response) => {
        let html = '';
        try {
            const userMatches = typeof response === 'string' ? JSON.parse(response) : response;
            if (question.pairs && Array.isArray(question.pairs)) {
                html += '<ul class="list-disc pl-4 m-0">';
                question.pairs.forEach(pair => {
                    const matched = userMatches[pair.id] || '(not matched)';
                    html += `<li class="response-item">${pair.text} → ${matched}</li>`;
                });
                html += '</ul>';
            } else {
                html += `<p class="response-item">${JSON.stringify(userMatches)}</p>`;
            }
        } catch (_error) {
            html += `<p class="response-item">${response}</p>`;
        }
        return html;
    }
};

// Schema for validation, linting, and AI-assisted authoring
export const schema = {
    type: 'matching',
    description: 'Match source items to their correct targets',
    scormType: 'matching',
    example: `<div class="interaction matching-interaction matching-deferred" data-interaction-id="demo-matching">
  <div class="question-prompt"><h3>Match each item to its pair</h3></div>
  <div class="matching-container">
    <div class="matching-column matching-items">
      <h4 class="matching-column-header">Items</h4>
      <div class="matching-list">
        <button type="button" class="matching-item matched" data-item-id="p1" style="--pair-color: #9333ea;" disabled><span class="matching-item-text">HTML</span></button>
        <button type="button" class="matching-item" data-item-id="p2"><span class="matching-item-text">CSS</span></button>
        <button type="button" class="matching-item" data-item-id="p3"><span class="matching-item-text">JavaScript</span></button>
      </div>
    </div>
    <div class="matching-column matching-targets">
      <h4 class="matching-column-header">Matches</h4>
      <div class="matching-list">
        <button type="button" class="matching-target" data-match-id="p3"><span class="matching-target-text">Interactivity</span></button>
        <button type="button" class="matching-target matched" data-match-id="p1" style="--pair-color: #9333ea;" disabled><span class="matching-target-text">Structure</span></button>
        <button type="button" class="matching-target" data-match-id="p2"><span class="matching-target-text">Styling</span></button>
      </div>
    </div>
  </div>
</div>`,
    properties: {
        pairs: {
            type: 'array',
            required: true,
            minItems: 2,
            description: 'Source-target pairs to match',
            itemSchema: {
                source: { type: 'string', required: true },
                target: { type: 'string', required: true }
            }
        },
        feedbackMode: {
            type: 'string',
            enum: ['immediate', 'deferred'],
            default: 'deferred',
            description: 'When to show match feedback'
        }
    }
};

/**
 * Creates a matching question interaction
 * @param {Object} config - Configuration object
 * @param {string} config.id - Unique identifier
 * @param {string} config.prompt - Question prompt
 * @param {Array} config.pairs - Array of {id, text, match} pairs
 * @param {Object} config.feedback - Optional feedback messages
 * @param {boolean} config.controlled - Whether to use controlled mode
 * @param {string} config.feedbackMode - 'immediate' | 'deferred' (default: 'deferred')
 *   - immediate: Green/red feedback on each match, no check button
 *   - deferred: Visual connections, check all at once with smart feedback
 * @returns {Object} Question object with render, evaluate, checkAnswer, reset, getResponse, setResponse methods
 */
export function createMatchingQuestion(config) {
    validateAgainstSchema(config, schema);

    const {
        id,
        prompt,
        pairs,
        controlled = false,
        feedbackMode = 'deferred'
    } = config;

    // Validate pairs array
    if (!Array.isArray(pairs) || pairs.length === 0) {
        throw new Error(`Matching question "${id}" must have at least one pair`);
    }

    // Validate pair structure
    pairs.forEach((pair, index) => {
        if (!pair.id || !pair.text || !pair.match) {
            throw new Error(`Matching question "${id}" pair at index ${index} must have id, text, and match properties`);
        }
    });

    let _container = null;
    let _pairsData = null;
    const _colors = ['#9333ea', '#ec4899', '#f59e0b', '#3b82f6', '#6366f1', '#8b5cf6', '#06b6d4', '#14b8a6'];

    const questionObj = {
        id,
        type: 'matching',
        pairs,
        feedbackMode,

        render: (container) => {
            validateContainer(container, id);
            _container = container;

            // Create shuffled match options (right column)
            const matchOptions = pairs.map(p => ({ id: p.id, match: p.match }));
            shuffleArray(matchOptions);

            // Store pairs data for later reference
            _pairsData = {
                items: pairs.map(p => ({ id: p.id, text: p.text })),
                matches: matchOptions,
                correctAnswers: pairs.reduce((acc, p) => {
                    acc[p.id] = p.match;
                    return acc;
                }, {})
            };

            const modeClass = feedbackMode === 'immediate' ? 'matching-immediate' : 'matching-deferred';
            const instructionText = feedbackMode === 'immediate'
                ? 'Click an item on the left, then its correct match on the right.'
                : 'Click an item on the left, then click its match on the right.';

            let html = `
                <div class="interaction matching-interaction ${modeClass}" data-interaction-id="${id}" data-feedback-mode="${feedbackMode}">
                    <div class="question-prompt">
                        <h3>${prompt}</h3>
                        <p class="matching-instruction">${instructionText}</p>
                    </div>
                    <div class="matching-container">
                        <div class="matching-column matching-items">
                            <h4 class="matching-column-header">Items</h4>
                            <div class="matching-list">
            `;

            pairs.forEach((pair) => {
                html += `
                    <button type="button" 
                            class="matching-item" 
                            data-item-id="${pair.id}" 
                            data-testid="${id}-match-item-${pair.id}"
                            aria-label="Match item: ${pair.text}">
                        <span class="matching-item-text">${pair.text}</span>
                        ${feedbackMode === 'immediate' ? '<span class="matching-feedback-icon" aria-hidden="true"></span>' : ''}
                    </button>
                `;
            });

            html += `
                            </div>
                        </div>
                        <div class="matching-column matching-targets">
                            <h4 class="matching-column-header">Matches</h4>
                            <div class="matching-list">
            `;

            matchOptions.forEach((option) => {
                html += `
                    <button type="button" 
                            class="matching-target" 
                            data-match-id="${option.id}" 
                            data-testid="${id}-match-target-${option.id}"
                            aria-label="Match target: ${option.match}">
                        <span class="matching-target-text">${option.match}</span>
                        ${feedbackMode === 'deferred' ? '<span class="matching-connection-indicator" aria-hidden="true"></span>' : ''}
                    </button>
                `;
            });

            html += `
                            </div>
                        </div>
                    </div>
                    ${feedbackMode === 'deferred' ? renderInteractionControls(id, controlled) : ''}
                    ${renderFeedbackContainer(id)}
                </div>
            `;

            container.innerHTML = html;

            // Setup interaction state and handlers
            setupMatchingInteraction(container, questionObj, _pairsData, feedbackMode, _colors);

            // Attach event handler only in uncontrolled mode AND deferred mode
            if (!controlled && feedbackMode === 'deferred') {
                const correctPattern = JSON.stringify(_pairsData.correctAnswers);

                container.addEventListener('click', createInteractionEventHandler(questionObj, {
                    ...config,
                    scormType: 'matching',
                    correctPattern
                }));
            }
        },

        evaluate: (matches) => {
            if (!matches || typeof matches !== 'object') {
                return {
                    score: 0,
                    correct: false,
                    results: [],
                    response: JSON.stringify({}),
                    error: 'Invalid matches format'
                };
            }

            let correct = 0;
            const results = [];

            pairs.forEach(pair => {
                const userAnswer = matches[pair.id];
                const correctAnswer = pair.match;
                const isCorrect = userAnswer && correctAnswer &&
                    userAnswer.trim() === correctAnswer.trim();

                if (isCorrect) correct++;
                results.push({
                    itemId: pair.id,
                    userAnswer: userAnswer || null,
                    correctAnswer: pair.match,
                    correct: isCorrect
                });
            });

            return {
                score: correct / pairs.length,
                correct: correct === pairs.length,
                results,
                response: JSON.stringify(matches)
            };
        },

        checkAnswer: () => {
            validateContainer(_container, id);

            const matches = questionObj.getResponse();
            const evaluation = questionObj.evaluate(matches);

            // Show visual feedback on items
            if (feedbackMode === 'deferred') {
                visuallyShowResults(_container, evaluation.results);
            }

            if (evaluation.correct) {
                const feedbackMsg = config.feedback?.correct || 'Excellent! All matches are correct.';
                displayFeedback(_container, id, feedbackMsg, 'correct');
            } else {
                const feedbackMsg = config.feedback?.incorrect || `${Math.round(evaluation.score * 100)}% correct. Review your matches.`;
                displayFeedback(_container, id, feedbackMsg, 'incorrect');
            }

            return evaluation;
        },

        reset: () => {
            validateContainer(_container, id);

            // Clear all visual states
            _container.querySelectorAll('.matching-item').forEach(item => {
                item.classList.remove('selected', 'matched', 'correct', 'incorrect', 'flash-incorrect');
                item.disabled = false;
                item.style.removeProperty('--pair-color');
            });

            _container.querySelectorAll('.matching-target').forEach(target => {
                target.classList.remove('selected', 'matched', 'correct', 'incorrect');
                target.disabled = false;
                target.style.removeProperty('--pair-color');
            });

            clearFeedback(_container, id);

            // Reset internal state
            const stateData = _container._matchingState;
            if (stateData) {
                stateData.matches = {};
                stateData.selectedItem = null;
                stateData.selectedTarget = null;
                stateData.colorIndex = 0;
            }
        },

        getResponse: () => {
            validateContainer(_container, id);
            const state = _container._matchingState;
            return state ? { ...state.matches } : {};
        },

        setResponse: (matches) => {
            validateContainer(_container, id);

            // Handle array format from automation API (e.g., [{source: "pair-1", target: "pair-1"}])
            let processedMatches = matches;
            if (Array.isArray(matches)) {
                processedMatches = {};
                matches.forEach(item => {
                    if (item.source && item.target) {
                        // Map source ID to target ID/text
                        // The automation API might pass the target ID or the target text.
                        // The internal state expects { itemId: matchText }.
                        // If the input is { source: "pair-1", target: "pair-1" }, we need to know if "pair-1" is the ID or text.
                        // In this component, match options have IDs same as pair IDs usually, but text is what's stored in state.matches.

                        // Let's try to find the match text corresponding to the target ID if possible
                        const targetId = item.target;
                        const targetOption = _pairsData.matches.find(m => m.id === targetId);
                        const matchText = targetOption ? targetOption.match : item.target;

                        processedMatches[item.source] = matchText;
                    }
                });
            }

            if (!processedMatches || typeof processedMatches !== 'object') {
                throw new Error(`setResponse expects an object for matching question "${id}"`);
            }

            questionObj.reset();

            const state = _container._matchingState;
            if (state) {
                state.matches = { ...processedMatches };

                // Update UI to reflect matches
                Object.entries(processedMatches).forEach(([itemId, matchText]) => {
                    const item = _container.querySelector(`.matching-item[data-item-id="${escapeCssSelector(itemId)}"]`);
                    const target = Array.from(_container.querySelectorAll('.matching-target'))
                        .find(t => t.querySelector('.matching-target-text')?.textContent.trim() === matchText);

                    if (item && target) {
                        item.classList.add('matched');
                        target.classList.add('matched');
                        item.disabled = true;
                        target.disabled = true;

                        if (feedbackMode === 'deferred') {
                            const color = _colors[state.colorIndex % _colors.length];
                            item.style.setProperty('--pair-color', color);
                            target.style.setProperty('--pair-color', color);
                            state.colorIndex++;
                        }
                    }
                });
            }
        },

        getCorrectAnswer: () => {
            return pairs.reduce((acc, pair) => {
                acc[pair.id] = pair.match;
                return acc;
            }, {});
        }
    };

    // For uncontrolled interactions, register with the central registry for lifecycle mgmt
    if (!controlled) {
        registerCoreInteraction(config, questionObj);
    }

    return questionObj;
}

/**
 * Shuffles array in place
 */
function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

/**
 * Visually show results for deferred feedback mode
 */
function visuallyShowResults(container, results) {
    results.forEach(result => {
        const item = container.querySelector(`.matching-item[data-item-id="${escapeCssSelector(result.itemId)}"]`);
        const target = Array.from(container.querySelectorAll('.matching-target'))
            .find(t => t.querySelector('.matching-target-text')?.textContent.trim() === result.userAnswer);

        if (result.correct) {
            // Keep green for correct
            if (item) {
                item.classList.remove('matched');
                item.classList.add('correct');
            }
            if (target) {
                target.classList.remove('matched');
                target.classList.add('correct');
            }
        } else {
            // Flash red then reset incorrect ones
            if (item) {
                item.classList.add('flash-incorrect');
                setTimeout(() => {
                    item.classList.remove('flash-incorrect', 'matched');
                    item.disabled = false;
                    item.style.removeProperty('--pair-color');
                }, 1000);
            }
            if (target) {
                target.classList.add('flash-incorrect');
                setTimeout(() => {
                    target.classList.remove('flash-incorrect', 'matched');
                    target.disabled = false;
                    target.style.removeProperty('--pair-color');
                }, 1000);
            }

            // Remove from state after animation
            const state = container._matchingState;
            if (state) {
                setTimeout(() => {
                    delete state.matches[result.itemId];
                }, 1000);
            }
        }
    });
}

/**
 * Sets up the matching interaction state and click handlers
 */
function setupMatchingInteraction(container, questionObj, pairsData, feedbackMode, colors) {
    container._matchingState = {
        matches: {},
        selectedItem: null,
        selectedTarget: null,
        pairsData,
        colorIndex: 0
    };

    container.addEventListener('click', (event) => {
        const state = container._matchingState;

        const matchingItem = event.target.closest('.matching-item');
        if (matchingItem && !matchingItem.disabled) {
            if (state.selectedTarget) {
                performMatch(container, state, matchingItem, state.selectedTarget, pairsData, feedbackMode, colors);
                return;
            }
            handleItemClick(container, state, matchingItem, feedbackMode, colors);
            return;
        }

        const matchingTarget = event.target.closest('.matching-target');
        if (matchingTarget && !matchingTarget.disabled) {
            if (state.selectedItem) {
                performMatch(container, state, state.selectedItem, matchingTarget, pairsData, feedbackMode, colors);
                return;
            }
            if (matchingTarget.classList.contains('matched')) {
                unmatchTarget(container, state, matchingTarget, feedbackMode);
                return;
            }
            handleTargetClick(container, state, matchingTarget, feedbackMode, colors);
        }
    });

    container.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            const target = event.target;
            if (target.classList.contains('matching-item') || target.classList.contains('matching-target')) {
                target.click();
            }
        }
    });
}

function handleItemClick(container, state, item, feedbackMode, colors) {
    if (item.classList.contains('matched')) {
        unmatchItem(container, state, item);
        return;
    }

    state.selectedItem = item;
    state.selectedTarget = null;

    // In deferred mode, set the color FIRST before any DOM changes
    if (feedbackMode === 'deferred' && colors) {
        const nextColor = colors[state.colorIndex % colors.length];
        item.style.setProperty('--selection-color', nextColor);
    }

    // Now clear other selections
    container.querySelectorAll('.matching-item').forEach(i => {
        i.classList.remove('selected');
        if (i !== item) {
            i.style.removeProperty('--selection-color');
        }
    });
    container.querySelectorAll('.matching-target').forEach(t => {
        t.classList.remove('selected');
        t.style.removeProperty('--selection-color');
    });

    item.classList.add('selected');
}

function handleTargetClick(container, state, target, feedbackMode, colors) {
    state.selectedTarget = target;
    state.selectedItem = null;

    // In deferred mode, set the color FIRST before any DOM changes
    if (feedbackMode === 'deferred' && colors) {
        const nextColor = colors[state.colorIndex % colors.length];
        target.style.setProperty('--selection-color', nextColor);
    }

    // Now clear other selections
    container.querySelectorAll('.matching-item').forEach(i => {
        i.classList.remove('selected');
        i.style.removeProperty('--selection-color');
    });
    container.querySelectorAll('.matching-target').forEach(t => {
        t.classList.remove('selected');
        if (t !== target) {
            t.style.removeProperty('--selection-color');
        }
    });

    target.classList.add('selected');
}

function performMatch(container, state, item, target, pairsData, feedbackMode, colors) {
    const itemId = item.dataset.itemId;
    const matchText = target.querySelector('.matching-target-text').textContent.trim();

    // Pre-emptively set the selection color on the target to prevent focus flicker.
    // The target is about to be matched, so it should share the same color
    // as the already-selected item.
    if (feedbackMode === 'deferred') {
        const currentColor = colors[state.colorIndex % colors.length];
        target.style.setProperty('--selection-color', currentColor);
    }

    const correctAnswer = pairsData.correctAnswers[itemId];
    const isCorrect = matchText === correctAnswer;

    // Immediate feedback mode
    if (feedbackMode === 'immediate') {
        if (isCorrect) {
            item.classList.remove('selected');
            item.classList.add('matched', 'correct');
            item.disabled = true;

            target.classList.remove('selected');
            target.classList.add('matched', 'correct');
            target.disabled = true;

            state.matches[itemId] = matchText;
        } else {
            // Flash red then reset
            item.classList.add('incorrect');
            target.classList.add('incorrect');

            setTimeout(() => {
                item.classList.remove('incorrect', 'selected');
                target.classList.remove('incorrect', 'selected');
            }, 600);
        }

        state.selectedItem = null;
        state.selectedTarget = null;
        return;
    }

    // Deferred feedback mode - allow any match with color coding
    const existingItemId = Object.keys(state.matches).find(id => state.matches[id] === matchText);
    if (existingItemId && existingItemId !== itemId) {
        const prevItem = container.querySelector(`.matching-item[data-item-id="${escapeCssSelector(existingItemId)}"]`);
        if (prevItem) {
            prevItem.classList.remove('matched');
            prevItem.style.removeProperty('--pair-color');
        }
        delete state.matches[existingItemId];
    }

    if (state.matches[itemId]) {
        const prevMatchText = state.matches[itemId];
        const prevTarget = Array.from(container.querySelectorAll('.matching-target'))
            .find(t => t.querySelector('.matching-target-text')?.textContent.trim() === prevMatchText);
        if (prevTarget) {
            prevTarget.classList.remove('matched');
            prevTarget.style.removeProperty('--pair-color');
        }
    }

    const color = colors[state.colorIndex % colors.length];
    state.colorIndex++;

    item.classList.remove('selected');
    item.classList.add('matched');
    // Don't disable in deferred mode - allow rematching
    item.style.setProperty('--pair-color', color);

    target.classList.remove('selected');
    target.classList.add('matched');
    // Don't disable in deferred mode - allow rematching
    target.style.setProperty('--pair-color', color);

    state.matches[itemId] = matchText;
    state.selectedItem = null;
    state.selectedTarget = null;
}

function unmatchItem(container, state, item) {
    const itemId = item.dataset.itemId;
    const matchText = state.matches[itemId];
    if (!matchText) return;

    const target = Array.from(container.querySelectorAll('.matching-target'))
        .find(t => t.querySelector('.matching-target-text')?.textContent.trim() === matchText);

    if (target) {
        target.classList.remove('matched', 'correct');
        target.style.removeProperty('--pair-color');
    }

    item.classList.remove('matched', 'correct');
    item.style.removeProperty('--pair-color');
    delete state.matches[itemId];
}

function unmatchTarget(container, state, target, _feedbackMode) {
    const matchText = target.querySelector('.matching-target-text').textContent.trim();
    const itemId = Object.keys(state.matches).find(id => state.matches[id] === matchText);
    if (!itemId) return;

    const item = container.querySelector(`.matching-item[data-item-id="${escapeCssSelector(itemId)}"]`);
    if (item) {
        item.classList.remove('matched', 'correct');
        item.style.removeProperty('--pair-color');
    }

    target.classList.remove('matched', 'correct');
    target.style.removeProperty('--pair-color');
    delete state.matches[itemId];
}
