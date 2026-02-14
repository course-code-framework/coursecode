/**
 * course-config.js — Centralized course configuration for CourseCode
 * Single source of truth: all metadata, structure, objectives, and feature configuration
 *
 * SCHEMA REFERENCE (for AI agents authoring courses)
 * 
 * LAYOUT: 'article' (default) | 'traditional' | 'focused' | 'presentation' | 'canvas'
 * 
 * SCORING (null = disabled):
 *   { type: 'average'|'weighted'|'maximum'|'custom', sources: [...], calculate?: fn }
 * 
 * OBJECTIVES (auto-managed by criteria OR manual via assessment.assessmentObjective):
 *   { id: 'obj-X', description: 'text', criteria: {type, ...fields}, initialCompletion: 'incomplete'|'completed', initialSuccess: 'unknown'|'passed'|'failed' }
 *   Criteria types: slideVisited|allSlidesVisited|timeOnSlide|flag|allFlags
 * 
 * AUDIO (slide-level narration - playback settings only):
 *   { src: 'audio/narration.mp3', autoplay: false, completionThreshold: 0.95 }
 *   - src: path relative to course/assets/ (or full path/URL)
 *   - autoplay: whether to start playing when slide loads (default: false)
 *   - completionThreshold: percentage (0-1) of audio that must be heard for completion (default: 0.95)
 *   To gate navigation on audio, use engagement requirement: { type: 'slideAudioComplete' }
 * 
 * NARRATION SOURCE TYPES:
 *   Slide export:      { src: '@slides/intro.js' }        → course/assets/audio/intro.mp3
 *   Modal/Tab audio:   { src: '@slides/intro.js#key' }    → course/assets/audio/intro--key.mp3
 *   Direct file:       { src: 'audio/custom.mp3' }        → course/assets/audio/custom.mp3
 * 
 * MULTI-KEY NARRATION (in slide file):
 *   export const narration = {
 *     slide: `Main slide narration...`,
 *     'about-modal': `Narration when modal opens...`,
 *     'details-tab': `Narration when tab is selected...`,
 *     voice_id: 'optional-voice-id'  // Optional: voice settings apply to all
 *   };
 *   Generates: intro.mp3, intro--about-modal.mp3, intro--details-tab.mp3
 * 
 * TAB AUDIO (per-panel audio on tabs):
 *   <div class="tabs-panel" data-audio-src="audio/tab1.mp3" data-audio-required="true" data-audio-threshold="0.9">
 *   - Audio loads when tab is activated
 *   - If required, tab isn't marked "viewed" until audio threshold is reached
 * 
 * MODAL AUDIO (audio triggered by modal):
 *   <button data-modal-trigger="..." data-audio-src="audio/modal.mp3" data-audio-required="true" data-audio-threshold="0.9">
 *   OR programmatically: Modal.show({ audio: { src, required, completionThreshold } })
 * 
 * ENGAGEMENT (required: false = no tracking):
 *   requirements: [{ type: viewAllTabs|viewAllPanels|viewAllFlipCards|viewAllHotspots|interactionComplete|allInteractionsComplete|scrollDepth|timeOnSlide|flag|allFlags|slideAudioComplete|audioComplete|modalAudioComplete, message?: str, ...props }]
 *   Audio requirement types:
 *     - slideAudioComplete: slide-level audio (no props needed)
 *     - audioComplete: standalone audio player (requires audioId)
 *     - modalAudioComplete: modal audio (requires modalId)
 *   Engagement requirement properties: interactionId, label (for interactionComplete), percentage (scrollDepth), minSeconds (timeOnSlide), key|flags (flag/allFlags), equals (flag matching)
 *   Flip card tracking: Each flip card must have data-flip-card-id attribute for viewAllFlipCards to work
 * 
 * NAVIGATION.GATING.CONDITIONS:
 *   objectiveStatus: {objectiveId, completion_status?|success_status?} | assessmentStatus: {assessmentId, requires: 'passed'|'failed'} | timeOnSlide: {slideId, minSeconds} | flag: {key, equals?} | custom: {key, equals?}
 * 
 * WINDOW AUTO-RESIZE (environment.autoResizeWindow):
 *   { width: 1024, height: 768 } - Resize popup window to these dimensions on load
 *   true - Use default size (1024x768)
 *   false - Disable auto-resize entirely
 *   Note: Only works for popup windows. Browsers block resize for main windows.
 * 
 * SUPPORT (error modal contact info):
 *   { email: 'support@example.com', phone?: '+1-800-555-0100' }
 *   Displayed in error modals when users encounter issues that may affect progress.
 * 
 * ERROR REPORTING (environment.errorReporting):
 *   { endpoint: 'https://your-worker.workers.dev/errors', includeContext?: true, enableUserReports?: true }
 *   Sends framework errors to a webhook for email alerts. Disabled if endpoint is missing.
 *   enableUserReports adds "Report Issue" button to settings menu (default: true when endpoint set).
 *   Use with Cloudflare Worker to keep API keys server-side.
 *   CourseCode Cloud launches override manual endpoint config via injected <meta name="cc-*"> tags
 *   (zero-config cloud wiring). Treat this as a self-hosted/manual fallback.
 *
 * LMS COMPATIBILITY PROFILE (environment.lmsCompatibilityMode):
 *   'auto' (default): choose profile by format (strict-scorm12 / conservative-scorm2004 / modern-http)
 *   'balanced': generic safe defaults
 *   'strict-scorm12': conservative timeouts for legacy SCORM 1.2 LMS behavior
 *   'conservative-scorm2004': conservative timeouts for SCORM 2004 LMS behavior
 *   'modern-http': tuned for cmi5/LTI HTTP-based flows
 * 
 * SLIDE: { type: 'slide', id, component, title, menu, engagement, navigation, audio? }
 * ASSESSMENT: { type: 'assessment', id, component, menu, engagement, navigation } + assessmentObjective in component
 * SECTION: { type: 'section', id, menu, children: [] }
 * 
 * navigation.controls: { exitTarget?: slideId, nextTarget?: slideId, previousTarget?: slideId }
 * navigation.sequence: { includeByDefault: bool, includeWhen: condition?, insert: {position: 'before'|'after', slideId} }
 * navigation.breadcrumbs: { enabled: bool }  // Show breadcrumb path in slide area (hidden when sidebar open)
 * menu: { label: str, icon?: emoji, hidden?: bool, defaultExpanded?: bool }
 * 
 * EXTERNAL HOSTING (CDN deployment with proxy packages):
 *   format: 'scorm1.2-proxy' | 'scorm2004-proxy' | 'cmi5-remote'
 *   externalUrl: 'https://cdn.example.com/courses/my-course'  // Where course is hosted
 *   accessControl: {
 *     clients: {
 *       'acme-corp': { token: 'generated-token-here' },
 *       'globex': { token: 'another-token-here' }
 *     }
 *   }
 *   Generate tokens: coursecode token --add <clientId>
 *   Build output: One package per client (e.g., acme-corp_proxy.zip)
 *
 * CLOUD DEPLOYMENT:
 *   When using CourseCode Cloud, the format setting is ignored. The cloud generates
 *   any LMS format on demand from the universal build — no rebuild needed.
 *   Authors deploying to the cloud do not need to set a format here.
 * 
 * NAVIGATION.HEADER:
 *   { enabled: bool }  // Show/hide course header bar. Canvas layout hides by default.
 * 
 * NAVIGATION.SIDEBAR:
 *   { enabled: bool, position: 'left'|'right', width: CSS, collapsible: bool, defaultCollapsed: bool, showProgress: bool }
 * 
 * NAVIGATION.FOOTER:
 *   { showButtons: bool }  // Show/hide prev/next nav buttons. Traditional layout always shows.
 * 
 * NAVIGATION.DOCUMENT_GALLERY:
 *   { enabled: bool, directory: 'assets/docs', label: str, icon: iconName, allowDownloads: bool, fileTypes: ['pdf','md',...] }
 * 
 * SLIDE_DEFAULTS:
 *   { contentWidth: 'narrow'|'medium'|'wide'|'full' }  // Auto-wraps slide content; per-slide override via data-content-width attr
 * 
 * ENVIRONMENT.DEVELOPMENT:
 *   { disableGating: bool, showSlideIndicator: bool }  // disableGating bypasses all navigation gating during dev
 */

export const courseConfig = {
    metadata: {
        title: 'CourseCode',
        description: 'CourseCode template for course development',
        version: '2.0.0',
        author: 'Seth Vincent',
        language: 'en'
    },
    layout: 'article',
    branding: {
        logo: './course/assets/images/logo.svg',
        logoAlt: 'CourseCode Logo',
        companyName: 'CourseCode',
        courseTitle: 'CourseCode'
    },
    support: {
        email: 'support@example.com'
    },
    scoring: {
        type: 'average',
        sources: [
            'assessment:example-final-exam'
        ]
    },
    objectives: [
        {
            id: 'visited-finishing',
            description: 'View the finishing slide',
            initialCompletion: 'incomplete',
            initialSuccess: 'unknown',
            criteria: {
                type: 'slideVisited',
                slideId: 'example-finishing'
            }
        },
        {
            id: 'core-content',
            description: 'Visit all core content slides',
            initialCompletion: 'incomplete',
            initialSuccess: 'unknown',
            criteria: {
                type: 'allSlidesVisited',
                slideIds: [
                    'example-interactions-showcase',
                    'example-ui-showcase'
                ]
            }
        },
        {
            id: 'thorough-review',
            description: 'Spend at least 2 minutes reviewing content',
            initialCompletion: 'incomplete',
            initialSuccess: 'unknown',
            criteria: {
                type: 'timeOnSlide',
                slideId: 'example-interactions-showcase',
                minSeconds: 120
            }
        },
        {
            id: 'custom-mastery',
            description: 'Demonstrate mastery (custom logic)',
            initialCompletion: 'incomplete',
            initialSuccess: 'unknown'
        },
        {
            id: 'example-intro-completed-flag',
            description: 'Complete introduction (flag-based)',
            initialCompletion: 'incomplete',
            initialSuccess: 'unknown',
            criteria: {
                type: 'flag',
                key: 'example-intro-complete',
                equals: true
            }
        },
        {
            id: 'all-sections-unlocked',
            description: 'Unlock all course sections',
            initialCompletion: 'incomplete',
            initialSuccess: 'unknown',
            criteria: {
                type: 'allFlags',
                flags: [
                    'section-1-unlocked',
                    'section-2-unlocked',
                    {
                        key: 'section-3-unlocked',
                        equals: true
                    }
                ]
            }
        }
    ],
    structure: [
        {
            type: 'section',
            id: 'example-getting-started',
            menu: {
                label: 'Getting Started',
                icon: 'rocket',
                defaultExpanded: true
            },
            children: [
                {
                    type: 'slide',
                    id: 'example-welcome',
                    component: '@slides/example-welcome.js',
                    title: 'Welcome',
                    menu: {
                        label: 'Welcome',
                        icon: 'home'
                    },
                    engagement: {
                        required: false
                    },
                    navigation: {
                        sequential: true,
                        controls: {
                            showPrevious: false,
                            showNext: true
                        }
                    }
                },
                {
                    type: 'slide',
                    id: 'example-workflow',
                    component: '@slides/example-workflow.js',
                    title: 'The AI Workflow',
                    menu: {
                        label: 'AI Workflow',
                        icon: 'zap'
                    },
                    engagement: {
                        required: false
                    },
                    navigation: {
                        sequential: true
                    }
                },
                {
                    type: 'slide',
                    id: 'example-preview-tour',
                    component: '@slides/example-preview-tour.js',
                    title: 'Using the Preview',
                    menu: {
                        label: 'Preview Tour',
                        icon: 'eye'
                    },
                    engagement: {
                        required: false
                    },
                    navigation: {
                        sequential: true
                    }
                }
            ]
        },
        {
            type: 'section',
            id: 'example-building-courses',
            menu: {
                label: 'Building Courses',
                icon: 'folder',
                defaultExpanded: true
            },
            children: [
                {
                    type: 'slide',
                    id: 'example-course-structure',
                    component: '@slides/example-course-structure.js',
                    title: 'Your Course Files',
                    menu: {
                        label: 'Course Files',
                        icon: 'folder-open'
                    },
                    engagement: {
                        required: false
                    },
                    navigation: {
                        sequential: true
                    }
                },
                {
                    type: 'slide',
                    id: 'example-ui-showcase',
                    component: '@slides/example-ui-showcase.js',
                    title: 'UI Components Showcase',
                    menu: {
                        label: 'UI Components',
                        icon: 'layout'
                    },
                    engagement: {
                        required: false
                    },
                    navigation: {
                        sequential: true
                    }
                },
                {
                    type: 'slide',
                    id: 'example-interactions-showcase',
                    component: '@slides/example-interactions-showcase.js',
                    title: 'Interactions Showcase',
                    menu: {
                        label: 'Interactions',
                        icon: 'mouse-pointer'
                    },
                    engagement: {
                        required: true,
                        mode: 'all',
                        requirements: [
                            {
                                type: 'viewAllTabs'
                            },
                            {
                                type: 'interactionComplete',
                                interactionId: 'system-architecture-dd'
                            },
                            {
                                type: 'interactionComplete',
                                interactionId: 'lms-standards-matching'
                            },
                            {
                                type: 'interactionComplete',
                                interactionId: 'lms-standards-text'
                            },
                            {
                                type: 'interactionComplete',
                                interactionId: 'requirements-spec-fillin'
                            },
                            {
                                type: 'interactionComplete',
                                interactionId: 'efficiency-calculation'
                            },
                            {
                                type: 'interactionComplete',
                                interactionId: 'framework-components-qa'
                            }
                        ],
                        showIndicator: true
                    },
                    navigation: {
                        sequential: true
                    }
                },
                {
                    type: 'slide',
                    id: 'example-finishing',
                    component: '@slides/example-finishing.js',
                    title: 'Finishing Your Course',
                    menu: {
                        label: 'Finishing',
                        icon: 'flag'
                    },
                    engagement: {
                        required: false
                    },
                    navigation: {
                        sequential: true
                    }
                }
            ]
        },
        {
            type: 'assessment',
            id: 'example-final-exam',
            component: '@slides/example-final-exam.js',
            title: 'Knowledge Check',
            menu: {
                label: 'Knowledge Check',
                icon: 'clipboard-check'
            },
            engagement: {
                required: false
            },
            navigation: {
                sequential: true,
                gating: {
                    mode: 'all',
                    message: 'Complete all slides before starting the knowledge check.',
                    conditions: [
                        {
                            type: 'objectiveStatus',
                            objectiveId: 'visited-finishing',
                            completion_status: 'completed'
                        }
                    ]
                }
            }
        },
        {
            type: 'slide',
            id: 'example-remedial',
            component: '@slides/example-remedial.js',
            title: 'Review Content',
            menu: {
                hidden: true
            },
            engagement: {
                required: false
            },
            navigation: {
                controls: {
                    exitTarget: 'example-final-exam'
                },
                gating: {
                    mode: 'any',
                    message: 'Review content is available after an unsuccessful assessment attempt.',
                    conditions: [
                        {
                            type: 'assessmentStatus',
                            assessmentId: 'example-final-exam',
                            requires: 'failed'
                        }
                    ]
                }
            }
        },
        {
            type: 'slide',
            id: 'example-summary',
            component: '@slides/example-summary.js',
            title: 'Course Complete',
            menu: {
                label: 'Complete',
                icon: 'award'
            },
            engagement: {
                required: false
            },
            navigation: {
                sequential: true,
                gating: {
                    mode: 'all',
                    message: 'Complete the knowledge check to see the summary.',
                    conditions: [
                        {
                            type: 'assessmentStatus',
                            assessmentId: 'example-final-exam',
                            requires: 'passed'
                        }
                    ]
                }
            }
        }
    ],
    navigation: {
        header: {
            enabled: true
        },
        footer: {
            showButtons: true
        },
        sidebar: {
            enabled: true,
            position: 'left',
            width: '280px',
            collapsible: true,
            defaultCollapsed: true,
            showProgress: true
        },
        breadcrumbs: {
            enabled: true
        },
        documentGallery: {
            enabled: true,
            directory: 'assets/docs',
            label: 'Resources',
            icon: 'file-text',
            allowDownloads: true,
            fileTypes: [
                'pdf',
                'md',
                'jpg',
                'png'
            ]
        }
    },
    features: {
        accessibility: {
            darkMode: true,
            fontSize: true,
            highContrast: true,
            reducedMotion: true,
            keyboardShortcuts: true
        },
        security: false,
        offline: false,
        analytics: true,
        feedback: true
    },
    completion: {
        promptForComments: true,
        promptForRating: true
    },
    slideDefaults: {
        contentWidth: 'medium'
    },
    environment: {
        lmsCompatibilityMode: 'auto',
        autoResizeWindow: false,
        disableBeforeUnloadGuard: true,
        development: {
            disableGating: false,
            showSlideIndicator: true
        },
        automation: {
            enabled: true,
            disableBeforeUnloadGuard: true,
            exposeCorrectAnswers: true
        }
    }
};
