/**
 * Scaffold commands — create, clean, and generate course files
 */

import fs from 'fs';
import path from 'path';

/**
 * Minimal course-config.js content for blank projects
 */
const MINIMAL_CONFIG = `export const courseConfig = {
    metadata: {
        title: 'Course Title',
        description: 'Course description',
        version: '1.0.0',
        language: 'en'
    },
    layout: 'article',
    structure: [
        {
            type: 'slide',
            id: 'intro',
            component: '@slides/intro.js',
            title: 'Introduction',
            engagement: { required: false }
        }
    ],
    navigation: {
        sidebar: { enabled: true }
    },
    environment: {
        automation: { enabled: true, exposeCorrectAnswers: true }
    }
};
`;

/**
 * Minimal slide template
 */
function slideTemplate(id) {
    const title = id.replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    return `export const slide = {
    render(root, context) {
        const container = document.createElement('div');
        container.innerHTML = \`
            <h1>${title}</h1>
            <p>Content goes here.</p>
        \`;
        return container;
    }
};
`;
}

/**
 * Minimal assessment template
 */
function assessmentTemplate(id) {
    return `const { AssessmentManager, createMultipleChoiceQuestion } = CourseCode;

export const config = {
    id: '${id}',
    assessmentObjective: null,
    settings: {
        passingScore: 80,
        randomizeQuestions: false,
        allowUnansweredSubmission: true
    }
};

const questions = [
    createMultipleChoiceQuestion({
        id: '${id}-q1',
        prompt: 'Question text?',
        choices: [
            { value: 'a', text: 'Option A' },
            { value: 'b', text: 'Option B' },
            { value: 'c', text: 'Option C' }
        ],
        correctAnswer: 'a',
        controlled: true
    })
];

export const slide = {
    render(root) {
        const assessment = AssessmentManager.createAssessment(config, questions);
        return assessment.render(root);
    }
};
`;
}

/**
 * Remove all example-* files and reset config to minimal starter.
 * Looks for course/ directory relative to cwd or a provided base path.
 */
export function clean(options = {}) {
    const basePath = options.basePath || process.cwd();
    const coursePath = path.join(basePath, 'course');

    if (!fs.existsSync(coursePath)) {
        console.error('\n❌ No course/ directory found. Are you in a CourseCode project?\n');
        process.exit(1);
    }

    let removed = 0;

    // Remove example slides
    const slidesDir = path.join(coursePath, 'slides');
    if (fs.existsSync(slidesDir)) {
        for (const file of fs.readdirSync(slidesDir)) {
            if (file.startsWith('example-')) {
                fs.unlinkSync(path.join(slidesDir, file));
                removed++;
            }
        }
    }

    // Remove example audio
    const audioDir = path.join(coursePath, 'assets', 'audio');
    if (fs.existsSync(audioDir)) {
        for (const file of fs.readdirSync(audioDir)) {
            if (file.startsWith('example-')) {
                fs.unlinkSync(path.join(audioDir, file));
                removed++;
            }
        }
    }

    // Rewrite course-config.js to minimal starter
    const configPath = path.join(coursePath, 'course-config.js');
    if (fs.existsSync(configPath)) {
        fs.writeFileSync(configPath, MINIMAL_CONFIG);
    }

    // Create the intro slide if it doesn't exist
    const introPath = path.join(slidesDir, 'intro.js');
    if (!fs.existsSync(introPath)) {
        fs.mkdirSync(slidesDir, { recursive: true });
        fs.writeFileSync(introPath, slideTemplate('intro'));
    }

    console.log(`\n✅ Cleaned project — removed ${removed} example file${removed !== 1 ? 's' : ''}, reset course-config.js\n`);
}

/**
 * Create a new slide file.
 */
export function newSlide(id) {
    const slidePath = path.join(process.cwd(), 'course', 'slides', `${id}.js`);

    if (fs.existsSync(slidePath)) {
        console.error(`\n❌ Slide file already exists: course/slides/${id}.js\n`);
        process.exit(1);
    }

    fs.mkdirSync(path.dirname(slidePath), { recursive: true });
    fs.writeFileSync(slidePath, slideTemplate(id));
    console.log(`\n✅ Created slide: course/slides/${id}.js\n`);
}

/**
 * Create a new assessment file.
 */
export function newAssessment(id) {
    const assessmentPath = path.join(process.cwd(), 'course', 'slides', `${id}.js`);

    if (fs.existsSync(assessmentPath)) {
        console.error(`\n❌ File already exists: course/slides/${id}.js\n`);
        process.exit(1);
    }

    fs.mkdirSync(path.dirname(assessmentPath), { recursive: true });
    fs.writeFileSync(assessmentPath, assessmentTemplate(id));
    console.log(`\n✅ Created assessment: course/slides/${id}.js\n`);
}

/**
 * Create a new course-config.js file.
 */
export function newConfig() {
    const configPath = path.join(process.cwd(), 'course', 'course-config.js');

    if (fs.existsSync(configPath)) {
        console.error('\n❌ course/course-config.js already exists. Use `coursecode clean` to reset it.\n');
        process.exit(1);
    }

    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    fs.writeFileSync(configPath, MINIMAL_CONFIG);
    console.log('\n✅ Created course/course-config.js\n');
}
