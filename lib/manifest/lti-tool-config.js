/**
 * @file lti-tool-config.js
 * @description Generates LTI 1.3 tool registration configuration.
 * Produces a JSON file that platform admins use to register the tool.
 * Supports Dynamic Registration (RFC) format.
 */

/**
 * Generates LTI 1.3 tool configuration JSON.
 * @param {Object} config - Course configuration
 * @param {Object} options - Additional options (externalUrl)
 * @returns {string} JSON string of tool configuration
 */
export function generateLtiToolConfig(config, options = {}) {
    const baseUrl = options.externalUrl || config.externalUrl || 'https://your-course-host.example.com';
    const title = config.title || 'CourseCode Course';
    const description = config.description || '';

    const toolConfig = {
        // LTI 1.3 Tool Configuration
        // See: https://www.imsglobal.org/spec/lti-dr/v1p0
        'application_type': 'web',
        'response_types': ['id_token'],
        'grant_types': ['implicit', 'client_credentials'],
        'initiate_login_uri': `${baseUrl}/lti/login`,
        'redirect_uris': [
            `${baseUrl}/index.html`,
            `${baseUrl}/lti/launch`
        ],
        'client_name': title,
        'jwks_uri': `${baseUrl}/lti/jwks`,
        'logo_uri': `${baseUrl}/assets/logo.png`,
        'token_endpoint_auth_method': 'private_key_jwt',
        'scope': 'https://purl.imsglobal.org/spec/lti-ags/scope/score https://purl.imsglobal.org/spec/lti-ags/scope/lineitem.readonly',

        // LTI-specific claims
        'https://purl.imsglobal.org/spec/lti-tool-configuration': {
            'domain': new URL(baseUrl).hostname,
            'description': description,
            'target_link_uri': `${baseUrl}/index.html`,
            'claims': ['iss', 'sub', 'name', 'given_name', 'family_name', 'email'],
            'messages': [
                {
                    'type': 'LtiResourceLinkRequest',
                    'target_link_uri': `${baseUrl}/index.html`,
                    'label': title
                }
            ]
        }
    };

    return JSON.stringify(toolConfig, null, 2);
}
