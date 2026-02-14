# [Course Title]

> **Intended Audience: AI Agents** — This is a machine-readable template for AI agents. For human-readable documentation, see `USER_GUIDE.md`.

* **Course ID:** `[COURSE-ID]`
* **Target Audience:** `[Audience]`
* **Estimated Duration:** `[X] minutes`
* **Layout Type:** `traditional` | `article` | `focused` | `presentation` | `canvas`
* **Architecture:** `Single-SCO`
* **Key Learning Objectives:** `[Human-readable objective 1]`, `[Objective 2]`, `[Objective 3]`

---

## 1. Course Overview & Strategy

*This section defines the high-level architecture, scoring, and success criteria.*

### A. Completion & Success Rules

* **Completion:** [e.g., "Must view all slides and pass Final Exam"]
* **Success:** [e.g., "Final Exam score >= 80%"]
* **Scoring Strategy:** [e.g., "Weighted: Final Exam (100%)" or "Average of all quizzes"]

### B. Objectives & Tracking Logic

*Defines the SCORM objectives used for tracking. Maps to `course-config.js`.*

| ID | Description | Criteria Type | Details |
|---|---|---|---|
| `obj-intro` | Completed introduction | `slideVisited` | `slide-01` |
| `obj-core` | Reviewed core content | `allSlidesVisited` | `[slide-02, slide-03]` |
| `obj-exam` | Passed Final Exam | `Manual` | Set by `assess-final` |

---

## 2. Content Structure (High-Level)

*Master table of contents showing flow, gating, and logic.*

* **Module 1: Introduction**
  * `slide-01`: [Welcome]
* **Module 2: Core Concepts** (`Gate:` Requires `obj-intro`)
  * `slide-02`: [Concept A]
  * `slide-03`: [Concept B]
* **Module 3: Assessment**
  * `assess-final`: [Final Exam]

---

## 3. Slide-by-Slide Breakdown

*Detailed specification for every slide. This is the blueprint for development.*

### Module 1: Introduction

#### `slide-01`: [Title]

**Visual Concept:**

[Describe the layout, imagery, and visual hierarchy. E.g., "Split screen: Left side has a welcome video placeholder, Right side has the course title and start button."]

**Content:**

* **Heading:** [H1 Title]
* **Body:**
  * [Paragraph 1 text...]
  * [Bullet points...]
* **UI Elements:**
  * Button: "Start Course"

**Narration:** (if audio is used)

> [Narration script that complements—not duplicates—on-screen content. Expand on key points, provide context, or guide attention rather than reading text verbatim.]

**Navigation & Tracking:**

* **Nav:** Next button unlocks after media completes.
* **Track:** `slideVisited` (completes `obj-intro`).

---

### Module 2: Core Concepts

#### `slide-02`: [Title]

**Visual Concept:**

[E.g., "Interactive Accordion. Three collapsible sections labeled 'Plan', 'Do', 'Check'."]

**Content:**

* **Intro Text:** Click each step to learn more.
* **Accordion Item 1 (Plan):** [Content for item 1]
* **Accordion Item 2 (Do):** [Content for item 2]
* **Accordion Item 3 (Check):** [Content for item 3]

**Interactions:**

* **Type:** Accordion
* **Behavior:** User must click all 3 items to proceed.

**Navigation & Tracking:**

* **Engagement:** `viewAllTabs` required to unlock Next button.

---

#### `slide-03`: [Practice Scenario]

**Visual Concept:**

[E.g., "Scenario Layout. Context text on top, multiple choice question below."]

**Content:**

* **Scenario:** [Context paragraph...]
* **Question:** [Question text]
* **Options:**
  * A) [Text]
  * B) [Text] (Correct)
  * C) [Text]
* **Feedback:**
  * **Correct:** [Text]
  * **Incorrect:** [Text]

**Interactions:**

* **Type:** Multiple Choice (Practice)
* **ID:** `practice-01`

**Navigation & Tracking:**

* **Track:** Contributes to `obj-core`.

---

### Module 3: Assessment

#### `assess-final`: [Final Exam]

**Strategy:**

* **Pool:** Select 10 questions from a bank of 15.
* **Pass Score:** 80%
* **Retries:** 2 attempts allowed.

**Question Bank:**

**Q1** (`q1-id`): [Question Text]

* **Type:** Multiple Choice
* **Options:** A) [Text], B) [Text] (Correct)
* **Feedback:** [Explain why]

**Q2** (`q2-id`): [Question Text]

* **Type:** True/False
* **Correct:** True
* **Feedback:** [Explain why]

... *(continue for all questions)* ...
