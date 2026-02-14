/**
 * Preview Tour slide - Guide to using the preview server and its tools
 */

const { iconManager } = CourseCode;

export const slide = {
  render(_root, _context) {
    const container = document.createElement('div');
    container.innerHTML = `
      <div class="stack-lg">
        
        <!-- Header -->
        <header class="slide-header">
          <h1>Using the Preview</h1>
          <p>Your course preview simulates a real LMS and includes powerful authoring tools.</p>
        </header>

        <!-- Starting the Preview -->
        <section class="card no-hover">
          <h2 class="text-lg font-bold border-bottom pb-2 mb-4">${iconManager.getIcon('play')} Starting the Preview</h2>
          <div class="cols-2 gap-6">
            <div class="stack-sm">
              <p>In your project folder, run:</p>
              <pre class="bg-gray-100 p-3 rounded overflow-x-auto"><code>coursecode preview</code></pre>
              <p>Then open <code>http://localhost:4173</code> in your browser.</p>
            </div>
            <div class="callout callout--success callout--compact">
              <strong>${iconManager.getIcon('refresh-cw')} Live Reload:</strong> The preview automatically refreshes when you save changes. No need to manually reload.
            </div>
          </div>
        </section>

        <!-- Header Bar Tools -->
        <section class="card no-hover">
          <h2 class="text-lg font-bold border-bottom pb-2 mb-4">${iconManager.getIcon('settings')} Header Bar Tools</h2>
          <p class="mb-4">The header bar at the top of the preview gives you access to these tools:</p>
          
          <div class="cols-3 gap-4">
            <div class="card card-outlined h-full">
              <h3 class="font-bold mb-2">📊 Status</h3>
              <p class="text-sm">Dashboard showing course health: build status, slide count, engagement summary, and errors at a glance.</p>
            </div>
            <div class="card card-outlined h-full">
              <h3 class="font-bold mb-2">✏️ Edit</h3>
              <p class="text-sm">Click any text in your course to edit it directly. Changes save to your source files automatically.</p>
            </div>
            <div class="card card-outlined h-full">
              <h3 class="font-bold mb-2">📄 Review</h3>
              <p class="text-sm">See all your course content in one scrollable view. Useful for reviewing the full learner experience.</p>
            </div>
            <div class="card card-outlined h-full">
              <h3 class="font-bold mb-2">📋 Config</h3>
              <p class="text-sm">View and modify course settings, slide properties, and engagement configurations through a visual interface.</p>
            </div>
            <div class="card card-outlined h-full">
              <h3 class="font-bold mb-2">📝 Interactions</h3>
              <p class="text-sm">Browse and test all interactions on the current slide. See response data and evaluation results.</p>
            </div>
            <div class="card card-outlined h-full">
              <h3 class="font-bold mb-2">🧩 Catalog</h3>
              <p class="text-sm">Browse all available UI components and CSS patterns with live previews. A visual reference for what's possible.</p>
            </div>
          </div>
        </section>

        <!-- Testing Features -->
        <section class="card no-hover">
          <h2 class="text-lg font-bold border-bottom pb-2 mb-4">${iconManager.getIcon('check-circle')} Testing Your Course</h2>
          <div class="stack-md">
            <div class="cols-3 gap-4">
              <div class="callout callout--info callout--compact">
                <strong>🔍 Debug:</strong> Inspect SCORM state, view every LMS API call, and see validation warnings.
              </div>
              <div class="callout callout--info callout--compact">
                <strong>${iconManager.getIcon('rotate-ccw')} Reset:</strong> Start fresh with a clean slate. Clears all progress and saved state.
              </div>
              <div class="callout callout--warning callout--compact">
                <strong>${iconManager.getIcon('unlock')} Skip Gating:</strong> Toggle in the Config panel to bypass navigation locks during testing.
              </div>
            </div>
            <p class="text-sm text-muted">Your progress is saved automatically, just like in a real LMS. Refresh the page and you'll be right where you left off.</p>
          </div>
        </section>

        <!-- URL Parameters -->
        <section class="card no-hover">
          <h2 class="text-lg font-bold border-bottom pb-2 mb-4">${iconManager.getIcon('link')} Quick Access URLs</h2>
          <p class="mb-3">Add these to your URL to enable features automatically:</p>
          <table class="table table-striped">
            <thead>
              <tr>
                <th>URL</th>
                <th>Effect</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><code>#example-welcome</code></td>
                <td>Navigate to any slide by its ID</td>
              </tr>
              <tr>
                <td><code>?skipGating=true</code></td>
                <td>Bypass all navigation locks</td>
              </tr>
              <tr>
                <td><code>?debug=true</code></td>
                <td>Open debug panel on load</td>
              </tr>
              <tr>
                <td><code>?dashboard</code></td>
                <td>Open the status dashboard on load</td>
              </tr>
            </tbody>
          </table>
        </section>

        <!-- MCP Note -->
        <div class="callout callout--success">
          <h3 class="font-bold">${iconManager.getIcon('cpu')} AI-Powered Preview with MCP</h3>
          <p>When your AI is connected via MCP, it can navigate slides, take screenshots, test interactions, and inspect course state directly. You don't need to describe what you see; the AI sees it too.</p>
        </div>

      </div>
    `;

    return container;
  }
};
