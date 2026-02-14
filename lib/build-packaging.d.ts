export function stampFormat(html: string, format: string): string
export function stampFormatInHtml(htmlPath: string, format: string): void

export function validateExternalHostingConfig(config: Record<string, unknown>): void

export function createStandardPackage(options: {
  rootDir: string
  distDir: string
  config: Record<string, unknown>
  outputDir?: string
}): Promise<string>

export function createProxyPackage(options: {
  rootDir: string
  config: Record<string, unknown>
  clientId?: string
  token?: string
  outputDir?: string
}): Promise<string>

export function createRemotePackage(options: {
  rootDir: string
  config: Record<string, unknown>
  clientId?: string
  token?: string
  outputDir?: string
}): Promise<string>

export function createExternalPackagesForClients(options: {
  rootDir: string
  config: Record<string, unknown>
  outputDir?: string
}): Promise<void>
