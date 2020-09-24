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

export type Advices = {
  command: Record<string, boolean>
  pragma: Record<string, boolean>
  env?: Record<string, string>
  omit?: boolean
}
