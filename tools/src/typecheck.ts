import { Env } from './env'
import path from 'path'
import fs from 'fs'
import rimraf from 'rimraf'
import mkdirp from 'mkdirp'
import { merge } from './merge'
import equal from 'deep-equal'
import hashcode from 'ts-hashcode'

type VerTestMap = {
  v1: ObjectSet
  v2: ObjectSet
  v3: ObjectSet
}

export function generateTypeCheck(env: Env) {
  if (!fs.existsSync(env.outputs_dir)) {
    console.log(`missing outputs dir`)
    return
  }

  const report: Record<string, any> = {}

  const dirs = fs.readdirSync(env.outputs_dir, { withFileTypes: true })
  for (const dir of dirs) {
    if (dir.isFile()) {
      continue
    }
    const cmd = dir.name
    const responses: VerTestMap = {
      v1: new ObjectSet(),
      v2: new ObjectSet(),
      v3: new ObjectSet(),
    }

    const cmdDir = path.join(env.outputs_dir, cmd)
    const files = fs.readdirSync(cmdDir, { withFileTypes: true })
    let count = 0

    process.stdout.write(
      `\r${cmd}: ${count} (1: ${responses['v1'].length}, 2: ${responses['v2'].length}, 3: ${responses['v3'].length})`
    )

    for (const file of files) {
      count += 1
      if (file.isDirectory()) {
        continue
      }
      process.stdout.write(
        `\r${cmd}: ${count} (1: ${responses['v1'].length}, 2: ${responses['v2'].length}, 3: ${responses['v3'].length})`
      )

      if (file.name.match(/\[(v[123])\]/)) {
        const v = RegExp.$1
        if (isVersion(v)) {
          const json = fs.readFileSync(path.join(cmdDir, file.name), { encoding: 'utf-8' })
          const obj = JSON.parse(json)
          responses[v].set(obj)
        }
      }
    }

    console.log('')
    merge(report, {
      commands: {
        [cmd]: {
          v1: {
            count: responses['v1'].length,
          },
          v2: {
            count: responses['v2'].length,
          },
          v3: {
            count: responses['v3'].length,
          },
        },
      },
    })

    for (const v of [1, 2, 3]) {
      const ver = `v${v}` as keyof VerTestMap
      const test = env.prettier_format(makeTest(cmd, responses[ver], v))
      env.save_typecheck(`${cmd}=v${v}.test.ts`, test)
    }
  }

  env.save_report('typecheck', report)
}

function isVersion(v: string): v is 'v1' | 'v2' | 'v3' {
  return ['v1', 'v2', 'v3'].includes(v)
}

function makeTest(cmd: string, r_set: ObjectSet, v: number) {
  const tests = [
    `
    import { Types } from '@yagisumi/groongar'
    import { expectType } from 'tsd'

    describe('typecheck', () => {
  `,
  ]

  tests.push(`
      test('${cmd}:v${v}', () => {
    `)
  const ver = `v${v}` as keyof VerTestMap
  for (const r of r_set.values) {
    tests.push(`expectType<Types.ret<'${cmd}', ${v}>>(`)
    tests.push(JSON.stringify(r))
    tests.push(')\n\n')
  }

  tests.push(`
      })

    `)

  tests.push(`
    })

  `)

  return tests.join('')
}

class ObjectSet<V = any> {
  valMap: Record<string, Array<V>> = {}

  set(value: V) {
    const code = hashcode(value).toString()
    this.valMap[code] ??= []
    for (const v of this.valMap[code]) {
      if (equal(value, v)) {
        return
      }
    }
    this.valMap[code].push(value)
  }

  get length() {
    let len = 0
    for (const code of Object.keys(this.valMap)) {
      const vals = this.valMap[code]
      len += vals.length
    }
    return len
  }

  get values() {
    const values: Array<V> = []
    for (const code of Object.keys(this.valMap)) {
      const vals = this.valMap[code]
      values.push(...vals)
    }
    return values
  }
}
