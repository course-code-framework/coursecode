/**
 * Course Structure slide - Understanding your course files and folders
 */

const { iconManager } = CourseCode;

export const slide = {
  render(_root, _context) {
    const container = document.createElement('div');
    container.innerHTML = `
      <div class="stack-lg">
        
        <!-- Header -->
        <header class="slide-header">
          <h1>Your Course Files</h1>
          <p>A quick tour of where everything lives in your course project.</p>
        </header>

        <!-- Folder Structure -->
        <section class="card no-hover">
          <h2 class="text-lg font-bold border-bottom pb-2 mb-4">${iconManager.getIcon('folder')} Project Structure</h2>
          <div class="cols-2 gap-6">
            <div>
              <pre class="bg-gray-100 p-4 rounded overflow-x-auto" style="max-width: 100%; font-size: clamp(0.72rem, 2vw, 0.875rem); line-height: 1.35;"><code>my-course/
├── course/              ← <strong>Your content</strong>
│   ├── course-config.js
│   ├── slides/
│   ├── assets/
│   ├── theme.css
│   └── references/
│
└── framework/           ← <strong>Don't edit</strong>
    └── docs/</code></pre>
            </div>
            <div class="stack-md">
              <div class="callout callout--success callout--compact">
                <strong>course/</strong> - All your content goes here. This is the only folder you'll work with.
              </div>
              <div class="callout callout--compact">
                <strong>framework/</strong> - System files. Your AI assistant uses the docs inside, but you don't need to touch it.
              </div>
            </div>
          </div>
        </section>

        <!-- Key Files -->
        <section class="card no-hover">
          <h2 class="text-lg font-bold border-bottom pb-2 mb-4">${iconManager.getIcon('file')} Key Files</h2>
          
          <div class="accordion" id="files-accordion" data-component="accordion" data-mode="single">
            
            <div data-title="course-config.js - Course Settings" data-icon="settings">
              <div class="stack-sm">
                <p>This file controls your entire course structure:</p>
                <ul class="list-styled">
                  <li><strong>Metadata</strong> - Title, description, version</li>
                  <li><strong>Structure</strong> - Order of slides, sections, and assessments</li>
                  <li><strong>Objectives</strong> - Learning goals to track</li>
                  <li><strong>Navigation</strong> - How learners move through content</li>
                  <li><strong>Engagement</strong> - What learners must complete</li>
                </ul>
                <p class="text-sm text-muted">Your AI assistant will create and modify this file for you.</p>
              </div>
            </div>
            
            <div data-title="slides/ - Your Slide Files" data-icon="layers">
              <div class="stack-sm">
                <p>Each slide in your course is a separate file in this folder.</p>
                <ul class="list-styled">
                  <li>One file per slide (e.g., <code>intro.js</code>, <code>module-1.js</code>)</li>
                  <li>Contains the content: HTML, text, and interactions</li>
                  <li>AI generates these based on your outline</li>
                </ul>
              </div>
            </div>
            
            <div data-title="assets/ - Media Files" data-icon="image">
              <div class="stack-sm">
                <p>All your media lives here, organized by type:</p>
                <ul class="list-styled">
                  <li><strong>images/</strong> - Photos, diagrams, icons</li>
                  <li><strong>audio/</strong> - Narration and sound effects</li>
                  <li><strong>video/</strong> - Video files (or use YouTube/Vimeo links)</li>
                </ul>
              </div>
            </div>
            
            <div data-title="theme.css - Branding" data-icon="palette">
              <div class="stack-sm">
                <p>Customize your course appearance:</p>
                <ul class="list-styled">
                  <li>Brand colors (primary, accent, backgrounds)</li>
                  <li>Fonts and typography</li>
                  <li>Spacing and sizing adjustments</li>
                </ul>
                <p class="text-sm text-muted">We'll cover theming in detail later.</p>
              </div>
            </div>
            
            <div data-title="references/ - Source Materials" data-icon="file-text">
              <div class="stack-sm">
                <p>Place your existing content here for conversion:</p>
                <ul class="list-styled">
                  <li>PDFs, Word docs, PowerPoints</li>
                  <li>Run <code>coursecode convert</code> to process them</li>
                  <li>Converted markdown appears in <code>references/converted/</code></li>
                </ul>
              </div>
            </div>
            
          </div>
        </section>

        <!-- Slides vs Sections -->
        <section class="card no-hover">
          <h2 class="text-lg font-bold border-bottom pb-2 mb-4">${iconManager.getIcon('git-branch')} Slides, Sections, and Assessments</h2>
          <div class="cols-3 gap-4">
            <div class="callout callout--info">
              <h3 class="font-bold mb-2">Slides</h3>
              <p class="text-sm">Individual screens of content. Each has its own file and can contain text, media, and interactions.</p>
            </div>
            <div class="callout callout--success">
              <h3 class="font-bold mb-2">Sections</h3>
              <p class="text-sm">Groups of related slides. Appear as expandable folders in the navigation menu.</p>
            </div>
            <div class="callout callout--warning">
              <h3 class="font-bold mb-2">Assessments</h3>
              <p class="text-sm">Graded quizzes. Scores are tracked and reported to your LMS.</p>
            </div>
          </div>
        </section>

      </div>
    `;

    return container;
  }
};
