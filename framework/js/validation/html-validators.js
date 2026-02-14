/**
 * @file html-validators.js
 * @description Runtime HTML validation for rendered slide content.
 * Checks for common authoring issues that cause page reloads or break component wiring.
 * Single consumer: view-manager.js (runs after each slide render).
 */

// ============================================================================
// HTML Structure Validation Helpers
// ============================================================================

/**
 * Validates buttons inside forms have explicit type attributes to prevent page reloads.
 * @param {HTMLElement} element - The element to validate
 * @returns {{valid: boolean, errors: Array<{message: string, context: Object}>}} Validation result
 */
export function validateFormButtons(element) {
    const errors = [];
    const forms = element.querySelectorAll('form');
    
    forms.forEach((form) => {
        const buttons = form.querySelectorAll('button:not([type])');
        if (buttons.length > 0) {
            errors.push({
                message: `Found ${buttons.length} button(s) inside a form without a 'type' attribute`,
                context: {
                    form: form.outerHTML.substring(0, 200) + '...',
                    buttons: Array.from(buttons).map(btn => btn.outerHTML),
                    fix: 'Add type="button" to buttons that should not submit the form, or type="submit" for submit buttons.'
                }
            });
        }
    });

    return {
        valid: errors.length === 0,
        errors
    };
}

/**
 * Validates that buttons with data-action inside forms have explicit type attributes.
 * @param {HTMLElement} element - The element to validate
 * @returns {{valid: boolean, errors: Array<{message: string, context: Object}>}} Validation result
 */
export function validateActionButtonsInForms(element) {
    const errors = [];
    const actionElements = element.querySelectorAll('[data-action]');
    
    actionElements.forEach(actionEl => {
        if (actionEl.tagName === 'BUTTON' && actionEl.closest('form') && !actionEl.hasAttribute('type')) {
            errors.push({
                message: 'Button with data-action inside a form is missing type attribute',
                context: {
                    button: actionEl.outerHTML,
                    action: actionEl.getAttribute('data-action'),
                    fix: 'Add type="button" to prevent the button from submitting the form.'
                }
            });
        }
    });

    return {
        valid: errors.length === 0,
        errors
    };
}

/**
 * Validates that anchor tags don't have dangerous href values that cause page reloads.
 * @param {HTMLElement} element - The element to validate
 * @returns {{valid: boolean, errors: Array<{message: string, context: Object}>}} Validation result
 */
export function validateAnchorTags(element) {
    const errors = [];
    const dangerousAnchors = element.querySelectorAll('a[href="#"], a[href=""]');
    
    if (dangerousAnchors.length > 0) {
        errors.push({
            message: `Found ${dangerousAnchors.length} anchor tag(s) with dangerous href attribute`,
            context: {
                anchors: Array.from(dangerousAnchors).map(a => a.outerHTML),
                fix: 'For internal navigation, use NavigationActions.goToSlide(). For other actions, use a <button type="button">. For external links, use a valid URL.'
            }
        });
    }

    return {
        valid: errors.length === 0,
        errors
    };
}

// ============================================================================
// UI Component Validation Helpers
// ============================================================================

/**
 * Required data-action patterns for UI components.
 * @constant {Object}
 */
export const UI_COMPONENT_ACTIONS = {
    dropdown: {
        trigger: 'toggle-dropdown',
        item: 'select-item'
    },
    tabs: {
        button: 'select-tab'
    },
    modal: {
        close: 'close-modal'
    },
    interaction: {
        check: 'check-answer',
        reset: 'reset'
    }
};

/**
 * Validates dropdown components have required data-action attributes.
 * @param {HTMLElement} element - The element to validate (should contain dropdowns)
 * @returns {{valid: boolean, errors: Array<{message: string, context: Object}>}} Validation result
 */
export function validateDropdownActions(element) {
    const errors = [];
    const dropdowns = element.querySelectorAll('.custom-dropdown, [class*="dropdown"]');

    dropdowns.forEach(dropdown => {
        // Check for dropdown triggers without data-action
        const triggers = dropdown.querySelectorAll('.dropdown-trigger, [class*="dropdown-trigger"]');
        triggers.forEach(trigger => {
            if (!trigger.hasAttribute('data-action')) {
                errors.push({
                    message: 'Dropdown trigger is missing data-action attribute',
                    context: {
                        element: trigger.outerHTML,
                        expected: `data-action="${UI_COMPONENT_ACTIONS.dropdown.trigger}"`,
                        fix: 'Add data-action="toggle-dropdown" to the dropdown trigger button.'
                    }
                });
            } else {
                const action = trigger.getAttribute('data-action');
                if (action !== UI_COMPONENT_ACTIONS.dropdown.trigger) {
                    errors.push({
                        message: `Dropdown trigger has incorrect data-action="${action}"`,
                        context: {
                            element: trigger.outerHTML,
                            actual: action,
                            expected: UI_COMPONENT_ACTIONS.dropdown.trigger,
                            fix: `Change to data-action="${UI_COMPONENT_ACTIONS.dropdown.trigger}".`
                        }
                    });
                }
            }
        });

        // Check for dropdown items without data-action
        const items = dropdown.querySelectorAll('.dropdown-item, [class*="dropdown-item"]');
        items.forEach(item => {
            if (!item.hasAttribute('data-action')) {
                errors.push({
                    message: 'Dropdown item is missing data-action attribute',
                    context: {
                        element: item.outerHTML,
                        expected: `data-action="${UI_COMPONENT_ACTIONS.dropdown.item}"`,
                        fix: 'Add data-action="select-item" to the dropdown item.'
                    }
                });
            } else {
                const action = item.getAttribute('data-action');
                if (action !== UI_COMPONENT_ACTIONS.dropdown.item) {
                    errors.push({
                        message: `Dropdown item has incorrect data-action="${action}"`,
                        context: {
                            element: item.outerHTML,
                            actual: action,
                            expected: UI_COMPONENT_ACTIONS.dropdown.item,
                            fix: `Change to data-action="${UI_COMPONENT_ACTIONS.dropdown.item}".`
                        }
                    });
                }
            }
        });
    });

    return {
        valid: errors.length === 0,
        errors
    };
}

/**
 * Validates tab components have required data-action attributes.
 * @param {HTMLElement} element - The element to validate (should contain tabs)
 * @returns {{valid: boolean, errors: Array<{message: string, context: Object}>}} Validation result
 */
export function validateTabActions(element) {
    const errors = [];
    
    // Look for tab containers
    const tabContainers = element.querySelectorAll('.tabs, [role="tablist"]');
    
    tabContainers.forEach(container => {
        const tabButtons = container.querySelectorAll('.tab-button, [role="tab"]');
        
        tabButtons.forEach(button => {
            if (!button.hasAttribute('data-action')) {
                errors.push({
                    message: 'Tab button is missing data-action attribute',
                    context: {
                        element: button.outerHTML,
                        expected: `data-action="${UI_COMPONENT_ACTIONS.tabs.button}"`,
                        fix: 'Add data-action="select-tab" to the tab button.'
                    }
                });
            } else {
                const action = button.getAttribute('data-action');
                if (action !== UI_COMPONENT_ACTIONS.tabs.button) {
                    errors.push({
                        message: `Tab button has incorrect data-action="${action}"`,
                        context: {
                            element: button.outerHTML,
                            actual: action,
                            expected: UI_COMPONENT_ACTIONS.tabs.button,
                            fix: `Change to data-action="${UI_COMPONENT_ACTIONS.tabs.button}".`
                        }
                    });
                }
            }
        });
    });

    return {
        valid: errors.length === 0,
        errors
    };
}

/**
 * Validates modal components have required data-action attributes.
 * @param {HTMLElement} element - The element to validate (should contain modals)
 * @returns {{valid: boolean, errors: Array<{message: string, context: Object}>}} Validation result
 */
export function validateModalActions(element) {
    const errors = [];
    const modals = element.querySelectorAll('.modal, [role="dialog"]');
    
    modals.forEach(modal => {
        // Check for close buttons (both .modal-close and any button meant to close)
        const closeButtons = modal.querySelectorAll('.modal-close, button[aria-label*="close" i], button[aria-label*="dismiss" i]');
        
        closeButtons.forEach(button => {
            if (!button.hasAttribute('data-action')) {
                errors.push({
                    message: 'Modal close button is missing data-action attribute',
                    context: {
                        element: button.outerHTML,
                        expected: `data-action="${UI_COMPONENT_ACTIONS.modal.close}"`,
                        fix: 'Add data-action="close-modal" to the modal close button.'
                    }
                });
            } else {
                const action = button.getAttribute('data-action');
                if (action !== UI_COMPONENT_ACTIONS.modal.close) {
                    errors.push({
                        message: `Modal close button has incorrect data-action="${action}"`,
                        context: {
                            element: button.outerHTML,
                            actual: action,
                            expected: UI_COMPONENT_ACTIONS.modal.close,
                            fix: `Change to data-action="${UI_COMPONENT_ACTIONS.modal.close}".`
                        }
                    });
                }
            }
        });
    });

    return {
        valid: errors.length === 0,
        errors
    };
}

/**
 * Validates interaction components have required data-action attributes.
 * @param {HTMLElement} element - The element to validate (should contain interactions)
 * @returns {{valid: boolean, errors: Array<{message: string, context: Object}>}} Validation result
 */
export function validateInteractionActions(element) {
    const errors = [];
    
    // Look for interaction containers (common patterns)
    const interactions = element.querySelectorAll('[data-interaction-type], .interaction, [class*="interaction-"]');
    
    interactions.forEach(interaction => {
        const interactionId = interaction.id || interaction.dataset.interaction || 'unknown';
        
        // Check for check-answer buttons
        const checkButtons = interaction.querySelectorAll('.check-answer, button[class*="check"]');
        checkButtons.forEach(button => {
            if (!button.hasAttribute('data-action')) {
                errors.push({
                    message: 'Interaction check button is missing data-action attribute',
                    context: {
                        interactionId,
                        element: button.outerHTML,
                        expected: `data-action="${UI_COMPONENT_ACTIONS.interaction.check}"`,
                        fix: 'Add data-action="check-answer" and data-interaction="[id]" to the check button.'
                    }
                });
            } else {
                const action = button.getAttribute('data-action');
                if (action !== UI_COMPONENT_ACTIONS.interaction.check && action !== UI_COMPONENT_ACTIONS.interaction.reset) {
                    errors.push({
                        message: `Interaction button has incorrect data-action="${action}"`,
                        context: {
                            interactionId,
                            element: button.outerHTML,
                            actual: action,
                            expected: `"${UI_COMPONENT_ACTIONS.interaction.check}" or "${UI_COMPONENT_ACTIONS.interaction.reset}"`,
                            fix: 'Use data-action="check-answer" or data-action="reset".'
                        }
                    });
                }
            }

            // Verify data-interaction attribute is present
            if (!button.hasAttribute('data-interaction')) {
                errors.push({
                    message: 'Interaction button is missing data-interaction attribute',
                    context: {
                        interactionId,
                        element: button.outerHTML,
                        fix: 'Add data-interaction="[id]" to identify which interaction this button controls.'
                    }
                });
            }
        });
    });

    return {
        valid: errors.length === 0,
        errors
    };
}

/**
 * Validates all UI components in an element for required data-action attributes.
 * This function checks all component types (dropdowns, tabs, modals, interactions).
 * @param {HTMLElement} element - The element to validate
 * @param {string} [viewName=''] - Optional view name for error context
 * @returns {{valid: boolean, errors: Array<{type: string, message: string, context: Object}>}} Validation result
 */
export function validateUIComponentActions(element, viewName = '') {
    const allErrors = [];

    // Validate dropdowns
    const dropdownResult = validateDropdownActions(element);
    dropdownResult.errors.forEach(error => {
        allErrors.push({ type: 'dropdown', viewName, ...error });
    });

    // Validate tabs
    const tabResult = validateTabActions(element);
    tabResult.errors.forEach(error => {
        allErrors.push({ type: 'tabs', viewName, ...error });
    });

    // Validate modals
    const modalResult = validateModalActions(element);
    modalResult.errors.forEach(error => {
        allErrors.push({ type: 'modal', viewName, ...error });
    });

    // Validate interactions
    const interactionResult = validateInteractionActions(element);
    interactionResult.errors.forEach(error => {
        allErrors.push({ type: 'interaction', viewName, ...error });
    });

    return {
        valid: allErrors.length === 0,
        errors: allErrors
    };
}

/**
 * Validates rendered HTML content for common issues that cause page reloads or errors.
 * This is the master validation function that checks both HTML structure and UI components.
 * @param {HTMLElement} element - The element to validate
 * @param {string} [viewName=''] - Optional view name for error context
 * @returns {{valid: boolean, errors: Array<{type: string, message: string, context: Object}>}} Validation result
 */
export function validateRenderedHTML(element, viewName = '') {
    const allErrors = [];

    // Validate HTML structure (forms, buttons, anchors)
    const formButtonResult = validateFormButtons(element);
    formButtonResult.errors.forEach(error => {
        allErrors.push({ type: 'form-button', viewName, ...error });
    });

    const actionButtonResult = validateActionButtonsInForms(element);
    actionButtonResult.errors.forEach(error => {
        allErrors.push({ type: 'action-button', viewName, ...error });
    });

    const anchorResult = validateAnchorTags(element);
    anchorResult.errors.forEach(error => {
        allErrors.push({ type: 'anchor', viewName, ...error });
    });

    // Validate UI components
    const uiComponentResult = validateUIComponentActions(element, viewName);
    allErrors.push(...uiComponentResult.errors);

    return {
        valid: allErrors.length === 0,
        errors: allErrors
    };
}
