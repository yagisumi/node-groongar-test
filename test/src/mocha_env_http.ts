import { getGroongaPath, sleep } from './funcs'
import { Advices, SetupConfig, TestEnv } from './types'
import { createClient, GroongaHttpClient } from '@yagisumi/groonga-http-client'
import axios from 'axios'
import getPort from 'get-port'
import child_process from 'child_process'
import * as funcs from './funcs'

type HttpTestEnv = {
  client: GroongaHttpClient
  config: SetupConfig
  server: child_process.ChildProcessWithoutNullStreams
}

const groonga = getGroongaPath()

function setupClient(config: SetupConfig): Promise<TestEnv> {
  const opts: child_process.SpawnOptionsWithoutStdio = {
    stdio: 'pipe',
  }
  if (config.env) {
    opts.env = config.env
  }
  return new Promise((resolve, reject) => {
    getPort()
      .then((port) => {
        const server = child_process.spawn(
          groonga,
          ['--protocol', 'http', '--port', `${port}`, '-s', '-n', config.db_path],
          opts
        )

        let error: Error | undefined = undefined
        server.on('error', (err) => {
          error = err
        })
        server.on('exit', (code) => {
          if (typeof code === 'number' && code !== 0) {
            error = new Error(`exit code: ${code}`)
          }
        })

        setTimeout(() => {
          if (error) {
            reject(error)
          } else if (typeof (server as any).exitCode === 'number') {
            reject(new Error(`exit code: ${(server as any).exitCode}`))
          } else {
            const client = createClient(axios, `http://localhost:${port}`)
            const env: HttpTestEnv = {
              config,
              client,
              server,
            }
            resolve(env)
          }
        }, 300)
      })
      .catch((err) => {
        reject(err)
      })
  })
}

function teardownClient(env: HttpTestEnv): Promise<void> {
  return new Promise((resolve) => {
    try {
      env.client.command('shutdown', () => {})
    } catch (err) {
      // empty
    }
    setTimeout(async () => {
      if (env.server.killed) {
        resolve()
        return
      }
      for (let i = 0; i < 10; i++) {
        try {
          env.server.kill()
          await sleep(300)
          if (env.server.killed) {
            break
          }
        } catch (err) {
          if (env.server.killed) {
            break
          }
        }
      }
      resolve()
    }, 300)
  })
}

function shouldOmit(advices: Advices) {
  if (advices.omit) {
    return true
  }

  if (advices.pragma.require_platform === '!windows' && process.platform === 'win32') {
    return true
  } else if (advices.pragma.require_platform === 'windows' && process.platform !== 'win32') {
    return true
  }

  return false
}

declare const global: any

for (const f in funcs) {
  global[f] = (funcs as any)[f]
}

global.setEnv = function (key: string, value: string) {}

global.setupClient = setupClient
global.teardownClient = teardownClient
global.shouldOmit = shouldOmit
global.clientInterface = 'http'
