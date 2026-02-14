export interface StubPlayerConfig {
  title: string
  launchUrl: string
  storageKey: string
  passwordHash?: string
  isLive?: boolean
  liveReload?: boolean
  courseContent?: string
  startSlide?: string | number
  isDesktop?: boolean
  moduleBasePath?: string
}

export function generateStubPlayer(config: StubPlayerConfig): string
export function escapeHtml(str: string): string
