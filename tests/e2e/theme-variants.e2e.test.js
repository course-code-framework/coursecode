import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { launchBrowser, loadCourse } from './helpers/setup.js';
import { goToSlide } from './helpers/automation.js';

describe('Theme variants', () => {
    let browser;
    let frame;

    beforeAll(async () => {
        browser = await launchBrowser();
        ({ frame } = await loadCourse(browser));
        await goToSlide(frame, 'example-ui-showcase');
    }, 60000);

    afterAll(async () => {
        if (browser) await browser.close();
    });

    async function getAccordionStyles({ globalStyle = null, localStyle = null }) {
        return frame.evaluate(({ globalStyle: rootStyle, localStyle: componentStyle }) => {
            const root = document.documentElement;
            const accordion = document.querySelector('#demo-accordion');
            const firstItem = accordion?.querySelector('.accordion-item');
            const firstButton = accordion?.querySelector('.accordion-button');
            const firstBody = accordion?.querySelector('.accordion-body');

            if (!accordion || !firstItem || !firstButton || !firstBody) {
                throw new Error('Accordion fixture was not rendered');
            }

            if (rootStyle) root.dataset.accordionStyle = rootStyle;
            else root.removeAttribute('data-accordion-style');

            if (componentStyle) accordion.dataset.accordionStyle = componentStyle;
            else accordion.removeAttribute('data-accordion-style');

            const accordionStyles = getComputedStyle(accordion);
            const itemStyles = getComputedStyle(firstItem);
            const buttonStyles = getComputedStyle(firstButton);
            const bodyStyles = getComputedStyle(firstBody);

            return {
                container: {
                    display: accordionStyles.display,
                    gap: accordionStyles.gap,
                    borderTopWidth: accordionStyles.borderTopWidth,
                    boxShadow: accordionStyles.boxShadow
                },
                item: {
                    borderTopWidth: itemStyles.borderTopWidth,
                    borderBottomWidth: itemStyles.borderBottomWidth,
                    borderRadius: itemStyles.borderRadius,
                    marginBottom: itemStyles.marginBottom
                },
                button: {
                    borderRadius: buttonStyles.borderRadius,
                    backgroundColor: buttonStyles.backgroundColor
                },
                body: {
                    padding: bodyStyles.padding
                }
            };
        }, { globalStyle, localStyle });
    }

    it.each(['flush', 'separated', 'minimal', 'boxed'])(
        'applies the global %s style identically to a component-level style',
        async (style) => {
            const globalStyles = await getAccordionStyles({ globalStyle: style });
            const localStyles = await getAccordionStyles({ localStyle: style });

            expect(globalStyles).toEqual(localStyles);
        }
    );

    it('applies the global separated accordion style to the container and items', async () => {
        const styles = await getAccordionStyles({ globalStyle: 'separated' });

        expect(styles.container.display).toBe('flex');
        expect(styles.container.gap).not.toBe('normal');
        expect(styles.container.borderTopWidth).toBe('0px');
        expect(styles.container.boxShadow).toBe('none');
        expect(styles.item.borderTopWidth).toBe('1px');
        expect(styles.item.borderRadius).not.toBe('0px');
    });

    it('lets a component-level style override the global accordion style', async () => {
        const styles = await getAccordionStyles({
            globalStyle: 'separated',
            localStyle: 'flush'
        });

        expect(styles.container.display).toBe('block');
        expect(styles.container.gap).toBe('normal');
        expect(styles.container.borderTopWidth).toBe('0px');
        expect(styles.container.boxShadow).toBe('none');
        expect(styles.item.borderTopWidth).toBe('0px');
        expect(styles.item.borderRadius).toBe('0px');
    });

    it('continues to support a component-level separated style', async () => {
        const styles = await getAccordionStyles({ localStyle: 'separated' });

        expect(styles.container.display).toBe('flex');
        expect(styles.container.gap).not.toBe('normal');
        expect(styles.container.borderTopWidth).toBe('0px');
        expect(styles.item.borderTopWidth).toBe('1px');
        expect(styles.item.borderRadius).not.toBe('0px');
    });
});
