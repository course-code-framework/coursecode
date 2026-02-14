/**
 * Intro Cards Layout Pattern
 * 
 * CSS-only component for introduction/overview slides.
 */

export const schema = {
    type: 'intro-cards',
    description: 'Introduction section with centered intro text and card grid',
    example: `<div data-component="intro-cards">
  <div class="intro"><h2>Welcome to Courseware</h2><p class="lead">Explore our key features below.</p></div>
  <div class="card-grid">
    <div class="card"><div class="card-body"><h3>Interactive</h3><p>Drag-drop, quizzes, and more.</p></div></div>
    <div class="card"><div class="card-body"><h3>Accessible</h3><p>WCAG-compliant out of the box.</p></div></div>
  </div>
</div>`,
    properties: {},
    structure: {
        container: '[data-component="intro-cards"]',
        children: {
            intro: { selector: '.intro' },
            lead: { selector: '.intro .lead' },
            cardGrid: { selector: '.card-grid', required: true }
        }
    }
};

export const metadata = {
    category: 'ui-component',
    cssOnly: true,
    cssFile: 'components/intro-cards.css'
};

/** No-op initializer — CSS-only component, registered for consistency. */
export function init() {}
