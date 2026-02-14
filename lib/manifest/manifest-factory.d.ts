export function generateManifest(
  format: 'scorm2004' | 'scorm1.2' | 'cmi5' | 'scorm1.2-proxy' | 'scorm2004-proxy' | 'cmi5-remote' | 'lti',
  config: Record<string, unknown>,
  files: string[],
  options?: { externalUrl?: string }
): { filename: string; content: string }

export function getSchemaFiles(
  format: 'scorm2004' | 'scorm1.2' | 'cmi5' | 'lti'
): string[]
