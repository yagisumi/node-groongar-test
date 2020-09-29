import { Env } from './env'
import path from 'path'
import fs from 'fs'
import rimraf from 'rimraf'
import mkdirp from 'mkdirp'
import { merge } from './merge'
import { collectTestMap, GrnTestConverter } from './grntest_converter'
import { getErrorMessage } from './command_converter'
import { Database } from 'nroonga'
import { createGroongar } from '@yagisumi/groongar'

type OutputsContext = {
  env: Env
  report: Record<string, any>
  log: Record<string, boolean>
  converter: GrnTestConverter
  test_base: string
}

export async function collectOutputs(env: Env) {
  const src_dir = env.groonga_src_dir
  if (src_dir === undefined) {
    throw new Error('groonga source code directory not found')
  }
  const report: Record<string, any> = {
    groonga_src_dir: src_dir,
  }

  const test_base = path.join(src_dir, 'test/command')
  const suite_dir = path.join(src_dir, 'test/command/suite')
  const test_map = await collectTestMap(suite_dir, test_base, report)

  const log = loadOutputsLog(env)
  const test_map_keys = Object.keys(test_map)
  let count = 0
  for (const testPath of test_map_keys) {
    count += 1
    if (log[testPath]) {
      continue
    }
    console.log(`[${count.toString().padStart(4, ' ')}/${test_map_keys.length}] ${testPath}`)

    const converter = new GrnTestConverter(testPath, test_map[testPath])
    const context: OutputsContext = {
      env,
      report,
      log,
      converter,
      test_base,
    }
    const r = await execTest(context).catch(() => false)
    if (!r) {
      merge(report, {
        errors: {
          count: 1,
          paths: {
            [testPath]: true,
          },
        },
      })
    }
    log[testPath] = true
    merge(report, {
      count: 1,
    })
    saveOutputsLog(env, log)
  }

  env.save_report('outputs', report)
}

const OUTPUTS_LOG = 'outputs.json'

function loadOutputsLog(env: Env): Record<string, boolean> {
  const logPath = path.join(env.outputs_dir, OUTPUTS_LOG)
  if (fs.existsSync(logPath)) {
    try {
      const json = fs.readFileSync(logPath, { encoding: 'utf-8' })
      return JSON.parse(json)
    } catch (e) {
      //
    }
  }

  return {}
}

function saveOutputsLog(env: Env, log: Record<string, boolean>) {
  env.save_output(OUTPUTS_LOG, log)
}

async function execTest(context: OutputsContext) {
  const { env, report, converter, test_base } = context
  const elems = converter.buildTestElems()
  const test_path = converter.testPath.replace(/\//g, '=')

  for (const v of ['1', '2', '3']) {
    const db_directory = path.join(env.temp_dir, `${test_path}[${v}]`)
    const db_path = path.join(db_directory, 'db')
    mkdirp.sync(db_directory)

    const env_keys: string[] = []
    for (const elem of elems) {
      if (elem.type === 'export') {
        if (elem.string.match(/^#\$(\w+)=(.+)/)) {
          const key = RegExp.$1
          const val = RegExp.$2.replace(/#\{/g, '${')
          process.env[key] = val
          env_keys.push(key)
        }
      }
    }

    let db = new Database(db_path)
    const rg = createGroongar(db)
    if (rg.error) {
      continue
    }
    const groongar = rg.value

    try {
      for (const elem of elems) {
        // console.log(elem)
        if (elem.type === 'command') {
          const test_id = `[${elem.command.command_name}][${test_path}][${elem.count}][v${v}]`
          if (!['dump'].includes(elem.command.command_name)) {
            elem.command.arguments['output_type'] = 'json'
            elem.command.arguments['command_version'] = v
          }
          // console.log(elem.command.to_command_format())
          try {
            const response = db.commandSync(elem.command.to_command_format())
            if (!['dump'].includes(elem.command.command_name)) {
              env.save_output(`${elem.command.command_name}/${test_id}.json`, response)
            }
          } catch (e) {
            const errMsg = getErrorMessage(elem.response)
            if (!errMsg) {
              merge(report, {
                unexpected_errors: {
                  count: 1,
                  elems: { [test_id]: e.toString() },
                },
              })
            }
          }
        } else if (elem.type === 'pragma') {
          if (elem.string.startsWith('#@omit')) {
            break
          } else if (elem.string.startsWith('#@eval')) {
            break
          } else if (elem.string.match(/^#@suggest-create-dataset\s+(\w+)/)) {
            const dataset = RegExp.$1
            await groongar.suggestCreateDataset(dataset)
          } else if (elem.string.match(/^#@copy-path\s+(\S+)\s+(\S+)/)) {
            const src = RegExp.$1
            const dest = RegExp.$2.replace(/#\{\s*(\w+)\s*\}/, (m0, m1) => {
              merge(report, {
                copy_path_vars: {
                  [m1]: 1,
                },
              })
              if (m1 === 'db_directory') {
                return db_directory
              } else if (m1 === 'db_path') {
                return db_path
              }
              return m0
            })
            // console.log('copy-path', { src, dest })
            try {
              db.close()
              fs.copyFileSync(path.join(test_base, src), dest)
              db = new Database(db_path)
              // console.log('copy-path: ok')
            } catch (e) {
              // console.log('copy-path: fail')
              merge(report, {
                copy_path_fails: [{ src, dest }],
              })
            }
          } else if (elem.string.match(/#@sleep\s+(\d+)/)) {
            const time = Number(RegExp.$1) * 1000
            await sleep(time)
          } else if (elem.string.match(/^#@generate-series\s+(\d+)\s+(\d+)\s+(\w+)\s+'((?:\\'|[^'])+)'/)) {
            const from = Number(RegExp.$1)
            const to = Number(RegExp.$2)
            const table = RegExp.$3
            const value = RegExp.$4.trim().replace(/=>/g, ':')
            const load = (values: any[]) => groongar.load({ table, values })
            if (value.match(/:\s*i/)) {
              await generateSeries(
                from,
                to,
                (i) => {
                  return eval(value)
                },
                load
              )
            } else {
              const obj = eval(value)
              await generateSeries(from, to, () => obj, load)
            }
          }
        }
      }
    } catch (e) {
      return false
    } finally {
      for (const key of env_keys) {
        delete process.env[key]
      }
      db.close()
      rimraf.sync(db_directory)
    }
  }

  return true
}

export async function generateSeries(
  from: number,
  to: number,
  value_f: (i: number) => any,
  callback: (values: any[]) => Promise<any>
) {
  let i = from
  let values = []

  while (i < to) {
    values.push(value_f(i))
    i += 1
    if (values.length >= 1000) {
      await callback(values)
      values = []
    }
  }

  if (values.length > 0) {
    await callback(values)
  }

  return
}

export function sleep(msec: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, msec))
}
