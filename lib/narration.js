/**
 * Narration command - generate audio narration from text
 */

import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { validateProject } from './project-utils.js';


export async function narration(options = {}) {
  validateProject();
  
  const scriptPath = path.join(process.cwd(), 'framework', 'scripts', 'generate-narration.js');
  
  if (!fs.existsSync(scriptPath)) {
    console.error(`
❌ Narration script not found at: framework/scripts/generate-narration.js

   Make sure your framework is up to date:
   scorm upgrade
`);
    process.exit(1);
  }
  
  console.log(`
🎙️  Generating audio narration...
`);
  
  // Build args
  const args = [scriptPath];
  if (options.force) args.push('--force');
  if (options.slide) args.push('--slide', options.slide);
  if (options.dryRun) args.push('--dry-run');
  if (options.rebuildCache) args.push('--rebuild-cache');
  
  return new Promise((resolve, reject) => {
    const child = spawn('node', args, {
      cwd: process.cwd(),
      stdio: 'inherit',
      shell: true
    });
    
    child.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Narration generation failed with code ${code}`));
      }
    });
    
    child.on('error', reject);
  });
}
