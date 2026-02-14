/**
 * FRAMEWORK EXAMPLE SLIDE
 * This is a template example demonstrating remedial content patterns. You can keep it as a reference or delete it.
 * See COURSE_AUTHORING_GUIDE.md for full documentation.
 */

const { createDragDropQuestion, announceToScreenReader, AppActions, iconManager } = CourseCode;
export const slide = {
  render(_root, _context) {
    const container = document.createElement('div');
    container.innerHTML = `
      <div class="stack-lg">
        
        <header class="slide-header">
          <h1>🔄 Review & Practice</h1>
        </header>

        <div class="callout callout--info">
          <h2 class="text-lg font-bold">🚀 Let's Review the Basics</h2>
          <p>Learning takes practice! Let's strengthen your understanding of CourseCode
             with a quick review of the key concepts and hands-on exercises.</p>
        </div>

        <section>
          <h2 class="text-xl font-bold mb-4 border-bottom pb-2">${iconManager.getIcon('target')} CourseCode Key Concepts</h2>

          <div class="cols-3 gap-4">
            <div class="card no-hover h-full stack-sm">
              <h3 class="text-lg font-bold">${iconManager.getIcon('folder')} Project Structure</h3>
              <div class="text-sm">
                <p class="mb-1"><strong>course-config.js</strong> - Course metadata and slide order</p>
                <p class="mb-1"><strong>slides/</strong> - Individual slide modules</p>
                <p class="mb-1"><strong>theme.css</strong> - Custom color variables</p>
                <p><strong>assets/</strong> - Images, videos, and media</p>
              </div>
            </div>

            <div class="card no-hover h-full stack-sm">
              <h3 class="text-lg font-bold">${iconManager.getIcon('refresh-cw')} Development Workflow</h3>
              <ol class="list-numbered text-sm pl-4">
                <li><strong>Create</strong> - <code>coursecode create</code></li>
                <li><strong>Develop</strong> - <code>coursecode dev</code></li>
                <li><strong>Preview</strong> - Test in browser with hot reload</li>
                <li><strong>Build</strong> - <code>coursecode build</code></li>
              </ol>
            </div>

            <div class="card no-hover h-full stack-sm">
              <h3 class="text-lg font-bold">${iconManager.getIcon('target')} LMS Integration</h3>
              <div class="text-sm">
                <p class="mb-1"><strong>SCORM 1.2</strong> - Widest LMS compatibility</p>
                <p class="mb-1"><strong>SCORM 2004</strong> - Enhanced tracking features</p>
                <p class="mb-1"><strong>cmi5</strong> - Modern xAPI-based standard</p>
                <p><strong>Scoring</strong> - Automatic score reporting</p>
              </div>
            </div>
          </div>
        </section>

        <section class="card no-hover stack-md">
          <div>
            <h2 class="text-xl font-bold">${iconManager.getIcon('settings')} Practice Exercise</h2>
            <p>Organize the course development workflow steps:</p>
          </div>
          <div id="remedial-practice"></div>
        </section>

        <section class="resources">
          <h2 class="text-xl font-bold mb-4">${iconManager.getIcon('book-open')} Helpful Resources</h2>
          <div class="stack-sm">
            <button data-resource="authoring-guide" class="btn btn-sm btn-outline-primary w-full justify-start">Course Authoring Guide</button>
            <button data-resource="components" class="btn btn-sm btn-outline-primary w-full justify-start">Component Reference</button>
            <button data-resource="cli" class="btn btn-sm btn-outline-primary w-full justify-start">CLI Commands</button>
          </div>
        </section>

        <div class="flex justify-center mt-4">
          <button class="btn btn-success btn-lg complete-remedial-btn">
            ${iconManager.getIcon('check-circle')} Complete Review
          </button>
        </div>

      </div>
    `;
    
    setupRemedialContent(container);
    
    return container;
  }
};

/**
 * Sets up and initializes remedial content including practice exercises and resource handlers
 * @param {HTMLElement} container - The container element containing remedial content
 */
function setupRemedialContent(container) {
  // CourseCode workflow practice
  const remedialConfig = {
    id: 'remedial-coursecode-workflow',
    prompt: 'Organize the course development workflow steps',
    items: [
      { id: 'create', content: 'Create Project' },
      { id: 'develop', content: 'Write Slides' },
      { id: 'test', content: 'Test in Browser' },
      { id: 'build', content: 'Build Package' }
    ],
    dropZones: [
      { id: 'setup', label: 'Setup Phase', accepts: ['create'] },
      { id: 'authoring', label: 'Authoring Phase', accepts: ['develop', 'test'] },
      { id: 'deploy', label: 'Deployment Phase', accepts: ['build'] }
    ]
  };

  const remedialQuestion = createDragDropQuestion(remedialConfig);
  const practiceContainer = container.querySelector('#remedial-practice');
  if (practiceContainer) {
    remedialQuestion.render(practiceContainer);
  }

  async function completeRemedial() {
    announceToScreenReader('Review completed successfully!');
  }

  function showResource(resourceType) {
    const resources = {
      'authoring-guide': 'The Course Authoring Guide covers slide creation, interactions, assessments, accessibility, and theming. Find it at docs/COURSE_AUTHORING_GUIDE.md',
      'components': 'CourseCode includes drag-drop, fill-in-the-blank, numeric input, multiple choice, interactive images, tabs, accordions, and more.',
      'cli': 'Key commands: coursecode create (new project), coursecode dev (development server), coursecode build (production package), coursecode info (project details)'
    };

    const message = resources[resourceType] || 'Resource not found';
    AppActions.showNotification(message, 'info', 8000);
  }

  container.querySelector('.complete-remedial-btn').addEventListener('click', completeRemedial);
  container.querySelectorAll('.resources button').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      showResource(link.dataset.resource);
    });
  });
}

