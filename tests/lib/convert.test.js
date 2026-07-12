import { describe, expect, it } from 'vitest';
import { replaceEmbeddedDataImages } from '../../lib/convert.js';

describe('replaceEmbeddedDataImages', () => {
    it('removes base64 image payloads while preserving a useful review marker', () => {
        const input = '# Reference\n\n![System diagram](data:image/png;base64,AAABBBCCC)\n\nBody text.';

        const result = replaceEmbeddedDataImages(input);

        expect(result.omittedImageCount).toBe(1);
        expect(result.markdown).not.toContain('base64');
        expect(result.markdown).toContain('Embedded image omitted: System diagram');
        expect(result.markdown).toContain('Body text.');
    });

    it('leaves normal linked images unchanged', () => {
        const input = '![Diagram](images/diagram.png)';

        expect(replaceEmbeddedDataImages(input)).toEqual({
            markdown: input,
            omittedImageCount: 0
        });
    });
});
