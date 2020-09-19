import { SetupConfig, TestEnv } from './types'
import { Database } from 'nroonga'
import * as funcs from './funcs'

type NroongaTestEnv = {
  client: Database
  config: SetupConfig
}

function setupClient(config: SetupConfig): Promise<TestEnv> {
  return new Promise((resolve) => {
    const client = new Database(config.db_path)
    const env: NroongaTestEnv = {
      config,
      client,
    }
    resolve(env)
  })
}

function teardownClient(env: NroongaTestEnv): Promise<void> {
  return new Promise((resolve) => {
    try {
      env.client.close()
    } catch (err) {
      // empty
    }
    resolve()
  })
}

declare const global: any

for (const f in funcs) {
  global[f] = (funcs as any)[f]
}

global.setupClient = setupClient
global.teardownClient = teardownClient
global.clientInterface = 'nroonga'
;(process.env as any)['TS_NODE_CACHE'] = false
