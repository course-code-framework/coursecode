---
name: publish
description: Package a CourseCode course for an LMS (SCORM 1.2, SCORM 2004, cmi5, LTI 1.3), deploy it to CourseCode Cloud, or export a shareable preview or single HTML file. Use when someone wants to export, build, package, upload, deploy, publish, or share a finished course.
---

# Publish a course

## 1. Preflight

- `coursecode_lint` must report zero errors. Fix them first.
- Recommend the `review` skill if the course has not been reviewed.
- Check `course/course-config.js` for the course title, description, and version. The version appears in the package file name.

## 2. Ask where the course is going

| Destination | What to run |
|---|---|
| An LMS (upload a ZIP) | `npx coursecode build --format <format>` |
| CourseCode Cloud (hosted, any LMS format on demand, preview links) | `npx coursecode deploy` |
| Stakeholder review without an LMS | Cloud preview link, or `npx coursecode preview --export` |
| One file to email or open offline | `npx coursecode export html` |

### LMS formats

Ask which LMS they use or which standard it supports. If they do not know:

- `scorm1.2`: works in almost every LMS. The safe default for older or unknown systems.
- `scorm2004`: richer tracking and sequencing; most corporate LMSs.
- `cmi5`: modern xAPI-based standard; requires LMS support.
- `lti`: LTI 1.3 launch from a server-backed platform. Needs extra setup; see `framework/docs/USER_GUIDE.md`.

`build` lints, builds into `dist/`, and writes the ZIP to the project root, named `<course>_v<version>_<format>.zip`. Report the file name and tell the author to upload it as a new course or package in their LMS.

### CourseCode Cloud

1. Login is once per machine: `npx coursecode login`. It prints a URL and a short code. Run it in the background, give the author the URL and code, and wait until it reports success. Never ask for or handle their password.
2. Deploy:
   - `npx coursecode deploy` uploads and follows the course's deploy-mode setting for production.
   - `npx coursecode deploy --preview` updates only the review link; add `--password <value>` to protect it.
3. Share the dashboard and preview links the command prints. Cloud generates any LMS format on demand, so no format choice is needed.

Courses linked to a GitHub repo in Cloud deploy production through `git push`; the CLI only allows `--preview` for them.

### Static preview or single file

- `npx coursecode preview --export` writes a static preview to `./course-preview` for any web host. Add `--password <value>` for a soft password gate (not real security).
- `npx coursecode export html` writes one self-contained HTML file named after the course. Progress is not reported to an LMS.

## 3. Wrap up

Tell the author what was produced, where it is, and how to test it (upload to their LMS test environment, or open the preview link). Suggest committing the project to git so this version can be rebuilt later.
