import { SetupConfig, TestEnv, Advices } from './types'
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

function shouldOmit(advices: Advices) {
  if (advices.omit) {
    return true
  } else if (advices.command['thread_limit']) {
    return true
  } else if (advices.command['lock_acquire']) {
    return true
  } else if (advices.command['lock_release']) {
    return true
  }

  return false
}

declare const global: any

for (const f in funcs) {
  global[f] = (funcs as any)[f]
}

global.setupClient = setupClient
global.teardownClient = teardownClient
global.shouldOmit = shouldOmit
global.clientInterface = 'nroonga'
