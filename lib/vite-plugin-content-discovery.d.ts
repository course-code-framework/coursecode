import type { Plugin } from 'vite'

export interface ContentDiscoveryOptions {
  /** Course directory (default: `<root>/course`). */
  coursePath?: string
  /** Document gallery config from course-config.js `navigation.documentGallery`. */
  galleryConfig?: {
    enabled?: boolean
    directory?: string
    fileTypes?: string[]
    [key: string]: unknown
  } | null
  /**
   * Write the preview-only `_content-manifest.json` into the build output.
   * Defaults to true only for `--mode development` builds (used by preview).
   */
  writeContentManifest?: boolean
  [key: string]: unknown
}

export default function contentDiscoveryPlugin(options?: ContentDiscoveryOptions): Plugin

/** Inject `data-edit-path` attributes into a slide template literal body. */
export function injectEditPaths(html: string): string
