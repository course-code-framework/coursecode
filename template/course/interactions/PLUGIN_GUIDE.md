# Custom Interactions

Drop a `.js` file here to auto-register a custom interaction type.

## Quick Start

**File:** `rating-scale.js` → **Factory:** `CourseCode.createRatingScaleQuestion()`

```javascript
// Optional: Schema for linting/AI assistance
export const schema = {
  type: 'rating-scale',
  properties: {
    options: { type: 'array', required: true, description: 'Rating options' },
    correctAnswer: { type: 'string', description: 'Correct option index' }
  }
};

// Optional: Metadata for UI tools
export const metadata = {
  label: 'Rating Scale',
  category: 'interactive',
  scormType: 'choice'
};

// Required: Creator function
export function create(container, config) {
  let response = null;
  
  // Inject styles once
  if (!document.getElementById('rating-scale-styles')) {
    const el = document.createElement('style');
    el.id = 'rating-scale-styles';
    el.textContent = `
      .rating-scale { display: flex; gap: 0.5rem; }
      .rating-scale-option { cursor: pointer; padding: 0.5rem 1rem; border: 1px solid var(--border); border-radius: var(--radius); }
      .rating-scale-option.selected { background: var(--primary); color: white; }
    `;
    document.head.appendChild(el);
  }
  
  container.innerHTML = `
    <div class="interaction" data-interaction-id="${config.id}">
      <p class="prompt">${config.prompt}</p>
      <div class="rating-scale">
        ${config.options.map((opt, i) => 
          `<button type="button" class="rating-scale-option" data-value="${i}">${opt}</button>`
        ).join('')}
      </div>
    </div>
  `;
  
  container.querySelectorAll('.rating-scale-option').forEach(btn => {
    btn.addEventListener('click', () => {
      container.querySelectorAll('.rating-scale-option').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      response = btn.dataset.value;
    });
  });
  
  return {
    getResponse: () => response,
    setResponse: (val) => {
      response = val;
      container.querySelectorAll('.rating-scale-option').forEach(btn => {
        btn.classList.toggle('selected', btn.dataset.value === String(val));
      });
    },
    checkAnswer: () => ({ correct: response === config.correctAnswer, score: response === config.correctAnswer ? 1 : 0 }),
    reset: () => {
      response = null;
      container.querySelectorAll('.rating-scale-option').forEach(b => b.classList.remove('selected'));
    }
  };
}
```

## Exports

| Export | Required | Purpose |
|--------|----------|---------|
| `create(container, config)` | ✅ | Factory function |
| `schema` | Optional | Enables linting, AI assistance, preview editor |
| `metadata` | Optional | UI labels, categories, SCORM interaction type |

## Usage in Slides

```javascript
const rating = CourseCode.createRatingScaleQuestion(container, {
  id: 'my-rating',
  prompt: 'How would you rate this?',
  options: ['Poor', 'Fair', 'Good', 'Excellent'],
  correctAnswer: '3'
});
```

See `COURSE_AUTHORING_GUIDE.md` for full interaction API.
