/**
 * Hotspot Coordinate Helper Utility
 * Development tool to help authors determine hotspot coordinates
 *
 * Usage:
 * import { enableHotspotHelper } from '../../../framework/js/utilities/hotspot-helper.js';
 *
 * // In your slide render function:
 * const img = document.querySelector('img');
 * enableHotspotHelper(img);
 *
 * // Click on the image to see coordinates logged to console
 */

import { logger } from './logger.js';

/**
 * Enable coordinate helper on an image element
 * Logs pixel and percentage coordinates on click
 * @param {HTMLImageElement} imageElement - Image element to attach helper to
 * @param {Object} options - Configuration options
 * @param {boolean} options.showOverlay - Show visual overlay (default: true)
 * @param {boolean} options.showPixels - Log pixel coordinates (default: true)
 * @param {boolean} options.showPercent - Log percentage coordinates (default: true)
 * @param {string} options.outputFormat - 'json' or 'code' (default: 'both')
 */
export function enableHotspotHelper(imageElement, options = {}) {
  const {
    showOverlay = true,
    showPixels = true,
    showPercent = true,
    outputFormat = 'both'
  } = options;

  if (!imageElement) {
    logger.error('[HotspotHelper] No image element provided');
    return;
  }

  // Wait for image to load
  const initialize = () => {
    const container = imageElement.parentElement;
    let overlay = null;

    if (showOverlay) {
      // Create visual overlay
      overlay = document.createElement('div');
      overlay.style.cssText = `
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        pointer-events: none;
        z-index: 9999;
      `;
      container.style.position = 'relative';
      container.appendChild(overlay);
    }

    const markers = [];

    imageElement.addEventListener('click', (e) => {
      const rect = imageElement.getBoundingClientRect();
      const naturalWidth = imageElement.naturalWidth || imageElement.width;
      const naturalHeight = imageElement.naturalHeight || imageElement.height;

      const clickX = e.clientX - rect.left;
      const clickY = e.clientY - rect.top;

      const pixelX = Math.round((clickX / rect.width) * naturalWidth);
      const pixelY = Math.round((clickY / rect.height) * naturalHeight);

      const percentX = ((clickX / rect.width) * 100).toFixed(2);
      const percentY = ((clickY / rect.height) * 100).toFixed(2);

      logger.debug('\n=== Hotspot Coordinate Helper ===');
      logger.debug(`Image: ${naturalWidth}x${naturalHeight}px`);

      if (showPixels) {
        logger.debug('\nPixel coordinates:');
        logger.debug(`  x: ${pixelX}, y: ${pixelY}`);
      }

      if (showPercent) {
        logger.debug('\nPercentage coordinates:');
        logger.debug(`  x: ${percentX}%, y: ${percentY}%`);
      }

      if (outputFormat === 'json' || outputFormat === 'both') {
        logger.debug('\nJSON format (circle):');
        logger.debug(JSON.stringify({
          id: 'hotspot-1',
          shape: 'circle',
          position: { cx: pixelX, cy: pixelY, r: 25 },
          correct: true,
          label: 'Hotspot Label'
        }, null, 2));

        logger.debug('\nJSON format (rectangle):');
        logger.debug(JSON.stringify({
          id: 'hotspot-1',
          shape: 'rectangle',
          position: { x: pixelX, y: pixelY, width: 50, height: 40 },
          correct: true,
          label: 'Hotspot Label'
        }, null, 2));
      }

      if (outputFormat === 'code' || outputFormat === 'both') {
        logger.debug('\nCode snippet (circle):');
        logger.debug(`{
  id: 'hotspot-1',
  shape: 'circle',
  position: { cx: ${pixelX}, cy: ${pixelY}, r: 25 },
  correct: true,
  label: 'Hotspot Label'
}`);

        logger.debug('\nCode snippet (rectangle):');
        logger.debug(`{
  id: 'hotspot-1',
  shape: 'rectangle',
  position: { x: ${pixelX}, y: ${pixelY}, width: 50, height: 40 },
  correct: true,
  label: 'Hotspot Label'
}`);
      }

      // Add visual marker
      if (overlay) {
        const marker = document.createElement('div');
        marker.style.cssText = `
          position: absolute;
          left: ${clickX}px;
          top: ${clickY}px;
          width: 10px;
          height: 10px;
          background: rgba(255, 0, 0, 0.7);
          border: 2px solid white;
          border-radius: 50%;
          transform: translate(-50%, -50%);
          pointer-events: none;
        `;

        const label = document.createElement('div');
        label.style.cssText = `
          position: absolute;
          left: ${clickX + 10}px;
          top: ${clickY - 10}px;
          background: rgba(0, 0, 0, 0.8);
          color: white;
          padding: 2px 6px;
          font-size: 11px;
          border-radius: 3px;
          white-space: nowrap;
          pointer-events: none;
        `;
        label.textContent = `${pixelX}, ${pixelY}`;

        overlay.appendChild(marker);
        overlay.appendChild(label);
        markers.push({ marker, label });
      }

      logger.debug('=================================\n');
    });

    // Add clear button
    if (showOverlay) {
      const clearButton = document.createElement('button');
      clearButton.textContent = 'Clear Markers';
      clearButton.style.cssText = `
        position: absolute;
        top: 10px;
        right: 10px;
        z-index: 10000;
        padding: 5px 10px;
        background: rgba(255, 0, 0, 0.8);
        color: white;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        font-size: 12px;
      `;
      clearButton.addEventListener('click', () => {
        markers.forEach(({ marker, label }) => {
          marker.remove();
          label.remove();
        });
        markers.length = 0;
      });
      container.appendChild(clearButton);
    }

    logger.debug('[HotspotHelper] Enabled on image. Click to see coordinates.');
  };

  if (imageElement.complete) {
    initialize();
  } else {
    imageElement.addEventListener('load', initialize);
  }
}

/**
 * Create an interactive hotspot designer
 * Shows a UI for drawing hotspots on an image
 * @param {HTMLImageElement} imageElement - Image element
 * @param {Function} onSave - Callback when hotspots are saved
 */
export function createHotspotDesigner(imageElement, onSave) {
  if (!imageElement) {
    logger.error('[HotspotDesigner] No image element provided');
    return;
  }

  const container = imageElement.parentElement;
  container.style.position = 'relative';

  const hotspots = [];
  let _currentShape = 'circle';
  const _isDrawing = false;
  const _startPoint = null;

  // Create UI
  const ui = document.createElement('div');
  ui.className = 'absolute p-3';
  ui.style.cssText = `
    top: 10px;
    left: 10px;
    background: white;
    padding: 10px;
    border-radius: 4px;
    box-shadow: 0 2px 10px rgba(0,0,0,0.2);
    z-index: 10000;
  `;

  ui.innerHTML = `
    <div class="mb-2 font-semibold">Hotspot Designer</div>
    <div class="mb-2">
      <label>
        <input type="radio" name="shape" value="circle" checked> Circle
      </label>
      <label class="ml-2">
        <input type="radio" name="shape" value="rectangle"> Rectangle
      </label>
    </div>
    <div class="mb-2">
      <label>
        <input type="checkbox" id="correct-checkbox" checked> Correct Answer
      </label>
    </div>
    <button id="save-hotspots" class="btn btn-success w-full" style="padding: 5px;">
      Save Hotspots
    </button>
    <button id="clear-all" class="btn btn-reset w-full mt-2" style="padding: 5px;">
      Clear All
    </button>
  `;

  container.appendChild(ui);

  // Shape selection
  ui.querySelectorAll('input[name="shape"]').forEach(input => {
    input.addEventListener('change', (e) => {
      currentShape = e.target.value;
    });
  });

  // Save button
  ui.querySelector('#save-hotspots').addEventListener('click', () => {
    if (onSave) {
      onSave(hotspots);
    }
    logger.debug('Hotspots configuration:');
    logger.debug(JSON.stringify(hotspots, null, 2));
  });

  // Clear button
  ui.querySelector('#clear-all').addEventListener('click', () => {
    hotspots.length = 0;
    // Clear visual markers
  });

  logger.debug('[HotspotDesigner] Enabled. Click and drag to draw hotspots.');
}

/**
 * Convert percentage-based config to pixel-based config
 * @param {Object} config - Hotspot config with percentage values
 * @param {number} imageWidth - Image width in pixels
 * @param {number} imageHeight - Image height in pixels
 * @returns {Object} Config with pixel values
 */
export function percentToPixels(config, imageWidth, imageHeight) {
  const converted = { ...config };

  if (config.position) {
    const pos = { ...config.position };

    Object.keys(pos).forEach(key => {
      if (typeof pos[key] === 'string' && pos[key].endsWith('%')) {
        const percent = parseFloat(pos[key]);
        const dimension = key === 'cx' || key === 'x' || key === 'width' ? imageWidth : imageHeight;
        pos[key] = Math.round((percent / 100) * dimension);
      }
    });

    converted.position = pos;
  }

  return converted;
}

/**
 * Convert pixel-based config to percentage-based config
 * @param {Object} config - Hotspot config with pixel values
 * @param {number} imageWidth - Image width in pixels
 * @param {number} imageHeight - Image height in pixels
 * @returns {Object} Config with percentage values
 */
export function pixelsToPercent(config, imageWidth, imageHeight) {
  const converted = { ...config };

  if (config.position) {
    const pos = { ...config.position };

    Object.keys(pos).forEach(key => {
      if (typeof pos[key] === 'number') {
        const dimension = key === 'cx' || key === 'x' || key === 'width' ? imageWidth : imageHeight;
        const percent = ((pos[key] / dimension) * 100).toFixed(2);
        pos[key] = `${percent}%`;
      }
    });

    converted.position = pos;
  }

  return converted;
}
