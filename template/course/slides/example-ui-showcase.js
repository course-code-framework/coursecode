/**
 * UI Components Showcase
 * This slide demonstrates available UI components with collapsible code examples.
 * See COURSE_AUTHORING_GUIDE.md for full documentation.
 */

export const slide = {
  render(_root, _context) {
    const container = document.createElement('div');
    container.innerHTML = `
      <div class="stack-lg">
        
        <!-- Header -->
        <div class="stack-md">
          <div class="callout callout--info">
            <h2 class="text-xl font-bold m-0">UI Components Showcase</h2>
            <p class="m-0">Explore the available components. Click "View Code" to see the HTML for each example.</p>
          </div>
        </div>

        <!-- Main Tabs -->
        <div id="demo-tabs" data-component="tabs">
          <div class="tab-list" role="tablist">
            <button class="tab-button active" data-action="select-tab" data-tab="static" role="tab">Static & Layout</button>
            <button class="tab-button" data-action="select-tab" data-tab="interactive" role="tab">Interactive</button>
            <button class="tab-button" data-action="select-tab" data-tab="forms" role="tab">Forms</button>
            <button class="tab-button" data-action="select-tab" data-tab="feedback" role="tab">Feedback</button>
            <button class="tab-button" data-action="select-tab" data-tab="images" role="tab">Images</button>
            <button class="tab-button" data-action="select-tab" data-tab="audio" role="tab">Audio</button>
            <button class="tab-button" data-action="select-tab" data-tab="video" role="tab">Video</button>
          </div>

          <!-- Tab 1: Static & Layout -->
          <div id="static" class="tab-content active" role="tabpanel">
            <div class="stack-lg">
              
              <!-- Buttons -->
              <section class="card no-hover">
                <h3 class="text-lg font-bold border-bottom pb-2 mb-4">Buttons</h3>
                <div class="stack-md">
                  <div class="flex flex-wrap gap-2">
                    <button class="btn btn-primary">Primary</button>
                    <button class="btn btn-secondary">Secondary</button>
                    <button class="btn btn-success">Success</button>
                    <button class="btn btn-warning">Warning</button>
                    <button class="btn btn-danger">Danger</button>
                    <button class="btn btn-info">Info</button>
                  </div>
                  <div class="flex flex-wrap gap-2 items-end">
                    <button class="btn btn-primary btn-sm">Small</button>
                    <button class="btn btn-primary">Regular</button>
                    <button class="btn btn-primary btn-lg">Large</button>
                    <button class="btn btn-primary" disabled>Disabled</button>
                    <button class="btn btn-outline-primary">Outline Primary</button>
                    <button class="btn btn-outline-secondary">Outline Secondary</button>
                  </div>
                  
                  <div data-component="collapse" class="mt-3">
                    <button type="button" class="btn btn-sm btn-secondary collapse-trigger" data-action="toggle-collapse" aria-controls="code-buttons" aria-expanded="false">
                      <span class="collapse-text-show">Show Code Example</span>
                      <span class="collapse-text-hide">Hide Code Example</span>
                    </button>
                    <div class="collapse-panel mt-3" id="code-buttons">
                      <pre class="bg-gray-100 p-3 rounded text-xs overflow-x-auto"><code>&lt;button class="btn btn-primary"&gt;Primary&lt;/button&gt;
                        &lt;button class="btn btn-secondary"&gt;Secondary&lt;/button&gt;
                        &lt;button class="btn btn-primary btn-lg"&gt;Large&lt;/button&gt;
                        &lt;button class="btn btn-outline-primary"&gt;Outline&lt;/button&gt;</code></pre>
                    </div>
                  </div>
                </div>
              </section>

              <!-- Badges -->
              <section class="card no-hover">
                <h3 class="text-lg font-bold border-bottom pb-2 mb-4">Badges</h3>
                <div class="stack-md">
                  <div class="flex flex-wrap gap-2 items-center">
                    <span class="badge badge-primary">Primary</span>
                    <span class="badge badge-secondary">Secondary</span>
                    <span class="badge badge-success">Success</span>
                    <span class="badge badge-warning">Warning</span>
                    <span class="badge badge-danger">Danger</span>
                    <span class="badge badge-info">Info</span>
                  </div>
                  <div class="flex flex-wrap gap-2 items-center">
                    <span class="badge badge-outline">Outline</span>
                    <span class="badge badge-primary badge-borderless">Borderless</span>
                    <span class="hero-badge">Hero Badge</span>
                    <span class="hero-badge hero-badge-borderless">Hero Borderless</span>
                  </div>

                  <div data-component="collapse" class="mt-3">
                    <button type="button" class="btn btn-sm btn-secondary collapse-trigger" data-action="toggle-collapse" aria-controls="code-badges" aria-expanded="false">
                      <span class="collapse-text-show">Show Code Example</span>
                      <span class="collapse-text-hide">Hide Code Example</span>
                    </button>
                    <div class="collapse-panel mt-3" id="code-badges">
                      <pre class="bg-gray-100 p-3 rounded text-xs overflow-x-auto"><code>&lt;span class="badge badge-primary"&gt;Primary&lt;/span&gt;
&lt;span class="badge badge-outline"&gt;Outline&lt;/span&gt;
&lt;span class="badge badge-primary badge-borderless"&gt;Borderless&lt;/span&gt;
&lt;span class="hero-badge"&gt;Hero Badge&lt;/span&gt;
&lt;span class="hero-badge hero-badge-borderless"&gt;Hero Borderless&lt;/span&gt;</code></pre>
                    </div>
                  </div>
                </div>
              </section>

              <!-- Callouts -->
              <section class="card no-hover">
                <h3 class="text-lg font-bold border-bottom pb-2 mb-4">Callouts</h3>
                <div class="stack-md">
                  <p class="text-sm text-primary m-0">All modern <code>.callout</code> variants are shown below.</p>
                  <div class="callout callout--neutral" data-component="callout" data-icon="book-open">
                    <h4 class="callout__title">Neutral context</h4>
                    <div class="callout__body">
                      <p>Use neutral for non-urgent explanatory context, notes, and transitional guidance.</p>
                    </div>
                  </div>
                  <div class="callout callout--info" data-component="callout" data-icon="sparkles" data-icon-size="md">
                    <h4 class="callout__title">Modern default (recommended)</h4>
                    <div class="callout__body">
                      <p>Use this as the default informational callout in new content.</p>
                    </div>
                    <div class="callout__meta">Meta text slot example</div>
                  </div>
                  <div class="callout callout--success" data-component="callout" data-icon="check-circle">
                    <h4 class="callout__title">Success</h4>
                    <div class="callout__body">
                      <p>Positive confirmations, completion states, and successful outcomes.</p>
                    </div>
                  </div>
                  <div class="callout callout--warning" data-component="callout" data-icon="alert-triangle">
                    <h4 class="callout__title">Warning</h4>
                    <div class="callout__body">
                      <p>Cautionary guidance when users should double-check before continuing.</p>
                    </div>
                  </div>
                  <div class="callout callout--danger" data-component="callout" data-icon="octagon-alert">
                    <h4 class="callout__title">Danger</h4>
                    <div class="callout__body">
                      <p>Errors, critical problems, and high-severity states.</p>
                    </div>
                  </div>
                  <div class="callout callout--success callout--compact" data-component="callout" data-icon="check" data-icon-size="xs">
                    <h4 class="callout__title">Compact success</h4>
                    <div class="callout__body">
                      <p>Great for checklist confirmations and short feedback.</p>
                    </div>
                  </div>
                  <div class="callout callout--neutral callout--spacious" data-component="callout" data-icon="layers">
                    <h4 class="callout__title">Spacious neutral</h4>
                    <div class="callout__body">
                      <p>Use spacious density when you want a calmer, editorial rhythm around longer context.</p>
                    </div>
                  </div>
                  <div class="callout callout--info callout--actionable" data-component="callout" data-icon="mouse-pointer" tabindex="0">
                    <h4 class="callout__title">Actionable info</h4>
                    <div class="callout__body">
                      <p>Use actionable when the whole panel acts like an interactive target.</p>
                    </div>
                    <div class="callout__actions">
                      <button class="btn btn-sm btn-outline-primary">Open</button>
                    </div>
                  </div>
                  <div class="callout callout--warning callout--dismissible" data-component="callout" data-icon="shield" data-icon-class="icon-warning">
                    <button class="callout__dismiss" aria-label="Dismiss">×</button>
                    <h4 class="callout__title">Warning with action slot</h4>
                    <div class="callout__body">
                      <p>For higher attention states, pair warning content with a clear next action.</p>
                    </div>
                    <div class="callout__actions">
                      <button class="btn btn-sm btn-outline-secondary">Review</button>
                    </div>
                  </div>
                  <div class="callout callout--danger callout--filled" data-component="callout" data-icon="stop-circle">
                    <h4 class="callout__title">Filled danger</h4>
                    <div class="callout__body">
                      <p>Reserve the filled variant for urgent, blocking states only.</p>
                    </div>
                  </div>
                  <div data-component="collapse" class="mt-3">
                    <button type="button" class="btn btn-sm btn-secondary collapse-trigger" data-action="toggle-collapse" aria-controls="code-callouts" aria-expanded="false">
                      <span class="collapse-text-show">Show Code Example</span>
                      <span class="collapse-text-hide">Hide Code Example</span>
                    </button>
                    <div class="collapse-panel mt-3" id="code-callouts">
                      <pre class="bg-gray-100 p-3 rounded text-xs overflow-x-auto"><code>&lt;!-- Severity --&gt;
&lt;aside class="callout callout--neutral" data-component="callout" data-icon="book-open"&gt;...&lt;/aside&gt;
&lt;aside class="callout callout--info" data-component="callout" data-icon="sparkles" data-icon-size="md"&gt;...&lt;/aside&gt;
&lt;aside class="callout callout--success" data-component="callout" data-icon="check-circle"&gt;...&lt;/aside&gt;
&lt;aside class="callout callout--warning" data-component="callout" data-icon="alert-triangle"&gt;...&lt;/aside&gt;
&lt;aside class="callout callout--danger" data-component="callout" data-icon="octagon-alert"&gt;...&lt;/aside&gt;

&lt;!-- Density --&gt;
&lt;aside class="callout callout--compact" data-component="callout" data-icon="check" data-icon-size="xs"&gt;...&lt;/aside&gt;
&lt;aside class="callout callout--spacious" data-component="callout" data-icon="layers"&gt;...&lt;/aside&gt;

&lt;!-- Style + behavior --&gt;
&lt;aside class="callout callout--filled" data-component="callout" data-icon="stop-circle"&gt;...&lt;/aside&gt;
&lt;aside class="callout callout--actionable" data-component="callout" data-icon="mouse-pointer"&gt;...&lt;/aside&gt;
&lt;aside class="callout callout--dismissible"&gt;
  &lt;button class="callout__dismiss" aria-label="Dismiss"&gt;×&lt;/button&gt;
&lt;/aside&gt;

&lt;!-- Slots --&gt;
&lt;aside class="callout callout--info" data-component="callout" data-icon="auto"&gt;
  &lt;h4 class="callout__title"&gt;Title&lt;/h4&gt;
  &lt;div class="callout__body"&gt;&lt;p&gt;Message text&lt;/p&gt;&lt;/div&gt;
  &lt;div class="callout__meta"&gt;Meta line&lt;/div&gt;
  &lt;div class="callout__actions"&gt;&lt;button class="btn btn-sm btn-outline-secondary"&gt;Action&lt;/button&gt;&lt;/div&gt;
&lt;/aside&gt;</code></pre>
                    </div>
                  </div>
                </div>
              </section>

              <!-- Layout Grid -->
              <section class="card no-hover">
                <h3 class="text-lg font-bold border-bottom pb-2 mb-4">Grid Layouts</h3>
                <div class="stack-md">
                  <p>Responsive grid utilities: <code>.cols-2</code>, <code>.cols-3</code>, <code>.cols-auto-fit</code></p>
                  <div class="cols-3 gap-4">
                    <div class="p-4 bg-gray-100 rounded text-center">Col 1</div>
                    <div class="p-4 bg-gray-100 rounded text-center">Col 2</div>
                    <div class="p-4 bg-gray-100 rounded text-center">Col 3</div>
                  </div>
                  <div class="split-60-40 gap-4 mt-4">
                    <div class="p-4 bg-gray-100 rounded text-center">60% Width</div>
                    <div class="p-4 bg-gray-100 rounded text-center">40% Width</div>
                  </div>
                </div>
              </section>

              <!-- Intro Cards Pattern -->
              <section class="card no-hover">
                <h3 class="text-lg font-bold border-bottom pb-2 mb-4">Intro Cards Pattern</h3>
                <p class="mb-4">Use for welcome slides and feature overviews. Cards are equal-width and stack on mobile.</p>
                
                <div data-component="intro-cards" class="mb-4">
                  <div class="intro-card">
                    <div class="card-icon">🎯</div>
                    <h3>First Feature</h3>
                    <p>Brief description of the first key feature or benefit.</p>
                  </div>
                  <div class="intro-card">
                    <div class="card-icon">⚡</div>
                    <h3>Second Feature</h3>
                    <p>Brief description of the second key feature or benefit.</p>
                  </div>
                  <div class="intro-card">
                    <div class="card-icon">✨</div>
                    <h3>Third Feature</h3>
                    <p>Brief description of the third key feature or benefit.</p>
                  </div>
                </div>
                
                <div data-component="collapse">
                  <button type="button" class="btn btn-sm btn-secondary collapse-trigger" data-action="toggle-collapse" aria-controls="code-intro-cards" aria-expanded="false">
                    <span class="collapse-text-show">Show Code Example</span>
                    <span class="collapse-text-hide">Hide Code Example</span>
                  </button>
                  <div class="collapse-panel mt-3" id="code-intro-cards">
                    <pre class="bg-gray-100 p-3 rounded text-xs overflow-x-auto"><code>&lt;div data-component="intro-cards"&gt;
  &lt;div class="intro-card"&gt;
    &lt;div class="card-icon"&gt;🎯&lt;/div&gt;
    &lt;h3&gt;Feature Title&lt;/h3&gt;
    &lt;p&gt;Description text.&lt;/p&gt;
  &lt;/div&gt;
  &lt;!-- Add more intro-card divs --&gt;
&lt;/div&gt;</code></pre>
                  </div>
                </div>
              </section>

              <!-- Steps Pattern -->
              <section class="card no-hover">
                <h3 class="text-lg font-bold border-bottom pb-2 mb-4">Steps Pattern</h3>
                <p class="mb-4">Use for processes, workflows, or sequential instructions.</p>
                
                <div data-component="steps" class="mb-4" data-steps-style="connected">
                  <div class="step">
                    <div class="step-number">1</div>
                    <div class="step-content">
                      <h3>First Step</h3>
                      <p>Description of what happens in this step.</p>
                    </div>
                  </div>
                  <div class="step">
                    <div class="step-number">2</div>
                    <div class="step-content">
                      <h3>Second Step</h3>
                      <p>Description of what happens in this step.</p>
                    </div>
                  </div>
                  <div class="step">
                    <div class="step-number">3</div>
                    <div class="step-content">
                      <h3>Third Step</h3>
                      <p>Description of what happens in this step.</p>
                    </div>
                  </div>
                </div>
                
                <div data-component="collapse">
                  <button type="button" class="btn btn-sm btn-secondary collapse-trigger" data-action="toggle-collapse" aria-controls="code-steps" aria-expanded="false">
                    <span class="collapse-text-show">Show Code Example</span>
                    <span class="collapse-text-hide">Hide Code Example</span>
                  </button>
                  <div class="collapse-panel mt-3" id="code-steps">
                    <pre class="bg-gray-100 p-3 rounded text-xs overflow-x-auto"><code>&lt;div data-component="steps" data-steps-style="connected"&gt;
  &lt;div class="step"&gt;
    &lt;div class="step-number"&gt;1&lt;/div&gt;
    &lt;div class="step-content"&gt;
      &lt;h3&gt;Step Title&lt;/h3&gt;
      &lt;p&gt;Step description.&lt;/p&gt;
    &lt;/div&gt;
  &lt;/div&gt;
  &lt;!-- Add more step divs --&gt;
&lt;/div&gt;</code></pre>
                  </div>
                </div>
              </section>

              <!-- Feature Comparison Pattern -->
              <section class="card no-hover">
                <h3 class="text-lg font-bold border-bottom pb-2 mb-4">Pros/Cons Comparison</h3>
                <p class="mb-4">Use side-by-side cards for comparing options or listing pros/cons.</p>
                
                <div class="card-grid-2 gap-6 mb-4">
                  <div class="card card-accent-left" data-accent="success">
                    <div class="card-body stack-sm">
                      <h3 class="font-bold text-success">✓ Pros</h3>
                      <ul class="list-styled">
                        <li>First advantage point</li>
                        <li>Second advantage point</li>
                        <li>Third advantage point</li>
                      </ul>
                    </div>
                  </div>
                  <div class="card card-accent-left" data-accent="warning">
                    <div class="card-body stack-sm">
                      <h3 class="font-bold text-warning">✗ Cons</h3>
                      <ul class="list-styled">
                        <li>First disadvantage point</li>
                        <li>Second disadvantage point</li>
                      </ul>
                    </div>
                  </div>
                </div>
                
                <div data-component="collapse">
                  <button type="button" class="btn btn-sm btn-secondary collapse-trigger" data-action="toggle-collapse" aria-controls="code-comparison" aria-expanded="false">
                    <span class="collapse-text-show">Show Code Example</span>
                    <span class="collapse-text-hide">Hide Code Example</span>
                  </button>
                  <div class="collapse-panel mt-3" id="code-comparison">
                    <pre class="bg-gray-100 p-3 rounded text-xs overflow-x-auto"><code>&lt;div class="card-grid-2 gap-6"&gt;
  &lt;div class="card card-accent-left" data-accent="success"&gt;
    &lt;div class="card-body stack-sm"&gt;
      &lt;h3 class="font-bold text-success"&gt;✓ Pros&lt;/h3&gt;
      &lt;ul class="list-styled"&gt;
        &lt;li&gt;Advantage&lt;/li&gt;
      &lt;/ul&gt;
    &lt;/div&gt;
  &lt;/div&gt;
  &lt;div class="card card-accent-left" data-accent="warning"&gt;
    &lt;div class="card-body stack-sm"&gt;
      &lt;h3 class="font-bold text-warning"&gt;✗ Cons&lt;/h3&gt;
      &lt;ul class="list-styled"&gt;
        &lt;li&gt;Disadvantage&lt;/li&gt;
      &lt;/ul&gt;
    &lt;/div&gt;
  &lt;/div&gt;
&lt;/div&gt;</code></pre>
                  </div>
                </div>
              </section>

              <!-- Card with Header -->
              <section class="card no-hover">
                <h3 class="text-lg font-bold border-bottom pb-2 mb-4">Card with Header</h3>
                <p class="mb-4">Use <code>.card-header</code>, <code>.card-body</code>, and <code>.card-footer</code> inside a <code>.card</code>. The header has a default background, auto-bold headings, and bleeds to card edges. No extra classes needed.</p>
                
                <div class="card-grid-3 gap-6 mb-4">
                  <div class="card">
                    <div class="card-header">
                      <h4>Default Header</h4>
                    </div>
                    <div class="card-body stack-sm">
                      <p>Just <code>.card-header</code> with an <code>&lt;h4&gt;</code>. Background and bold are automatic.</p>
                    </div>
                    <div class="card-footer">
                      <button class="btn btn-sm btn-primary">Action</button>
                    </div>
                  </div>
                  <div class="card card-accent-top" data-accent="success">
                    <div class="card-header">
                      <h4>With Subtitle</h4>
                      <p class="text-sm text-muted">Subtitle text supported</p>
                    </div>
                    <div class="card-body stack-sm">
                      <ul class="list-styled">
                        <li>Combine with <code>.card-accent-top</code></li>
                        <li>Subtitles auto-reset margins</li>
                        <li>Footer is always optional</li>
                      </ul>
                    </div>
                  </div>
                  <div class="card">
                    <div class="card-header bg-success-subtle">
                      <h4>Custom Background</h4>
                    </div>
                    <div class="card-body stack-sm">
                      <p>Override the default with any <code>.bg-*</code> class on the header.</p>
                    </div>
                    <div class="card-footer no-border">
                      <p class="text-sm text-muted">Footer with <code>.no-border</code></p>
                    </div>
                  </div>
                </div>
                
                <div data-component="collapse">
                  <button type="button" class="btn btn-sm btn-secondary collapse-trigger" data-action="toggle-collapse" aria-controls="code-card-header" aria-expanded="false">
                    <span class="collapse-text-show">Show Code Example</span>
                    <span class="collapse-text-hide">Hide Code Example</span>
                  </button>
                  <div class="collapse-panel mt-3" id="code-card-header">
                    <pre class="bg-gray-100 p-3 rounded text-xs overflow-x-auto"><code>&lt;!-- Simplest usage — background and bold are automatic --&gt;
&lt;div class="card"&gt;
  &lt;div class="card-header"&gt;
    &lt;h4&gt;Title&lt;/h4&gt;
  &lt;/div&gt;
  &lt;div class="card-body"&gt;
    &lt;p&gt;Content&lt;/p&gt;
  &lt;/div&gt;
&lt;/div&gt;

&lt;!-- With footer --&gt;
&lt;div class="card"&gt;
  &lt;div class="card-header"&gt;
    &lt;h4&gt;Title&lt;/h4&gt;
    &lt;p class="text-sm text-muted"&gt;Optional subtitle&lt;/p&gt;
  &lt;/div&gt;
  &lt;div class="card-body stack-sm"&gt;
    &lt;p&gt;Body content.&lt;/p&gt;
  &lt;/div&gt;
  &lt;div class="card-footer"&gt;
    &lt;button class="btn btn-sm btn-primary"&gt;Action&lt;/button&gt;
  &lt;/div&gt;
&lt;/div&gt;

&lt;!-- Override header background --&gt;
&lt;div class="card"&gt;
  &lt;div class="card-header bg-primary-subtle"&gt;
    &lt;h4&gt;Colored&lt;/h4&gt;
  &lt;/div&gt;
  &lt;div class="card-body"&gt;...&lt;/div&gt;
&lt;/div&gt;</code></pre>
                  </div>
                </div>
              </section>

              <!-- Features Pattern -->
              <section class="card no-hover">
                <h3 class="text-lg font-bold border-bottom pb-2 mb-4">Features Pattern</h3>
                <p class="mb-4">Use for highlighting 3-4 key features or selling points.</p>
                
                <div data-component="features" class="mb-4">
                  <div class="feature-item">
                    <span class="emoji icon-2xl">🚀</span>
                    <h3>Fast Performance</h3>
                    <p>Lightning-fast load times.</p>
                  </div>
                  <div class="feature-item">
                    <span class="emoji icon-2xl">📱</span>
                    <h3>Mobile Ready</h3>
                    <p>Works on any device.</p>
                  </div>
                  <div class="feature-item">
                    <span class="emoji icon-2xl">🎨</span>
                    <h3>Easy to Customize</h3>
                    <p>Full design system support.</p>
                  </div>
                </div>
                
                <div data-component="collapse">
                  <button type="button" class="btn btn-sm btn-secondary collapse-trigger" data-action="toggle-collapse" aria-controls="code-features" aria-expanded="false">
                    <span class="collapse-text-show">Show Code Example</span>
                    <span class="collapse-text-hide">Hide Code Example</span>
                  </button>
                  <div class="collapse-panel mt-3" id="code-features">
                    <pre class="bg-gray-100 p-3 rounded text-xs overflow-x-auto"><code>&lt;div data-component="features"&gt;
  &lt;div class="feature-item"&gt;
    &lt;span&gt;🚀&lt;/span&gt;
    &lt;h3&gt;Feature Title&lt;/h3&gt;
    &lt;p&gt;Description text.&lt;/p&gt;
  &lt;/div&gt;
  &lt;!-- Add more feature-item divs --&gt;
&lt;/div&gt;</code></pre>
                  </div>
                </div>
              </section>

              <!-- Comparison Pattern -->
              <section class="card no-hover">
                <h3 class="text-lg font-bold border-bottom pb-2 mb-4">Comparison Pattern</h3>
                <p class="mb-4">Use for comparing two options with one highlighted as recommended.</p>
                
                <div data-component="comparison" class="mb-4">
                  <div class="comparison-item">
                    <h3>Basic Plan</h3>
                    <ul class="list-styled">
                      <li>Up to 10 users</li>
                      <li>5GB storage</li>
                      <li>Email support</li>
                    </ul>
                  </div>
                  <div class="comparison-item highlight">
                    <h3>Pro Plan ⭐</h3>
                    <ul class="list-styled">
                      <li>Unlimited users</li>
                      <li>100GB storage</li>
                      <li>Priority support</li>
                      <li>Advanced analytics</li>
                    </ul>
                  </div>
                </div>
                
                <div data-component="collapse">
                  <button type="button" class="btn btn-sm btn-secondary collapse-trigger" data-action="toggle-collapse" aria-controls="code-comparison-pattern" aria-expanded="false">
                    <span class="collapse-text-show">Show Code Example</span>
                    <span class="collapse-text-hide">Hide Code Example</span>
                  </button>
                  <div class="collapse-panel mt-3" id="code-comparison-pattern">
                    <pre class="bg-gray-100 p-3 rounded text-xs overflow-x-auto"><code>&lt;div data-component="comparison"&gt;
  &lt;div class="comparison-item"&gt;
    &lt;h3&gt;Option A&lt;/h3&gt;
    &lt;ul&gt;&lt;li&gt;Feature&lt;/li&gt;&lt;/ul&gt;
  &lt;/div&gt;
  &lt;div class="comparison-item highlight"&gt;
    &lt;h3&gt;Option B (Recommended)&lt;/h3&gt;
    &lt;ul&gt;&lt;li&gt;Feature&lt;/li&gt;&lt;/ul&gt;
  &lt;/div&gt;
&lt;/div&gt;</code></pre>
                  </div>
                </div>
              </section>

              <!-- Stats Pattern -->
              <section class="card no-hover">
                <h3 class="text-lg font-bold border-bottom pb-2 mb-4">Stats Pattern</h3>
                <p class="mb-4">Use for displaying key metrics or statistics.</p>
                
                <div data-component="stats" class="mb-4">
                  <div class="stat">
                    <span class="stat-value">99%</span>
                    <span class="stat-label">Satisfaction</span>
                  </div>
                  <div class="stat">
                    <span class="stat-value">500+</span>
                    <span class="stat-label">Courses</span>
                  </div>
                  <div class="stat">
                    <span class="stat-value">24/7</span>
                    <span class="stat-label">Support</span>
                  </div>
                </div>
                
                <div data-component="collapse">
                  <button type="button" class="btn btn-sm btn-secondary collapse-trigger" data-action="toggle-collapse" aria-controls="code-stats" aria-expanded="false">
                    <span class="collapse-text-show">Show Code Example</span>
                    <span class="collapse-text-hide">Hide Code Example</span>
                  </button>
                  <div class="collapse-panel mt-3" id="code-stats">
                    <pre class="bg-gray-100 p-3 rounded text-xs overflow-x-auto"><code>&lt;div data-component="stats"&gt;
  &lt;div class="stat"&gt;
    &lt;span class="stat-value"&gt;99%&lt;/span&gt;
    &lt;span class="stat-label"&gt;Satisfaction&lt;/span&gt;
  &lt;/div&gt;
  &lt;!-- Add more stat divs --&gt;
&lt;/div&gt;</code></pre>
                  </div>
                </div>
              </section>

              <!-- Hero Pattern -->
              <section class="card no-hover">
                <h3 class="text-lg font-bold border-bottom pb-2 mb-4">Hero Pattern</h3>
                <p class="mb-4">Use for full-width intro sections with a call to action.</p>
                
                <div data-component="hero" class="hero-gradient mb-4">
                  <div class="hero-content">
                    <h2 class="hero-title">Welcome to the Course</h2>
                    <p class="hero-subtitle">Learn everything you need to know about our topic.</p>
                    <div class="hero-cta">
                      <button class="btn btn-primary">Get Started</button>
                    </div>
                  </div>
                </div>
                
                <div data-component="collapse">
                  <button type="button" class="btn btn-sm btn-secondary collapse-trigger" data-action="toggle-collapse" aria-controls="code-hero" aria-expanded="false">
                    <span class="collapse-text-show">Show Code Example</span>
                    <span class="collapse-text-hide">Hide Code Example</span>
                  </button>
                  <div class="collapse-panel mt-3" id="code-hero">
                    <pre class="bg-gray-100 p-3 rounded text-xs overflow-x-auto"><code>&lt;div data-component="hero" class="hero-gradient"&gt;
  &lt;div class="hero-content"&gt;
    &lt;h1 class="hero-title"&gt;Welcome&lt;/h1&gt;
    &lt;p class="hero-subtitle"&gt;Subtitle text&lt;/p&gt;
    &lt;div class="hero-cta"&gt;
      &lt;button class="btn btn-primary"&gt;Get Started&lt;/button&gt;
    &lt;/div&gt;
  &lt;/div&gt;
&lt;/div&gt;</code></pre>
                  </div>
                </div>
              </section>

              <!-- Timeline Pattern -->
              <section class="card no-hover">
                <h3 class="text-lg font-bold border-bottom pb-2 mb-4">Timeline Pattern</h3>
                <p class="mb-4">Use for chronological events or history. (Note: This is a static pattern; see Interactive tab for the interactive timeline component.)</p>
                
                <div data-component="timeline" class="mb-4">
                  <div class="timeline-item">
                    <span class="timeline-date">2020</span>
                    <div class="timeline-marker"></div>
                    <div class="timeline-content">
                      <h3>Company Founded</h3>
                      <p>We started with a simple idea to revolutionize learning.</p>
                    </div>
                  </div>
                  <div class="timeline-item">
                    <span class="timeline-date">2022</span>
                    <div class="timeline-marker"></div>
                    <div class="timeline-content">
                      <h3>Major Milestone</h3>
                      <p>Reached 1 million users across 50 countries.</p>
                    </div>
                  </div>
                  <div class="timeline-item">
                    <span class="timeline-date">2024</span>
                    <div class="timeline-marker"></div>
                    <div class="timeline-content">
                      <h3>AI Integration</h3>
                      <p>Launched AI-powered authoring tools.</p>
                    </div>
                  </div>
                </div>
                
                <div data-component="collapse">
                  <button type="button" class="btn btn-sm btn-secondary collapse-trigger" data-action="toggle-collapse" aria-controls="code-timeline" aria-expanded="false">
                    <span class="collapse-text-show">Show Code Example</span>
                    <span class="collapse-text-hide">Hide Code Example</span>
                  </button>
                  <div class="collapse-panel mt-3" id="code-timeline">
                    <pre class="bg-gray-100 p-3 rounded text-xs overflow-x-auto"><code>&lt;div data-component="timeline"&gt;
  &lt;div class="timeline-item"&gt;
    &lt;span class="timeline-date"&gt;2020&lt;/span&gt;
    &lt;div class="timeline-marker"&gt;&lt;/div&gt;
    &lt;div class="timeline-content"&gt;
      &lt;h3&gt;Event Title&lt;/h3&gt;
      &lt;p&gt;Description&lt;/p&gt;
    &lt;/div&gt;
  &lt;/div&gt;
&lt;/div&gt;</code></pre>
                  </div>
                </div>
              </section>

              <!-- Quote Pattern -->
              <section class="card no-hover">
                <h3 class="text-lg font-bold border-bottom pb-2 mb-4">Quote Pattern</h3>
                <p class="mb-4">Use for testimonials, quotes, or citations.</p>
                
                <div data-component="quote" class="quote-card mb-4">
                  <p class="quote-text">"This training completely changed how I approach my work. The interactive elements made complex topics easy to understand."</p>
                  <div class="quote-attribution">
                    <img class="quote-avatar" src="https://i.pravatar.cc/80?img=32" alt="Jane Smith">
                    <span class="quote-author">Jane Smith</span>
                    <span class="quote-role">Senior Manager, Acme Corp</span>
                  </div>
                </div>
                
                <div data-component="collapse">
                  <button type="button" class="btn btn-sm btn-secondary collapse-trigger" data-action="toggle-collapse" aria-controls="code-quote" aria-expanded="false">
                    <span class="collapse-text-show">Show Code Example</span>
                    <span class="collapse-text-hide">Hide Code Example</span>
                  </button>
                  <div class="collapse-panel mt-3" id="code-quote">
                    <pre class="bg-gray-100 p-3 rounded text-xs overflow-x-auto"><code>&lt;div data-component="quote" class="quote-card"&gt;
  &lt;p class="quote-text"&gt;"Quote text here."&lt;/p&gt;
  &lt;div class="quote-attribution"&gt;
    &lt;img class="quote-avatar" src="avatar.jpg" alt="Name"&gt;
    &lt;span class="quote-author"&gt;Name&lt;/span&gt;
    &lt;span class="quote-role"&gt;Title&lt;/span&gt;
  &lt;/div&gt;
&lt;/div&gt;</code></pre>
                  </div>
                </div>
              </section>

              <!-- Checklist Pattern -->
              <section class="card no-hover">
                <h3 class="text-lg font-bold border-bottom pb-2 mb-4">Checklist Pattern</h3>
                <p class="mb-4">Use for task lists, requirements, or progress tracking.</p>
                
                <div data-component="checklist" class="mb-4">
                  <div class="checklist-progress">
                    <div class="checklist-progress-bar">
                      <div class="checklist-progress-fill" style="width: 60%"></div>
                    </div>
                    <span class="checklist-progress-text">3 of 5 complete</span>
                  </div>
                  <div class="checklist-item completed">
                    <div class="checklist-text"><strong>Complete orientation</strong></div>
                  </div>
                  <div class="checklist-item completed">
                    <div class="checklist-text"><strong>Watch training videos</strong></div>
                  </div>
                  <div class="checklist-item completed">
                    <div class="checklist-text"><strong>Read documentation</strong></div>
                  </div>
                  <div class="checklist-item">
                    <div class="checklist-text"><strong>Pass assessment</strong></div>
                    <span class="checklist-status status-required">Required</span>
                  </div>
                  <div class="checklist-item">
                    <div class="checklist-text"><strong>Get certified</strong></div>
                  </div>
                </div>
                
                <div data-component="collapse">
                  <button type="button" class="btn btn-sm btn-secondary collapse-trigger" data-action="toggle-collapse" aria-controls="code-checklist" aria-expanded="false">
                    <span class="collapse-text-show">Show Code Example</span>
                    <span class="collapse-text-hide">Hide Code Example</span>
                  </button>
                  <div class="collapse-panel mt-3" id="code-checklist">
                    <pre class="bg-gray-100 p-3 rounded text-xs overflow-x-auto"><code>&lt;div data-component="checklist"&gt;
  &lt;div class="checklist-progress"&gt;
    &lt;div class="checklist-progress-bar"&gt;
      &lt;div class="checklist-progress-fill" style="width: 60%"&gt;&lt;/div&gt;
    &lt;/div&gt;
    &lt;span class="checklist-progress-text"&gt;3 of 5 complete&lt;/span&gt;
  &lt;/div&gt;
  &lt;div class="checklist-item completed"&gt;
    &lt;div class="checklist-text"&gt;&lt;strong&gt;Task&lt;/strong&gt;&lt;/div&gt;
  &lt;/div&gt;
  &lt;div class="checklist-item"&gt;
    &lt;div class="checklist-text"&gt;&lt;strong&gt;Task&lt;/strong&gt;&lt;/div&gt;
    &lt;span class="checklist-status status-required"&gt;Required&lt;/span&gt;
  &lt;/div&gt;
&lt;/div&gt;</code></pre>
                  </div>
                </div>
              </section>

            </div>
          </div>

          <!-- Tab 2: Interactive -->
          <div id="interactive" class="tab-content" role="tabpanel" hidden>
            <div class="stack-lg">

              <!-- Accordion -->
              <section class="card no-hover">
                <h3 class="text-lg font-bold border-bottom pb-2 mb-4">Accordion</h3>
                <div class="accordion mb-4" id="demo-accordion" data-component="accordion" data-mode="multi">
                  <div data-title="Section 1">
                    Content for section 1.
                  </div>
                  <div data-title="Section 2">
                    Content for section 2.
                  </div>
                </div>
                
                <div data-component="collapse">
                  <button type="button" class="btn btn-sm btn-secondary collapse-trigger" data-action="toggle-collapse" aria-controls="code-accordion" aria-expanded="false">
                    <span class="collapse-text-show">Show Code Example</span>
                    <span class="collapse-text-hide">Hide Code Example</span>
                  </button>
                  <div class="collapse-panel mt-3" id="code-accordion">
                    <pre class="bg-gray-100 p-3 rounded text-xs overflow-x-auto"><code>&lt;div class="accordion" data-component="accordion" data-mode="multi"&gt;
  &lt;div data-title="Section Title"&gt;
    Content here.
  &lt;/div&gt;
&lt;/div&gt;</code></pre>
                  </div>
                </div>
              </section>

              <!-- Collapse (Show/Hide) -->
              <section class="card no-hover">
                <h3 class="text-lg font-bold border-bottom pb-2 mb-4">Collapse (Show/Hide)</h3>
                <div data-component="collapse" class="mb-4">
                  <button class="btn btn-secondary collapse-trigger" data-action="toggle-collapse" aria-controls="demo-collapse" aria-expanded="false">
                    <span class="collapse-text-show">Show Transcript</span>
                    <span class="collapse-text-hide">Hide Transcript</span>
                  </button>
                  <div class="collapse-panel mt-3" id="demo-collapse">
                    <div class="p-4 bg-gray-100 rounded">
                      <p>This is expandable content that can be shown or hidden. Use it for transcripts, additional details, or optional information that doesn't need to be visible by default.</p>
                    </div>
                  </div>
                </div>
                
                <div data-component="collapse">
                  <button type="button" class="btn btn-sm btn-secondary collapse-trigger" data-action="toggle-collapse" aria-controls="code-collapse" aria-expanded="false">
                    <span class="collapse-text-show">Show Code Example</span>
                    <span class="collapse-text-hide">Hide Code Example</span>
                  </button>
                  <div class="collapse-panel mt-3" id="code-collapse">
                    <pre class="bg-gray-100 p-3 rounded text-xs overflow-x-auto"><code>&lt;div data-component="collapse"&gt;
  &lt;button class="btn btn-secondary collapse-trigger" data-action="toggle-collapse" aria-controls="my-panel"&gt;
    &lt;span class="collapse-text-show"&gt;Show&lt;/span&gt;
    &lt;span class="collapse-text-hide"&gt;Hide&lt;/span&gt;
  &lt;/button&gt;
  &lt;div class="collapse-panel mt-3" id="my-panel"&gt;
    Content here.
  &lt;/div&gt;
&lt;/div&gt;</code></pre>
                  </div>
                </div>
              </section>

              <!-- Modals -->
              <section class="card no-hover">
                <h3 class="text-lg font-bold border-bottom pb-2 mb-4">Modals</h3>
                <div class="flex gap-2 mb-4">
                  <button class="btn btn-primary" 
                    data-component="modal-trigger" 
                    data-title="Demo Modal" 
                    data-body="#demo-modal-body"
                    data-footer="#demo-modal-footer"
                    data-audio-src="audio/example-ui-showcase--demo-modal.mp3"
                    data-audio-required="false">
                    Launch Modal with Audio
                  </button>
                </div>
                
                <div data-component="collapse">
                  <button type="button" class="btn btn-sm btn-secondary collapse-trigger" data-action="toggle-collapse" aria-controls="code-modal" aria-expanded="false">
                    <span class="collapse-text-show">Show Code Example</span>
                    <span class="collapse-text-hide">Hide Code Example</span>
                  </button>
                  <div class="collapse-panel mt-3" id="code-modal">
                    <pre class="bg-gray-100 p-3 rounded text-xs overflow-x-auto"><code>&lt;button class="btn btn-primary" 
  data-component="modal-trigger" 
  data-title="Modal Title" 
  data-body="#my-modal-body"
  data-footer="#my-modal-footer"&gt;
  Open Modal
&lt;/button&gt;</code></pre>
                  </div>
                </div>
              </section>

              <!-- Flip Cards -->
              <section class="card no-hover">
                <h3 class="text-lg font-bold border-bottom pb-2 mb-4">Flip Cards</h3>
                <div class="cols-3 gap-4 mb-4">
                  <div class="flip-card" data-component="flip-card">
                    <div class="flip-card-inner">
                      <div class="flip-card-front">
                        <span class="flip-card-icon">🃏</span>
                        <h3 class="flip-card-title">Default</h3>
                        <p class="text-sm text-muted">Click to reveal</p>
                      </div>
                      <div class="flip-card-back">
                        <h3 class="flip-card-title">Back Side</h3>
                        <p class="flip-card-text">Primary gradient background</p>
                      </div>
                    </div>
                  </div>
                  <div class="flip-card" data-component="flip-card">
                    <div class="flip-card-inner">
                      <div class="flip-card-front">
                        <span class="flip-card-icon">🎨</span>
                        <h3 class="flip-card-title">Secondary</h3>
                        <p class="text-sm text-muted">Click to reveal</p>
                      </div>
                      <div class="flip-card-back bg-secondary">
                        <h3 class="flip-card-title">Variant</h3>
                        <p class="flip-card-text">Using .bg-secondary</p>
                      </div>
                    </div>
                  </div>
                  <div class="flip-card" data-component="flip-card">
                    <div class="flip-card-inner">
                      <div class="flip-card-front">
                        <span class="flip-card-icon">📋</span>
                        <h3 class="flip-card-title">More Variants</h3>
                        <p class="text-sm text-muted">Click for list</p>
                      </div>
                      <div class="flip-card-back bg-dark">
                        <h3 class="flip-card-title">Back Variants</h3>
                        <p class="flip-card-text text-xs">.bg-light, .bg-dark, .bg-success-subtle, .bg-warning-subtle, .bg-danger-subtle, .bg-info-subtle</p>
                      </div>
                    </div>
                  </div>
                </div>
                
                <div data-component="collapse">
                  <button type="button" class="btn btn-sm btn-secondary collapse-trigger" data-action="toggle-collapse" aria-controls="code-flipcard" aria-expanded="false">
                    <span class="collapse-text-show">Show Code Example</span>
                    <span class="collapse-text-hide">Hide Code Example</span>
                  </button>
                  <div class="collapse-panel mt-3" id="code-flipcard">
                    <pre class="bg-gray-100 p-3 rounded text-xs overflow-x-auto"><code>&lt;div class="flip-card" data-component="flip-card"&gt;
  &lt;div class="flip-card-inner"&gt;
    &lt;div class="flip-card-front"&gt;
      &lt;span class="flip-card-icon"&gt;🃏&lt;/span&gt;
      &lt;h3 class="flip-card-title"&gt;Title&lt;/h3&gt;
    &lt;/div&gt;
    &lt;div class="flip-card-back"&gt;
      &lt;h3 class="flip-card-title"&gt;Back&lt;/h3&gt;
      &lt;p class="flip-card-text"&gt;Content&lt;/p&gt;
    &lt;/div&gt;
  &lt;/div&gt;
&lt;/div&gt;</code></pre>
                  </div>
                </div>
              </section>

              <!-- Interactive Timeline -->
              <section class="card no-hover">
                <h3 class="text-lg font-bold border-bottom pb-2 mb-4">Interactive Timeline</h3>
                <p class="mb-4">Click each event to expand details. Use <code>data-component="interactive-timeline"</code> for auto-initialization.</p>
                <div class="interactive-timeline" id="demo-timeline" data-component="interactive-timeline">
                  <div class="timeline-event" data-event-id="1998" tabindex="0">
                    <div class="timeline-marker"></div>
                    <div class="timeline-date">1998</div>
                    <div class="timeline-summary">
                      <h4>AICC Standard</h4>
                      <p>First interoperability standard</p>
                    </div>
                    <div class="timeline-details">
                      <p>The Aviation Industry CBT Committee established the first standards for computer-based training interoperability, enabling courses to work across different LMS platforms.</p>
                    </div>
                  </div>
                  <div class="timeline-event" data-event-id="2001" tabindex="-1">
                    <div class="timeline-marker"></div>
                    <div class="timeline-date">2001</div>
                    <div class="timeline-summary">
                      <h4>SCORM 1.2</h4>
                      <p>Industry standard adopted</p>
                    </div>
                    <div class="timeline-details">
                      <p>SCORM 1.2 became the dominant standard for eLearning content packaging and runtime communication, still widely used today in legacy systems.</p>
                    </div>
                  </div>
                  <div class="timeline-event" data-event-id="2013" tabindex="-1">
                    <div class="timeline-marker"></div>
                    <div class="timeline-date">2013</div>
                    <div class="timeline-summary">
                      <h4>xAPI / Tin Can</h4>
                      <p>Experience tracking arrives</p>
                    </div>
                    <div class="timeline-details">
                      <p>The Experience API (xAPI) introduced statement-based tracking, enabling learning experiences beyond the LMS — from mobile apps to simulations to real-world activities.</p>
                    </div>
                  </div>
                  <div class="timeline-event" data-event-id="2016" tabindex="-1">
                    <div class="timeline-marker"></div>
                    <div class="timeline-date">2016</div>
                    <div class="timeline-summary">
                      <h4>cmi5</h4>
                      <p>xAPI meets LMS</p>
                    </div>
                    <div class="timeline-details">
                      <p>cmi5 bridged the gap between xAPI's flexibility and LMS requirements, providing a standardized profile for launching and tracking content in managed learning environments.</p>
                    </div>
                  </div>
                </div>
                
                <div data-component="collapse" class="mt-4">
                  <button type="button" class="btn btn-sm btn-secondary collapse-trigger" data-action="toggle-collapse" aria-controls="code-interactive-timeline" aria-expanded="false">
                    <span class="collapse-text-show">Show Code Example</span>
                    <span class="collapse-text-hide">Hide Code Example</span>
                  </button>
                  <div class="collapse-panel mt-3" id="code-interactive-timeline">
                    <pre class="bg-gray-100 p-3 rounded text-xs overflow-x-auto"><code>&lt;div class="interactive-timeline" data-component="interactive-timeline"&gt;
  &lt;div class="timeline-event" data-event-id="2020" tabindex="0"&gt;
    &lt;div class="timeline-marker"&gt;&lt;/div&gt;
    &lt;div class="timeline-date"&gt;2020&lt;/div&gt;
    &lt;div class="timeline-summary"&gt;
      &lt;h4&gt;Event Title&lt;/h4&gt;
      &lt;p&gt;Brief summary&lt;/p&gt;
    &lt;/div&gt;
    &lt;div class="timeline-details"&gt;
      &lt;p&gt;Expanded details shown on click.&lt;/p&gt;
    &lt;/div&gt;
  &lt;/div&gt;
&lt;/div&gt;</code></pre>
                  </div>
                </div>
              </section>

              <!-- Embed Frame (Custom Widget) -->
              <section class="card no-hover">
                <h3 class="text-lg font-bold border-bottom pb-2 mb-4">Embed Frame (Custom HTML/JS App)</h3>
                <p class="mb-4">Embed sandboxed HTML/JS applications using <code>data-component="embed-frame"</code>. The iframe provides complete CSS isolation and communicates via <code>postMessage</code>.</p>
                
                <div class="cols-2 gap-6" style="align-items: start;">
                  <!-- The Widget -->
                  <div class="stack-sm">
                    <div data-component="embed-frame"
                         data-src="assets/widgets/gravity-painter.html"
                         data-embed-id="gravity-painter"
                         data-aspect-ratio="3/4">
                    </div>
                    <p class="text-xs text-muted text-center">✨ Click and drag to paint with particles • Create 100+ to complete</p>
                  </div>
                  
                  <!-- Feature Notes -->
                  <div class="stack-md">
                    <div class="callout callout--info callout--compact">
                      <h4 class="font-bold text-sm mb-2">🔒 CSS Isolation</h4>
                      <p class="text-sm">Course styles don't affect the widget. The iframe creates a completely separate styling context.</p>
                    </div>
                    
                    <div class="callout callout--success callout--compact">
                      <h4 class="font-bold text-sm mb-2">📡 postMessage Bridge</h4>
                      <p class="text-sm">Widget sets flags via <code>coursecode:flag</code> messages. Works with existing engagement requirements.</p>
                    </div>
                    
                    <div class="callout callout--compact">
                      <h4 class="font-bold text-sm mb-2">📐 Aspect Ratio</h4>
                      <p class="text-sm">Use <code>data-aspect-ratio</code> for fixed proportions, or omit for auto-height mode with resize messages.</p>
                    </div>
                    
                    <div class="callout callout--warning callout--compact">
                      <h4 class="font-bold text-sm mb-2">⚡ Engagement Gating</h4>
                      <p class="text-sm">Gate with <code>{ type: 'flag', key: 'gravity-painter-complete' }</code> in requirements.</p>
                    </div>
                  </div>
                </div>
                
                <div data-component="collapse" class="mt-4">
                  <button type="button" class="btn btn-sm btn-secondary collapse-trigger" data-action="toggle-collapse" aria-controls="code-embed-frame" aria-expanded="false">
                    <span class="collapse-text-show">Show Code Example</span>
                    <span class="collapse-text-hide">Hide Code Example</span>
                  </button>
                  <div class="collapse-panel mt-3" id="code-embed-frame">
                    <pre class="bg-gray-100 p-3 rounded text-xs overflow-x-auto"><code>&lt;div data-component="embed-frame"
     data-src="assets/widgets/my-widget.html"
     data-embed-id="my-widget"
     data-aspect-ratio="16/9"&gt;
&lt;/div&gt;</code></pre>
                  </div>
                </div>
              </section>
            </div>
          </div>

          <!-- Tab 3: Forms -->
          <div id="forms" class="tab-content" role="tabpanel" hidden>
            <div class="stack-lg">
              
              <form data-component="form-validator" data-success-message="Form valid!" class="stack-lg">
                
                <!-- Inputs -->
                <section class="card no-hover">
                  <h3 class="text-lg font-bold border-bottom pb-2 mb-4">Text Inputs</h3>
                  <div class="stack-md">
                    <div class="form-group">
                      <label class="form-label required">Username</label>
                      <input type="text" class="form-control" required placeholder="Enter username">
                    </div>
                    <div class="form-group">
                      <label class="form-label">Bio</label>
                      <textarea class="form-control" rows="3"></textarea>
                      <span class="form-help">Tell us about yourself</span>
                    </div>
                  </div>
                  
                  <div data-component="collapse" class="mt-3">
                    <button type="button" class="btn btn-sm btn-secondary collapse-trigger" data-action="toggle-collapse" aria-controls="code-text-inputs" aria-expanded="false">
                      <span class="collapse-text-show">Show Code Example</span>
                      <span class="collapse-text-hide">Hide Code Example</span>
                    </button>
                    <div class="collapse-panel mt-3" id="code-text-inputs">
                      <pre class="bg-gray-100 p-3 rounded text-xs overflow-x-auto"><code>&lt;div class="form-group"&gt;
  &lt;label class="form-label required"&gt;Label&lt;/label&gt;
  &lt;input type="text" class="form-control" required&gt;
&lt;/div&gt;</code></pre>
                    </div>
                  </div>
                </section>

                <!-- Toggles -->
                <section class="card no-hover">
                  <h3 class="text-lg font-bold border-bottom pb-2 mb-4">Toggles</h3>
                  <div id="demo-toggles" data-component="toggle-group" class="stack-sm">
                    <label class="toggle-switch">
                      <input type="checkbox" data-label="Default Toggle">
                      <span class="toggle-slider"></span>
                      <span class="toggle-label">Default Toggle</span>
                    </label>
                    <label class="toggle-switch toggle-success">
                      <input type="checkbox" checked data-label="Success Toggle">
                      <span class="toggle-slider"></span>
                      <span class="toggle-label">Success Toggle</span>
                    </label>
                  </div>
                  
                  <div data-component="collapse" class="mt-3">
                    <button type="button" class="btn btn-sm btn-secondary collapse-trigger" data-action="toggle-collapse" aria-controls="code-toggles" aria-expanded="false">
                      <span class="collapse-text-show">Show Code Example</span>
                      <span class="collapse-text-hide">Hide Code Example</span>
                    </button>
                    <div class="collapse-panel mt-3" id="code-toggles">
                      <pre class="bg-gray-100 p-3 rounded text-xs overflow-x-auto"><code>&lt;label class="toggle-switch"&gt;
  &lt;input type="checkbox" data-label="Toggle Label"&gt;
  &lt;span class="toggle-slider"&gt;&lt;/span&gt;
  &lt;span class="toggle-label"&gt;Toggle Label&lt;/span&gt;
&lt;/label&gt;</code></pre>
                    </div>
                  </div>
                </section>

                <!-- Radios & Checkboxes -->
                <section class="card no-hover">
                  <h3 class="text-lg font-bold border-bottom pb-2 mb-4">Selection Controls</h3>
                  <div class="cols-2 gap-6">
                    <div>
                      <h4 class="text-sm font-bold mb-2">Radio Group</h4>
                      <div class="radio-group" id="demo-radios">
                        <label class="radio-option">
                          <input type="radio" name="demo-radio" value="Option 1">
                          <span class="radio-custom"></span>
                          <div class="radio-label">Option 1</div>
                        </label>
                        <label class="radio-option">
                          <input type="radio" name="demo-radio" value="Option 2">
                          <span class="radio-custom"></span>
                          <div class="radio-label">Option 2</div>
                        </label>
                      </div>
                    </div>
                    <div>
                      <h4 class="text-sm font-bold mb-2">Checkbox Group</h4>
                      <div class="checkbox-group" id="demo-checkboxes" data-component="checkbox-group">
                        <label class="checkbox-option">
                          <input type="checkbox" value="Choice A">
                          <span class="checkbox-custom"></span>
                          <div class="checkbox-label">Choice A</div>
                        </label>
                        <label class="checkbox-option">
                          <input type="checkbox" value="Choice B">
                          <span class="checkbox-custom"></span>
                          <div class="checkbox-label">Choice B</div>
                        </label>
                      </div>
                    </div>
                  </div>
                  
                  <div data-component="collapse" class="mt-3">
                    <button type="button" class="btn btn-sm btn-secondary collapse-trigger" data-action="toggle-collapse" aria-controls="code-selection" aria-expanded="false">
                      <span class="collapse-text-show">Show Code Example</span>
                      <span class="collapse-text-hide">Hide Code Example</span>
                    </button>
                    <div class="collapse-panel mt-3" id="code-selection">
                      <pre class="bg-gray-100 p-3 rounded text-xs overflow-x-auto"><code>&lt;label class="radio-option"&gt;
  &lt;input type="radio" name="group" value="value"&gt;
  &lt;span class="radio-custom"&gt;&lt;/span&gt;
  &lt;div class="radio-label"&gt;Label&lt;/div&gt;
&lt;/label&gt;</code></pre>
                    </div>
                  </div>
                </section>

                <!-- Dropdown -->
                <section class="card no-hover">
                  <h3 class="text-lg font-bold border-bottom pb-2 mb-4">Custom Dropdown</h3>
                  <div class="form-group">
                    <label class="form-label">Select Item</label>
                    <div class="custom-dropdown" id="demo-dropdown" data-component="dropdown">
                      <button type="button" class="dropdown-trigger" data-action="toggle-dropdown">
                        <span class="dropdown-text">Choose...</span>
                      </button>
                      <div class="dropdown-menu">
                        <div class="dropdown-item" data-value="Item 1" data-action="select-item">Item 1</div>
                        <div class="dropdown-item" data-value="Item 2" data-action="select-item">Item 2</div>
                        <div class="dropdown-item" data-value="Item 3" data-action="select-item">Item 3</div>
                      </div>
                    </div>
                  </div>
                  
                  <div data-component="collapse" class="mt-3">
                    <button type="button" class="btn btn-sm btn-secondary collapse-trigger" data-action="toggle-collapse" aria-controls="code-dropdown" aria-expanded="false">
                      <span class="collapse-text-show">Show Code Example</span>
                      <span class="collapse-text-hide">Hide Code Example</span>
                    </button>
                    <div class="collapse-panel mt-3" id="code-dropdown">
                      <pre class="bg-gray-100 p-3 rounded text-xs overflow-x-auto"><code>&lt;div class="custom-dropdown" data-component="dropdown"&gt;
  &lt;button type="button" class="dropdown-trigger" data-action="toggle-dropdown"&gt;
    &lt;span class="dropdown-text"&gt;Select...&lt;/span&gt;
  &lt;/button&gt;
  &lt;div class="dropdown-menu"&gt;
    &lt;div class="dropdown-item" data-value="1" data-action="select-item"&gt;Item 1&lt;/div&gt;
  &lt;/div&gt;
&lt;/div&gt;</code></pre>
                    </div>
                  </div>
                </section>

                <div class="mt-4">
                  <button type="submit" class="btn btn-primary">Validate Form</button>
                </div>

              </form>
            </div>
          </div>

          <!-- Tab 4: Feedback -->
          <div id="feedback" class="tab-content" role="tabpanel" hidden>
            <div class="stack-lg">
              
              <!-- Notifications -->
              <section class="card no-hover">
                <h3 class="text-lg font-bold border-bottom pb-2 mb-4">Notifications</h3>
                <p class="mb-4">Toast notifications that appear at the top right.</p>
                <div class="flex flex-wrap gap-2">
                  <button class="btn btn-success" data-action="show-notification" data-type="success" data-message="Success message!">Success</button>
                  <button class="btn btn-info" data-action="show-notification" data-type="info" data-message="Info message.">Info</button>
                  <button class="btn btn-warning" data-action="show-notification" data-type="warning" data-message="Warning message.">Warning</button>
                  <button class="btn btn-danger" data-action="show-notification" data-type="danger" data-message="Error message.">Error</button>
                </div>
                
                <div data-component="collapse" class="mt-4">
                  <button type="button" class="btn btn-sm btn-secondary collapse-trigger" data-action="toggle-collapse" aria-controls="code-notifications" aria-expanded="false">
                    <span class="collapse-text-show">Show Code Example</span>
                    <span class="collapse-text-hide">Hide Code Example</span>
                  </button>
                  <div class="collapse-panel mt-3" id="code-notifications">
                    <pre class="bg-gray-100 p-3 rounded text-xs overflow-x-auto"><code>&lt;button data-action="show-notification" 
        data-type="success" 
        data-message="Success message!"&gt;
  Show Notification
&lt;/button&gt;</code></pre>
                  </div>
                </div>
              </section>

              <!-- Tooltips -->
              <section class="card no-hover">
                <h3 class="text-lg font-bold border-bottom pb-2 mb-4">Tooltips</h3>
                <div class="stack-md">
                  
                  <p class="font-bold mb-0">Positions</p>
                  <div class="flex flex-wrap gap-3">
                    <button class="btn btn-secondary" data-tooltip="Top position (default)" data-tooltip-position="top">Top</button>
                    <button class="btn btn-secondary" data-tooltip="Right position" data-tooltip-position="right">Right</button>
                    <button class="btn btn-secondary" data-tooltip="Bottom position" data-tooltip-position="bottom">Bottom</button>
                    <button class="btn btn-secondary" data-tooltip="Left position" data-tooltip-position="left">Left</button>
                  </div>

                  <p class="font-bold mb-0">Timing</p>
                  <div class="flex flex-wrap gap-3">
                    <button class="btn btn-secondary" data-tooltip="Default 500ms delay">Default (500ms)</button>
                    <button class="btn btn-secondary" data-tooltip="Instant — no delay!" data-tooltip-delay="0">Instant</button>
                    <button class="btn btn-secondary" data-tooltip="Longer 1s delay" data-tooltip-delay="1000">Slow (1s)</button>
                  </div>

                  <p class="font-bold mb-0">Themes &amp; Customization</p>
                  <div class="flex flex-wrap gap-3">
                    <button class="btn btn-secondary" data-tooltip="Dark theme (default)">Dark</button>
                    <button class="btn btn-secondary" data-tooltip="Light theme variant" data-tooltip-theme="light">Light</button>
                    <button class="btn btn-secondary" data-tooltip="This tooltip has a wider max-width of 400px, useful for longer explanations." data-tooltip-width="400">Wide (400px)</button>
                    <button class="btn btn-secondary" data-tooltip="Line 1\\nLine 2\\nLine 3">Multi-line</button>
                  </div>

                  <p class="font-bold mb-0">Icon Tooltips</p>
                  <p>Use <code>.tooltip-icon</code> for inline contextual help<span class="tooltip-icon" data-tooltip="Icons scale with font size and use your course's primary color."></span></p>
                  <h4>Heading with info<span class="tooltip-icon" data-tooltip="Tooltip icons work inside headings too." data-tooltip-delay="0"></span></h4>
                  <p class="text-sm">Small text with icon<span class="tooltip-icon" data-tooltip="Automatically scales down with smaller text."></span> — icons size proportionally.</p>
                </div>

                <div data-component="collapse" class="mt-4">
                  <button type="button" class="btn btn-sm btn-secondary collapse-trigger" data-action="toggle-collapse" aria-controls="code-tooltips" aria-expanded="false">
                    <span class="collapse-text-show">Show Code Example</span>
                    <span class="collapse-text-hide">Hide Code Example</span>
                  </button>
                  <div class="collapse-panel mt-3" id="code-tooltips">
                    <pre class="bg-gray-100 p-3 rounded text-xs overflow-x-auto"><code>&lt;!-- Inline tooltip on any element --&gt;
&lt;button data-tooltip="Tooltip text" data-tooltip-position="top"&gt;Hover me&lt;/button&gt;

&lt;!-- Custom delay (0 = instant, default = 500ms) --&gt;
&lt;span data-tooltip="No delay!" data-tooltip-delay="0"&gt;Instant&lt;/span&gt;

&lt;!-- Light theme, custom width --&gt;
&lt;span data-tooltip="Wide content" data-tooltip-theme="light" data-tooltip-width="400"&gt;Wide&lt;/span&gt;

&lt;!-- Multi-line (use \n) --&gt;
&lt;span data-tooltip="Line 1\nLine 2"&gt;Multi-line&lt;/span&gt;

&lt;!-- Icon tooltip (no inner text needed) --&gt;
&lt;span class="tooltip-icon" data-tooltip="Contextual help text"&gt;&lt;/span&gt;</code></pre>
                  </div>
                </div>
              </section>

            </div>
          </div>

          <!-- Tab 5: Images -->
          <div id="images" class="tab-content" role="tabpanel" hidden>
            <div class="stack-lg">

              <!-- Carousel -->
              <section class="card no-hover">
                <h3 class="text-lg font-bold border-bottom pb-2 mb-4">Carousel</h3>
                <div class="carousel" id="demo-carousel" data-component="carousel">
                  <div class="carousel-track">
                    <div class="carousel-slide">
                      <img src="https://picsum.photos/800/400?random=20" alt="Slide 1" class="img-fluid img-rounded">
                    </div>
                    <div class="carousel-slide">
                      <img src="https://picsum.photos/800/400?random=21" alt="Slide 2" class="img-fluid img-rounded">
                    </div>
                    <div class="carousel-slide">
                      <img src="https://picsum.photos/800/400?random=22" alt="Slide 3" class="img-fluid img-rounded">
                    </div>
                  </div>
                  <button class="carousel-button prev" data-action="prev-slide" aria-label="Previous">&#10094;</button>
                  <button class="carousel-button next" data-action="next-slide" aria-label="Next">&#10095;</button>
                  <div class="carousel-dots"></div>
                </div>
                
                <div data-component="collapse" class="mt-4">
                  <button type="button" class="btn btn-sm btn-secondary collapse-trigger" data-action="toggle-collapse" aria-controls="code-carousel" aria-expanded="false">
                    <span class="collapse-text-show">Show Code Example</span>
                    <span class="collapse-text-hide">Hide Code Example</span>
                  </button>
                  <div class="collapse-panel mt-3" id="code-carousel">
                    <pre class="bg-gray-100 p-3 rounded text-xs overflow-x-auto"><code>&lt;div class="carousel" data-component="carousel"&gt;
  &lt;div class="carousel-track"&gt;
    &lt;div class="carousel-slide"&gt;&lt;img src="slide.jpg"&gt;&lt;/div&gt;
  &lt;/div&gt;
  &lt;button class="carousel-button prev" data-action="prev-slide"&gt;‹&lt;/button&gt;
  &lt;button class="carousel-button next" data-action="next-slide"&gt;›&lt;/button&gt;
  &lt;div class="carousel-dots"&gt;&lt;/div&gt;
&lt;/div&gt;</code></pre>
                  </div>
                </div>
              </section>

              <!-- Lightbox -->
              <section class="card no-hover">
                <h3 class="text-lg font-bold border-bottom pb-2 mb-4">Lightbox (Click-to-Enlarge)</h3>
                <p class="mb-4">Click any image to enlarge. Use <code>data-component="lightbox"</code> on links. Gallery mode enables prev/next navigation.</p>
                <div class="image-gallery-3 gap-4">
                  <a href="https://picsum.photos/800/600?random=1" data-component="lightbox" class="image-link" data-lightbox-gallery="demo-gallery" data-lightbox-caption="Mountain landscape at sunset">
                    <img src="https://picsum.photos/400/300?random=1" alt="Landscape 1" class="img-rounded">
                  </a>
                  <a href="https://picsum.photos/800/600?random=2" data-component="lightbox" class="image-link" data-lightbox-gallery="demo-gallery" data-lightbox-caption="Serene forest path">
                    <img src="https://picsum.photos/400/300?random=2" alt="Landscape 2" class="img-rounded">
                  </a>
                  <a href="https://picsum.photos/800/600?random=3" data-component="lightbox" class="image-link" data-lightbox-gallery="demo-gallery" data-lightbox-caption="Ocean waves at dawn">
                    <img src="https://picsum.photos/400/300?random=3" alt="Landscape 3" class="img-rounded">
                  </a>
                </div>
                <p class="text-sm text-muted mt-3">Keyboard: <strong>ESC</strong> to close, <strong>←/→</strong> arrows for gallery navigation.</p>
                
                <div data-component="collapse" class="mt-4">
                  <button type="button" class="btn btn-sm btn-secondary collapse-trigger" data-action="toggle-collapse" aria-controls="code-lightbox" aria-expanded="false">
                    <span class="collapse-text-show">Show Code Example</span>
                    <span class="collapse-text-hide">Hide Code Example</span>
                  </button>
                  <div class="collapse-panel mt-3" id="code-lightbox">
                    <pre class="bg-gray-100 p-3 rounded text-xs overflow-x-auto"><code>&lt;a href="full-image.jpg" data-component="lightbox" class="image-link" 
   data-lightbox-gallery="gallery-name" 
   data-lightbox-caption="Image Caption"&gt;
  &lt;img src="thumbnail.jpg" alt="Description"&gt;
&lt;/a&gt;</code></pre>
                  </div>
                </div>
              </section>

              <!-- Markdown & PDF Lightbox -->
              <section class="card no-hover">
                <h3 class="text-lg font-bold border-bottom pb-2 mb-4">Markdown & PDF Lightbox</h3>
                <p class="mb-4">Click any preview to view the full document. Markdown thumbnails are auto-rendered; PDFs show a styled placeholder with filename.</p>
                <div class="flex gap-4 flex-wrap items-start justify-between">
                  <a href="assets/docs/example_md_1.md" data-component="lightbox" data-lightbox-caption="Sample Document" data-lightbox-subtitle="Sample Document" style="width: 200px; height: 150px;"></a>
                  <a href="assets/docs/example_md_2.md" data-component="lightbox" data-lightbox-caption="Reference Table" data-lightbox-subtitle="Reference Table" style="width: 200px; height: 150px;"></a>
                  <a href="assets/docs/example_pdf_1.pdf" data-component="lightbox" data-lightbox-caption="Quick Reference Guide" data-lightbox-thumbnail="assets/docs/example_pdf_1_thumbnail.png" data-lightbox-subtitle="Quick Reference Guide" style="width: 200px; height: 150px;"></a>
                </div>
              </section>

              <!-- Image Galleries -->
              <section class="card no-hover">
                <h3 class="text-lg font-bold border-bottom pb-2 mb-4">Image Gallery Layouts</h3>
                <div class="stack-md">
                  <div>
                    <p class="font-bold text-sm mb-2"><code>.image-gallery-4</code> - Fixed 4 columns</p>
                    <div class="image-gallery-4 gap-2">
                      <img src="https://picsum.photos/200/200?random=4" alt="Sample" class="img-fluid img-rounded-sm">
                      <img src="https://picsum.photos/200/200?random=5" alt="Sample" class="img-fluid img-rounded-sm">
                      <img src="https://picsum.photos/200/200?random=6" alt="Sample" class="img-fluid img-rounded-sm">
                      <img src="https://picsum.photos/200/200?random=7" alt="Sample" class="img-fluid img-rounded-sm">
                    </div>
                  </div>
                  <div>
                    <p class="font-bold text-sm mb-2"><code>.image-gallery-uniform</code> - Square aspect ratio</p>
                    <div class="image-gallery-3 image-gallery-uniform gap-2">
                      <img src="https://picsum.photos/300/400?random=8" alt="Sample" class="img-fluid">
                      <img src="https://picsum.photos/400/300?random=9" alt="Sample" class="img-fluid">
                      <img src="https://picsum.photos/350/350?random=10" alt="Sample" class="img-fluid">
                    </div>
                  </div>
                </div>
              </section>

              <!-- Linked Images with Hover Effects -->
              <section class="card no-hover">
                <h3 class="text-lg font-bold border-bottom pb-2 mb-4">Linked Image Hover Effects</h3>
                <div class="cols-3 gap-4">
                  <div class="text-center">
                    <a href="javascript:void(0)" class="image-link">
                      <img src="https://picsum.photos/200/150?random=11" alt="Default" class="img-rounded">
                    </a>
                    <p class="text-sm text-muted mt-2"><code>.image-link</code></p>
                  </div>
                  <div class="text-center">
                    <a href="javascript:void(0)" class="image-link image-link-lift">
                      <img src="https://picsum.photos/200/150?random=12" alt="Lift" class="img-rounded">
                    </a>
                    <p class="text-sm text-muted mt-2"><code>.image-link-lift</code></p>
                  </div>
                  <div class="text-center">
                    <a href="javascript:void(0)" class="image-link image-link-zoom">
                      <img src="https://picsum.photos/200/150?random=13" alt="Zoom" class="img-rounded">
                    </a>
                    <p class="text-sm text-muted mt-2"><code>.image-link-zoom</code></p>
                  </div>
                </div>
              </section>

              <!-- Image Shapes -->
              <section class="card no-hover">
                <h3 class="text-lg font-bold border-bottom pb-2 mb-4">Image Shapes & Effects</h3>
                <div class="flex flex-wrap gap-4 items-end">
                  <div class="text-center">
                    <img src="https://picsum.photos/100/100?random=14" alt="Rounded" class="img-rounded">
                    <p class="text-xs text-muted mt-2">.img-rounded</p>
                  </div>
                  <div class="text-center">
                    <img src="https://picsum.photos/100/100?random=15" alt="Circle" class="img-circle">
                    <p class="text-xs text-muted mt-2">.img-circle</p>
                  </div>
                  <div class="text-center">
                    <img src="https://picsum.photos/100/100?random=16" alt="Bordered" class="img-bordered">
                    <p class="text-xs text-muted mt-2">.img-bordered</p>
                  </div>
                  <div class="text-center">
                    <img src="https://picsum.photos/100/100?random=17" alt="Shadow" class="img-rounded img-shadow">
                    <p class="text-xs text-muted mt-2">.img-shadow</p>
                  </div>
                  <div class="text-center">
                    <img src="https://picsum.photos/100/100?random=18" alt="Shadow Large" class="img-rounded img-shadow-lg">
                    <p class="text-xs text-muted mt-2">.img-shadow-lg</p>
                  </div>
                </div>
                
                <div data-component="collapse" class="mt-4">
                  <button type="button" class="btn btn-sm btn-secondary collapse-trigger" data-action="toggle-collapse" aria-controls="code-image-shapes" aria-expanded="false">
                    <span class="collapse-text-show">Show Code Example</span>
                    <span class="collapse-text-hide">Hide Code Example</span>
                  </button>
                  <div class="collapse-panel mt-3" id="code-image-shapes">
                    <pre class="bg-gray-100 p-3 rounded text-xs overflow-x-auto"><code>&lt;img src="image.jpg" class="img-rounded"&gt;
&lt;img src="image.jpg" class="img-circle"&gt;
&lt;img src="image.jpg" class="img-bordered"&gt;
&lt;img src="image.jpg" class="img-shadow"&gt;</code></pre>
                  </div>
                </div>
              </section>

            </div>
          </div>

          <!-- Tab 6: Audio Components -->
          <div id="audio" class="tab-content pt-4" role="tabpanel" hidden>
            <div class="stack-lg">
              
              <!-- Audio Player Variations -->
              <section class="card no-hover">
                <h3 class="text-lg font-bold border-bottom pb-2 mb-4">Standalone Audio Player Components</h3>
                <p class="mb-4">These are <strong>standalone audio players</strong> using <code>data-component="audio-player"</code>. Multiple players can be visible simultaneously - each controls its own audio track.</p>
                
                <div class="stack-md">
                  <!-- Full Size Player Demo -->
                  <div class="callout callout--info">
                    <h4 class="font-bold mb-2">Full Size Player</h4>
                    <p class="text-sm mb-3">Complete controls with progress bar, time display, and all playback options.</p>
                    <div class="mt-2" data-component="audio-player" 
                         data-audio-src="audio/example-ui-showcase--full-player.mp3"
                         data-audio-id="full-player-demo">
                    </div>
                  </div>
                  
                  <!-- Compact Player Demo -->
                  <div class="callout">
                    <h4 class="font-bold mb-2">Compact Player</h4>
                    <p class="text-sm mb-3">Minimal controls (play/pause, restart, mute) - same style used in modals.</p>
                    <div class="mt-2" data-component="audio-player" 
                         data-audio-src="audio/example-ui-showcase--compact-player.mp3"
                         data-audio-id="compact-player-demo"
                         data-audio-compact="true">
                    </div>
                  </div>
                  
                  <!-- How Standalone Audio Works -->
                  <div class="callout callout--success">
                    <h4 class="font-bold mb-2">How Standalone Audio Works</h4>
                    <ul class="list-disc ml-4 stack-sm text-sm">
                      <li>Add <code>data-component="audio-player"</code> to any element</li>
                      <li>Set <code>data-audio-src</code> to your audio file path</li>
                      <li>Set <code>data-audio-id</code> for unique identification (required for gating)</li>
                      <li>Add <code>data-audio-compact="true"</code> for minimal controls</li>
                      <li>Add <code>data-audio-required="true"</code> to enable completion tracking</li>
                      <li>Multiple players can exist on one slide (if no slide-level audio)</li>
                    </ul>
                  </div>
                </div>
                
                <div data-component="collapse" class="mt-4">
                  <button type="button" class="btn btn-sm btn-secondary collapse-trigger" data-action="toggle-collapse" aria-controls="code-audio" aria-expanded="false">
                    <span class="collapse-text-show">Show Code Example</span>
                    <span class="collapse-text-hide">Hide Code Example</span>
                  </button>
                  <div class="collapse-panel mt-3" id="code-audio">
                    <pre class="bg-gray-100 p-3 rounded text-xs overflow-x-auto"><code>&lt;div data-component="audio-player" 
     data-audio-src="audio/file.mp3"
     data-audio-id="unique-id"
     data-audio-compact="true"&gt;
&lt;/div&gt;</code></pre>
                  </div>
                </div>
              </section>

              <!-- Player Comparison -->
              <section class="card no-hover">
                <h3 class="text-lg font-bold border-bottom pb-2 mb-4">Audio Modes Comparison</h3>
                <table class="table table-striped">
                  <thead>
                    <tr>
                      <th>Mode</th>
                      <th>Configuration</th>
                      <th>Location</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr><td>📄 Slide Audio</td><td>Defined in <code>course-config.js</code></td><td>Full player in nav footer</td></tr>
                    <tr><td>🪟 Modal Audio</td><td><code>data-audio-src</code> on modal trigger</td><td>Compact player in modal footer</td></tr>
                    <tr><td>🎵 Standalone</td><td><code>data-component="audio-player"</code></td><td>Inline, anywhere in content</td></tr>
                  </tbody>
                </table>
              </section>

              <!-- Audio Mutual Exclusivity -->
              <section class="card no-hover">
                <h3 class="text-lg font-bold border-bottom pb-2 mb-4">Audio Context Rules</h3>
                <div class="callout callout--warning">
                  <p class="mb-2"><strong>⚠️ Singleton Constraint:</strong> Only one audio track plays at a time.</p>
                  <ul class="list-disc ml-4 stack-sm text-sm">
                    <li>Playing any audio automatically pauses other audio</li>
                    <li>Slides with slide-level audio cannot have modal or standalone audio</li>
                    <li>Modal and standalone audio can coexist on slides without slide audio</li>
                    <li>The linter will catch invalid configurations</li>
                  </ul>
                </div>
              </section>

            </div>
          </div>

          <!-- Tab 7: Video Components -->
          <div id="video" class="tab-content pt-4" role="tabpanel" hidden>
            <div class="stack-lg">
              
              <!-- Video Player Demo -->
              <section class="card no-hover">
                <h3 class="text-lg font-bold border-bottom pb-2 mb-4">Video Player Component</h3>
                <p class="mb-4">Embed videos using the <code>data-component="video-player"</code> declarative component. Supports native HTML5 video with custom controls overlay.</p>
                
                <div class="stack-md">
                  <!-- YouTube Video Example -->
                  <div class="callout callout--info">
                    <h4 class="font-bold mb-2">YouTube Video</h4>
                    <p class="text-sm mb-3">YouTube videos embed with native platform controls.</p>
                    <div class="mt-3" data-component="video-player" 
                         data-video-src="https://youtu.be/q2_c2_WfJFg"
                         data-video-id="youtube-demo">
                    </div>
                  </div>
                  
                  <!-- Native Video Example -->
                  <div class="callout">
                    <h4 class="font-bold mb-2">Native HTML5 Video</h4>
                    <p class="text-sm mb-3">Local files use custom controls with progress tracking.</p>
                    <div class="mt-3" data-component="video-player" 
                         data-video-src="https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4"
                         data-video-id="native-demo">
                    </div>
                  </div>
                  
                  <!-- Usage Guide -->
                  <div class="callout callout--success">
                    <h4 class="font-bold mb-2">How to Use Video Players</h4>
                    <ul class="list-disc ml-4 stack-sm text-sm">
                      <li>Add <code>data-component="video-player"</code> to any element</li>
                      <li>Set <code>data-video-src</code> to your video file path</li>
                      <li>Set <code>data-video-id</code> for unique identification</li>
                      <li>Add <code>data-video-poster</code> for a poster image</li>
                      <li>Add <code>data-video-required="true"</code> for completion tracking</li>
                      <li>Add <code>data-video-captions</code> for subtitles (.vtt file)</li>
                    </ul>
                  </div>
                </div>
                
                <div data-component="collapse" class="mt-4">
                  <button type="button" class="btn btn-sm btn-secondary collapse-trigger" data-action="toggle-collapse" aria-controls="code-video" aria-expanded="false">
                    <span class="collapse-text-show">Show Code Example</span>
                    <span class="collapse-text-hide">Hide Code Example</span>
                  </button>
                  <div class="collapse-panel mt-3" id="code-video">
                    <pre class="bg-gray-100 p-3 rounded text-xs overflow-x-auto"><code>&lt;div data-component="video-player" 
     data-video-src="video/file.mp4"
     data-video-id="unique-id"
     data-video-poster="poster.jpg"&gt;
&lt;/div&gt;</code></pre>
                  </div>
                </div>
              </section>

              <!-- Video Lightbox -->
              <section class="card no-hover">
                <h3 class="text-lg font-bold border-bottom pb-2 mb-4">Video Lightbox (Click-to-Play)</h3>
                <p class="mb-4">Click a thumbnail to open the video in a lightbox overlay. Uses the same <code>data-component="lightbox"</code> attribute as images - the component auto-detects video URLs.</p>
                
                <div class="cols-2 gap-4">
                  <!-- YouTube Video Lightbox -->
                  <div class="text-center">
                    <a href="https://youtu.be/q2_c2_WfJFg" data-component="lightbox" class="image-link block" data-lightbox-caption="YouTube Video Demo">
                      <div class="aspect-16-9 rounded overflow-hidden">
                        <img src="https://img.youtube.com/vi/q2_c2_WfJFg/mqdefault.jpg" alt="YouTube Video" class="img-cover">
                      </div>
                    </a>
                    <p class="text-sm text-muted mt-2">YouTube</p>
                  </div>
                  
                  <!-- Vimeo Video Lightbox -->
                  <div class="text-center">
                    <a href="https://vimeo.com/824804225" data-component="lightbox" class="image-link block" data-lightbox-caption="Vimeo Video Demo">
                      <div class="aspect-16-9 rounded overflow-hidden">
                        <img src="https://picsum.photos/seed/vimeo/320/180" alt="Vimeo Video" class="img-cover">
                      </div>
                    </a>
                    <p class="text-sm text-muted mt-2">Vimeo</p>
                  </div>
                </div>
                
                <div class="callout callout--success mt-4">
                  <h4 class="font-bold mb-2">How Video Lightbox Works</h4>
                  <ul class="list-disc ml-4 stack-sm text-sm">
                    <li>Use <code>data-component="lightbox"</code> on any link pointing to a video URL</li>
                    <li>Supports YouTube (youtu.be, youtube.com), Vimeo, and native video (.mp4, .webm)</li>
                    <li>Videos auto-play when the lightbox opens</li>
                    <li>Playback stops automatically when the lightbox closes</li>
                  </ul>
                </div>
              </section>

              <!-- Video Controls -->
              <section class="card no-hover">
                <h3 class="text-lg font-bold border-bottom pb-2 mb-4">Video Controls</h3>
                <p class="mb-4">Native videos display custom controls. External embeds (YouTube/Vimeo) use their native UI.</p>
                <table class="table table-striped">
                  <thead>
                    <tr>
                      <th>Control</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr><td>▶️ Play/Pause</td><td>Toggle playback (click overlay or button)</td></tr>
                    <tr><td>📊 Progress Bar</td><td>Click or drag to seek</td></tr>
                    <tr><td>🔇 Mute</td><td>Toggle audio</td></tr>
                    <tr><td>⏱️ Time Display</td><td>Shows current position / duration</td></tr>
                    <tr><td>📺 Fullscreen</td><td>Double-click video or use button</td></tr>
                  </tbody>
                </table>
              </section>

              <!-- Engagement Gating -->
              <section class="card no-hover">
                <h3 class="text-lg font-bold border-bottom pb-2 mb-4">Engagement Gating</h3>
                <div class="callout callout--warning">
                  <p class="mb-2"><strong>Video Completion Requirements</strong></p>
                  <p class="text-sm mb-3">Videos can gate navigation. Add <code>data-video-required="true"</code> to the player, then configure requirements in course-config.js:</p>
                  <pre class="bg-gray-100 p-3 rounded text-xs overflow-x-auto"><code>engagement: {
  required: true,
  requirements: [
    { type: 'videoComplete', videoId: 'sample-video', message: 'Watch the video' }
  ]
}</code></pre>
                </div>
              </section>

            </div>
          </div>

        </div>

        <!-- Hidden Modal Content -->
        <div id="audio-modal-content" style="display: none;">
          <div class="stack-md">
            <p><strong>Demo Modal with Audio</strong></p>
            <p>This modal demonstrates audio narration with built-in audio controls rendered in the modal footer.</p>
            <ul class="list-disc ml-4 stack-sm">
              <li><strong>Compact Controls:</strong> Modals render minimal audio controls (play/pause, restart, mute)</li>
              <li><strong>Position Persistence:</strong> Audio position is saved when you close and reopen</li>
              <li><strong>Completion Tracking:</strong> Required audio completion can gate modal closing</li>
              <li><strong>Mute Preference:</strong> Mute state persists across your entire session</li>
            </ul>
          </div>
        </div>

        <!-- Templates -->
        <template id="demo-modal-body">
          <p>This is a modal content area. You can put any HTML here.</p>
        </template>
        <template id="demo-modal-footer">
          <button class="btn btn-secondary" data-action="close-modal">Close</button>
          <button class="btn btn-primary" data-action="close-modal">Save Changes</button>
        </template>
      </div>
    `;

    return container;
  }
};

/**
 * Narration for ui-demo slide components.
 * 
 * This slide demonstrates various UI components including:
 * - Interactive Tab: Modal with audio narration (data-audio-src="audio/example-ui-showcase--demo-modal.mp3")
 * - Audio Components Tab: Two standalone audio players demonstrating full and compact modes
 * 
 * Since this slide has NO slide-level audio, it can have modal and standalone audio.
 * 
 * MULTI-KEY FORMAT with audio narration:
 *   - 'demo-modal': Narration for the modal in Interactive tab
 *   - 'full-player': Narration for the full-size standalone audio player demo
 *   - 'compact-player': Narration for the compact standalone audio player demo
 * 
 * Run `npm run narration` to generate audio files:
 *   - course/assets/audio/example-ui-showcase--demo-modal.mp3
 *   - course/assets/audio/example-ui-showcase--full-player.mp3
 *   - course/assets/audio/example-ui-showcase--compact-player.mp3
 * 
 * Reference in slide HTML:
 *   - Modal audio: data-audio-src="audio/example-ui-showcase--demo-modal.mp3"
 *   - Full player: data-audio-src="audio/example-ui-showcase--full-player.mp3"
 *   - Compact player: data-audio-src="audio/example-ui-showcase--compact-player.mp3"
 */
export const narration = {
  'demo-modal': `
Welcome to the Demo Modal with Audio.

This modal demonstrates how the framework handles audio narration with built-in audio controls rendered in the modal footer.

Key capabilities include:

- Compact Controls: Modals render minimal audio controls - play pause, restart, and mute
- Position Persistence: Audio position is saved when you close and reopen this modal
- Completion Tracking: Required audio completion can gate modal closing
- Mute Preference: Your mute state persists across the entire session

Use the controls in the modal footer to manage playback. Close this modal when you're done.
`,
  'full-player': `
This is the full-size audio player.

It includes a progress bar that you can click to seek, time display showing current position and total duration, and all standard playback controls.

The full-size player is ideal for primary narration where you want learners to have complete control over their listening experience.

You can have multiple standalone players on the same slide. Try playing this while the compact player below is also visible - when you play one, it automatically pauses the other.
`,
  'compact-player': `
This is the compact audio player.

It uses the same minimal control set as modal audio - just play pause, restart, and mute buttons.

The compact player is useful when you want audio controls that take up less space, or when embedded in smaller UI elements like callouts or sidebars.

Notice that both players are visible at the same time, but only one audio track plays at a time due to the singleton audio architecture.
`
};
