declare function setEnv(key: string, value: string): void
declare function deleteEnv(key: string): void
declare function mkdir(path: string): void
declare function exists(path: string): boolean
declare function rimraf(dir_path: string): void
declare function copyFile(src: string, dest: string): void
declare const clientInterface: 'nroonga' | 'http' | 'stdio'

type CommandCallback = (err: Error | undefined, data: any) => void
interface GroongaClient {
  command(command: string, options: Record<string, unknown>, callback: CommandCallback): void
  command(command: string, callback: CommandCallback): void
}
type SetupConfig = {
  db_path: string
}
interface TestEnv {
  client: GroongaClient
  config: SetupConfig
}

declare function setupClient(config: SetupConfig): Promise<TestEnv>
declare function teardownClient(env: TestEnv): Promise<void>

declare function copyPath(src: string, dest: string): void

declare function generateSeries(
  from: number,
  to: number,
  value_f: (i: number) => any,
  callback: (values: any[]) => Promise<any>
): Promise<void>

declare function sleep(msec: number): Promise<void>

declare function fixDBPath(actual: unknown, db_path: string | RegExp): unknown

declare function fixObjectInspect(obj: unknown): unknown

// import type { PlatformPath } from 'path'
interface Path {
  join(a: string, b: string): string
}
declare const Path: Path
