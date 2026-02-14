import interactionManager from './interaction-manager.js';
import { logger } from '../utilities/logger.js';
import stateManager from '../state/index.js';
import { generateScormTimestamp } from '../validation/scorm-validators.js';

/**
 * @typedef {object} Comment
 * @property {string} text - The content of the comment.
 * @property {string} location - The slide or location where the comment was made.
 * @property {string} timestamp - The ISO 8601 timestamp of when the comment was created.
 */

const DOMAIN_KEY = 'comments';

class CommentManager {
    /**
     * @type {Comment[]}
     */
    #comments;

    constructor() {
        this.#comments = [];
    }

    /**
     * Initializes the manager by hydrating comments from domain state.
     * This must be called after the StateManager is initialized.
     */
    initialize() {
        this.#comments = stateManager.getDomainState(DOMAIN_KEY) || [];
        logger.debug('CommentManager initialized');
    }

    /**
     * Adds a new comment and persists it to the LMS.
     * @param {string} text - The content of the comment.
     * @param {string} [location=''] - The slide ID or location identifier.
     * @throws {Error} If text is empty or not a valid string
     */
    addComment(text, location = '') {
        if (!text || typeof text !== 'string' || text.trim() === '') {
            throw new Error('CommentManager: Comment text cannot be empty.');
        }

        const newComment = {
            text,
            location,
            timestamp: generateScormTimestamp(),
        };

        // Update in-memory state
        this.#comments.push(newComment);

        // Persist via domain state (stored in suspend_data)
        stateManager.setDomainState(DOMAIN_KEY, this.#comments);

        logger.debug('Comment added and persisted:', newComment);
    }

    /**
     * Adds a course rating as a likert interaction.
     * @param {number | string} rating - The rating value provided by the user.
     */
    addRating(rating) {
        if (rating === null || rating === undefined) {
            return;
        }

        interactionManager.addLikertInteraction({
            id: 'course-rating',
            response: String(rating),
            description: 'Overall course satisfaction rating on a 5-star scale.'
        });

        logger.debug('Rating added and persisted to LMS:', rating);
    }

    /**
     * Retrieves all comments from the in-memory store.
     * @returns {Comment[]} An array of all comments.
     */
    getComments() {
        return [...this.#comments];
    }
}

const commentManager = new CommentManager();
export default commentManager;
