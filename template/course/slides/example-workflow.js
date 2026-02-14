/**
 * Workflow slide - The AI-driven workflow with MCP integration
 */

const { iconManager } = CourseCode;

export const slide = {
  render(_root, _context) {
    const container = document.createElement('div');
    container.innerHTML = `
      <div class="stack-lg">
        
        <!-- Header -->
        <header class="slide-header">
          <h1>The AI Workflow</h1>
          <p>Four steps to create professional e-learning courses with AI assistance.</p>
        </header>

        <!-- Two Approaches -->
        <section class="card no-hover">
          <h2 class="text-lg font-bold border-bottom pb-2 mb-4">${iconManager.getIcon('zap')} Two Ways to Work with AI</h2>
          <div class="card-grid-2 gap-6">
            <div class="card card-accent-left" data-accent="primary">
              <div class="card-body stack-sm">
                <h3 class="font-bold">${iconManager.getIcon('cpu', { size: 'md' })} MCP (Recommended)</h3>
                <p class="text-sm">Your AI connects directly to CourseCode through the <strong>Model Context Protocol</strong>. It can preview your course, take screenshots, test interactions, and fix issues automatically.</p>
                <div class="callout callout--success callout--compact">
                  <strong>Setup:</strong> Add CourseCode as an MCP server in your AI tool. See the User Guide for instructions.
                </div>
              </div>
            </div>
            <div class="card card-accent-left" data-accent="secondary">
              <div class="card-body stack-sm">
                <h3 class="font-bold">${iconManager.getIcon('message-square', { size: 'md' })} Chat-Based (Manual)</h3>
                <p class="text-sm">Share documentation files with your AI and describe what you want. You preview the course yourself and report issues back to the AI.</p>
                <div class="callout callout--compact">
                  <strong>No setup needed</strong>, but you do more of the work.
                </div>
              </div>
            </div>
          </div>
        </section>

        <!-- Steps -->
        <section data-component="steps" data-style="connected">
          <div class="step">
            <div class="step-number">1</div>
            <div class="step-content">
              <h3>Convert Your Materials</h3>
              <p><strong>What you'll do:</strong> Turn your existing training documents into a format AI can read.</p>
              <div class="callout callout--info callout--compact mt-2">
                <strong>Where to put your files:</strong> Copy your PDFs, Word docs, or PowerPoints into the <code>course/references/</code> folder.
              </div>
              <p class="mt-2"><strong>The command to run:</strong></p>
              <pre class="bg-gray-100 p-2 rounded text-sm overflow-x-auto"><code>coursecode convert</code></pre>
              <p class="text-sm text-muted mt-2">Creates text versions in <code>course/references/converted/</code>. <em>Skip if starting from scratch.</em></p>
            </div>
          </div>
          <div class="step">
            <div class="step-number">2</div>
            <div class="step-content">
              <h3>Create Your Outline</h3>
              <p><strong>What you'll do:</strong> Plan the structure of your course before building it.</p>
              <div class="cols-2 gap-4 mt-2">
                <div class="callout callout--info callout--compact">
                  <strong>${iconManager.getIcon('cpu', { size: 'sm' })} With MCP:</strong>
                  <p class="text-sm mt-1 mb-0 font-mono">"Create a course outline for <em>[topic]</em>. The audience is <em>[description]</em> and it should take <em>[duration]</em>."</p>
                  <p class="text-sm text-muted mt-1 mb-0">The AI reads your references and the outline template automatically.</p>
                </div>
                <div class="callout callout--compact">
                  <strong>${iconManager.getIcon('message-square', { size: 'sm' })} Without MCP:</strong>
                  <p class="text-sm mt-1 mb-0">Share your converted docs, <code>COURSE_OUTLINE_TEMPLATE.md</code>, and <code>COURSE_OUTLINE_GUIDE.md</code> with your AI.</p>
                </div>
              </div>
              <p class="text-sm text-muted mt-2"><strong>Important:</strong> Review the outline carefully. Ask for changes until you're happy.</p>
            </div>
          </div>
          <div class="step">
            <div class="step-number">3</div>
            <div class="step-content">
              <h3>Build the Course</h3>
              <p><strong>What you'll do:</strong> Have your AI create all slides based on your approved outline.</p>
              <div class="cols-2 gap-4 mt-2">
                <div class="callout callout--info callout--compact">
                  <strong>${iconManager.getIcon('cpu', { size: 'sm' })} With MCP:</strong>
                  <p class="text-sm mt-1 mb-0 font-mono">"Build the course from the outline. Use engaging components and interactions."</p>
                  <p class="text-sm text-muted mt-1 mb-0">The AI reads all docs, lints its work, and screenshots slides to verify.</p>
                </div>
                <div class="callout callout--compact">
                  <strong>${iconManager.getIcon('message-square', { size: 'sm' })} Without MCP:</strong>
                  <p class="text-sm mt-1 mb-0">Share your outline and <code>COURSE_AUTHORING_GUIDE.md</code> with your AI.</p>
                </div>
              </div>
            </div>
          </div>
          <div class="step">
            <div class="step-number">4</div>
            <div class="step-content">
              <h3>Preview & Refine</h3>
              <p><strong>What you'll do:</strong> Review and polish your course until it's ready.</p>
              <div class="cols-2 gap-4 mt-2">
                <div class="callout callout--info callout--compact">
                  <strong>${iconManager.getIcon('cpu', { size: 'sm' })} With MCP:</strong>
                  <p class="text-sm mt-1 mb-0 font-mono">"Screenshot the intro slide. The heading color should be darker."</p>
                  <p class="text-sm text-muted mt-1 mb-0">The AI sees and fixes issues directly. No copy-pasting error messages.</p>
                </div>
                <div class="callout callout--compact">
                  <strong>${iconManager.getIcon('message-square', { size: 'sm' })} Without MCP:</strong>
                  <p class="text-sm mt-1 mb-0">Run <code>coursecode preview</code>, browse to <code>localhost:4173</code>, and describe issues to your AI.</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <!-- MCP Advantage Callout -->
        <div class="callout callout--success">
          <h3 class="font-bold">${iconManager.getIcon('zap')} Why MCP Makes a Difference</h3>
          <div class="cols-3 gap-4 mt-2">
            <div class="stack-xs">
              <strong>Self-correcting</strong>
              <p class="text-sm m-0">AI lints its own code and catches errors before you do.</p>
            </div>
            <div class="stack-xs">
              <strong>Visual verification</strong>
              <p class="text-sm m-0">AI screenshots slides to verify layout and design.</p>
            </div>
            <div class="stack-xs">
              <strong>Faster iteration</strong>
              <p class="text-sm m-0">No manual file sharing, no copy-pasting between tools.</p>
            </div>
          </div>
        </div>

      </div>
    `;

    return container;
  }
};
