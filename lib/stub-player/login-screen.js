/**
 * stub-player/login-screen.js - Login screen component
 * 
 * Generates the password-gate login screen HTML.
 *
 * The password is stored only as a salted PBKDF2-SHA-256 hash (random salt
 * per export) so the plaintext is not in the page and precomputed tables do
 * not apply. This is a soft access gate, NOT a security boundary: the course
 * files are deployed alongside the page and can be fetched directly.
 */

/** Must match PASSWORD_HASH_ITERATIONS in lib/preview-export.js */
const PASSWORD_HASH_ITERATIONS = 100000;

/**
 * Hash a string using SHA-256 (Web Crypto API)
 * @param {string} message - String to hash
 * @returns {Promise<string>} - Hex-encoded hash
 */
async function sha256(message) {
    const msgBuffer = new TextEncoder().encode(message);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    return toHex(hashBuffer);
}

function toHex(buffer) {
    return Array.from(new Uint8Array(buffer)).map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Derive the salted password hash (PBKDF2-SHA-256, 256-bit, hex).
 * @param {string} password
 * @param {string} salt - Hex salt string (used as UTF-8 bytes)
 * @returns {Promise<string>}
 */
export async function derivePasswordHash(password, salt) {
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits(
        { name: 'PBKDF2', hash: 'SHA-256', salt: encoder.encode(salt), iterations: PASSWORD_HASH_ITERATIONS },
        key,
        256
    );
    return toHex(bits);
}

/**
 * Generate login screen HTML
 * @param {Object} options
 * @param {string} options.title - Course title to display
 */
export function generateLoginScreen({ title }) {
    return `
    <div id="stub-player-login-screen" class="visible">
        <div id="login-box">
            <h1>${title}</h1>
            <p class="subtitle">Preview Access</p>
            <form id="stub-player-login-form" onsubmit="return false;">
                <input type="text" id="login-username" autocomplete="username" value="preview" aria-hidden="true" style="display:none;">
                <input type="password" id="stub-player-login-password" placeholder="Enter password" autocomplete="current-password" autofocus>
                <button type="submit" id="login-submit">Access Preview</button>
            </form>
            <div id="stub-player-login-error"></div>
        </div>
    </div>
    `;
}

/**
 * Initialize Client-Side Handlers
 */
export function createLoginHandlers({ onLogin }) {
    const loginScreen = document.getElementById('stub-player-login-screen');
    const form = document.getElementById('stub-player-login-form');
    const passwordInput = document.getElementById('stub-player-login-password');
    const errorMsg = document.getElementById('stub-player-login-error');

    // If no login screen exists (no password configured), trigger login immediately
    if (!loginScreen) {
        onLogin();
        return;
    }

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const input = passwordInput.value;
        const config = window.STUB_CONFIG || {};

        // Hash user input and compare to stored hash. Exports without a salt
        // predate salted hashing and use plain SHA-256.
        const inputHash = config.passwordSalt
            ? await derivePasswordHash(input, config.passwordSalt)
            : await sha256(input);

        if (inputHash === config.passwordHash) {
            loginScreen.classList.remove('visible');
            onLogin();
        } else {
            errorMsg.textContent = 'Incorrect password';
            passwordInput.value = '';
            passwordInput.focus();
        }
    });
}
