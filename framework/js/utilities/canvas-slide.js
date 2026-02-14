/**
 * @file canvas-slide.js
 * @description Convenience helper for canvas layout authors.
 * Wraps an HTML string and optional init callback into a valid slide export.
 * 
 * Usage (in a slide .js file):
 * 
 *   const { canvasSlide } = CourseCode;
 * 
 *   export const slide = canvasSlide(`
 *       <style>.my-app { color: white; }</style>
 *       <div class="my-app">
 *           <h1>Hello</h1>
 *           <button id="next">Next</button>
 *       </div>
 *   `, (el, api) => {
 *       el.querySelector('#next').onclick = () => api.NavigationActions.goToNextAvailableSlide();
 *   });
 * 
 * @param {string} html - The HTML content (can include <style> tags)
 * @param {Function} [init] - Optional callback: (element, CourseCode) => void
 * @returns {object} A valid slide export with render() method
 */
export function canvasSlide(html, init) {
    return {
        render() {
            const el = document.createElement('div');
            el.innerHTML = html;
            if (init) {
                init(el, window.CourseCode);
            }
            return el;
        }
    };
}
