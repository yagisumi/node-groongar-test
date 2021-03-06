declare function setEnv(key: string, value: string): void
declare function deleteEnv(key: string): void
declare function mkdir(dir: string): void
declare function exists(file: string): boolean
declare function rimraf(dir: string): boolean
declare function copyFile(src: string, dest: string): void
declare const clientInterface: 'nroonga' | 'http' | 'stdio'

type CommandCallback = (err: Error | undefined, data: any) => void
interface GroongaClient {
  command(command: string, options: Record<string, unknown>, callback: CommandCallback): void
  command(command: string, callback: CommandCallback): void
}

type SetupConfig = {
  db_path: string
  env?: Record<string, string>
}
interface TestEnv {
  client: GroongaClient
  config: SetupConfig
}
type PragmaAdvices = {
  omit?: boolean
  eval?: boolean
  require_platform?: '!windows' | 'windows'
  suggest_create_dataset?: string
  timeout?: number
  require_apache_arrow?: boolean
}

type Advices = {
  testPath: string
  command: Record<string, boolean>
  pragma: PragmaAdvices
  env?: Record<string, string>
  omit?: boolean
}

declare function shouldOmit(advices: Advices): boolean
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
declare function fixObjectList(obj: unknown): unknown
