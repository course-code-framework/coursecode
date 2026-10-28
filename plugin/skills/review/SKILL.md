---
name: review
description: Review a CourseCode course for broken slides, layout problems at mobile and desktop sizes, interaction and scoring bugs, accessibility issues, and content accuracy, then report findings. Use when someone asks to check, test, QA, review, or proof a course before sharing or publishing it.
---

# Review a course

Produce a findings list first. Fix things only after the author agrees, except for obvious lint errors.

The preview must be running (`npx coursecode preview`, started once in the background). Runtime tools also need `environment.automation.enabled: true` in `course/course-config.js`. If it is off, tell the author and ask before changing it.

## 1. Static checks

- `coursecode_lint`: record every error and warning.
- `coursecode_errors`: record build, runtime, framework, and console issues.

## 2. Structure and flow

- `coursecode_state`: get the table of contents, interactions, engagement rules, and LMS state.
- Compare the structure to `course/COURSE_OUTLINE.md` if it exists. Note missing or extra slides.
- `coursecode_reset`, then walk the course in order with `coursecode_navigate`. Check that navigation gating and engagement requirements behave as configured.

## 3. Visual pass

For each slide, screenshot at desktop size, then switch with `coursecode_viewport` (`mobile-portrait`, then `tablet-portrait`) and screenshot again. Reset with `coursecode_viewport` `desktop` when done. Look for overflow, clipped text, overlapping elements, unreadable contrast, and broken images.

Spot-check a few slides in dark mode and high contrast using `coursecode_navigate` with `theme: "dark"` or `highContrast: true`.

## 4. Interactions and scoring

For every interaction, call `coursecode_interact` with a correct answer and a wrong one. Confirm `correct`, score, and feedback are right.

Assessments are graded on submit, not per question. Drive each one with `coursecode_assessment`: navigate to it, `start`, answer `question.id` with `coursecode_interact`, `next` through the questions, then `submit` (answer `confirm-unanswered-submit` or `dismiss-unanswered-modal` if a dialog opens). Check `lastResults` against the answers you gave, then run it again with wrong answers using `retake` if retakes are allowed. After the final assessment, check `coursecode_state` for completion and success status and the score sent to the LMS.

## 5. Content

- Check facts against `course/references/converted/`. Flag anything unsupported.
- Look for typos, inconsistent terms, unclear instructions, and feedback that does not explain the answer.
- Accessibility: meaningful alt text, heading order, link and button labels, no information conveyed by color alone.

## Report

Group findings by severity: **Blocking** (errors, broken interactions, wrong scoring, completion never reached), **Should fix** (layout, accessibility, accuracy), **Polish**. Give the slide ID and a one-line fix for each. Ask which to fix. After fixing, rerun lint and re-screenshot the affected slides.
