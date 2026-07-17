export function resolveUserDataPath(defaultPath: string, development: boolean): string {
  return development ? `${defaultPath}-development` : defaultPath;
}
