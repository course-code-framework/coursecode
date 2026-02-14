import { logger } from '../../utilities/logger.js';
import {
    validateAgainstSchema,
    createInteractionEventHandler,
    renderInteractionControls,
    displayFeedback,
    clearFeedback,
    normalizeInitialResponse,
    validateContainer,
    escapeCssSelector,
    registerCoreInteraction,
    parseResponse
} from './interaction-base.js';

// Metadata for drag-drop interaction type
export const metadata = {
    creator: 'createDragDropQuestion',
    scormType: 'other',
    showCheckAnswer: true,
    isAnswered: (response) => {
        if (!response || typeof response !== 'object') return false;
        return Object.keys(response).length > 0;
    },
    getCorrectAnswer: (config) => {
        const correctPlacements = {};
        if (config.dropZones && Array.isArray(config.dropZones)) {
            config.dropZones.forEach(zone => {
                if (zone.accepts && Array.isArray(zone.accepts)) {
                    zone.accepts.forEach(itemId => {
                        correctPlacements[itemId] = zone.id;
                    });
                }
            });
        }
        return JSON.stringify(correctPlacements);
    },
    formatCorrectAnswer: (_question, _correctAnswer) => {
        return '<p class="correct-item">See correct placements above</p>';
    },
    formatUserResponse: (question, response) => {
        try {
            const placements = typeof response === 'string' ? JSON.parse(response) : response;
            const count = Object.keys(placements).length;
            return `<p class="response-item">${count} item(s) placed</p>`;
        } catch (_error) {
            return `<p class="response-item">${response}</p>`;
        }
    }
};

// Schema for validation, linting, and AI-assisted authoring
export const schema = {
    type: 'drag-drop',
    description: 'Drag items into categorized drop zones',
    scormType: 'matching',
    example: `<div class="interaction drag-drop" data-interaction-id="demo-dd">
  <div class="question-prompt"><h3>Match items to their categories</h3></div>
  <div class="drag-drop-container">
    <div class="drag-items"><h4>Drag these items:</h4>
      <div class="drag-item" draggable="true" data-item-id="a">HTML</div>
      <div class="drag-item" draggable="true" data-item-id="b">CSS</div>
      <div class="drag-item" draggable="true" data-item-id="c">JavaScript</div>
    </div>
    <div class="drop-zones"><h4>Drop into correct zones:</h4>
      <div class="drop-zone" data-zone-id="structure"><div class="zone-label">Structure</div><div class="zone-content"></div></div>
      <div class="drop-zone" data-zone-id="style"><div class="zone-label">Styling</div><div class="zone-content"></div></div>
      <div class="drop-zone" data-zone-id="behavior"><div class="zone-label">Behavior</div><div class="zone-content"></div></div>
    </div>
  </div>
  <div class="interaction-controls"><button class="btn btn-primary" disabled>Check Answer</button></div>
</div>`,
    properties: {
        items: {
            type: 'array',
            required: true,
            minItems: 1,
            description: 'Draggable items',
            itemSchema: {
                id: { type: 'string', required: true },
                text: { type: 'string', required: true },
                correctZone: { type: 'string', required: true }
            }
        },
        dropZones: {
            type: 'array',
            required: true,
            minItems: 1,
            description: 'Drop target zones',
            itemSchema: {
                id: { type: 'string', required: true },
                label: { type: 'string', required: true }
            }
        }
    }
};

export function createDragDropQuestion(config) {
    validateAgainstSchema(config, schema);

    const { id, prompt, items, dropZones, controlled = false } = config;

    // Validate items and dropZones arrays
    if (!Array.isArray(items) || items.length === 0) {
        throw new Error(`Drag-drop question "${id}" must have at least one item`);
    }

    if (!Array.isArray(dropZones) || dropZones.length === 0) {
        throw new Error(`Drag-drop question "${id}" must have at least one drop zone`);
    }

    let _container = null;

    const questionObj = {
        id,
        type: 'drag-drop',

        render: (container, initialResponse = null) => {
            validateContainer(container, id);
            _container = container;

            // Parse initial response as object
            const initialValue = normalizeInitialResponse(initialResponse);
            const initialPlacements = parseResponse(initialValue, 'object') || {};

            let html = `
                <div class="interaction drag-drop" data-interaction-id="${id}">
                    <div class="question-prompt">
                        <h3>${prompt}</h3>
                    </div>
                    <div class="drag-drop-container">
                        <div class="drag-items" data-droppable="true">
                            <h4>Drag these items:</h4>
            `;

            items.forEach((item, index) => {
                const isPlaced = initialPlacements[item.id] !== undefined;

                html += `
                    <div
                      class="drag-item${isPlaced ? ' hidden' : ''}"
                      draggable="true"
                      data-item-id="${item.id}"
                      data-index="${index}"
                      tabindex="0"
                      role="button"
                      aria-grabbed="false"
                      data-testid="${id}-drag-item-${item.id}"
                    >
                        ${item.content}
                    </div>
                `;
            });

            html += `
                        </div>
                        <div class="drop-zones">
                            <h4>Drop into correct zones:</h4>
            `;

            dropZones.forEach((zone) => {
                const placedItemIds = Object.keys(initialPlacements).filter(itemId => initialPlacements[itemId] === zone.id);
                const maxItems = zone.maxItems || 1; // Default to 1 if not specified

                html += `
                    <div
                      class="drop-zone"
                      data-zone-id="${zone.id}"
                      data-accepts="${zone.accepts.join(',')}"
                      data-max-items="${maxItems}"
                      role="region"
                      aria-label="${zone.label}"
                      tabindex="0"
                      data-testid="${id}-drop-zone-${zone.id}"
                    >
                        <div class="zone-label">${zone.label}</div>
                        <div class="zone-content">`;

                // Add placed items to the zone
                placedItemIds.forEach(itemId => {
                    const item = items.find(i => i.id === itemId);
                    if (item) {
                        html += `
                            <div class="drag-item dropped" data-item-id="${item.id}" draggable="true" data-testid="${id}-dropped-item-${item.id}">
                                ${item.content}
                                <button type="button" class="remove-item" data-action="remove-item" data-item-id="${item.id}" aria-label="Remove ${item.content}" title="Remove this item" data-testid="${id}-remove-${item.id}">×</button>
                            </div>
                        `;
                    }
                });

                html += `
                        </div>
                    </div>
                `;
            });

            html += `
                        </div>
                    </div>
                    ${renderInteractionControls(id, controlled)}
                    <div class="overall-feedback" id="${id}_overall_feedback" aria-live="polite"></div>
                </div>
            `;

            container.innerHTML = html;

            // Setup drag-drop interaction
            setupDragDropInteraction(container, questionObj, initialPlacements);

            // Attach event handler only in uncontrolled mode
            if (!controlled) {
                const correctPattern = JSON.stringify(dropZones.reduce((acc, zone) => {
                    zone.accepts.forEach(itemId => acc[itemId] = zone.id);
                    return acc;
                }, {}));

                container.addEventListener('click', createInteractionEventHandler(questionObj, {
                    ...config,
                    scormType: 'other',
                    correctPattern
                }));
            }

            // Add direct event listeners to remove buttons to prevent drag interference
            const handleRemoveClick = (e) => {
                if (e.target.classList.contains('remove-item')) {
                    e.stopPropagation();
                    e.preventDefault();
                    const itemId = e.target.dataset.itemId;
                    if (itemId) {
                        removeItemFromZone(container, itemId);
                    }
                }
            };

            // Listen on multiple events to ensure reliability
            container.addEventListener('click', handleRemoveClick, true);
            container.addEventListener('mousedown', handleRemoveClick, true);
            container.addEventListener('touchstart', handleRemoveClick, { capture: true, passive: false });
        },

        evaluate: (placements) => {
            if (!placements || typeof placements !== 'object') {
                return {
                    score: 0,
                    correct: false,
                    results: [],
                    response: JSON.stringify({}),
                    error: 'Invalid placements format'
                };
            }

            let correct = 0;
            const results = [];

            Object.entries(placements).forEach(([itemId, zoneId]) => {
                const zone = dropZones.find(z => z.id === zoneId);
                const isCorrect = zone && zone.accepts.includes(itemId);
                if (isCorrect) correct++;
                results.push({ itemId, zoneId, correct: isCorrect });
            });

            return {
                score: correct / items.length,
                correct: correct === items.length,
                results,
                response: JSON.stringify(placements)
            };
        },

        checkAnswer: () => {
            validateContainer(_container, id);

            const placements = questionObj.getResponse();
            const evaluation = questionObj.evaluate(placements);

            if (evaluation.correct) {
                displayFeedback(_container, id, 'Excellent! All items are in the correct zones.', 'correct');
            } else {
                displayFeedback(_container, id, `${Math.round(evaluation.score * 100)}% correct. Review your placements.`, 'incorrect');
            }

            return evaluation;
        },

        reset: () => {
            validateContainer(_container, id);

            const dragItems = _container.querySelectorAll('.drag-item');
            dragItems.forEach(item => {
                item.style.display = '';
                item.classList.remove('keyboard-selected', 'dropped');
            });

            const zoneContents = _container.querySelectorAll('.drop-zone .zone-content');
            zoneContents.forEach(zone => zone.innerHTML = '');

            clearFeedback(_container, id);

            // Reset internal state
            const state = _container._dragDropState;
            if (state) {
                state.placements = {};
                state.selectedForDrop = null;
            }
        },

        getResponse: () => {
            validateContainer(_container, id);

            const placements = {};
            const zones = _container.querySelectorAll('.drop-zone');

            zones.forEach(zone => {
                const droppedItems = zone.querySelectorAll('.drag-item.dropped');
                droppedItems.forEach(item => {
                    placements[item.dataset.itemId] = zone.dataset.zoneId;
                });
            });

            return placements;
        },

        setResponse: (placements) => {
            validateContainer(_container, id);

            if (!placements || typeof placements !== 'object') {
                throw new Error(`setResponse expects an object for drag-drop question "${id}"`);
            }

            // Reset to clean state
            const dragItems = _container.querySelectorAll('.drag-item');
            dragItems.forEach(item => item.style.display = '');

            const zones = _container.querySelectorAll('.drop-zone .zone-content');
            zones.forEach(zone => zone.innerHTML = '');

            // Apply placements
            Object.keys(placements).forEach(itemId => {
                const zoneId = placements[itemId];
                const item = _container.querySelector(`.drag-item[data-item-id="${escapeCssSelector(itemId)}"]`);
                const zone = _container.querySelector(`.drop-zone[data-zone-id="${escapeCssSelector(zoneId)}"] .zone-content`);

                if (item && zone) {
                    const clonedItem = item.cloneNode(true);
                    clonedItem.classList.add('dropped');
                    clonedItem.draggable = false;
                    zone.appendChild(clonedItem);
                    item.style.display = 'none';
                }
            });

            // Update internal state
            const state = _container._dragDropState;
            if (state) {
                state.placements = { ...placements };
            }
        },

        getCorrectAnswer: () => {
            const correctPlacements = {};
            dropZones.forEach(zone => {
                if (zone.accepts && Array.isArray(zone.accepts)) {
                    zone.accepts.forEach(itemId => {
                        correctPlacements[itemId] = zone.id;
                    });
                }
            });
            return correctPlacements;
        }
    };

    // For uncontrolled interactions, register with the central registry for lifecycle mgmt
    if (!controlled) {
        registerCoreInteraction(config, questionObj);
    }

    return questionObj;
}

/**
 * Sets up drag-drop interaction with native HTML5 drag-and-drop, touch, and keyboard support
 */
function setupDragDropInteraction(container, questionObj, initialPlacements = {}) {
    // Store state on container element
    container._dragDropState = {
        placements: { ...initialPlacements },
        draggedElement: null,
        selectedForDrop: null,
        // Touch-specific state
        touchDragElement: null,
        touchClone: null,
        touchStartX: 0,
        touchStartY: 0,
        touchOffsetX: 0,
        touchOffsetY: 0
    };

    const state = container._dragDropState;

    // Lock the drag-items area height to prevent shrinking when items are removed
    const dragItemsArea = container.querySelector('.drag-items');
    if (dragItemsArea) {
        // Use requestAnimationFrame to ensure layout is complete before measuring
        requestAnimationFrame(() => {
            const currentHeight = dragItemsArea.offsetHeight;
            dragItemsArea.style.minHeight = `${currentHeight}px`;
        });
    }

    // Prevent drag from starting when clicking remove buttons
    const preventDragOnButton = (e) => {
        if (e.target.classList.contains('remove-item')) {
            e.stopPropagation();
            // Temporarily disable draggable on the parent
            const dragItem = e.target.closest('.drag-item');
            if (dragItem) {
                dragItem.draggable = false;
                setTimeout(() => { dragItem.draggable = true; }, 100);
            }
        }
    };

    container.addEventListener('mousedown', preventDragOnButton, true);
    container.addEventListener('touchstart', preventDragOnButton, { capture: true, passive: false });

    // Setup drag-and-drop event listeners
    const dragItems = container.querySelectorAll('.drag-item');
    dragItems.forEach(item => {
        item.addEventListener('dragstart', (e) => {
            // Prevent drag if clicking on remove button
            if (e.target.classList.contains('remove-item') || e.target.closest('.remove-item')) {
                e.preventDefault();
                return;
            }
            state.draggedElement = e.currentTarget;
            e.currentTarget.setAttribute('aria-grabbed', 'true');
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', e.currentTarget.dataset.itemId);
        });

        item.addEventListener('dragend', (e) => {
            e.target.setAttribute('aria-grabbed', 'false');
        });

        // Keyboard support for items
        item.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                container.querySelectorAll('.drag-item').forEach(i => i.classList.remove('keyboard-selected'));
                state.selectedForDrop = e.currentTarget;
                e.currentTarget.classList.add('keyboard-selected');
            }
        });

        // Touch support for items
        setupTouchDragForItem(item, container, state);
    });

    // Setup drop zones
    const dropZones = container.querySelectorAll('.drop-zone');
    dropZones.forEach(zone => {
        zone.addEventListener('dragover', (e) => {
            e.preventDefault();
            const zoneContent = e.currentTarget.querySelector('.zone-content');
            const maxItems = parseInt(e.currentTarget.dataset.maxItems) || 1;
            const currentItems = zoneContent ? zoneContent.querySelectorAll('.drag-item.dropped').length : 0;
            const isFull = currentItems >= maxItems;

            e.dataTransfer.dropEffect = isFull ? 'none' : 'move';
            e.currentTarget.classList.add('drag-over');
            e.currentTarget.classList.toggle('zone-full', isFull);
        });

        zone.addEventListener('dragleave', (e) => {
            e.currentTarget.classList.remove('drag-over', 'zone-full');
        });

        zone.addEventListener('drop', (e) => {
            e.preventDefault();
            e.currentTarget.classList.remove('drag-over', 'zone-full');
            if (state.draggedElement) {
                performDrop(container, state, state.draggedElement, e.currentTarget);
            }
        });

        // Keyboard support for zones
        zone.addEventListener('keydown', (e) => {
            if ((e.key === 'Enter' || e.key === ' ') && state.selectedForDrop) {
                e.preventDefault();
                performDrop(container, state, state.selectedForDrop, e.currentTarget);
            }
        });
    });

    // Setup drag items area as a drop zone (to drag items back)
    if (dragItemsArea) {
        dragItemsArea.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            e.currentTarget.classList.add('drag-over');
        });

        dragItemsArea.addEventListener('dragleave', (e) => {
            e.currentTarget.classList.remove('drag-over');
        });

        dragItemsArea.addEventListener('drop', (e) => {
            e.preventDefault();
            e.currentTarget.classList.remove('drag-over');
            if (state.draggedElement && state.draggedElement.classList.contains('dropped')) {
                const itemId = state.draggedElement.dataset.itemId;
                removeItemFromZone(container, itemId);
            }
        });

        // Keyboard support to return items
        dragItemsArea.addEventListener('keydown', (e) => {
            if ((e.key === 'Enter' || e.key === ' ') && state.selectedForDrop && state.selectedForDrop.classList.contains('dropped')) {
                e.preventDefault();
                const itemId = state.selectedForDrop.dataset.itemId;
                removeItemFromZone(container, itemId);
                state.selectedForDrop = null;
            }
        });
    }
}

/**
 * Performs a drop operation, moving an item to a zone
 */
function performDrop(container, state, item, zone) {
    const itemId = item.dataset.itemId;
    const zoneId = zone.dataset.zoneId;
    const zoneContent = zone.querySelector('.zone-content');

    if (!zoneContent) {
        throw new Error('Drop zone content element not found');
    }

    // Check max items limit
    const maxItems = parseInt(zone.dataset.maxItems) || 1;
    const currentItems = zoneContent.querySelectorAll('.drag-item.dropped');

    if (currentItems.length >= maxItems) {
        // Zone is full - don't allow drop
        logger.warn(`Zone "${zoneId}" is full (max: ${maxItems})`);
        return;
    }

    // If the item is already in a zone, remove it from that zone first
    if (item.classList.contains('dropped')) {
        const currentZone = item.closest('.drop-zone');
        if (currentZone) {
            const _oldZoneId = currentZone.dataset.zoneId;
            delete state.placements[itemId];
        }
        item.remove();

        // Show the original item in the items area temporarily
        const originalItem = container.querySelector(`.drag-items .drag-item[data-item-id="${escapeCssSelector(itemId)}"]`);
        if (originalItem) {
            originalItem.style.display = '';
        }
    }

    // Add new item to zone (don't clear existing items)
    const clonedItem = item.cloneNode(true);
    clonedItem.classList.add('dropped');
    clonedItem.classList.remove('keyboard-selected');
    clonedItem.draggable = true;

    // Add remove button if not already present
    if (!clonedItem.querySelector('.remove-item')) {
        const removeBtn = document.createElement('button');
        removeBtn.type = 'button';
        removeBtn.className = 'remove-item';
        removeBtn.dataset.action = 'remove-item';
        removeBtn.dataset.itemId = itemId;
        removeBtn.setAttribute('aria-label', `Remove ${item.textContent || item.innerText}`);
        removeBtn.setAttribute('title', 'Remove this item');
        removeBtn.textContent = '×';
        clonedItem.appendChild(removeBtn);
    }

    zoneContent.appendChild(clonedItem);

    // Setup drag listeners for the cloned item
    setupDragListenersForItem(clonedItem, container, state);

    // Update state
    state.placements[itemId] = zoneId;
    item.style.display = 'none';
    state.selectedForDrop = null;
    state.draggedElement = null;
}

/**
 * Setup drag event listeners for an item (used for items in zones)
 */
function setupDragListenersForItem(item, container, state) {
    item.addEventListener('dragstart', (e) => {
        // Prevent drag if clicking on remove button
        if (e.target.classList.contains('remove-item') || e.target.closest('.remove-item')) {
            e.preventDefault();
            return;
        }
        state.draggedElement = e.currentTarget;
        e.currentTarget.setAttribute('aria-grabbed', 'true');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', e.currentTarget.dataset.itemId);
    });

    item.addEventListener('dragend', (e) => {
        e.target.setAttribute('aria-grabbed', 'false');
    });

    item.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            container.querySelectorAll('.drag-item').forEach(i => i.classList.remove('keyboard-selected'));
            state.selectedForDrop = e.currentTarget;
            e.currentTarget.classList.add('keyboard-selected');
        }
    });

    // Touch support for items in zones
    setupTouchDragForItem(item, container, state);
}

/**
 * Sets up touch drag support for a drag item
 */
function setupTouchDragForItem(item, container, state) {
    let touchTimeout = null;
    let hasMoved = false;

    item.addEventListener('touchstart', (e) => {
        // Prevent touch drag if touching remove button
        if (e.target.classList.contains('remove-item') || e.target.closest('.remove-item')) {
            return;
        }

        const touch = e.touches[0];
        state.touchStartX = touch.clientX;
        state.touchStartY = touch.clientY;
        hasMoved = false;

        // Store the original item
        state.touchDragElement = item;

        // Calculate offset from touch point to item top-left
        const rect = item.getBoundingClientRect();
        state.touchOffsetX = touch.clientX - rect.left;
        state.touchOffsetY = touch.clientY - rect.top;

        // Start drag after a short delay to distinguish from scroll
        touchTimeout = setTimeout(() => {
            if (!hasMoved) {
                startTouchDrag(item, container, state, touch);
            }
        }, 150);
    }, { passive: false });

    item.addEventListener('touchmove', (e) => {
        if (!state.touchDragElement) return;

        const touch = e.touches[0];
        const moveX = Math.abs(touch.clientX - state.touchStartX);
        const moveY = Math.abs(touch.clientY - state.touchStartY);

        // If moved more than threshold, consider it a drag
        if (moveX > 10 || moveY > 10) {
            hasMoved = true;
            if (touchTimeout) {
                clearTimeout(touchTimeout);
                touchTimeout = null;
            }

            // Start drag if not already started
            if (!state.touchClone) {
                startTouchDrag(item, container, state, touch);
            }
        }

        // Move the clone if dragging
        if (state.touchClone) {
            e.preventDefault();
            moveTouchClone(state, touch);
            updateTouchDropTargetHighlight(container, touch);
        }
    }, { passive: false });

    item.addEventListener('touchend', (e) => {
        if (touchTimeout) {
            clearTimeout(touchTimeout);
            touchTimeout = null;
        }

        if (state.touchClone) {
            const touch = e.changedTouches[0];
            completeTouchDrop(container, state, touch);
        }

        // Reset touch state
        state.touchDragElement = null;
        hasMoved = false;
    });

    item.addEventListener('touchcancel', () => {
        if (touchTimeout) {
            clearTimeout(touchTimeout);
            touchTimeout = null;
        }
        cancelTouchDrag(container, state);
    });
}

/**
 * Starts the touch drag by creating a visual clone
 */
function startTouchDrag(item, container, state, touch) {
    // Prevent default to stop scrolling
    item.setAttribute('aria-grabbed', 'true');
    item.classList.add('touch-dragging');

    // Create a clone for visual feedback
    const clone = item.cloneNode(true);
    clone.classList.add('touch-drag-clone');
    clone.style.position = 'fixed';
    clone.style.zIndex = '10000';
    clone.style.pointerEvents = 'none';
    clone.style.width = `${item.offsetWidth}px`;
    clone.style.opacity = '0.9';
    clone.style.transform = 'scale(1.05)';
    clone.style.boxShadow = '0 8px 24px rgba(0, 0, 0, 0.3)';

    // Position clone at touch point
    clone.style.left = `${touch.clientX - state.touchOffsetX}px`;
    clone.style.top = `${touch.clientY - state.touchOffsetY}px`;

    document.body.appendChild(clone);
    state.touchClone = clone;

    // Dim the original item
    item.style.opacity = '0.4';
}

/**
 * Moves the touch clone to follow the finger
 */
function moveTouchClone(state, touch) {
    if (state.touchClone) {
        state.touchClone.style.left = `${touch.clientX - state.touchOffsetX}px`;
        state.touchClone.style.top = `${touch.clientY - state.touchOffsetY}px`;
    }
}

/**
 * Updates drop target highlight during touch drag
 */
function updateTouchDropTargetHighlight(container, touch) {
    // Remove existing highlights
    container.querySelectorAll('.drop-zone.drag-over, .drag-items.drag-over').forEach(el => {
        el.classList.remove('drag-over', 'zone-full');
    });

    // Find element under touch point
    const elementUnder = document.elementFromPoint(touch.clientX, touch.clientY);
    if (!elementUnder) return;

    // Check if over a drop zone
    const dropZone = elementUnder.closest('.drop-zone');
    if (dropZone && container.contains(dropZone)) {
        const zoneContent = dropZone.querySelector('.zone-content');
        const maxItems = parseInt(dropZone.dataset.maxItems) || 1;
        const currentItems = zoneContent ? zoneContent.querySelectorAll('.drag-item.dropped').length : 0;
        const isFull = currentItems >= maxItems;

        dropZone.classList.add('drag-over');
        if (isFull) {
            dropZone.classList.add('zone-full');
        }
        return;
    }

    // Check if over the drag items area (for returning items)
    const dragItemsArea = elementUnder.closest('.drag-items');
    if (dragItemsArea && container.contains(dragItemsArea)) {
        dragItemsArea.classList.add('drag-over');
    }
}

/**
 * Completes the touch drop operation
 */
function completeTouchDrop(container, state, touch) {
    // Remove highlights
    container.querySelectorAll('.drop-zone.drag-over, .drag-items.drag-over').forEach(el => {
        el.classList.remove('drag-over', 'zone-full');
    });

    // Remove clone
    if (state.touchClone) {
        state.touchClone.remove();
        state.touchClone = null;
    }

    // Reset original item appearance
    if (state.touchDragElement) {
        state.touchDragElement.style.opacity = '';
        state.touchDragElement.setAttribute('aria-grabbed', 'false');
        state.touchDragElement.classList.remove('touch-dragging');
    }

    // Find element under touch point
    const elementUnder = document.elementFromPoint(touch.clientX, touch.clientY);
    if (!elementUnder || !state.touchDragElement) return;

    // Check if dropped on a drop zone
    const dropZone = elementUnder.closest('.drop-zone');
    if (dropZone && container.contains(dropZone)) {
        performDrop(container, state, state.touchDragElement, dropZone);
        return;
    }

    // Check if dropped on drag items area (returning an item)
    const dragItemsArea = elementUnder.closest('.drag-items');
    if (dragItemsArea && container.contains(dragItemsArea)) {
        if (state.touchDragElement.classList.contains('dropped')) {
            const itemId = state.touchDragElement.dataset.itemId;
            removeItemFromZone(container, itemId);
        }
    }
}

/**
 * Cancels a touch drag operation
 */
function cancelTouchDrag(container, state) {
    // Remove highlights
    container.querySelectorAll('.drop-zone.drag-over, .drag-items.drag-over').forEach(el => {
        el.classList.remove('drag-over', 'zone-full');
    });

    // Remove clone
    if (state.touchClone) {
        state.touchClone.remove();
        state.touchClone = null;
    }

    // Reset original item appearance
    if (state.touchDragElement) {
        state.touchDragElement.style.opacity = '';
        state.touchDragElement.setAttribute('aria-grabbed', 'false');
        state.touchDragElement.classList.remove('touch-dragging');
    }

    state.touchDragElement = null;
}

/**
 * Removes an item from a drop zone and returns it to the items area
 */
function removeItemFromZone(container, itemId) {
    const state = container._dragDropState;
    if (!state) return;

    // Find the dropped item in a zone
    const droppedItem = container.querySelector(`.drop-zone .drag-item[data-item-id="${escapeCssSelector(itemId)}"]`);
    if (droppedItem) {
        droppedItem.remove();
    }

    // Show the original item in the items area
    const originalItem = container.querySelector(`.drag-items .drag-item[data-item-id="${escapeCssSelector(itemId)}"]`);
    if (originalItem) {
        originalItem.style.display = '';
    }

    // Update state
    delete state.placements[itemId];
}

