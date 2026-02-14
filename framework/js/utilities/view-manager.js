import { eventBus } from '../core/event-bus.js';
import { logger } from './logger.js';
import { validateRenderedHTML } from '../validation/html-validators.js';
import { initializeDeclarativeComponents } from './ui-initializer.js';
import { courseConfig } from '../../../course/course-config.js';

/**
 * Creates a view manager for a given container element.
 * @param {HTMLElement} container - The container element for the views.
 * @param {string} [scope='local'] - The scope of this ViewManager ('main' for main navigation, 'assessment' for assessment internal views, etc.)
 * @returns {object} A view manager instance.
 */
export function createViewManager(container, scope = 'local') {
    if (!container || !(container instanceof HTMLElement)) {
        throw new Error('ViewManager: A valid container element is required.');
    }

    const views = {};
    let currentViewName = null;

    /**
     * Registers a view with lifecycle hooks.
     * @param {string} name - The name of the view.
     * @param {object} viewObject - An object defining the view.
     * @param {Function} viewObject.render - A function that returns an HTMLElement. Called every time the view is shown.
     * @param {Function} [viewObject.onShow] - A function called every time the view is shown, after rendering.
     * @param {Function} [viewObject.onHide] - A function called every time the view is hidden, before removal from DOM.
     */
    function registerView(name, viewObject) {
        if (!name) {
            throw new Error('ViewManager: View name is required.');
        }
        if (!viewObject || typeof viewObject.render !== 'function') {
            throw new Error(`ViewManager: View '${name}' must be an object with a render function.`);
        }
        views[name] = { ...viewObject };
    }

    /**
     * Shows a view by name.
     * @param {string} name - The name of the view to show.
     * @param {object} [options] - Options to pass to the render and onShow functions.
     */
    async function showView(name, options = {}) {
        if (!views[name]) {
            throw new Error(`ViewManager: View '${name}' not found.`);
        }

        // Hide the current view and call its onHide hook
        let oldElement = null;
        if (currentViewName && views[currentViewName]) {
            const oldView = views[currentViewName];
            // Get the current element from the container
            oldElement = container.firstElementChild;
            if (oldElement && typeof oldView.onHide === 'function') {
                oldView.onHide(oldElement);
            }
        }

        const newView = views[name];

        // Emit before-change event to allow cleanup (e.g., clearing interaction registry)
        // Include scope to distinguish main navigation from component-internal navigation
        eventBus.emit('view:before-change', {
            oldView: currentViewName,
            newView: name,
            scope: scope,
            context: options
        });

        // Always render fresh to ensure current data is displayed
        let newElement = await newView.render(options);

        if (!(newElement instanceof HTMLElement)) {
            throw new Error(`ViewManager: View '${name}' render function must return an HTMLElement.`);
        }

        // Auto-wrap content with content-width class if configured and not already wrapped
        newElement = autoWrapContentIfNeeded(newElement, name);

        // Validate rendered HTML for common issues BEFORE adding to DOM
        validateRenderedContent(newElement, name);

        // Clear container and add new view
        container.innerHTML = '';
        container.appendChild(newElement);

        // Initialize any declarative components within the new view
        initializeDeclarativeComponents(newElement);

        // Call onShow hook
        if (typeof newView.onShow === 'function') {
            newView.onShow(newElement, options);
        }

        currentViewName = name;
        eventBus.emit('view:change', { view: name, context: options });
    }

    /**
     * Auto-wraps content with a content-width class if configured and not already wrapped.
     * Allows per-slide override using data-content-width attribute.
     * @param {HTMLElement} element - The rendered element
     * @param {string} viewName - The name of the view being rendered
     * @returns {HTMLElement} The element, potentially wrapped
     * @private
     */
    function autoWrapContentIfNeeded(element, _viewName) {
        // Canvas layout: author owns all styling, no auto-wrapping
        if (courseConfig?.layout === 'canvas') {
            return element;
        }

        // Check for per-slide override via data-content-width attribute
        const dataAttrWidth = element.getAttribute('data-content-width');
        const slideConfigWidth = dataAttrWidth;

        // Determine which width to use: per-slide override > global config > no wrapping
        const configWidth = slideConfigWidth || courseConfig?.slideDefaults?.contentWidth;
        
        if (!configWidth) {
            // No wrapping configured
            return element;
        }

        // Check if already wrapped with a content-width class
        if (hasContentWidthClass(element)) {
            // Already wrapped, don't double-wrap
            return element;
        }

        // Create wrapper with appropriate content-width class
        const wrapper = document.createElement('div');
        wrapper.className = `content-${configWidth}`;
        wrapper.appendChild(element);
        return wrapper;
    }

    /**
     * Checks if an element or its children already have a content-width class.
     * @param {HTMLElement} element - The element to check
     * @returns {boolean} True if element or children have content-width class
     * @private
     */
    function hasContentWidthClass(element) {
        const contentWidthClasses = ['content-narrow', 'content-medium', 'content-wide', 'content-full'];
        
        // Check the element itself
        if (element.classList && contentWidthClasses.some(cls => element.classList.contains(cls))) {
            return true;
        }
        
        // Check immediate children (common pattern: wrapper div around content)
        if (element.children && element.children.length > 0) {
            for (const child of element.children) {
                if (child.classList && contentWidthClasses.some(cls => child.classList.contains(cls))) {
                    return true;
                }
            }
        }
        
        return false;
    }

    /**
     * Validates rendered content for common issues that can cause page reloads or errors.
     * @param {HTMLElement} element - The rendered element to validate
     * @param {string} viewName - The name of the view being rendered
     * @private
     */
    function validateRenderedContent(element, viewName) {
        // Use centralized validation from html-validators.js
        const validation = validateRenderedHTML(element, viewName);
        
        if (!validation.valid) {
            // Process each error and emit events
            validation.errors.forEach(error => {
                const message = `View "${viewName}" [${error.type}]: ${error.message}`;
                logger.error(`[ViewManager] ${message}`, { domain: 'view', operation: 'validateRenderedContent', ...error.context });
            });

            // Throw with a summary of all errors
            const errorSummary = validation.errors.map(e => `[${e.type}] ${e.message}`).join('; ');
            throw new Error(`[ViewManager] View "${viewName}" has ${validation.errors.length} validation error(s): ${errorSummary}`);
        }
    }

    /**
     * Gets the name of the currently visible view.
     * @returns {string|null} The name of the current view.
     */
    function getCurrentView() {
        return currentViewName;
    }

    /**
     * Gets the container element.
     * @returns {HTMLElement} The container element.
     */
    function getContainer() {
        return container;
    }

    /**
     * Destroys the view manager and cleans up the container.
     */
    function destroy() {
        // Call onHide for current view if exists
        if (currentViewName && views[currentViewName]) {
            const currentElement = container.firstElementChild;
            const currentView = views[currentViewName];
            if (currentElement && typeof currentView.onHide === 'function') {
                currentView.onHide(currentElement);
            }
        }
        container.innerHTML = '';
        currentViewName = null;
    }

    return {
        registerView,
        showView,
        getCurrentView,
        getContainer,
        destroy,
    };
}
