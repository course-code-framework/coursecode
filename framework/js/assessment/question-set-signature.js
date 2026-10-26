/**
 * @file question-set-signature.js
 * @description Compact fingerprint of an assessment's question order.
 *
 * Non-randomized assessments key in-progress responses by question index and
 * do not persist their question order (that would cost suspend_data bytes per
 * question). Instead the session stores this short signature (a 32-bit FNV-1a
 * hash, at most 7 base-36 characters) of the ordered question ids and types.
 * On resume a different signature means the questions were inserted, removed,
 * reordered or retyped by a course update, so index-keyed responses can no
 * longer be trusted to belong to the question at that index.
 */

const FNV_OFFSET_BASIS = 0x811c9dc5;
const FNV_PRIME = 0x01000193;
const ENTRY_SEPARATOR = 0x1e; // ASCII record separator: never part of an id or type

function _feed(hash, text) {
    let h = hash;
    for (let i = 0; i < text.length; i++) {
        h ^= text.charCodeAt(i);
        h = Math.imul(h, FNV_PRIME);
    }
    return h;
}

function _entry(question) {
    return `${question?.id ?? ''}\u001f${question?.type ?? ''}`;
}

function _encode(hash) {
    return (hash >>> 0).toString(36);
}

/**
 * Signatures of every leading slice of the question list:
 * result[k] is the signature of questions[0..k] (k + 1 questions).
 * The last entry is the signature of the whole list.
 * @param {Array<{id?: string, type?: string}>} questions
 * @returns {string[]}
 */
export function computeQuestionSetPrefixSignatures(questions = []) {
    const signatures = [];
    let hash = FNV_OFFSET_BASIS;
    questions.forEach((question, index) => {
        if (index > 0) {
            hash ^= ENTRY_SEPARATOR;
            hash = Math.imul(hash, FNV_PRIME);
        }
        hash = _feed(hash, _entry(question));
        signatures.push(_encode(hash));
    });
    return signatures;
}

/**
 * Signature of the ordered question list.
 * @param {Array<{id?: string, type?: string}>} questions
 * @returns {string}
 */
export function computeQuestionSetSignature(questions = []) {
    const prefixes = computeQuestionSetPrefixSignatures(questions);
    return prefixes.length > 0 ? prefixes[prefixes.length - 1] : _encode(FNV_OFFSET_BASIS);
}
