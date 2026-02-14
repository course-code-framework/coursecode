/**
 * FRAMEWORK EXAMPLE SLIDE
 * This is a template example demonstrating summary/completion patterns. You can keep it as a reference or delete it.
 * See COURSE_AUTHORING_GUIDE.md for full documentation.
 */

const { interactionManager, AppActions, iconManager } = CourseCode;
export const slide = {
  render(_root, _context) {
    const interactions = interactionManager.getAllInteractions();
    const sessionDurationMs = AppActions.getSessionDuration();
    const interactionCount = interactions.length;
    const averageScore = interactionCount > 0
      ? Math.round((interactions.reduce((sum, i) => sum + (i.score || 0), 0) / interactionCount) * 100)
      : 0;
    const sessionDurationMinutes = Math.floor(sessionDurationMs / 60000);
    const sessionDurationDisplay = sessionDurationMinutes > 0
      ? `${sessionDurationMinutes} minutes`
      : 'Less than a minute';

    const container = document.createElement('div');
    container.innerHTML = `
      <div class="stack-lg">
        
        <header class="slide-header">
          <h1>Template Complete!</h1>
        </header>

        <div class="callout callout--success">
          <h2 class="text-xl font-bold">You've explored CourseCode!</h2>
          <p>You've seen the key features of the CourseCode framework. Now you're ready to build
             your own interactive e-learning courses with full LMS compatibility.</p>
        </div>

        <section class="card no-hover">
          <h2 class="text-lg font-bold border-bottom pb-2 mb-4">${iconManager.getIcon('bar-chart')} Session Summary</h2>
          <div class="cols-3 gap-4">
            <div class="p-4 bg-gray-50 rounded text-center">
              <h3 class="text-sm font-bold text-muted uppercase">Time Spent</h3>
              <p class="text-xl font-bold text-primary">${sessionDurationDisplay}</p>
            </div>
            <div class="p-4 bg-gray-50 rounded text-center">
              <h3 class="text-sm font-bold text-muted uppercase">Interactions</h3>
              <p class="text-xl font-bold text-primary">${interactionCount} completed</p>
            </div>
            <div class="p-4 bg-gray-50 rounded text-center">
              <h3 class="text-sm font-bold text-muted uppercase">Average Score</h3>
              <p class="text-xl font-bold text-primary">${averageScore}%</p>
            </div>
          </div>
        </section>

        <section>
          <h2 class="text-xl font-bold mb-4">Features Demonstrated</h2>
          <div class="cols-2 gap-4">
            <div class="flex gap-2 items-start">
              <span class="text-success">${iconManager.getIcon('check-circle')}</span>
              <div><strong>Drag & Drop:</strong> Interactive sorting and categorization</div>
            </div>
            <div class="flex gap-2 items-start">
              <span class="text-success">${iconManager.getIcon('check-circle')}</span>
              <div><strong>Fill in the Blank:</strong> Text input with flexible matching</div>
            </div>
            <div class="flex gap-2 items-start">
              <span class="text-success">${iconManager.getIcon('check-circle')}</span>
              <div><strong>Numeric Input:</strong> Number entry with tolerance</div>
            </div>
            <div class="flex gap-2 items-start">
              <span class="text-success">${iconManager.getIcon('check-circle')}</span>
              <div><strong>Interactive Images:</strong> Hotspots linked to content</div>
            </div>
            <div class="flex gap-2 items-start">
              <span class="text-success">${iconManager.getIcon('check-circle')}</span>
              <div><strong>Assessments:</strong> Graded quizzes with feedback</div>
            </div>
            <div class="flex gap-2 items-start">
              <span class="text-success">${iconManager.getIcon('check-circle')}</span>
              <div><strong>Accessibility:</strong> Dark mode, fonts, contrast, motion</div>
            </div>
            <div class="flex gap-2 items-start">
              <span class="text-success">${iconManager.getIcon('check-circle')}</span>
              <div><strong>Navigation:</strong> Sidebar, gating, progress tracking</div>
            </div>
          </div>
        </section>

        <section class="card no-hover bg-gray-50">
          <h2 class="text-lg font-bold mb-4">🚀 Next Steps</h2>
          <p class="mb-4">Ready to build your own course? Here's how to get started:</p>
          <ul class="list-styled">
            <li><strong>Read the Docs:</strong> Check out COURSE_AUTHORING_GUIDE.md for detailed instructions</li>
            <li><strong>Customize Theme:</strong> Edit theme.css to match your brand colors</li>
            <li><strong>Add Slides:</strong> Create new slide files in the slides/ folder</li>
            <li><strong>Configure Structure:</strong> Update course-config.js with your content</li>
            <li><strong>Build & Deploy:</strong> Run <code>coursecode build</code> to create your LMS package</li>
          </ul>
        </section>
      </div>
    `;
    
    return container;
  }
};