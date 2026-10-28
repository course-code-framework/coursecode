---
name: outline
description: Turn source material (PDFs, Word docs, PowerPoints, SME notes, or a described topic) into an approved CourseCode course outline before any slides are built. Use when someone wants to plan, outline, storyboard, or design a course, or has documents to convert into training.
---

# Create a course outline

The outline (`course/COURSE_OUTLINE.md`) is the design document: modules, slides, interactions, assessments, objectives, and completion rules. Slides are built from it later, so get it approved first.

If there is no `course/` directory, use the `new-course` skill first.

## 1. Gather source material

- Ask the author for their source documents and where they are. Copy them into `course/references/`.
- Convert them to markdown:
  ```bash
  npx coursecode convert
  ```
  Output lands in `course/references/converted/`. Supported: `.docx`, `.pptx`, `.pdf`, `.md`. Read every converted file. Image placeholders in the markdown point to figures you may want on slides.
- No documents? Interview the author instead: audience, what learners must be able to do afterwards, how long the course should take, and how success is measured.

## 2. Read the guides

Read both files in the project before writing anything. Their rules are specific and the outline must follow them:

- `framework/docs/COURSE_OUTLINE_GUIDE.md` explains each section, what to leave out, interaction specs, and a quality checklist.
- `framework/docs/COURSE_OUTLINE_TEMPLATE.md` is the structure to copy.

Use `coursecode_interaction_catalog` and `coursecode_component_catalog` to see what the framework can actually build, so the outline only asks for supported interactions and components.

## 3. Write the outline

Copy the template to `course/COURSE_OUTLINE.md` and fill it in.

- Keep it a design document: content, structure, interactions, engagement requirements, objectives, scoring. No code and no config syntax.
- Base content on the references. Do not invent facts, statistics, policies, or procedures. Mark gaps as questions for the author.
- Choose interactions that make learners apply the content (scenarios, sorting, sequencing), not only recall it.
- Run the guide's quality checklist before showing the outline.

## 4. Get approval

Summarize the outline for the author: module list, slide count, assessments, estimated duration, and any open questions. Ask them to review `course/COURSE_OUTLINE.md` and request changes.

Stop here until they approve it. Once approved, use the `build-slides` skill.
