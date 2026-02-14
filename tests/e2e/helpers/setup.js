/**
 * E2E Test Setup — Shared browser lifecycle per test file
 * 
 * The server is managed by global-setup.js. Each test file only needs
 * to launch a browser and load the course.
 */

import puppeteer from 'puppeteer-core';
import fs from 'fs';

export const CHROME_PATH = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
export const PORT = parseInt(process.env.E2E_PORT || '4199');
export const URL = `http://localhost:${PORT}`;

/**
 * Launch headless Chrome.
 */
export async function launchBrowser() {
    if (!fs.existsSync(CHROME_PATH)) {
        throw new Error(`Chrome not found at ${CHROME_PATH}. Set CHROME_PATH to run E2E tests.`);
    }

    return puppeteer.launch({
        executablePath: CHROME_PATH,
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
}

/**
 * Create a new page and load the course. Returns { page, frame }.
 * Waits for the course iframe to load and the Automation API to be ready.
 */
export async function loadCourse(browser) {
    if (!browser) throw new Error('Browser not available');

    const page = await browser.newPage();
    await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 15000 });

    const { waitForReady } = await import('./automation.js');
    const frame = await waitForReady(page);

    return { page, frame };
}
