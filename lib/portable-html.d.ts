import type { Plugin } from 'vite'

export function createPortableHtmlPlugin(): Plugin | Plugin[]
export function collectPortableAssets(buildDir: string): Record<string, string>
export function assemblePortableHtml(indexHtml: string, assetMap: Record<string, string>): string
export function validatePortableHtml(html: string): void
export function exportPortableHtml(options?: {
  output?: string
  lint?: boolean
  [key: string]: unknown
}): Promise<{ outputPath: string; sizeBytes: number; assetCount: number }>
