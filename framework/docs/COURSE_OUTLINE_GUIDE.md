# Course Outline Writing Guide

> **Intended Audience: AI Agents** — This document is a machine-readable reference for AI agents creating course outlines. For human-readable documentation, see `USER_GUIDE.md`.

## 1. Purpose & Core Principles

The outline is the **complete design and content specification** — everything except implementation code. A separate agent uses this outline + `COURSE_AUTHORING_GUIDE.md` to build the course.

**Prerequisite:** Familiarity with `COURSE_AUTHORING_GUIDE.md`.

### Rules

1. **Complete specification:** All final content (text, questions, feedback), navigation logic, objectives, assessments, interactions, and engagement. Nothing left to assumption.
2. **Design intent, not code:** Define WHAT happens, not HOW. Use template component names but never code or config syntax.
   - ✅ "A `multipleChoice` interaction with 4 options about safety hazards."
   - ❌ "`multipleChoice.create(root, {id: 'q1', ...})`"
3. **Use exact framework names:** Component types, manager names, criteria types — enables direct outline → code mapping.
   - ✅ "Locked by `stateFlag: 'module-1-complete'`" | "Engagement: `viewAllTabs` required"
   - ❌ "Make it available after completing module 1" | "User must view all tabs"
4. **AI-to-AI communication:** Write for an implementation agent that has `COURSE_AUTHORING_GUIDE.md` but not your source materials.

---

## 2. What to EXCLUDE

**NEVER include in the outline:**

| Category | Examples of what NOT to include |
|----------|-------------------------------|
| Code / Config | `export const slide = {...}`, config objects, JSON, code blocks |
| Manager APIs / SCORM | `stateManager.set()`, `cmi.objectives.0.id` — framework handles this |
| Implementation | "Import the component", "Add a click handler", file paths |
| Framework internals | DOM selectors, event handlers, utility class lists |
| Unavailable assets | Videos/audio/files that don't exist (diagrams that can be generated are OK) |

---

## 3. Outline Structure & Required Sections

An outline must contain the following sections.

### 3.1. Course Metadata

-   **Course Title:** Full descriptive title.
-   **Course ID:** A unique identifier (e.g., `DEPT-COURSE-001`).
-   **Target Audience:** Specific role, department, or learner group.
-   **Estimated Duration:** Realistic time in minutes.
-   **Layout Type:** `article` (default) | `traditional` | `focused` | `presentation` | `canvas`
-   **Completion Criteria:** High-level summary (e.g., "Visit all required slides and pass the final assessment with 80% or higher").
-   **Scoring Strategy (Optional):** How final course score is calculated.
    -   *Example:* "Course score = 100% if Final Exam passed, otherwise 0%."
    -   *Example:* "Course score = weighted average: 30% Quiz 1 + 30% Quiz 2 + 40% Final Exam."
    -   *Example:* "No course score tracked - completion based only on objectives."

### 3.2. Learning Objectives

List the key skills or knowledge the learner will gain. These are for human understanding and should align with the tracked objectives.

-   *Example: "Identify the three main components of the X process."*
-   *Example: "Apply the risk assessment matrix to a given scenario."*

### 3.3. Course Structure & Navigation Logic

All courses are **single-SCO** — one SCORM package, one set of tracking data. Sections/modules are UI-only (sidebar groupings), not SCORM boundaries.

**State Management:**
- **Flags** (`FlagManager`): Boolean values for custom logic and gating
- **Objectives** (`ObjectiveManager`): SCORM `cmi.objectives.n.*` for LMS reporting, completion, and gating
- **Assessments** (`AssessmentManager`): Graded evaluations with pass/fail, can gate navigation and auto-set objectives
- **Engagement** (`EngagementManager`): Slide-level completion (tabs viewed, interactions, scroll, time). Validated by runtime-linter.

**Gating Conditions** (`navigation.gating.conditions`): `objectiveStatus`, `assessmentStatus`, `stateFlag`, `timeOnSlide`. Mode: `all` (AND) | `any` (OR).

#### Structure

List all slides with IDs, titles, and rules. Group into sections for sidebar organization.

**Example Structure:**
```
- Module 1: Introduction
  - intro-01: Welcome (Engagement: viewAllTabs)
  - intro-02: Learning Objectives

- Module 2: Core Concepts
  - content-01: What is Job Briefing? (Gating: objectiveStatus 'completed-introduction')
  - content-02: The 5 Key Elements (Engagement: scrollDepth 80% + timeOnSlide 60s, mode: all)

- Module 3: Knowledge Check
  - kc-01: Knowledge Check (Gating: objectiveStatus 'reviewed-core-content')

- Module 4: Advanced Content
  - advanced-01: Case Studies (Gating: assessmentStatus 'kc-01' passed)

- Module 5: Remedial (Conditional)
  - remedial-01: Review (includeByDefault: false, insertAfter: 'kc-01', when: kc-01 failed)

- Module 6: Final
  - final-assessment: Final Exam (Gating: assessmentStatus 'kc-01' passed)
  - summary-01: Summary (Gating: assessmentStatus 'final-assessment' passed)
```

#### Navigation Gating Specifications

For each slide that has access restrictions, define the gating logic using the template's condition types.

**Gating Condition Types:**

| Type | Properties | Example |
|------|-----------|---------|
| `objectiveStatus` | `objectiveId`, `completion_status`, `success_status` | `objectiveId: 'completed-intro'`, `completion_status: 'completed'` |
| `assessmentStatus` | `assessmentId`, `requires` ('passed'/'failed') | `assessmentId: 'kc-01'`, `requires: 'passed'` |
| `stateFlag` | `key`, `value` (true/false) | `key: 'demo-complete'`, `value: true` |
| `timeOnSlide` | `slideId`, `minSeconds` | `slideId: 'content-01'`, `minSeconds: 120` |

**Gating Modes:** `all` (AND) or `any` (OR)

**Example Specifications:**

```
Slide: content-01
  Gating: objectiveStatus 'completed-introduction' completion_status='completed'
  Locked Message: "Complete the introduction first."

Slide: advanced-01 (Multiple conditions)
  Gating Mode: all
  Conditions: objectiveStatus 'reviewed-all-content' + assessmentStatus 'kc-01' passed
  Locked Message: "Complete all content and pass KC1."

Slide: remedial-01 (Reverse gating)
  Gating: assessmentStatus 'kc-01' requires='failed'
  Sequence: includeByDefault=false, insertAfter='kc-01'
```

#### Conditional Slide Insertion (Remedial/Branching)

The template supports dynamic slide insertion based on conditions (e.g., remedial content after failing an assessment).

**Specify for conditional slides:**
- **Include by default:** `false` (slide not in default navigation sequence)
- **Include when:** Condition that triggers insertion (same format as gating conditions)
- **Insert position:** `before` or `after` a specific `slideId`

**Example:**
- **Slide:** `remedial-01`
- **Conditional Insertion:**
  - Include by default: No
  - Include when: Assessment `kc-01` failed
  - Insert position: After slide `kc-01`

**Note on Conditional Content:**
The template supports advanced branching (role-based paths, optional enrichment). Keep specifications concise—conditional slides should only review/reinforce content already presented, never introduce required information that some learners won't see.

### 3.4. Slide-by-Slide Breakdown

Every slide must be fully specified with complete content, interactions, engagement, and tracking.

**Every slide MUST specify layout.** Describe structure, not code. Reference components explicitly.

Layout patterns: Single-column | Two-column (split) | Card grid (NxM) | Tabbed | Interactive Image | Hero+details | Assessment. Width: narrow | medium (default) | wide | full.

- ✅ "Two-column: left H2 + bullet list, right tabs component ('Overview', 'Steps', 'Examples')"
- ❌ "Content about safety procedures" (no structure)
- ❌ Code blocks or class names

#### Slide Template

```markdown
### [Slide ID]: [Slide Title]

**Layout:** (REQUIRED)
- Structure: Single-column | Two-column | Card grid (NxM) | Hero+details
- Components: tabs, accordion, modals (be explicit)
- Content width: narrow | medium (default) | wide | full

**Content:**
- ALL final text verbatim (headings, paragraphs, lists, callouts)
- Callouts: type (info/warning/error/success) + full text
- Images: "[Image: description]"

**Interaction:** (if interactive)
- Component type + full config (see Section 4)

**Engagement:** (REQUIRED)
- Required: true/false
- Mode: all/any
- Requirements: [types from table above]
- Show Indicator: true/false

**Narration:** (if audio narration is used)
- Full narration script (see Section 3.4.2 for writing guidelines)

**Tracking:** (if applicable)
- Flags Set: "flag-name on [trigger]"
- Objectives: "objective-id via [criteria]"

**Navigation Notes:** (optional, if non-standard)
```

#### 3.4.1. Engagement Requirements (CRITICAL)

**EVERY slide MUST specify engagement requirements.** runtime-linter validates at dev-time. Default: `required: false`.

**Engagement Types:**

| Type | Config | Validates |
|------|--------|-----------|
| `viewAllTabs` | - | `[data-component="tabs"]` exists |
| `viewAllPanels` | - | `[data-component="accordion"]` exists |
| `viewAllFlipCards` | - | `data-flip-card-id` elements exist |
| `viewAllTimelineEvents` | - | `[data-component="interactive-timeline"]` exists |
| `viewAllHotspots` | - | `[data-component="interactive-image"]` exists |
| `interactionComplete` | `interactionId`, `label` (optional) | Matching interaction ID exists |
| `allInteractionsComplete` | - | `[data-interaction-id]` elements exist |
| `scrollDepth` | `percentage` (0-100) | - |
| `timeOnSlide` | `minSeconds` | - |
| `flag` | `key`, `equals` (optional) | - |
| `allFlags` | `flags` array | - |
| `embedComplete` | `key` (flag set by embed) | `[data-component="embed-frame"]` exists |

**Modes:** `all` (AND) or `any` (OR)

**Progress Indicator:** Shows automatically when `required: true`. Set `showIndicator: false` to hide.

**Examples:**
- `Required: true, Mode: all, Requirements: viewAllTabs + timeOnSlide(60s)`
- `Required: true, Mode: any, Requirements: scrollDepth(90%) OR timeOnSlide(120s)`
- `Required: true, Requirements: allFlags(['zone-1-clicked', 'zone-2-clicked'])`
- `Required: false` (Next always enabled)

**Custom Flag-Based Activities:** For non-standard interactions (clickable diagram regions, multi-step workflows), use flags with `allFlags` requirement.

#### Content Completeness

**Content must be verbatim.** No placeholders or summaries.

✅ **Complete:**
> ## What is a Job Briefing?
> A job briefing is a structured communication session held before starting work. It ensures all team members understand:
> - The scope of work
> - Identified hazards
> - Safety procedures
> - Individual responsibilities
>
> **Why it matters:** Job briefings reduce incidents by 60% when conducted properly (NIOSH, 2023).

❌ **Incomplete:** "Explain what a job briefing is and why it's important."

#### 3.4.2. Narration Writing Guidelines

Narration should **complement** on-screen content, not duplicate it. Learners read faster than narration plays.

- ✅ Expand on key points with context, examples, or expert insight not shown on screen
- ✅ Guide attention and provide transitions between concepts
- ✅ Use conversational tone — rephrase formal text into natural speech
- ❌ Never read bullet points, headings, or on-screen text verbatim

### 3.5. Objectives & Tracking Logic

SCORM-compliant objectives (`cmi.objectives.n.*`) for LMS reporting, course completion, and navigation gating. Evaluated automatically (built-in criteria) or via assessment results.

**Objectives vs Flags:** Objectives = SCORM tracking with LMS integration. Flags = lightweight booleans for custom gating. Both gate navigation.

#### Built-In Objective Criteria Types

| Criteria Type | Config | Use Case |
|--------------|--------|----------|
| `slideVisited` | `slideId` | Track specific slide visit |
| `allSlidesVisited` | `slideIds` array | Ensure all module slides viewed |
| `timeOnSlide` | `slideId`, `minSeconds` | Ensure engagement with content |
| `flag` | `key`, `equals` | Bridge flags → SCORM objectives |
| `allFlags` | `flags` array | Multi-step flag-based processes |
| Assessment-Linked | Set `assessmentObjective` in assessment config | Auto-managed pass/fail objectives |

#### Objective Definitions

List each objective with: **ID**, **Description**, **Criteria Type**, **Use** (what it gates or reports).

**Example Objectives:**

```
Auto-Evaluated:
- completed-introduction: slideVisited 'intro-02' → Gates Module 2
- reviewed-all-core-content: allSlidesVisited ['content-01','content-02','content-03'] → Required for KC1
- engaged-with-case-study: timeOnSlide 'advanced-02' 180s → Ensures deep engagement

Assessment-Linked:
- passed-knowledge-check-1: assessmentObjective in kc-01 → Gates advanced content
  On pass (≥80%): completion='completed', success='passed'
  On fail (<80%): completion='completed', success='failed'
- passed-final-assessment: assessmentObjective in final-assessment → Course success criterion
```

#### Course Completion & Success Logic

Define which objectives (or combinations) determine:
1. **Course Completion** (`cmi.completion_status`)
2. **Course Success** (`cmi.success_status`)

**Example:**
- **Completion Requirements:**
  - Objective `reviewed-all-core-content` must be completed AND
  - Objective `passed-final-assessment` completion_status must be 'completed'

- **Success Requirements:**
  - Objective `passed-final-assessment` success_status must be 'passed'

**SCORM Note:**
- `completion_status`: 'completed', 'incomplete', 'not attempted', 'unknown'
- `success_status`: 'passed', 'failed', 'unknown'
- Assessments typically set both: completion when attempted, success based on score

### 3.6. Assessment Strategy

Practice interactions use standalone components (no scoring). Graded assessments use `AssessmentManager` for scoring, retries, and SCORM tracking. Assessments can auto-set objectives (`assessmentObjective`) and gate navigation (`assessmentStatus`). Course scoring strategy specified in §3.1.

#### Scoring Within an Assessment

Score = `(sum of correct weights) / (sum of all weights)` × 100. Default weight per question = 1. Score determines pass/fail against `passingScore`.

#### Assessment Types

| Type | Purpose | Location | Scoring | SCORM | Gating |
|------|---------|----------|---------|-------|--------|
| **Practice** (formative) | Reinforce with feedback | Embedded in content | None | Records interactions only | No |
| **Knowledge Check** (formative, graded) | Verify comprehension | End of module | Scored independently | Auto-sets objective via `assessmentObjective` | Can gate next module |
| **Final Assessment** (summative) | Certify mastery | Near course end | Scored independently | Sets primary success objective | Can gate completion |

#### Retake & Progressive Intervention

Define retake settings and intervention thresholds for each assessment.

**Settings:**
-   **`allowRetake`**: Enable/disable retake flow
-   **`randomizeQuestions`**: Shuffle question order on first attempt (default: false)
-   **`randomizeOnRetake`**: Re-randomize questions on each retry (default: true when banks or shuffle enabled)
-   **`allowUnansweredSubmission`**: Allow submit with unanswered questions (default: false)
    -   If false: Submit button disabled until all answered; shows confirmation modal
    -   If true: Allow immediate submission; unanswered = incorrect
-   **`attemptsBeforeRemedial`**: Present remedial content after N failures (null = disabled)
-   **`attemptsBeforeRestart`**: Require course restart after M failures (null = disabled, must be > attemptsBeforeRemedial)
-   **`remedialSlideIds`**: Slide IDs for remedial review (required when attemptsBeforeRemedial is set)

**Example - Knowledge Check:**
-   Unlimited retakes, remedial after 2 failures: `allowRetake: true, attemptsBeforeRemedial: 2, remedialSlideIds: ['remedial-01'], allowUnansweredSubmission: false`

**Example - Final Assessment:**
-   Restart after 3 failures: `allowRetake: true, attemptsBeforeRestart: 3, attemptsBeforeRemedial: null, allowUnansweredSubmission: false`

#### Assessment-Objective Integration

Specify `assessmentObjective` in each assessment config. Framework auto-updates objective on submission:
- Score ≥ passingScore: `completion='completed'`, `success='passed'`
- Score < passingScore: `completion='completed'`, `success='failed'`
- Practice assessments: `assessmentObjective: null`

#### Assessment Configuration Summary

For each graded assessment, specify:

```
Assessment: kc-01
  Title: "Knowledge Check 1"
  Questions: 5 (from bank of 7)
  Passing: 80%
  Attempts: Unlimited
  Randomization: Shuffle + re-randomize on retake
  Unanswered: Block submission
  Objective: passed-knowledge-check-1
  Gates: advanced-01, advanced-02
  Remedial: After 2 failures → remedial-01

Assessment: final-assessment
  Title: "Final Exam"
  Questions: 10 (fixed)
  Passing: 80%
  Attempts: Max 3 (restart after)
  Randomization: None
  Unanswered: Block submission
  Objective: passed-final-assessment (determines course success)
  Gates: summary-01
```

#### Question Banks & Randomization

**Bank Configuration:** Define category-based banks with selection rules.
```
Assessment: kc-01
Banks:
  - Safety Procedures: 4 defined, select 2
  - Hazard Identification: 3 defined, select 2
  - Communication: 3 defined, select 1
Total: 10 defined, learner sees 5
```

**Randomization Settings:**
- `randomizeQuestions`: Shuffle order (default: false)
- `randomizeOnRetake`: New selection + shuffle on retry (default: true when banks enabled)

**Design Guidelines:**
- Banks for formative (variety across retakes)
- Fixed questions for summative (consistency)
- Shuffle to reduce memorization
- Fixed order when questions build on each other

### 3.7. Flags vs Objectives: Decision Guide

| Use Case | Flags | Objectives |
|----------|-------|------------|
| Simple boolean state | ✓ | |
| Navigation gating (no LMS reporting) | ✓ | |
| Custom UI tracking (hotspots, workflows) | ✓ | |
| SCORM-compliant LMS reporting | | ✓ |
| Formal learning outcomes | | ✓ |
| Pass/fail status needed | | ✓ |
| Flag logic needs LMS reporting | ✓ → objective via `flag`/`allFlags` criteria |

**Pattern:**
1. **Objectives** for formal outcomes + assessments
2. **Flags** for internal logic + custom interactions
3. **Flag-based objectives** to elevate flags to LMS
4. **Assessment-linked objectives** for graded assessments
5. Gate via `objectiveStatus`/`assessmentStatus` (SCORM-aligned), use `stateFlag` only for custom logic

### 3.8. Visual Layout & Course Cohesion

1. Describe structure, not CSS: "Two-column with image left, list right"
2. Use consistent terminology: cards, callouts, columns, tabs
3. Indicate hierarchy: primary headings, supporting text, warning callouts
4. Consistent elements: same callout colors, same button verbs, same heading hierarchy (H1=slide title, H2=section, H3=subsection)
5. Progressive disclosure: start simple, use tabs/accordions for advanced content

**Standard Patterns:**
- Content: Tabs (multi-path), Accordion (collapsible), Cards (equal-weight), Columns (side-by-side)
- Emphasis: Callouts (info/warning/error/success), Buttons (primary/secondary)
- Interaction Layouts: Question + vertical choices, Drag → drop zones, Image + hotspots

### 3.9. Reference Documents

List all source documents, SOPs, policies, standards, or SME resources used. Provides traceability for future content updates.
-   SOP 1556 - Some Task SOP (Revision 3, dated 2024-08-15)
-   OSHA 1910.269 - Electric Power Generation, Transmission, and Distribution
-   NFPA 70E - Standard for Electrical Safety in the Workplace (2024 Edition)
-   Internal training deck: "Effective Job Briefings" by J. Smith (2023)
-   Subject matter expert interviews: Site Safety Manager, Regional Operations Director

**Note:** This section will be expanded in future iterations to include detailed source-to-content mappings and version control for regulatory compliance.

### 3.10. Document Gallery (Optional)

If the course should include downloadable/viewable reference documents (PDFs, markdown, images), list them here. The framework auto-discovers files from `course/assets/docs/` and displays them in a collapsible sidebar gallery.

**Specify:**
- Which documents to include and their filenames
- Whether downloads should be allowed (`allowDownloads: true/false`)
- Custom thumbnail images for PDFs (place `<filename>_thumbnail.png` alongside the PDF)

### 3.11. Technical Limitations

**DO NOT design these features** - they are not supported by the framework:

-   ❌ **No AI Grading:** Cannot grade essays or open-ended text.
-   ❌ **No Multiplayer:** No chat, leaderboards, or live collaboration.
-   ❌ **No Microphone/Webcam:** No voice recording or video capture.
-   ❌ **No External Links:** Avoid linking out (breaks SCORM tracking/security).
-   ❌ **No Sticky/Fixed Positioning:** Cannot create sticky headers or floating navigation (SCORM iframe restriction). Use in-content navigation instead.
-   ❌ **No position:fixed Elements:** Floating elements would escape iframe boundaries.

---

## 4. Interaction Specifications

When a slide includes an interactive element, fully specify it using the formats below. The implementation agent will map these to the corresponding framework components.

### Interaction Categories

**Assessment Components** (SCORM-tracked, with answer checking):
-   `multipleChoice`, `trueFalse`, `fillIn`, `matching`, `dragDrop`, `numeric`, `hotspot`, `sequencing`, `likert`

**UI Components** (non-assessed, organizational):
-   `tabs`, `dropdown`, click-to-reveal, expandable cards, accordions, flip cards

**Practice vs. Graded:**
-   **Practice:** Uses assessment components but exists on content slides. Immediate feedback, no scoring.
-   **Graded:** Managed by `AssessmentManager`. Scoring, retries, and SCORM reporting apply.

### Specification Format

For each interaction, provide:
1. **Component type** (matches template component name)
2. **Unique ID** (used for SCORM tracking and DOM references)
3. **Complete configuration** (question, choices, correct answers, feedback, etc.)
4. **Context** (practice or graded, where it appears)

**Feedback Quality Standard:**
- **Correct Feedback:** Reinforce WHY it is right. Connect to learning objectives.
  - *Example:* "Correct! Assessing hazards first is the foundational principle of workplace safety."
- **Incorrect Feedback:** Explain WHY it is wrong and point to the correct concept. Be specific.
  - *Example:* "Not quite. While calling a supervisor is important, you must first assess immediate hazards to ensure your own safety."
- **Avoid:** Generic "Correct!" or "Try again" feedback

---

### Assessment Component Examples

Provide: **ID**, **Weight** (if graded), **Question/Prompt**, **Choices/Config**, **Correct Answer**, **Feedback** (correct + incorrect), **Context**.

#### `multipleChoice`
```
ID: kc1-q1, Weight: 1
Question: "What is the first step in conducting a job briefing?"
Choices: a) Assign tasks, b) Review scope of work, c) Identify hazards, d) Discuss emergency procedures
Correct: b
Feedback-Correct: "Correct! Reviewing scope ensures shared understanding."
Feedback-Incorrect: "Not quite. First step is reviewing scope of work."
Context: Knowledge Check 1
```

#### `trueFalse`
```
ID: practice-tf-1
Question: "Job briefings are only required for high-risk work."
Correct: false
Feedback-Correct: "Correct. Job briefings benefit all work activities."
Feedback-Incorrect: "Incorrect. All activities benefit from structured briefings."
Context: Practice on content-02
```

#### `fillIn`

Two modes: **inline** (cloze with `{{placeholder}}`) or **stacked** (Q&A with prompt).

```
ID: final-q3, Weight: 1
Mode: inline
Template: "The hazard categories are electrical, mechanical, and {{blank1}}."
Blank 1: Accepts ["chemical", "chemicals"], typoTolerance: 1
Feedback: [correct/incorrect messages]
Context: Final Assessment Q3

ID: practice-qa
Mode: stacked
Prompt: "What is the third hazard category?"
Blank 1: Accepts ["chemical"], placeholder: "Enter answer..."
Feedback: [correct/incorrect messages]
Context: Practice on content-02
```

#### `matching`
```
ID: match-roles
Prompt: "Match each role to its primary responsibility."
Pairs:
  - "Site Supervisor" → "Leads the briefing"
  - "Safety Officer" → "Reviews hazard controls"
  - "Crew Member" → "Confirms understanding of tasks"
Feedback-AllCorrect: "Excellent! You understand role responsibilities."
Feedback-SomeIncorrect: "Review the roles and try again."
Context: Practice on apply-01
```

#### `dragDrop`
```
ID: categorize-elements
Prompt: "Drag each item to the correct job briefing category."
Items: PPE requirements, Voltage levels, First aid location, Work sequence
Drop Zones: Safety Procedures, Work Scope, Hazard Identification
Correct Placements:
  - Safety Procedures: [PPE requirements, First aid location]
  - Work Scope: [Work sequence]
  - Hazard Identification: [Voltage levels]
Feedback: Immediate visual (green=correct, red=incorrect)
Context: Interactive on content-03
```

#### `numeric`
```
ID: calc-q1, Weight: 1
Question: "6 people × 15 min briefing = how many person-hours? (2 decimal places)"
Correct: 1.5, Tolerance: ±0.05
Feedback-Correct: "Correct! 6×15min = 90min = 1.5hrs"
Feedback-Incorrect: "Incorrect. Calculate: (6×15)/60"
Context: Final Assessment Q7
```

#### `hotspot`
```
ID: identify-hazard
Prompt: "Click on the primary electrical hazard."
Image: [Worksite diagram with exposed wiring, ladder, tools]
Hotspots:
  - exposed-wire: [120,80,200,140] rectangle (CORRECT)
  - ladder: [300,50,350,180] rectangle
  - toolbox: [450,200,520,250] rectangle
Feedback:
  - exposed-wire: "Correct! Exposed wiring is the electrical hazard."
  - ladder: "Ladder is a fall hazard, not electrical."
  - toolbox: "Toolbox is not a hazard here."
Context: Interactive on content-04
```

#### `sequencing`
```
ID: order-steps, Weight: 1
Prompt: "Arrange job briefing steps in correct order."
Items: Review scope, Identify hazards, Discuss safety, Assign responsibilities, Confirm understanding
Correct Order: [as listed above]
Feedback-Correct: "Correct! This is the proper sequence."
Feedback-Incorrect: "Not quite. Review the job briefing process."
Context: Knowledge Check 1 Q5
```

#### `likert`
```
ID: confidence-check
Prompt: "Rate your confidence:"
Questions: 1) Hazard assessment, 2) Selecting PPE, 3) Communicating risks
Scale: 1 (Not Confident) to 5 (Very Confident)
Context: Self-assessment on reflection-01 (no grading)
```

---

### UI Component Examples

#### `tabs`
```
ID: overview-tabs
Tabs:
  1. "Purpose": Job briefings ensure shared understanding of work, hazards, and safety.
  2. "Benefits": Reduce incidents by 60%, improve efficiency by 25%.
  3. "When Required": Before shifts, when tasks/hazards/team change.
Engagement: viewAllTabs required
```

#### `dropdown`
```
ID: select-role
Prompt: "Select your role for tailored responsibilities:"
Options: supervisor (Site Supervisor), safety (Safety Officer), crew (Crew Member)
On Change: Display role-specific content below
```

#### Click-to-Reveal / Accordion
```
ID: hazard-details
Items:
  - "Electrical Hazards" → Exposed conductors, overhead lines, arc flash risks
  - "Mechanical Hazards" → Rotating equipment, pinch points, struck-by hazards
  - "Environmental Hazards" → Extreme temps, weather, confined spaces
Behavior: Single-expand (others collapse)
Engagement: viewAllPanels required
```

---

### Graded Assessment Question Bank Format

```
### kc-01: Knowledge Check 1

Config:
  Type: Graded
  Passing: 80%
  Questions: 5 from bank of 7
  Randomization: Shuffle + re-randomize on retake
  Retries: Unlimited
  Unanswered: Block submission
  Objective: passed-knowledge-check-1

Question Bank:
1. [multipleChoice: ID, Weight, Question, Choices, Correct, Feedback]
2. [trueFalse: ID, Weight, Question, Correct, Feedback]
3. [fillIn: ID, Weight:2, Prompt, Blanks, Feedback]
...
```

---

## 5. Quality Checklist

Before finalizing the outline, verify completeness and adherence to the design/implementation boundary:

### Content Completeness
-   [ ] Every slide has **complete, final text**—no placeholders or summaries
-   [ ] All questions, answer choices, and feedback are **verbatim** as they should appear to learners
-   [ ] Visual elements are described clearly (images, diagrams, callouts, layout structures)
-   [ ] All interactive elements are **fully specified** with component type and complete configuration
-   [ ] **Every interaction** has specific correct AND incorrect feedback (not generic)

### Navigation & Flow
-   [ ] All slides listed with IDs, titles, grouped logically
-   [ ] All `stateFlag`s defined with name, trigger, and what they unlock
-   [ ] Locked slides reference their gating conditions
-   [ ] Learner progression path is unambiguous

### Engagement Requirements (CRITICAL)
-   [ ] **EVERY slide** specifies engagement or "Required: false"
-   [ ] Types match Section 3.4.1; mode (`all`/`any`) specified for multi-requirement slides
-   [ ] Requirements match slide content (tabs exist for viewAllTabs, etc.)

### Objectives & Tracking
-   [ ] All objectives have unique IDs with criteria type and purpose
-   [ ] Assessment-linked objectives specify `assessmentObjective` config
-   [ ] Course completion logic explicitly stated

### Assessment Architecture
-   [ ] Practice vs. graded clearly distinguished
-   [ ] All graded assessments specify: question count, passing score, retry policy, randomization, unanswered handling, `assessmentObjective`
-   [ ] Pass/fail → objective link is explicit

### Design/Implementation Boundary
-   [ ] NO code, config syntax, JSON, manager APIs, file paths, or import statements
-   [ ] ONLY template concept references (component names, manager names, criteria types)

### Usability
-   [ ] An agent with only this outline + `COURSE_AUTHORING_GUIDE.md` could build the course
-   [ ] No assumptions — all design decisions documented, no blanks to fill
-   [ ] Framework terminology used throughout

### Reference Materials
-   [ ] Source documents listed in Section 3.9

---

**[End of Guide]**
