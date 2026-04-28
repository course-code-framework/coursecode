/**
 * Welcome slide - Introduction to CourseCode for non-developers
 * A stunning, professional welcome experience with modern design
 */

const { NavigationActions, iconManager } = CourseCode;

export const slide = {
  render(_root, _context) {
    const container = document.createElement('div');
    container.innerHTML = `
      <div class="stack-lg" data-content-width="wide">
        
        <!-- Hero Section -->
        <div data-component="hero" class="hero-gradient hero-full-bleed hero-flush-top animate-fade-in" style="--hero-start: var(--color-primary); --hero-end: var(--color-gray-700);">
          <div class="hero-content">
            <span class="hero-badge hero-badge-borderless hero-badge-secondary animate-fade-up delay-200">${iconManager.getIcon('sparkles', { size: 'sm' })} AI-Powered Course Creation</span>
            <h1 class="hero-title animate-fade-up delay-300">Welcome to <span class="text-gradient">CourseCode</span></h1>
            <p class="hero-subtitle animate-fade-up delay-400">Build interactive e-learning courses with AI assistance. No coding required.</p>
          </div>
        </div>

        <!-- Feature Cards -->
        <section data-component="features">
          <div class="feature-item animate-fade-up delay-200">
            <div class="icon-circle icon-bg-primary mb-3 p-5">
              ${iconManager.getIcon('zap', { size: '3xl', class: 'icon-primary' })}
            </div>
            <h3 class="font-semibold">AI-Powered</h3>
            <p class="text-primary">Describe what you want, and your AI assistant builds it. Focus on content, not code.</p>
          </div>
          <div class="feature-item animate-fade-up delay-300">
            <div class="icon-circle icon-bg-accent mb-3 p-5">
              ${iconManager.getIcon('upload', { size: '3xl', class: 'icon-accent' })}
            </div>
            <h3 class="font-semibold">Use Your Content</h3>
            <p class="text-primary">Convert PowerPoints, Word docs, and PDFs into interactive courses automatically.</p>
          </div>
          <div class="feature-item animate-fade-up delay-400">
            <div class="icon-circle icon-bg-success mb-3 p-5">
              ${iconManager.getIcon('check-circle', { size: '3xl', class: 'icon-success' })}
            </div>
            <h3 class="font-semibold">LMS Ready</h3>
            <p class="text-primary">Export your course as a single ZIP file that works with any standards-compliant LMS.</p>
          </div>
        </section>

        <!-- Who is this for -->
        <section class="card card-elevated animate-fade-up delay-500">
          <div class="card-header">
            <h2 class="flex items-center gap-2">
              ${iconManager.getIcon('users', { size: 'lg', class: 'icon-primary' })}
              <span>Who is CourseCode for?</span>
            </h2>
          </div>
          <div class="card-body">
            <div class="card-grid-2 gap-8">
              <div class="stack-sm">
                <h3 class="flex items-center gap-2 font-semibold">
                  ${iconManager.getIcon('check-circle', { size: 'md', class: 'icon-success' })}
                  <span>Great for:</span>
                </h3>
                <ul class="list-styled list-compact">
                  <li>Instructional designers</li>
                  <li>Training teams</li>
                  <li>Subject matter experts</li>
                  <li>Non-technical authors</li>
                </ul>
              </div>
              <div class="stack-sm">
                <h3 class="flex items-center gap-2 font-semibold">
                  ${iconManager.getIcon('info', { size: 'md', class: 'icon-info' })}
                  <span>How it works:</span>
                </h3>
                <ul class="list-styled list-compact">
                  <li>You describe what you want in plain language</li>
                  <li>Your AI assistant writes the technical parts</li>
                  <li>You preview and refine using visual editing tools</li>
                  <li>No need to understand the underlying code</li>
                </ul>
              </div>
            </div>
          </div>
        </section>

        <!-- What you'll learn -->
        <section class="card card-flat animate-fade-up delay-700">
          <h3 class="flex items-center justify-center gap-2 font-semibold mb-4">
            ${iconManager.getIcon('book-open', { size: 'lg', class: 'icon-info' })}
            <span>What you'll learn in this course</span>
          </h3>
          <div class="flex justify-center gap-8">
            <ul class="list-none stack-xs m-0">
              <li class="flex items-center gap-2">${iconManager.getIcon('check', { size: 'sm', class: 'icon-success' })} The 4-step AI workflow</li>
              <li class="flex items-center gap-2">${iconManager.getIcon('check', { size: 'sm', class: 'icon-success' })} Preview and editing tools</li>
              <li class="flex items-center gap-2">${iconManager.getIcon('check', { size: 'sm', class: 'icon-success' })} Course structure</li>
            </ul>
            <ul class="list-none stack-xs m-0">
              <li class="flex items-center gap-2">${iconManager.getIcon('check', { size: 'sm', class: 'icon-success' })} UI components</li>
              <li class="flex items-center gap-2">${iconManager.getIcon('check', { size: 'sm', class: 'icon-success' })} Theming and branding</li>
              <li class="flex items-center gap-2">${iconManager.getIcon('check', { size: 'sm', class: 'icon-success' })} Building and deploying</li>
            </ul>
          </div>
        </section>

        <!-- Navigation -->
        <div class="flex justify-center gap-3 animate-fade-up delay-1000">
          <button id="start-btn" class="btn btn-gradient btn-lg btn-pill">
            ${iconManager.getIcon('arrow-right', { size: 'md', class: 'icon-dark' })}
            <span class="text-dark">Let's Get Started</span>
          </button>
        </div>

      </div>
    `;

    container.querySelector('#start-btn').addEventListener('click', () => {
      NavigationActions.goToNextAvailableSlide();
    });

    return container;
  }
};

export const narration = `
Welcome to CourseCode.

This opening slide introduces the template course and the main workflow it demonstrates.

CourseCode helps training teams, instructional designers, and subject matter experts build interactive learning experiences with AI assistance.

Use this course to explore the authoring workflow, preview tools, reusable components, theming options, and LMS-ready publishing process.
`;
