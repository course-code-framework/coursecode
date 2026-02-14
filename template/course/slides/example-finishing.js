/**
 * Finishing slide - Theming, branding, and deployment
 */

const { iconManager } = CourseCode;

export const slide = {
    render(_root, _context) {
        const container = document.createElement('div');
        container.innerHTML = `
      <div class="stack-lg">
        
        <!-- Header -->
        <header class="slide-header">
          <h1>Finishing Your Course</h1>
          <p>Customize the look, then build and deploy to your LMS.</p>
        </header>

        <!-- Theming Section -->
        <section class="card no-hover">
          <h2 class="text-lg font-bold border-bottom pb-2 mb-4">${iconManager.getIcon('palette')} Theming and Branding</h2>
          <div class="cols-2 gap-6">
            <div class="stack-md">
              <p>Edit <code>course/theme.css</code> to customize your course appearance:</p>
              <ul class="list-styled">
                <li><strong>Primary color</strong> - Buttons, links, accents</li>
                <li><strong>Secondary color</strong> - Alternate highlights</li>
                <li><strong>Background colors</strong> - Page and card backgrounds</li>
                <li><strong>Fonts</strong> - Headings and body text</li>
              </ul>
            </div>
            <div class="callout callout--info callout--compact">
              <strong>${iconManager.getIcon('message-square')} AI Prompt:</strong>
              <p class="text-sm mt-2 font-mono">"Update theme.css to use [your brand color] as the primary color, with [font name] for headings."</p>
            </div>
          </div>
        </section>

        <!-- Logo and Branding -->
        <section class="card no-hover">
          <h2 class="text-lg font-bold border-bottom pb-2 mb-4">${iconManager.getIcon('image')} Adding Your Logo</h2>
          <div class="stack-md">
            <p>Place your logo in <code>course/assets/images/</code>, then update course-config.js:</p>
            <div class="cols-2 gap-4">
              <pre class="bg-gray-100 p-3 rounded text-sm overflow-x-auto"><code>branding: {
  logo: './course/assets/images/your-logo.svg',
  logoAlt: 'Your Company',
  companyName: 'Your Company',
  courseTitle: 'Course Name'
}</code></pre>
              <div class="callout callout--compact">
                <strong>Tip:</strong> SVG logos work best because they scale perfectly at any size.
              </div>
            </div>
          </div>
        </section>

        <!-- Deployment -->
        <section class="card no-hover">
          <h2 class="text-lg font-bold border-bottom pb-2 mb-4">${iconManager.getIcon('package')} Deploying Your Course</h2>
          <div class="stack-md">
            <p>When your course is ready, build a package for your LMS:</p>
            <pre class="bg-gray-100 p-3 rounded overflow-x-auto"><code>coursecode build</code></pre>
            
            <h3 class="font-bold mt-4">Choosing a Format</h3>
            <p class="text-sm">Your LMS requires a specific format. If you're unsure, ask your LMS admin or try SCORM 1.2.</p>
            <table class="table table-striped">
              <thead>
                <tr>
                  <th>Format</th>
                  <th>What It Is</th>
                  <th>Command</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td><strong>cmi5</strong></td>
                  <td>Modern standard, rich data</td>
                  <td><code>coursecode build</code> (default)</td>
                </tr>
                <tr>
                  <td><strong>SCORM 2004</strong></td>
                  <td>Enterprise standard</td>
                  <td><code>coursecode build --format scorm2004</code></td>
                </tr>
                <tr>
                  <td><strong>SCORM 1.2</strong></td>
                  <td>Most compatible</td>
                  <td><code>coursecode build --format scorm1.2</code></td>
                </tr>
              </tbody>
            </table>

            <h3 class="font-bold mt-4">CDN Deployment (Advanced)</h3>
            <p class="text-sm">For frequent updates, host on a CDN and upload a tiny proxy to your LMS. Changes go live instantly without re-uploading. Ask your AI about <code>scorm1.2-proxy</code> or <code>cmi5-remote</code> formats.</p>
          </div>
        </section>

        <!-- Sharing Previews -->
        <section class="card no-hover">
          <h2 class="text-lg font-bold border-bottom pb-2 mb-4">${iconManager.getIcon('share-2')} Sharing for Review</h2>
          <div class="cols-2 gap-6">
            <div class="stack-sm">
              <p>Share your course with stakeholders before LMS deployment:</p>
              <pre class="bg-gray-100 p-3 rounded overflow-x-auto"><code>coursecode preview --export</code></pre>
              <p>Creates a folder you can upload to any web host (Netlify, GitHub Pages, etc.). Add password protection and other options with flags.</p>
            </div>
            <div class="stack-sm">
              <p><strong>Export content for SME review:</strong></p>
              <pre class="bg-gray-100 p-3 rounded overflow-x-auto"><code>coursecode export-content -o review.md</code></pre>
              <p class="text-sm text-muted">Extracts all slide text, interactions, and questions into a single document for subject matter expert review.</p>
            </div>
          </div>
        </section>

        <!-- Next Steps -->
        <div class="callout callout--success">
          <h3 class="font-bold">${iconManager.getIcon('check-circle')} You're Ready!</h3>
          <p>You now know the basics of creating courses with CourseCode. Explore the UI Showcase and Interactions Showcase to see what components are available, then take the assessment to test your knowledge.</p>
        </div>

      </div>
    `;

        return container;
    }
};
