import {
    validateAgainstSchema,
    createInteractionEventHandler,
    renderInteractionControls,
    renderFeedbackContainer,
    displayFeedback,
    clearFeedback,
    normalizeInitialResponse,
    validateContainer,
    registerCoreInteraction
} from './interaction-base.js';

// Metadata for sequencing interaction type
export const metadata = {
    creator: 'createSequencingQuestion',
    scormType: 'sequencing',
    showCheckAnswer: true,
    isAnswered: (response) => {
        return Array.isArray(response) && response.length > 0;
    },
    getCorrectAnswer: (config) => {
        return JSON.stringify(config.correctOrder || []);
    },
    formatCorrectAnswer: (question, correctAnswer) => {
        let html = '<ol class="list-decimal pl-4 m-0">';
        const correctOrder = Array.isArray(correctAnswer) ? correctAnswer : [];
        const items = question.items || [];

        correctOrder.forEach(itemId => {
            const item = items.find(i => i.id === itemId);
            if (item) {
                html += `<li>${item.text}</li>`;
            }
        });
        html += '</ol>';
        return html;
    },
    formatUserResponse: (question, response) => {
        let html = '<ol class="list-decimal pl-4 m-0">';
        const userOrder = Array.isArray(response) ? response : [];
        const items = question.items || [];

        userOrder.forEach(itemId => {
            const item = items.find(i => i.id === itemId);
            if (item) {
                html += `<li>${item.text}</li>`;
            }
        });
        html += '</ol>';
        return html;
    }
};

// Schema for validation, linting, and AI-assisted authoring
export const schema = {
    type: 'sequencing',
    description: 'Drag-to-reorder items into correct sequence',
    scormType: 'sequencing',
    example: `<div class="interaction sequencing" data-interaction-id="demo-seq">
  <div class="question-prompt"><h3>Arrange these steps in order:</h3></div>
  <div class="sequencing-layout">
    <div class="sequence-track" aria-hidden="true"><span class="sequence-label sequence-label-start">First</span><div class="sequence-track-line"></div><span class="sequence-label sequence-label-end">Last</span></div>
    <div class="sequencing-list" role="list">
      <div class="sequence-item" draggable="true" role="listitem" tabindex="0"><span class="item-text">Design</span></div>
      <div class="sequence-item" draggable="true" role="listitem" tabindex="0"><span class="item-text">Develop</span></div>
      <div class="sequence-item" draggable="true" role="listitem" tabindex="0"><span class="item-text">Test</span></div>
      <div class="sequence-item" draggable="true" role="listitem" tabindex="0"><span class="item-text">Deploy</span></div>
    </div>
  </div>
  <div class="interaction-controls"><button class="btn btn-primary" disabled>Check Answer</button></div>
</div>`,
    properties: {
        items: {
            type: 'array',
            required: true,
            minItems: 2,
            description: 'Items to sequence',
            itemSchema: {
                id: { type: 'string', required: true },
                text: { type: 'string', required: true }
            }
        },
        correctOrder: {
            type: 'array',
            required: true,
            description: 'Array of item IDs in correct order'
        }
    }
};

export function createSequencingQuestion(config) {
    validateAgainstSchema(config, schema);

    const { id, prompt, items, correctOrder, controlled = false, sequenceLabels = null } = config;

    // Validate items and correctOrder
    if (!Array.isArray(items) || items.length < 2) {
        throw new Error(`Sequencing question "${id}" must have at least two items`);
    }
    if (!Array.isArray(correctOrder) || correctOrder.length !== items.length) {
        throw new Error(`Sequencing question "${id}" correctOrder length must match items length`);
    }

    let _container = null;
    let _currentOrder = [];

    const questionObj = {
        id,
        type: 'sequencing',

        render: (container, initialResponse = null) => {
            validateContainer(container, id);
            _container = container;

            // Determine initial order: use saved response or default (shuffled or as provided)
            // For now, we'll use the order provided in 'items' as the initial display order.
            // Ideally, we should shuffle them if no initial response exists.
            let displayOrderIds = [];

            const initialValue = normalizeInitialResponse(initialResponse);
            if (Array.isArray(initialValue) && initialValue.length === items.length) {
                displayOrderIds = initialValue;
            } else {
                // Default to items order (author should provide them shuffled or we shuffle here)
                // Let's shuffle by default to ensure it's a challenge
                displayOrderIds = items.map(i => i.id).sort(() => Math.random() - 0.5);
            }

            _currentOrder = [...displayOrderIds];

            // Always show a direction cue; use provided labels or fall back to First/Last
            const effectiveSequenceLabels = (sequenceLabels && Array.isArray(sequenceLabels) && sequenceLabels.length >= 2)
                ? sequenceLabels
                : ['First', 'Last'];

            // Build sequence track with start label at top, line in middle, end label at bottom
            const startLabel = effectiveSequenceLabels[0];
            const endLabel = effectiveSequenceLabels[effectiveSequenceLabels.length - 1];
            const sequenceTrackHtml = `
                <div class="sequence-track" aria-hidden="true">
                    <span class="sequence-label sequence-label-start">${startLabel}</span>
                    <div class="sequence-track-line"></div>
                    <span class="sequence-label sequence-label-end">${endLabel}</span>
                </div>
            `;

            let html = `
                <div class="interaction sequencing" data-interaction-id="${id}">
                    <div class="question-prompt">
                        <h3>${prompt}</h3>
                    </div>
                    <div class="sequencing-layout">
                        ${sequenceTrackHtml}
                        <div class="sequencing-list" role="list">
            `;

            displayOrderIds.forEach((itemId, _index) => {
                const item = items.find(i => i.id === itemId);
                if (item) {
                    html += `
                        <div class="sequence-item" 
                             draggable="true" 
                             data-item-id="${item.id}" 
                             role="listitem"
                             tabindex="0"
                             aria-label="${item.text}. Press Up or Down arrow to reorder.">
                            <span class="item-text">${item.text}</span>
                        </div>
                    `;
                }
            });

            html += `
                        </div>
                    </div>
                    ${renderFeedbackContainer(id)}
                    ${renderInteractionControls(id, controlled)}
                </div>
            `;

            container.innerHTML = html;

            // Attach event listeners
            const listContainer = container.querySelector('.sequencing-list');
            attachDragAndDropListeners(listContainer);
            attachKeyboardListeners(listContainer);

            // Attach standard interaction handlers
            container.addEventListener('click', createInteractionEventHandler(questionObj, config));
        },

        getResponse: () => {
            return [..._currentOrder];
        },

        evaluate: (response) => {
            const orderToCheck = Array.isArray(response) ? response : _currentOrder;
            const isCorrect = JSON.stringify(orderToCheck) === JSON.stringify(correctOrder);

            return {
                correct: isCorrect,
                score: isCorrect ? 1 : 0,
                response: orderToCheck
            };
        },

        setResponse: (response) => {
            if (!Array.isArray(response)) return;
            _currentOrder = [...response];
            // Re-render to reflect new order
            questionObj.render(_container, _currentOrder);
        },

        checkAnswer: () => {
            const evaluation = questionObj.evaluate(_currentOrder);
            const feedbackMsg = evaluation.correct
                ? (config.feedback?.correct || 'Correct sequence!')
                : (config.feedback?.incorrect || 'Incorrect sequence. Try again.');

            displayFeedback(_container, id, feedbackMsg, evaluation.correct ? 'correct' : 'incorrect');
            return { ...evaluation, feedback: feedbackMsg };
        },

        reset: () => {
            clearFeedback(_container);
            // Re-shuffle or reset to initial state
            // For simplicity, we'll just re-render with a new shuffle
            questionObj.render(_container, null);
        },

        showHint: () => {
            // Optional: Highlight the first incorrect item
        },

        getCorrectAnswer: () => {
            return [...correctOrder];
        }
    };

    // For uncontrolled interactions, register with the central registry for lifecycle mgmt
    if (!controlled) {
        registerCoreInteraction(config, questionObj);
    }

    // Helper to update internal order state based on DOM
    function updateOrderFromDOM(listContainer) {
        const itemElements = Array.from(listContainer.querySelectorAll('.sequence-item'));
        _currentOrder = itemElements.map(el => el.dataset.itemId);
    }

    function attachDragAndDropListeners(list) {
        let draggedItem = null;

        list.addEventListener('dragstart', (e) => {
            draggedItem = e.target.closest('.sequence-item');
            if (!draggedItem) {
                e.preventDefault();
                return;
            }
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', draggedItem.dataset.itemId);
            draggedItem.classList.add('dragging');
            // Accessibility
            draggedItem.setAttribute('aria-grabbed', 'true');
        });

        list.addEventListener('dragend', (_e) => {
            if (draggedItem) {
                draggedItem.classList.remove('dragging');
                draggedItem.setAttribute('aria-grabbed', 'false');
                draggedItem = null;
            }
            // Remove all drop indicators
            list.querySelectorAll('.sequence-item').forEach(item => {
                item.classList.remove('drag-over-top', 'drag-over-bottom');
            });

            updateOrderFromDOM(list);
        });

        // Required for drop to work - must prevent default on dragenter
        list.addEventListener('dragenter', (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
        });

        list.addEventListener('dragover', (e) => {
            e.preventDefault(); // Allow drop
            e.dataTransfer.dropEffect = 'move'; // Show move cursor, not 🚫

            // If no valid dragged item, skip indicator logic
            if (!draggedItem) return;

            // Clear all previous indicators
            list.querySelectorAll('.sequence-item').forEach(item => {
                item.classList.remove('drag-over-top', 'drag-over-bottom');
            });

            const items = Array.from(list.querySelectorAll('.sequence-item'));
            if (items.length === 0) return;

            // Find the item we should indicate drop position for
            let targetItem = null;
            let position = 'bottom'; // 'top' or 'bottom'

            for (let i = 0; i < items.length; i++) {
                const item = items[i];
                if (item === draggedItem) continue;

                const rect = item.getBoundingClientRect();
                const midY = rect.top + rect.height / 2;

                if (e.clientY < midY) {
                    targetItem = item;
                    position = 'top';
                    break;
                } else {
                    targetItem = item;
                    position = 'bottom';
                }
            }

            if (targetItem && targetItem !== draggedItem) {
                targetItem.classList.add(position === 'top' ? 'drag-over-top' : 'drag-over-bottom');
            }
        });

        list.addEventListener('dragleave', (e) => {
            // Only clear if leaving the list entirely
            if (!list.contains(e.relatedTarget)) {
                list.querySelectorAll('.sequence-item').forEach(item => {
                    item.classList.remove('drag-over-top', 'drag-over-bottom');
                });
            }
        });

        list.addEventListener('drop', (e) => {
            e.preventDefault();

            const items = Array.from(list.querySelectorAll('.sequence-item'));
            let targetItem = null;
            let position = 'bottom';

            for (let i = 0; i < items.length; i++) {
                const item = items[i];
                if (item === draggedItem) continue;

                const rect = item.getBoundingClientRect();
                const midY = rect.top + rect.height / 2;

                if (e.clientY < midY) {
                    targetItem = item;
                    position = 'top';
                    break;
                } else {
                    targetItem = item;
                    position = 'bottom';
                }
            }

            if (targetItem && draggedItem && targetItem !== draggedItem) {
                // Capture reference before it gets nullified in dragend
                const droppedItem = draggedItem;

                if (position === 'top') {
                    list.insertBefore(droppedItem, targetItem);
                } else {
                    list.insertBefore(droppedItem, targetItem.nextSibling);
                }

                // Add settling animation to the dropped item
                droppedItem.classList.add('settling');
                droppedItem.addEventListener('animationend', () => {
                    droppedItem.classList.remove('settling');
                }, { once: true });

                targetItem.classList.remove('drag-over-top', 'drag-over-bottom');
                updateOrderFromDOM(list);
            }
        });
    }

    function attachKeyboardListeners(list) {
        list.addEventListener('keydown', (e) => {
            const item = e.target.closest('.sequence-item');
            if (!item) return;

            if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                e.preventDefault();

                if (e.key === 'ArrowUp') {
                    const prev = item.previousElementSibling;
                    if (prev) {
                        // Capture reference for animationend callback
                        const movedItem = item;
                        list.insertBefore(movedItem, prev);
                        movedItem.classList.add('settling');
                        movedItem.addEventListener('animationend', () => {
                            movedItem.classList.remove('settling');
                        }, { once: true });
                        movedItem.focus();
                        updateOrderFromDOM(list);
                    }
                } else if (e.key === 'ArrowDown') {
                    const next = item.nextElementSibling;
                    if (next) {
                        // Capture reference for animationend callback
                        const movedItem = item;
                        list.insertBefore(movedItem, next.nextSibling);
                        movedItem.classList.add('settling');
                        movedItem.addEventListener('animationend', () => {
                            movedItem.classList.remove('settling');
                        }, { once: true });
                        movedItem.focus();
                        updateOrderFromDOM(list);
                    }
                }
            }
        });
    }

    return questionObj;
}
