---
name: build-slides
description: Build or edit CourseCode slides, interactions, assessments, and course-config.js from an approved outline, verifying each batch with lint and screenshots. Use when someone wants to build, write, add, or change course slides, quizzes, interactions, layout, or theme in a CourseCode project.
---

# Build course slides

## Before you write code

1. Read `framework/docs/COURSE_AUTHORING_GUIDE.md` in full. It defines the slide format, interactions, assessments, engagement tracking, styling, and config. Do not guess framework APIs.
2. Read `course/COURSE_OUTLINE.md`. If it does not exist or is not approved, use the `outline` skill first. For small edits to an existing course, the outline is optional.
3. Call `coursecode_workflow_status` and make sure the preview is running (see the `new-course` skill).
4. Example slides: if `course/slides/` still has `example-*` files and the author is building their own course, ask before running `npx coursecode clean`. It deletes the examples and resets `course-config.js` to a minimal starter.

## Rules that the linter will enforce

- Each slide file exports `meta` and a default HTML string:
  ```js
  export const meta = { title: 'Slide Title' };
  export default `<section class="slide">...</section>`;
  ```
- No `import` statements for components, interactions, CSS, or icons. They are global. The only valid import is a local asset: `import photo from '../assets/images/photo.png';`.
- Interactions come from the global: `const { createMultipleChoiceQuestion } = CourseCode;`.
- Components are declarative: `data-component="tabs"` in the HTML.
- Use framework CSS classes. Find them with `coursecode_css_catalog`. Put brand overrides in `course/theme.css` only.
- Work only in `course/`. Never edit `framework/` or `node_modules/`.
- Do not use em-dashes in sentences.

Discover before you invent: `coursecode_component_catalog`, `coursecode_interaction_catalog`, `coursecode_css_catalog`, and `coursecode_icon_catalog` list what exists. Custom components or interactions go in `course/components/` or `course/interactions/`, and only when nothing built-in fits.

## Build loop

Work one module at a time:

1. Write the module's slides and register them in `course/course-config.js` (structure, engagement requirements, objectives, assessments, as the outline specifies).
2. Run `coursecode_lint`. Fix every error before moving on. Lint suggests replacements for invalid CSS classes.
3. Run `coursecode_errors` for live build and runtime problems.
4. Screenshot the slides you changed with `coursecode_screenshot` (`slideId`). Look at them and fix layout problems. Use `detailed: true` for text inspection and `scrollY` or `fullPage` for long slides. Target the slides you changed, not every slide.
5. For new interactions, answer them once with `coursecode_interact` to confirm correct answers and feedback work.

After the first full pass, stop and show the author: list what was built, share a couple of screenshots, and ask for feedback before polishing. Then use the `review` skill.

## Content quality

- Slide text comes from the outline and `course/references/converted/`. Do not invent facts.
- Keep slides focused: one idea per slide, short paragraphs, visual structure (cards, tabs, accordions) for dense material.
- Write feedback that explains why an answer is right or wrong.
