export type CommandCallback = (err: Error | undefined, data: any) => void

export interface GroongaClient {
  command(command: string, options: Record<string, unknown>, callback: CommandCallback): void
  command(command: string, callback: CommandCallback): void
}

export type SetupConfig = {
  db_path: string
  env?: Record<string, string>
}

export interface TestEnv {
  client: GroongaClient
  config: SetupConfig
}

export type PragmaAdvices = {
  omit?: boolean
  eval?: boolean
  require_platform?: '!windows' | 'windows'
  suggest_create_dataset?: string
  timeout?: number
  require_apache_arrow?: boolean
}

export type Advices = {
  testPath: string
  command: Record<string, boolean>
  pragma: PragmaAdvices
  env?: Record<string, string>
  omit?: boolean
}
