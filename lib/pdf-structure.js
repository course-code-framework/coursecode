import PDFParser from 'pdf2json';


/**
 * Custom PDF Structure Parser
 * Uses pdf2json to extract text with layout information, then applies heuristics
 * to identify headers and reconstruct document structure.
 */
export function parsePdfStructure(filePath) {
    const pdfParser = new PDFParser();

    return new Promise((resolve, reject) => {
        pdfParser.on('pdfParser_dataError', errData => reject(errData.parserError));
        pdfParser.on('pdfParser_dataReady', pdfData => {
            try {
                const structure = processPdfData(pdfData);
                resolve(structure);
            } catch (err) {
                reject(err);
            }
        });

        pdfParser.loadPDF(filePath);
    });
}

function processPdfData(pdfData) {
    const pages = pdfData.Pages || [];
    let allTextBlocks = [];

    // 1. Flatten all text blocks across pages
    pages.forEach((page, pageIndex) => {
        const texts = page.Texts || [];
        texts.forEach(text => {
            // text.R is an array of runs (usually 1)
            // text.x, text.y are position units (approx 1/25th of an inch?)
            
            const content = text.R.map(run => decodeURIComponent(run.T)).join('');
            
            // TS = [fontId, fontSize, isBold, isItalic]
            // We need to parse TS from the first run
            const run = text.R[0];
            const fontSize = run?.TS?.[1] || 12; 
            const isBold = run?.TS?.[2] === 1;

            if (content.trim()) {
                allTextBlocks.push({
                    text: content,
                    x: text.x, 
                    y: text.y + (pageIndex * 100), // Global Y including page offset (heuristic 100 units per page)
                    w: text.w,
                    fontSize,
                    isBold,
                    page: pageIndex + 1
                });
            }
        });
    });

    // 2. Determine "Body Text" font size (most common size)
    const sizeCounts = {};
    allTextBlocks.forEach(block => {
        const size = Math.round(block.fontSize * 10) / 10;
        sizeCounts[size] = (sizeCounts[size] || 0) + 1;
    });
    
    let bodySize = 0;
    let maxCount = 0;
    for (const [size, count] of Object.entries(sizeCounts)) {
        if (count > maxCount) {
            maxCount = count;
            bodySize = parseFloat(size);
        }
    }

    // 3. Sort by Page -> Y -> X
    allTextBlocks.sort((a, b) => {
        if (a.page !== b.page) return a.page - b.page;
        if (Math.abs(a.y - b.y) > 0.5) return a.y - b.y; // Roughly same line
        return a.x - b.x;
    });

    // 4. Cluster into elements
    const elements = [];
    let currentElement = null;

    allTextBlocks.forEach((block, index) => {
        const isHeader = block.fontSize > bodySize * 1.1 || (block.isBold && block.fontSize >= bodySize);
        const headingLevel = isHeader ? calculateHeaderLevel(block.fontSize, bodySize) : 0;
        const type = isHeader ? `h${headingLevel}` : 'p';

        // Check proximity to previous block
        const prevBlock = allTextBlocks[index - 1];
        
        // Vertical gap check (heuristic)
        // If gap is small, it's likely the same paragraph
        // If gap is large, it's a new paragraph
        // If type changed (header <-> p), it's a new element

        let isSameElement = false;
        if (currentElement && currentElement.type === type && prevBlock) {
             const verticalGap = block.y - prevBlock.y;
             // Line height heuristic: adjacent lines are usually < 1.5 units apart in pdf2json coords
             if (verticalGap < 2 && verticalGap > -0.5) { 
                 isSameElement = true;
             }
        }

        if (isSameElement) {
            currentElement.text += ' ' + decode(block.text);
        } else {
            if (currentElement) elements.push(currentElement);
            currentElement = {
                type,
                text: decode(block.text),
                page: block.page,
                metadata: {
                  fontSize: block.fontSize,
                  isBold: block.isBold
                }
            };
        }
    });

    if (currentElement) elements.push(currentElement);

    return {
        metadata: pdfData.Meta,
        elements
    };
}

function calculateHeaderLevel(size, bodySize) {
    const ratio = size / bodySize;
    if (ratio > 1.5) return 1;
    if (ratio > 1.2) return 2;
    return 3;
}

function decode(str) {
    return str.replace(/\s+/g, ' ').trim();
}
