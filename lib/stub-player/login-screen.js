/**
 * stub-player/login-screen.js - Login screen component
 * 
 * Generates the password-protected login screen HTML.
 * Uses SHA-256 hashing so plaintext password is never stored in source.
 */

/**
 * Hash a string using SHA-256 (Web Crypto API)
 * @param {string} message - String to hash
 * @returns {Promise<string>} - Hex-encoded hash
 */
async function sha256(message) {
    const msgBuffer = new TextEncoder().encode(message);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
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

        // Hash user input and compare to stored hash
        const inputHash = await sha256(input);

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
