/**
 * Interactions Showcase
 * Demonstrates available interaction types with collapsible configuration examples.
 * See COURSE_AUTHORING_GUIDE.md for full documentation.
 */

const { createDragDropQuestion, createFillInQuestion, createNumericQuestion, createMatchingQuestion, createMultipleChoiceQuestion, createTrueFalseQuestion } = CourseCode;
import courseArchitectureImg from '../assets/images/course-architecture.svg';

export const slide = {
  render(_root, _context) {
    const container = document.createElement('div');
    container.innerHTML = `
      <div class="stack-lg">
        
        <header class="slide-header">
          <h1>Interactions Showcase</h1>
          <p>Explore the interaction types built into CourseCode. Click "View Config" to see how each is configured.</p>
        </header>

        <div id="workshop-tabs" data-component="tabs">
          <div class="tab-list" role="tablist">
            <button class="tab-button active" data-action="select-tab" data-tab="dragdrop-content" role="tab" aria-selected="true" aria-controls="dragdrop-content">
              🧩 Drag & Drop
            </button>
            <button class="tab-button" data-action="select-tab" data-tab="matching-content" role="tab" aria-selected="false" aria-controls="matching-content">
              🔗 Matching
            </button>
            <button class="tab-button" data-action="select-tab" data-tab="choice-content" role="tab" aria-selected="false" aria-controls="choice-content">
              ☑️ Choice
            </button>
            <button class="tab-button" data-action="select-tab" data-tab="textinput-content" role="tab" aria-selected="false" aria-controls="textinput-content">
              ✍️ Text Input
            </button>
            <button class="tab-button" data-action="select-tab" data-tab="diagram-content" role="tab" aria-selected="false" aria-controls="diagram-content">
              🖼️ Interactive Image
            </button>
          </div>

          <div id="dragdrop-content" class="tab-content active" role="tabpanel">
            <div class="card no-hover stack-md">
              <div>
                <h2 class="text-xl font-bold">Drag and Drop</h2>
                <p>Learners drag items into categorized drop zones. Great for sorting, matching, and classification activities:</p>
              </div>
              <div id="dragdrop-interaction"><div class="interaction drag-drop" data-interaction-id="system-architecture-dd">
                    <div class="question-prompt">
                        <h3>Organize these d elements into their proper categories</h3>
                    </div>
                    <div class="drag-drop-container">
                        <div class="drag-items" data-droppable="true" style="min-height: 428px;">
                            <h4>Drag these items:</h4>
            
                    <div class="drag-item" draggable="true" data-item-id="intro-slide" data-index="0" tabindex="0" role="button" aria-grabbed="false" data-testid="system-architecture-dd-drag-item-intro-slide">
                        Welcome Slide
                    </div>
                
                    <div class="drag-item" draggable="true" data-item-id="content-slide" data-index="1" tabindex="0" role="button" aria-grabbed="false" data-testid="system-architecture-dd-drag-item-content-slide">
                        Learning Content
                    </div>
                
                    <div class="drag-item" draggable="true" data-item-id="quiz" data-index="2" tabindex="0" role="button" aria-grabbed="false" data-testid="system-architecture-dd-drag-item-quiz">
                        Knowledge Check
                    </div>
                
                    <div class="drag-item" draggable="true" data-item-id="assessment" data-index="3" tabindex="0" role="button" aria-grabbed="false" data-testid="system-architecture-dd-drag-item-assessment">
                        Final Assessment
                    </div>
                
                    <div class="drag-item" draggable="true" data-item-id="summary" data-index="4" tabindex="0" role="button" aria-grabbed="false" data-testid="system-architecture-dd-drag-item-summary">
                        Course Summary
                    </div>
                
                        </div>
                        <div class="drop-zones">
                            <h4>Drop into correct zones:</h4>
            
                    <div class="drop-zone" data-zone-id="opening" data-accepts="intro-slide" data-max-items="1" role="region" aria-label="Opening" tabindex="0" data-testid="system-architecture-dd-drop-zone-opening">
                        <div class="zone-label">Opening</div>
                        <div class="zone-content">
                        </div>
                    </div>
                
                    <div class="drop-zone" data-zone-id="body" data-accepts="content-slide,quiz" data-max-items="2" role="region" aria-label="Course Body" tabindex="0" data-testid="system-architecture-dd-drop-zone-body">
                        <div class="zone-label">Course Body</div>
                        <div class="zone-content">
                        </div>
                    </div>
                
                    <div class="drop-zone" data-zone-id="closing" data-accepts="assessment,summary" data-max-items="2" role="region" aria-label="Closing" tabindex="0" data-testid="system-architecture-dd-drop-zone-closing">
                        <div class="zone-label">Closing</div>
                        <div class="zone-content">
                        </div>
                    </div>
                
                        </div>
                    </div>
                    <div class="flex flex-wrap justify-center gap-3" data-testid="system-architecture-dd-controls"><button type="button" class="btn btn-success" data-action="check-answer" data-interaction="system-architecture-dd" data-testid="system-architecture-dd-check-answer">Check Answer</button><button type="button" class="btn btn-reset" data-action="reset" data-interaction="system-architecture-dd" data-testid="system-architecture-dd-reset">Reset</button></div>
                    <div class="overall-feedback" id="system-architecture-dd_overall_feedback" aria-live="polite"></div>
                </div></div>
              
              <div data-component="collapse" class="mt-3">
                <button class="btn btn-sm btn-secondary collapse-trigger" data-action="toggle-collapse" aria-controls="code-dragdrop-config" aria-expanded="false">
                  <span class="collapse-text-show">Show Code Example</span>
                  <span class="collapse-text-hide">Hide Code Example</span>
                </button>
                <div class="collapse-panel mt-3" id="code-dragdrop-config">
                  <pre class="bg-gray-100 p-3 rounded text-xs overflow-x-auto"><code>// Drag and Drop configuration
{
  id: 'course-sections-dd',
  prompt: 'Organize elements into categories',
  items: [
    { id: 'item-1', content: 'Item text' }
  ],
  dropZones: [
    { id: 'zone-1', label: 'Zone Name', accepts: ['item-1'], maxItems: 1 }
  ]
}</code></pre>
                </div>
              </div>
            </div>
          </div>

          <div id="matching-content" class="tab-content" role="tabpanel" hidden>
            <div class="card no-hover stack-md">
              <div>
                <h2 class="text-xl font-bold">Matching</h2>
                <p>Connect items from two columns. Click an item on the left, then its match on the right:</p>
              </div>
              <div id="matching-interaction"><div class="interaction matching-interaction matching-deferred" data-interaction-id="lms-standards-matching" data-feedback-mode="deferred">
                    <div class="question-prompt">
                        <h3>Match each LMS standard with its description</h3>
                        <p class="matching-instruction">Click an item on the left, then click its match on the right.</p>
                    </div>
                    <div class="matching-container">
                        <div class="matching-column matching-items">
                            <h4 class="matching-column-header">Items</h4>
                            <div class="matching-list">
            
                    <button type="button" class="matching-item selected" data-item-id="scorm12" data-testid="lms-standards-matching-match-item-scorm12" aria-label="Match item: SCORM 1.2" style="--selection-color: #9333ea;">
                        <span class="matching-item-text">SCORM 1.2</span>
                        
                    </button>
                
                    <button type="button" class="matching-item" data-item-id="scorm2004" data-testid="lms-standards-matching-match-item-scorm2004" aria-label="Match item: SCORM 2004">
                        <span class="matching-item-text">SCORM 2004</span>
                        
                    </button>
                
                    <button type="button" class="matching-item" data-item-id="cmi5" data-testid="lms-standards-matching-match-item-cmi5" aria-label="Match item: cmi5">
                        <span class="matching-item-text">cmi5</span>
                        
                    </button>
                
                    <button type="button" class="matching-item" data-item-id="xapi" data-testid="lms-standards-matching-match-item-xapi" aria-label="Match item: xAPI">
                        <span class="matching-item-text">xAPI</span>
                        
                    </button>
                
                            </div>
                        </div>
                        <div class="matching-column matching-targets">
                            <h4 class="matching-column-header">Matches</h4>
                            <div class="matching-list">
            
                    <button type="button" class="matching-target" data-match-id="cmi5" data-testid="lms-standards-matching-match-target-cmi5" aria-label="Match target: xAPI-based">
                        <span class="matching-target-text">xAPI-based</span>
                        <span class="matching-connection-indicator" aria-hidden="true"></span>
                    </button>
                
                    <button type="button" class="matching-target" data-match-id="scorm12" data-testid="lms-standards-matching-match-target-scorm12" aria-label="Match target: Legacy standard">
                        <span class="matching-target-text">Legacy standard</span>
                        <span class="matching-connection-indicator" aria-hidden="true"></span>
                    </button>
                
                    <button type="button" class="matching-target" data-match-id="xapi" data-testid="lms-standards-matching-match-target-xapi" aria-label="Match target: Activity streams">
                        <span class="matching-target-text">Activity streams</span>
                        <span class="matching-connection-indicator" aria-hidden="true"></span>
                    </button>
                
                    <button type="button" class="matching-target" data-match-id="scorm2004" data-testid="lms-standards-matching-match-target-scorm2004" aria-label="Match target: Adds sequencing">
                        <span class="matching-target-text">Adds sequencing</span>
                        <span class="matching-connection-indicator" aria-hidden="true"></span>
                    </button>
                
                            </div>
                        </div>
                    </div>
                    <div class="flex flex-wrap justify-center gap-3" data-testid="lms-standards-matching-controls"><button type="button" class="btn btn-success" data-action="check-answer" data-interaction="lms-standards-matching" data-testid="lms-standards-matching-check-answer">Check Answer</button><button type="button" class="btn btn-reset" data-action="reset" data-interaction="lms-standards-matching" data-testid="lms-standards-matching-reset">Reset</button></div>
                    <div id="lms-standards-matching_feedback" class="feedback" aria-live="polite" data-testid="lms-standards-matching-feedback"></div>
                </div></div>
              
              <div data-component="collapse" class="mt-3">
                <button class="btn btn-sm btn-secondary collapse-trigger" data-action="toggle-collapse" aria-controls="code-matching-config" aria-expanded="false">
                  <span class="collapse-text-show">Show Code Example</span>
                  <span class="collapse-text-hide">Hide Code Example</span>
                </button>
                <div class="collapse-panel mt-3" id="code-matching-config">
                  <pre class="bg-gray-100 p-3 rounded text-xs overflow-x-auto"><code>// Matching configuration
{
  id: 'lms-standards-matching',
  prompt: 'Match each item with its description',
  pairs: [
    { id: 'item1', text: 'Item 1', match: 'Description 1' },
    { id: 'item2', text: 'Item 2', match: 'Description 2' }
  ],
  feedbackMode: 'deferred'
}</code></pre>
                </div>
              </div>
            </div>
          </div>

          <div id="choice-content" class="tab-content" role="tabpanel" hidden>
            <div class="stack-lg">
              <div class="card no-hover stack-md">
                <div>
                  <h2 class="text-xl font-bold">Multiple Choice</h2>
                  <p>Single-select question with immediate feedback. Great for knowledge checks:</p>
                </div>
                <div id="multiple-choice-interaction"></div>
              </div>

              <div class="card no-hover stack-md">
                <div>
                  <h2 class="text-xl font-bold">True / False</h2>
                  <p>Simple binary choice with explanation feedback:</p>
                </div>
                <div id="true-false-interaction"></div>
              </div>
              
              <div data-component="collapse" class="mt-3">
                <button class="btn btn-sm btn-secondary collapse-trigger" data-action="toggle-collapse" aria-controls="code-choice-config" aria-expanded="false">
                  <span class="collapse-text-show">Show Code Example</span>
                  <span class="collapse-text-hide">Hide Code Example</span>
                </button>
                <div class="collapse-panel mt-3" id="code-choice-config">
                  <pre class="bg-gray-100 p-3 rounded text-xs overflow-x-auto"><code>// Multiple Choice configuration
{
  id: 'question-mc',
  prompt: 'Question text?',
  correctAnswer: 'b',
  choices: [
    { value: 'a', text: 'Option A', feedback: 'Wrong' },
    { value: 'b', text: 'Option B', correct: true, feedback: 'Correct!' }
  ]
}

// True/False configuration
{
  id: 'question-tf',
  prompt: 'Statement to evaluate.',
  correctAnswer: true,
  feedback: { correct: 'Right!', incorrect: 'Wrong.' }
}</code></pre>
                </div>
              </div>
            </div>
          </div>

          <div id="textinput-content" class="tab-content" role="tabpanel" hidden>
            <div class="stack-lg">
              <div class="card no-hover stack-md">
                <div>
                  <h2 class="text-xl font-bold">Simple Text Input</h2>
                  <p>Short answer question with fuzzy matching. Accepts multiple correct answers, whitespace normalization, and typo tolerance:</p>
                </div>
                <div id="simple-text-interaction"></div>
              </div>

              <div class="card no-hover stack-md">
                <div>
                  <h2 class="text-xl font-bold">Q&A Stacked Layout</h2>
                  <p>Traditional question-and-answer format. Use <code>prompt</code> instead of <code>template</code>:</p>
                </div>
                <div id="stacked-text-interaction"></div>
              </div>

              <div class="card no-hover stack-md">
                <div>
                  <h2 class="text-xl font-bold">Fill in the Blank (Cloze)</h2>
                  <p>Inline text inputs within flowing content using {{placeholder}} syntax:</p>
                </div>
                <div id="fillin-interaction"></div>
              </div>

              <div class="card no-hover stack-md">
                <div>
                  <h2 class="text-xl font-bold">Numeric Input</h2>
                  <p>Number entry with tolerance ranges. Perfect for calculations and measurements:</p>
                </div>
                <div id="numeric-interaction"></div>
              </div>
              
              <div data-component="collapse" class="mt-3">
                <button class="btn btn-sm btn-secondary collapse-trigger" data-action="toggle-collapse" aria-controls="code-textinput-config" aria-expanded="false">
                  <span class="collapse-text-show">Show Code Example</span>
                  <span class="collapse-text-hide">Hide Code Example</span>
                </button>
                <div class="collapse-panel mt-3" id="code-textinput-config">
                  <pre class="bg-gray-100 p-3 rounded text-xs overflow-x-auto"><code>// Fill-in-the-blank (cloze) configuration
{
  id: 'fillin-question',
  template: 'Complete the sentence: {{blank1}} is the answer.',
  blanks: {
    blank1: { correct: 'answer', placeholder: 'type here...', typoTolerance: 1 }
  }
}

// Numeric input configuration
{
  id: 'numeric-question',
  prompt: 'Calculate the result:',
  correctRange: { exact: 42 },
  tolerance: 0,
  units: 'items'
}</code></pre>
                </div>
              </div>
            </div>
          </div>

          <div id="diagram-content" class="tab-content" role="tabpanel" hidden>
            <div class="card no-hover stack-md">
              <div>
                <h2 class="text-xl font-bold">Interactive Image with Hotspots</h2>
                <p>Click hotspots on images to reveal content. Links to accordions for detailed information:</p>
              </div>
              
              <div class="grid gap-4" style="align-items: start;">
                <!-- Interactive Image -->
                <div 
                    class="col-8 interactive-image-container"
                    data-component="interactive-image" 
                    data-accordion-id="system-accordion" 
                    id="system-diagram-interactive"
                >
                    <img src="${courseArchitectureImg}" alt="Course Architecture Diagram" class="interactive-image-img">
                    
                    <!-- Hotspots -->
                    <button 
                        class="interactive-image-hotspot" 
                        style="top: 50.0%; left: 15.6%; width: 150px; height: 200px;" 
                        data-hotspot-id="power-unit"
                        data-shape="rect"
                        data-color="danger"
                        data-border-style="transparent"
                        data-border-style-active="dashed"
                        data-fill="transparent"
                        data-fill-active="semi"
                        data-transparency="90" 
                        data-scale="false"
                        data-mark-viewed="false"
                        aria-label="Slides & Content"
                    ></button>
                    
                    <button 
                        class="interactive-image-hotspot" 
                        style="top: 50%; left: 50%;" 
                        data-hotspot-id="control-module"
                        data-shape="circle"
                        data-fill="solid"
                        data-border-style="none"
                        data-mark-viewed="true"
                        aria-label="CourseCode Framework"
                    >2</button>

                    <button 
                        class="interactive-image-hotspot" 
                        style="top: 37.5%; left: 84.4%;" 
                        data-hotspot-id="output-interface"
                        data-shape="rounded"
                        data-mark-viewed="false"
                        aria-label="LMS Package"
                    >3</button>
                </div>

                <!-- Accordion -->
                <div id="system-accordion" class="col-4" data-component="accordion" data-mode="single">
                    <div class="accordion-item">
                        <button class="accordion-button collapsed" data-panel="power-unit" data-action="toggle-accordion-panel">
                            <span class="accordion-title">1. Slides & Content</span>
                            <span class="accordion-icon"></span>
                        </button>
                        <div id="system-accordion-panel-power-unit" class="accordion-content" hidden>
                            <div class="accordion-body">
                                <p><strong>Location:</strong> course/slides/ directory</p>
                                <p><strong>Format:</strong> JavaScript modules with render() function</p>
                                <p><strong>Features:</strong> HTML templates, imports, narration exports</p>
                            </div>
                        </div>
                    </div>

                    <div class="accordion-item">
                        <button class="accordion-button collapsed" data-panel="control-module" data-action="toggle-accordion-panel">
                            <span class="accordion-title">2. CourseCode Framework</span>
                            <span class="accordion-icon"></span>
                        </button>
                        <div id="system-accordion-panel-control-module" class="accordion-content" hidden>
                            <div class="accordion-body">
                                <p><strong>Function:</strong> Manages navigation, tracking, and interactions</p>
                                <p><strong>Components:</strong> UI library, assessment system, LMS drivers</p>
                                <p><strong>Accessibility:</strong> WCAG 2.1 AA compliant</p>
                            </div>
                        </div>
                    </div>

                    <div class="accordion-item">
                        <button class="accordion-button collapsed" data-panel="output-interface" data-action="toggle-accordion-panel">
                            <span class="accordion-title">3. LMS Package</span>
                            <span class="accordion-icon"></span>
                        </button>
                        <div id="system-accordion-panel-output-interface" class="accordion-content" hidden>
                            <div class="accordion-body">
                                <p><strong>Output:</strong> ZIP file ready for LMS upload</p>
                                <p><strong>Standards:</strong> SCORM 1.2, SCORM 2004, cmi5</p>
                                <p><strong>Contents:</strong> HTML, JS, CSS, manifest, and assets</p>
                            </div>
                        </div>
                    </div>
                </div>
              </div>
              
              <div data-component="collapse" class="mt-3">
                <button class="btn btn-sm btn-secondary collapse-trigger" data-action="toggle-collapse" aria-controls="code-hotspot-config" aria-expanded="false">
                  <span class="collapse-text-show">Show Code Example</span>
                  <span class="collapse-text-hide">Hide Code Example</span>
                </button>
                <div class="collapse-panel mt-3" id="code-hotspot-config">
                  <pre class="bg-gray-100 p-3 rounded text-xs overflow-x-auto"><code>&lt;div data-component="interactive-image" data-accordion-id="my-accordion"&gt;
  &lt;img src="diagram.svg" alt="Diagram"&gt;
  &lt;button class="interactive-image-hotspot" 
    style="top: 50%; left: 15%;" 
    data-hotspot-id="section-1"
    data-shape="circle"
    data-fill="solid"&gt;1&lt;/button&gt;
&lt;/div&gt;

&lt;div id="my-accordion" data-component="accordion"&gt;
  &lt;div class="accordion-item"&gt;
    &lt;button data-panel="section-1"&gt;Section 1&lt;/button&gt;
    &lt;div id="my-accordion-panel-section-1"&gt;Content&lt;/div&gt;
  &lt;/div&gt;
&lt;/div&gt;</code></pre>
                </div>
              </div>
            </div>
          </div>
        </div>

      </div>
    `;

    setupInteractions(container);

    return container;
  }
};

/**
 * Sets up and initializes interactive components for the slide
 * @param {HTMLElement} root - The root element for the slide
 */
function setupInteractions(root) {
  // Drag and drop interaction setup
  const dragContainer = root.querySelector('#dragdrop-interaction');
  if (dragContainer) {
    const dragDropConfig = {
      id: 'system-architecture-dd',
      label: 'Course Structure Drag-and-Drop',
      prompt: 'Organize these course elements into their proper categories',
      items: [
        { id: 'intro-slide', content: 'Welcome Slide' },
        { id: 'content-slide', content: 'Learning Content' },
        { id: 'quiz', content: 'Knowledge Check' },
        { id: 'assessment', content: 'Final Assessment' },
        { id: 'summary', content: 'Course Summary' }
      ],
      dropZones: [
        { id: 'opening', label: 'Opening', accepts: ['intro-slide'], maxItems: 1 },
        { id: 'body', label: 'Course Body', accepts: ['content-slide', 'quiz'], maxItems: 2 },
        { id: 'closing', label: 'Closing', accepts: ['assessment', 'summary'], maxItems: 2 }
      ]
    };
    const dragDropQuestion = createDragDropQuestion(dragDropConfig);
    dragDropQuestion.render(dragContainer);
  }

  // Matching interaction setup
  const matchingContainer = root.querySelector('#matching-interaction');
  if (matchingContainer) {
    const matchingConfig = {
      id: 'lms-standards-matching',
      label: 'LMS Standards Matching',
      prompt: 'Match each LMS standard with its description',
      pairs: [
        { id: 'scorm12', text: 'SCORM 1.2', match: 'Legacy standard' },
        { id: 'scorm2004', text: 'SCORM 2004', match: 'Adds sequencing' },
        { id: 'cmi5', text: 'cmi5', match: 'xAPI-based' },
        { id: 'xapi', text: 'xAPI', match: 'Activity streams' }
      ],
      feedbackMode: 'deferred'
    };
    const matchingQuestion = createMatchingQuestion(matchingConfig);
    matchingQuestion.render(matchingContainer);
  }

  // Multiple Choice demo
  const mcContainer = root.querySelector('#multiple-choice-interaction');
  if (mcContainer) {
    const mcQuestion = createMultipleChoiceQuestion({
      id: 'framework-components-mc',
      prompt: 'Which LMS standard introduced xAPI (Experience API)?',
      correctAnswer: 'c',
      choices: [
        { value: 'a', text: 'SCORM 1.2', feedback: 'SCORM 1.2 was released in 2001, before xAPI existed.' },
        { value: 'b', text: 'SCORM 2004', feedback: 'SCORM 2004 added sequencing but still used the CMI data model.' },
        { value: 'c', text: 'cmi5', correct: true, feedback: 'Correct! cmi5 is built on xAPI and was specifically designed for LMS use.' },
        { value: 'd', text: 'AICC', feedback: 'AICC was an early aviation industry standard, predating xAPI.' }
      ]
    });
    mcQuestion.render(mcContainer);
  }

  // True/False demo
  const tfContainer = root.querySelector('#true-false-interaction');
  if (tfContainer) {
    const tfQuestion = createTrueFalseQuestion({
      id: 'framework-components-tf',
      prompt: 'SCORM courses can track learner progress across multiple websites.',
      correctAnswer: false,
      feedback: {
        correct: 'Correct! SCORM requires courses to run within an LMS iframe and cannot track activity across external sites.',
        incorrect: 'Not quite. SCORM is designed for single-origin LMS tracking and cannot follow learners to external websites.'
      }
    });
    tfQuestion.render(tfContainer);
  }

  // Simple text input demo (single-input short answer)
  const simpleTextContainer = root.querySelector('#simple-text-interaction');
  if (simpleTextContainer) {
    const simpleTextConfig = {
      id: 'lms-standards-text',
      label: 'LMS Standard Name',
      template: 'Name one of the three major LMS standards: {{answer}}',
      blanks: {
        answer: {
          correct: ['SCORM', 'cmi5', 'xAPI', 'Tin Can', 'Tin Can API', 'Experience API'],
          placeholder: 'Enter standard name...',
          typoTolerance: 1
        }
      }
    };
    const simpleTextQuestion = createFillInQuestion(simpleTextConfig);
    simpleTextQuestion.render(simpleTextContainer);
  }

  // Fill-in (cloze) interaction setup
  const fillContainer = root.querySelector('#fillin-interaction');
  if (fillContainer) {
    const fillInConfig = {
      id: 'requirements-spec-fillin',
      label: 'CourseCode Features Fill-in',
      template: 'CourseCode supports SCORM 1.2, SCORM 2004, and {{format}}. The framework includes built-in {{feature}} features. Audio narration can be generated using text-to-speech.',
      blanks: {
        format: { correct: 'cmi5', placeholder: 'format...' },
        feature: { correct: 'accessibility', placeholder: 'feature...', typoTolerance: 1 }
      }
    };
    const fillInQuestion = createFillInQuestion(fillInConfig);
    fillInQuestion.render(fillContainer);
  }

  // Numeric interaction setup
  const numericContainer = root.querySelector('#numeric-interaction');
  if (numericContainer) {
    const numericConfig = {
      id: 'efficiency-calculation',
      label: 'Passing Score Calculation',
      prompt: 'If an assessment has 20 questions and requires 80% to pass, how many questions must be answered correctly?',
      correctRange: { exact: 16 },
      tolerance: 0,
      placeholder: 'Enter number...',
      units: 'questions'
    };
    const numericQuestion = createNumericQuestion(numericConfig);
    numericQuestion.render(numericContainer);
  }

  // Stacked text input demo (Q&A format - simple prompt + input)
  const stackedContainer = root.querySelector('#stacked-text-interaction');
  if (stackedContainer) {
    const stackedConfig = {
      id: 'framework-components-qa',
      label: 'Framework Standard',
      prompt: 'What is the name of the modern LMS standard that uses xAPI statements?',
      blanks: {
        answer: {
          correct: ['cmi5', 'CMI5', 'cmi 5'],
          placeholder: 'Enter your answer...',
          typoTolerance: 1
        }
      }
    };
    const stackedQuestion = createFillInQuestion(stackedConfig);
    stackedQuestion.render(stackedContainer);
  }

  // Diagram interaction setup (placeholder for future implementation)
  const diagramContainer = root.querySelector('#diagram-interaction');
  if (diagramContainer) {
    diagramContainer.innerHTML = '<p>System diagram will be available soon.</p>';
  }
}
