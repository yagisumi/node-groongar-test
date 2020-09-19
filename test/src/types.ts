export type CommandCallback = (err: Error | undefined, data: any) => void

export interface GroongaClient {
  command(command: string, options: Record<string, unknown>, callback: CommandCallback): void
  command(command: string, callback: CommandCallback): void
}

export type SetupConfig = {
  db_path: string
}

export interface TestEnv {
  client: GroongaClient
  config: SetupConfig
}
