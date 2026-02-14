/**
 * @file form-validator.js
 * @description Handles declarative form validation and submission feedback.
 */

export const schema = {
    type: 'form-validator',
    description: 'Declarative form validation with feedback',
    example: `<form data-component="form-validator" data-success-message="Thanks for your feedback!" data-error-message="Please complete all fields." style="display: flex; flex-direction: column; gap: 12px; max-width: 320px;">
  <label style="font-weight: 500; font-size: 0.875rem;">Name
    <input type="text" required placeholder="Your name" style="display: block; width: 100%; margin-top: 4px; padding: 6px 10px; border: 1px solid #cbd5e1; border-radius: 4px;">
  </label>
  <label style="font-weight: 500; font-size: 0.875rem;">Email
    <input type="email" required placeholder="you@example.com" style="display: block; width: 100%; margin-top: 4px; padding: 6px 10px; border: 1px solid #cbd5e1; border-radius: 4px;">
  </label>
  <button type="submit" class="btn btn-primary">Submit</button>
</form>`,
    properties: {
        successMessage: { type: 'string', dataAttribute: 'data-success-message' },
        errorMessage: { type: 'string', dataAttribute: 'data-error-message' },
        closeModalOnSuccess: { type: 'boolean', dataAttribute: 'data-close-modal-on-success' }
    },
    structure: {
        container: 'form[data-component="form-validator"]',
        children: {}
    }
};

export const metadata = {
    category: 'ui-component',
    cssFile: 'components/forms.css',
    engagementTracking: null,
    emitsEvents: ['form:success', 'form:error']
};

import { showNotification } from './notifications.js';

export function init(form) {
    if (!form || form.tagName !== 'FORM') {
        throw new Error('FormValidator: Element must be a <form> tag.');
    }

    const successMessage = form.dataset.successMessage || 'Form submitted successfully!';
    const errorMessage = form.dataset.errorMessage || 'Please fill in all required fields.';

    const handleSubmit = (event) => {
        event.preventDefault();
        
        if (form.checkValidity()) {
            showNotification(successMessage, 'success');
            form.reset();
            
            // Dispatch success event for other components to listen to
            form.dispatchEvent(new CustomEvent('form:success', { bubbles: true }));

            // Check if we should close a parent modal
            if (form.dataset.closeModalOnSuccess === 'true') {
                const closeBtn = form.closest('.modal')?.querySelector('[data-action="close-modal"]');
                if (closeBtn) closeBtn.click();
            }
        } else {
            showNotification(errorMessage, 'error');
            
            // Dispatch error event
            form.dispatchEvent(new CustomEvent('form:error', { bubbles: true }));
        }
    };

    form.addEventListener('submit', handleSubmit);

    return {
        destroy: () => {
            form.removeEventListener('submit', handleSubmit);
        }
    };
}
