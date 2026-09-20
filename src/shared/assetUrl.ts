const dataRoot = `${import.meta.env.BASE_URL}demo-data/`

export function demoAsset(path: string): string {
  return `${dataRoot}${path.replace(/^\/+/, '')}`
}

