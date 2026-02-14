const o={render:a=>{const t=document.createElement("div");return t.innerHTML=`
      <div class="content-wide stack-lg">
        
        <!-- Header -->
        <div class="stack-md">
          <div class="callout callout-info">
            <h2 class="text-xl font-bold m-0">UI Component Library</h2>
            <p class="m-0">A comprehensive guide to the SCORM template's UI components and utility classes.</p>
          </div>
        </div>

        <!-- Main Tabs -->
        <div class="tabs" id="demo-tabs" data-component="tabs">
          <div class="tab-list" role="tablist">
            <button class="tab-button active" data-action="select-tab" data-tab="static" role="tab">Static & Layout</button>
            <button class="tab-button" data-action="select-tab" data-tab="interactive" role="tab">Interactive</button>
            <button class="tab-button" data-action="select-tab" data-tab="forms" role="tab">Forms</button>
            <button class="tab-button" data-action="select-tab" data-tab="feedback" role="tab">Feedback</button>
          </div>

          <!-- Tab 1: Static & Layout -->
          <div id="static" class="tab-content active" role="tabpanel">
            <div class="stack-lg">
              
              <!-- Buttons -->
              <section class="card no-hover">
                <h3 class="text-lg font-bold border-bottom pb-2 mb-4">Buttons</h3>
                <div class="stack-md">
                  <div class="d-flex flex-wrap gap-2">
                    <button class="btn">Default</button>
                    <button class="btn btn-primary">Primary</button>
                    <button class="btn btn-secondary">Secondary</button>
                    <button class="btn btn-success">Success</button>
                    <button class="btn btn-warning">Warning</button>
                    <button class="btn btn-danger">Danger</button>
                    <button class="btn btn-info">Info</button>
                  </div>
                  <div class="d-flex flex-wrap gap-2 items-end">
                    <button class="btn btn-primary btn-sm">Small</button>
                    <button class="btn btn-primary">Regular</button>
                    <button class="btn btn-primary btn-lg">Large</button>
                    <button class="btn btn-primary" disabled>Disabled</button>
                    <button class="btn btn-outline-primary">Outline Primary</button>
                    <button class="btn btn-outline-secondary">Outline Secondary</button>
                  </div>
                </div>
              </section>

              <!-- Callouts -->
              <section class="card no-hover">
                <h3 class="text-lg font-bold border-bottom pb-2 mb-4">Callouts</h3>
                <div class="stack-md">
                  <div class="callout">Default callout with some information.</div>
                  <div class="callout callout-info"><strong>Info:</strong> Useful information for the learner.</div>
                  <div class="callout callout-success"><strong>Success:</strong> You completed the task!</div>
                  <div class="callout callout-warning"><strong>Warning:</strong> Proceed with caution.</div>
                  <div class="callout callout-error"><strong>Error:</strong> Something went wrong.</div>
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
                    <div class="p-4 bg-blue-100 rounded text-center">60% Width</div>
                    <div class="p-4 bg-green-100 rounded text-center">40% Width</div>
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
                <div class="accordion" id="demo-accordion" data-component="accordion" data-mode="multi">
                  <div data-title="Section 1">
                    Content for section 1.
                  </div>
                  <div data-title="Section 2">
                    Content for section 2.
                  </div>
                </div>
              </section>

              <!-- Carousel -->
              <section class="card no-hover">
                <h3 class="text-lg font-bold border-bottom pb-2 mb-4">Carousel</h3>
                <div class="carousel" id="demo-carousel" data-component="carousel">
                  <div class="carousel-track">
                    <div class="carousel-slide bg-gray-100 p-8 text-center rounded">
                      <h4 class="text-xl">Slide 1</h4>
                      <p>Swipe or click arrows to navigate</p>
                    </div>
                    <div class="carousel-slide bg-blue-100 p-8 text-center rounded">
                      <h4 class="text-xl">Slide 2</h4>
                      <p>Supports touch gestures</p>
                    </div>
                    <div class="carousel-slide bg-green-100 p-8 text-center rounded">
                      <h4 class="text-xl">Slide 3</h4>
                      <p>Fully accessible</p>
                    </div>
                  </div>
                  <button class="carousel-button prev" data-action="prev-slide" aria-label="Previous">&#10094;</button>
                  <button class="carousel-button next" data-action="next-slide" aria-label="Next">&#10095;</button>
                  <div class="carousel-dots"></div>
                </div>
              </section>

              <!-- Modals -->
              <section class="card no-hover">
                <h3 class="text-lg font-bold border-bottom pb-2 mb-4">Modals</h3>
                <div class="d-flex gap-2">
                  <button class="btn btn-primary" 
                    data-component="modal-trigger" 
                    data-title="Demo Modal" 
                    data-body="#demo-modal-body"
                    data-footer="#demo-modal-footer">
                    Launch Modal
                  </button>
                </div>
              </section>

              <!-- Flip Cards -->
              <section class="card no-hover">
                <h3 class="text-lg font-bold border-bottom pb-2 mb-4">Flip Cards</h3>
                <div class="cols-2 gap-4">
                  <div class="flip-card" data-component="flip-card">
                    <div class="flip-card-inner">
                      <div class="flip-card-front">
                        <span class="flip-card-icon">🃏</span>
                        <h3 class="flip-card-title">Front Side</h3>
                        <p class="text-sm text-muted">Click to reveal</p>
                      </div>
                      <div class="flip-card-back">
                        <h3 class="flip-card-title">Back Side</h3>
                        <p class="flip-card-text">Revealed on click</p>
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
                </div>
              </section>

            </div>
          </div>

          <!-- Tab 3: Forms -->
          <div id="forms" class="tab-content" role="tabpanel" hidden>
            <div class="stack-lg">
              
              <form data-component="form-validator" data-success-message="Form valid!">
                
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
                <div class="d-flex flex-wrap gap-2">
                  <button class="btn btn-success" data-action="show-notification" data-type="success" data-message="Success message!">Success</button>
                  <button class="btn btn-info" data-action="show-notification" data-type="info" data-message="Info message.">Info</button>
                  <button class="btn btn-warning" data-action="show-notification" data-type="warning" data-message="Warning message.">Warning</button>
                  <button class="btn btn-danger" data-action="show-notification" data-type="error" data-message="Error message.">Error</button>
                </div>
              </section>

              <!-- Tooltips -->
              <section class="card no-hover">
                <h3 class="text-lg font-bold border-bottom pb-2 mb-4">Tooltips</h3>
                <p class="mb-4">Hover or focus to see tooltips.</p>
                <div class="d-flex flex-wrap gap-4 justify-center p-8 bg-gray-50 rounded">
                  <button class="btn btn-secondary" data-tooltip="Top Tooltip" data-tooltip-position="top">Top</button>
                  <button class="btn btn-secondary" data-tooltip="Right Tooltip" data-tooltip-position="right">Right</button>
                  <button class="btn btn-secondary" data-tooltip="Bottom Tooltip" data-tooltip-position="bottom">Bottom</button>
                  <button class="btn btn-secondary" data-tooltip="Left Tooltip" data-tooltip-position="left">Left</button>
                </div>
              </section>

            </div>
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
    `,t}};export{o as slide};
