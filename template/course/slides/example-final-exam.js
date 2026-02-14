/**
 * FRAMEWORK EXAMPLE SLIDE
 * This is a template example demonstrating assessment patterns. You can keep it as a reference or delete it.
 * See COURSE_AUTHORING_GUIDE.md for full documentation.
 */

const { AssessmentManager } = CourseCode;
// Standardized named export for assessment configuration.
// This object is imported by the framework during initialization.
export const config = {
  // CORE IDENTITY
  id: 'example-final-exam', // Unique SCORM-safe assessment key
  title: 'CourseCode Knowledge Check', // Learner-facing heading
  icon: 'target', // Optional icon name (from framework icon set) displayed before title
  description: `
    <p class="mb-3">Test your understanding of <strong>CourseCode fundamentals</strong>.</p>
    <ul style="list-style: disc; display: inline-block; text-align: left;" class="text-sm">
      <li>LMS standards (SCORM & cmi5)</li>
      <li>Essential CLI commands</li>
    </ul>
  `, // Optional HTML description shown below title
  containerId: 'assessment-container', // DOM node id for rendering

  // ASSESSMENT BEHAVIOR & CONSTRAINTS
  settings: {
    passingScore: 50, // Minimum % to pass (cmi5: LMS masteryScore can override)
    allowReview: true, // Allow review screen before submission
    showProgress: true, // Display progress bar with question count
    allowRetake: true, // Permit retake flow when learner fails
    randomizeQuestions: false, // Shuffle question order (works with questions array OR questionBanks)
    randomizeOnRetake: true, // Re-randomize on retake (default: true). Set false to keep same questions/order across attempts
    attemptsBeforeRemedial: 1, // After 1 failures, present remedial content (null = disabled)
    attemptsBeforeRestart: 2,  // After 2 failures, require course restart (null = disabled, must be > attemptsBeforeRemedial)
    remedialSlideIds: ['example-remedial'] // Slide IDs to navigate to for remedial review (required when attemptsBeforeRemedial is set)
  },

  // ===== TEMPLATE EXAMPLE: Question Banks =====
  // Uncomment and modify the below to use randomized question banks.
  // This is an advanced feature for courses with multiple question pools.
  // See SCORM_TEMPLATE_README.md for full documentation.
  // =============================================
  // questionBanks: [
  //   {
  //     id: 'safety-fundamentals',
  //     questions: [/* 20 safety questions */],
  //     selectCount: 5  // Select 5 random questions from this bank
  //   },
  //   {
  //     id: 'technical-procedures',
  //     questions: [/* 30 technical questions */],
  //     selectCount: 10  // Select 10 random questions from this bank
  //   }
  // ],
  // Note: When using questionBanks, questions are selected on first start and persist through refresh.
  // With randomizeOnRetake: true, new selection occurs on each retake.
  // With randomizeQuestions: true, selected questions are shuffled together.

  // LEARNER EXPERIENCE
  review: {
    requireAllAnswered: false // Permit submission with unanswered questions
  },

  // RESULTS
  resultsDisplay: {
    detailLevel: 'detailed', // Render full question-by-question breakdown
    showScore: true, // Display numeric score summary
    showPassFail: true, // Indicate pass or fail status
    showTimeSpent: true, // Show total time spent on assessment
    showQuestions: true, // List each question in results view
    showCorrectAnswers: true, // Reveal correct answers when learner is right
    showIncorrectAnswers: true, // Reveal correct answers when learner is wrong
    showUserResponses: true, // Display learner responses for each question
    showCorrectness: true // Tag questions as correct or incorrect
  },

  // COMPLETION & PROGRESSION LOGIC
  completionRequirements: {
    requireSubmission: true, // Assessment must be submitted
    requirePass: true, // Assessment must be passed (score >= passingScore)
    blockNavigation: true // Block leaving slide until requirements are met
  },
};

// Standardized named export for the slide component.
export const slide = {
  assessmentId: config.id,
  render(_root, context = {}) {
    // Defensive: ensure context is always an object (handles null/undefined cases)
    const safeContext = context || {};
    const overrides = safeContext.assessmentConfig || {};
    const containerId = overrides.containerId || config.containerId;

    // Create and return container element
    const slideContainer = document.createElement('div');
    slideContainer.innerHTML = `<div id="${containerId}"></div>`;

    // Define assessment questions using InteractionTypes format
    const questions = [
      {
        type: 'multiple-choice',
        id: 'coursecode-fundamentals',
        prompt: 'Which LMS standard does CourseCode support for tracking learner progress?',
        weight: 1,
        choices: [
          { value: 'scorm', text: 'SCORM 1.2, SCORM 2004, and cmi5', correct: true },
          { value: 'pdf', text: 'PDF exports only', correct: false },
          { value: 'html', text: 'Static HTML with no tracking', correct: false },
          { value: 'video', text: 'Video-only formats', correct: false }
        ],
        correctAnswer: 'scorm',
        feedback: {
          correct: 'Correct! CourseCode supports SCORM 1.2, SCORM 2004, and cmi5 standards.',
          incorrect: 'CourseCode supports multiple LMS standards: SCORM 1.2, SCORM 2004, and cmi5 for comprehensive tracking.'
        }
      },
      {
        type: 'fill-in',
        id: 'coursecode-commands',
        prompt: 'Complete the CourseCode CLI commands:',
        weight: 1,
        blanks: [
          { label: 'To create a new course, run', correct: 'coursecode create', placeholder: 'command' },
          { label: 'To start development mode, run', correct: 'coursecode dev', placeholder: 'command' },
          { label: 'To build for production, run', correct: 'coursecode build', placeholder: 'command' }
        ],
        caseSensitive: false,
        feedback: {
          correct: 'Perfect! You know the essential CourseCode CLI commands.',
          incorrect: 'The main commands are: coursecode create, coursecode dev, and coursecode build.'
        }
      }
    ];

    const assessment = AssessmentManager.createAssessment(
      { ...config, questions },
      overrides
    );

    const container = slideContainer.querySelector(`#${containerId}`);
    assessment.render(container, safeContext);

    return slideContainer;
  }
};
