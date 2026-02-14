/**
 * Convert Command
 * 
 * Converts docx, pptx, pdf, and md files to the converted references directory.
 */

import fs from 'fs/promises';
import path from 'path';

const SUPPORTED_EXTENSIONS = ['.docx', '.pptx', '.pdf', '.md'];

/**
 * Main convert function
 */
export async function convert(source, options) {
    const {
        output = './course/references/converted',
        format = 'all',
        dryRun = false,
        overwrite = false,
        flatten = false
    } = options;

    console.log('\n📄 Converting documents to markdown...\n');

    // Resolve paths
    const sourcePath = path.resolve(source);
    const outputPath = path.resolve(output);

    // Check if source exists
    try {
        await fs.access(sourcePath);
    } catch {
        console.error(`❌ Source path not found: ${sourcePath}`);
        process.exit(1);
    }

    // Determine if source is file or directory
    const sourceStat = await fs.stat(sourcePath);
    const isDirectory = sourceStat.isDirectory();

    // Find files to convert
    let files = [];
    if (isDirectory) {
        files = await findFiles(sourcePath, format);
    } else {
        const ext = path.extname(sourcePath).toLowerCase();
        if (SUPPORTED_EXTENSIONS.includes(ext)) {
            if (format === 'all' || format === ext.slice(1)) {
                files = [sourcePath];
            }
        }
    }

    // Filter by format if specified
    if (format !== 'all') {
        const targetExt = `.${format}`;
        files = files.filter(f => path.extname(f).toLowerCase() === targetExt);
    }

    if (files.length === 0) {
        console.log(`  Source: ${sourcePath}\n`);
        console.log('  No supported files found (.docx, .pptx, .pdf, .md)\n');
        console.log(`  Place source documents in ${source} and try again.\n`);
        return;
    }

    console.log(`  Source: ${sourcePath}`);
    console.log(`  Output: ${outputPath}\n`);

    if (dryRun) {
        console.log('  Would convert:');
        for (const file of files) {
            const _relativeSrc = path.relative(sourcePath, file);
            const outputName = getOutputName(file, sourcePath, outputPath, flatten, isDirectory);
            const relativeOut = path.relative(outputPath, outputName);
            const exists = await fileExists(outputName);
            const suffix = exists ? ' (exists, would skip)' : '';
            console.log(`    ${path.basename(file)} → ${relativeOut}${suffix}`);
        }
        const wouldConvert = await countConvertible(files, sourcePath, outputPath, flatten, isDirectory, overwrite);
        console.log(`\n  ${files.length} files found, ${wouldConvert} would be converted.\n`);
        return;
    }

    // Create output directory
    await fs.mkdir(outputPath, { recursive: true });

    // Convert files
    let converted = 0;
    let skipped = 0;

    for (const file of files) {
        const outputFile = getOutputName(file, sourcePath, outputPath, flatten, isDirectory);
        const ext = path.extname(file).toLowerCase();
        const exists = await fileExists(outputFile);

        if (exists && !overwrite) {
            console.log(`  ⊘ ${path.basename(file)} → skipped (already exists, use --overwrite)`);
            skipped++;
            continue;
        }

        try {
            const result = await convertFile(file);
            
            // Ensure output directory exists
            await fs.mkdir(path.dirname(outputFile), { recursive: true });
            
            // Write output
            // Write output
            await fs.writeFile(outputFile, result.markdown, 'utf-8');

            // Write structured data if available (for AI analysis)
            if (result.data) {
                const jsonPath = outputFile.replace(/\.md$/, '.json');
                await fs.writeFile(jsonPath, JSON.stringify(result.data, null, 2), 'utf-8');
            }

            let suffix = '';
            if (ext === '.md') {
                suffix = ' (copied)';
            } else if (ext === '.pptx' && result.slideCount) {
                suffix = ` (${result.slideCount} slides)`;
            }
            if (result.warnings?.length > 0) {
                console.log(`  ⚠ ${path.basename(file)} → ${path.basename(outputFile)}${suffix} (review recommended)`);
            } else {
                console.log(`  ✓ ${path.basename(file)} → ${path.basename(outputFile)}${suffix}`);
            }
            converted++;
        } catch (error) {
            console.log(`  ✗ ${path.basename(file)} → failed: ${error.message}`);
        }
    }

    console.log(`\nDone! ${converted} converted, ${skipped} skipped.`);

    // Show next steps only if we converted files
    if (converted > 0) {
        printNextSteps(outputPath);
    }
}

/**
 * Find all supported files in a directory recursively
 */
async function findFiles(dir, format) {
    const files = [];
    const entries = await fs.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        
        if (entry.isDirectory()) {
            // Skip md output directory to avoid confusion
            if (entry.name === 'converted') continue;
            const subFiles = await findFiles(fullPath, format);
            files.push(...subFiles);
        } else if (entry.isFile()) {
            const ext = path.extname(entry.name).toLowerCase();
            if (SUPPORTED_EXTENSIONS.includes(ext)) {
                files.push(fullPath);
            }
        }
    }

    return files;
}

/**
 * Get output filename for a source file
 */
function getOutputName(file, sourcePath, outputPath, flatten, isSourceDir) {
    const baseName = path.basename(file, path.extname(file)) + '.md';
    
    if (flatten || !isSourceDir) {
        return path.join(outputPath, baseName);
    }

    // Preserve directory structure
    const relativePath = path.relative(sourcePath, file);
    const relativeDir = path.dirname(relativePath);
    return path.join(outputPath, relativeDir, baseName);
}

/**
 * Check if file exists
 */
async function fileExists(filePath) {
    try {
        await fs.access(filePath);
        return true;
    } catch {
        return false;
    }
}

/**
 * Count how many files would be converted (for dry run)
 */
async function countConvertible(files, sourcePath, outputPath, flatten, isSourceDir, overwrite) {
    let count = 0;
    for (const file of files) {
        const outputFile = getOutputName(file, sourcePath, outputPath, flatten, isSourceDir);
        const exists = await fileExists(outputFile);
        if (!exists || overwrite) {
            count++;
        }
    }
    return count;
}

/**
 * Convert a single file based on its extension
 */
async function convertFile(filePath) {
    const ext = path.extname(filePath).toLowerCase();

    switch (ext) {
        case '.docx':
            return await convertDocx(filePath);
        case '.pptx':
            return await convertPptx(filePath);
        case '.pdf':
            return await convertPdf(filePath);
        case '.md':
            return await copyMd(filePath);
        default:
            throw new Error(`Unsupported format: ${ext}`);
    }
}

/**
 * Convert DOCX to markdown using mammoth
 */
async function convertDocx(filePath) {
    const mammoth = await import('mammoth');
    const result = await mammoth.convertToMarkdown({ path: filePath });
    
    return {
        markdown: result.value,
        warnings: result.messages.filter(m => m.type === 'warning')
    };
}

/**
 * Convert PPTX to markdown using node-pptx-parser
 */
async function convertPptx(filePath) {
    const PptxParser = (await import('node-pptx-parser')).default;
    
    const parser = new PptxParser(filePath);
    const textContent = await parser.extractText();
    
    let markdown = '';
    let slideNum = 0;

    for (const slide of textContent) {
        slideNum++;
        markdown += `# Slide ${slideNum}\n\n`;

        // Add slide text content
        if (slide.text && slide.text.length > 0) {
            for (const text of slide.text) {
                if (text && text.trim()) {
                    markdown += `${text.trim()}\n\n`;
                }
            }
        }

        markdown += '---\n\n';
    }

    return {
        markdown: markdown.trim(),
        slideCount: slideNum,
        warnings: []
    };
}

/**
 * Convert PDF to markdown/json using pdf2json custom parser
 */
async function convertPdf(filePath) {
    const { parsePdfStructure } = await import('./pdf-structure.js');
    const structure = await parsePdfStructure(filePath);

    // Convert structure to Markdown
    let markdown = '';
    for (const element of structure.elements) {
        if (element.type.startsWith('h')) {
            const level = element.type.substring(1);
            markdown += `${'#'.repeat(parseInt(level))} ${element.text}\n\n`;
        } else {
            markdown += `${element.text}\n\n`;
        }
    }

    return {
        markdown: markdown.trim(),
        data: structure, // Return structured data for JSON output if needed
        warnings: []
    };
}

/**
 * Copy markdown files directly (they're already in the right format)
 */
async function copyMd(filePath) {
    const content = await fs.readFile(filePath, 'utf-8');
    return {
        markdown: content,
        warnings: []
    };
}

/**
 * Print next steps for AI-assisted workflow
 */
function printNextSteps(outputPath) {
    const relativeOutput = path.relative(process.cwd(), outputPath);
    
    console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📋 Next steps (AI-assisted workflow):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. CREATE OUTLINE: Ask your AI assistant to reference:
   - framework/docs/COURSE_OUTLINE_GUIDE.md
   - framework/docs/COURSE_AUTHORING_GUIDE.md
   - ${relativeOutput}/*.md (your converted files)

2. IMPLEMENT COURSE: Then reference:
   - framework/docs/COURSE_AUTHORING_GUIDE.md
   - your-outline.md

Attach files using your AI tool's method (drag-drop, @file, #file, etc.)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`);
}
