import { Env } from './env'
import path from 'path'
import readdirp from 'readdirp'
import { merge } from './merge'
import { parseGrnTest, GrnTestElem, Command, Export, Pragma, Comment } from './grntest_parser'
import { CommandConverter } from './command_converter'
import fs from 'fs'
import mkdirp from 'mkdirp'
// import util from 'util'

type TestFileInfo = {
  base: string
  test: readdirp.EntryInfo
  expected: readdirp.EntryInfo
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

export async function collectTestMap(
  suite_dir: string,
  test_base: string,
  report: Record<string, any>
) {
  const entries = await readdirp.promise(suite_dir)
  const test_map: Record<string, TestFileInfo> = {}

  entries.forEach((ent) => {
    if (ent.path.endsWith('.test')) {
      const testPath = fixSuitePath(ent.path.slice(0, -5))
      test_map[testPath] = merge(test_map[testPath], { test: ent })
    } else if (ent.path.endsWith('.expected')) {
      const testPath = fixSuitePath(ent.path.slice(0, -9))
      test_map[testPath] = merge(test_map[testPath], { expected: ent })
    } else if (ent.path.endsWith('.rb')) {
      const testPath = fixSuitePath(ent.path.slice(0, -3))
      test_map[testPath] = merge(test_map[testPath], { test: ent })
    }
  })

  for (const testPath of Object.keys(test_map)) {
    test_map[testPath].base = test_base
    const { test, expected } = test_map[testPath]
    // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
    if (!test || !expected) {
      console.error(`not enough files: ${testPath}`)
      merge(report, { 'not enough files': [testPath] })
      continue
    }
  }

  return test_map
}

export async function convertGrnTest(env: Env) {
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

  const copypathMap: Record<string, boolean> = {}
  for (const testPath of Object.keys(test_map)) {
    // if (testPath.indexOf('suite/select/drilldowns/keys/') < 0) {
    //   continue
    // }

    console.log(testPath)

    const converter = new GrnTestConverter(testPath, test_map[testPath])
    try {
      const src = converter.main()
      merge(report, converter.report)
      merge(copypathMap, converter.copypathMap)

      if (converter.shouldIsolate()) {
        env.save_grntest(testPath + '.i-test.ts', env.prettier_format(src))
      } else {
        env.save_grntest(testPath + '.test.ts', env.prettier_format(src))
      }
    } catch (e) {
      console.error(e)
      throw e
    }
  }

  Object.keys(copypathMap).forEach((subPath) => {
    const src = path.join(test_base, subPath)
    const dest = path.join(env.groongar_grntest_dir, subPath)
    mkdirp.sync(path.dirname(dest))
    fs.copyFileSync(src, dest)
  })

  console.log(report)
  env.save_report('convert', report)
}

function fixSuitePath(testPath: string) {
  return 'suite/' + testPath.replace(/\\/g, '/')
}

export const OMIT_TEST_MAP: Record<string, string> = {
  'suite/response/jsonp': 'jsonp',
  'suite/index_column_diff/missings/with_section/apache_arrow': 'unsupported Apache Arrow', // since 9.1.1
}

type Context = {
  timeout?: number
  onerror?: boolean
}

export class GrnTestConverter {
  readonly testPath: string
  readonly testFileInfo: TestFileInfo
  report: Record<string, any> = {}
  testElems?: GrnTestElem[]
  private context: Context = {}
  omitReasons: Record<string, number> = {}
  skipReasons: Record<string, number> = {}
  isolatedReasons: Record<string, number> = {}
  copypathMap: Record<string, boolean> = {}
  private static includeMap: Record<string, GrnTestElem[]> = {}
  private advices: Advices

  constructor(testPath: string, testFileInfo: TestFileInfo) {
    this.testPath = testPath
    this.testFileInfo = testFileInfo

    this.advices = {
      testPath,
      command: {},
      pragma: {},
    }
    const reason = OMIT_TEST_MAP[testPath]
    if (reason != null) {
      this.omit(reason)
    }
  }

  main() {
    this.buildTestElems()
    const lines = this.buildLines()
    return this.applyTemplate(lines)
  }

  buildTestElems() {
    const { test, expected } = this.testFileInfo
    const elems = parseGrnTest(fs.readFileSync(test.fullPath, { encoding: 'utf8' }), false)
    const test_elems: GrnTestElem[] = []
    for (const elem of elems) {
      if (elem.type === 'pragma' && elem.string.match(/^#@include\s+(\S+)/)) {
        const grn = RegExp.$1
        test_elems.push(...this.includeGrn(grn))
      } else {
        test_elems.push(elem)
      }
    }
    const expected_elems = this.fixExpectedElems(
      parseGrnTest(fs.readFileSync(expected.fullPath, { encoding: 'utf8' }), true)
    )

    this.testElems = this.combineElems(test_elems, expected_elems)
    if (this.testElems === undefined) {
      merge(this.report['combine error'], [path])
      console.log(this.testPath)
      console.log({ test_elems, expected_elems })
      throw new Error('combine error')
    }

    return this.testElems
  }

  private fixExpectedElems(expected_elems: GrnTestElem[]) {
    // 10.0.8
    const NeedRemoveLoad = [
      'suite/select/drilldowns/keys/multiple_all_hash_value',
      'suite/select/drilldowns/keys/multiple_large',
    ]
    if (NeedRemoveLoad.includes(this.testPath)) {
      const fixed: GrnTestElem[] = []
      let skip_count = 0
      for (const elem of expected_elems) {
        if (elem.type !== 'command' || elem.command.command_name !== 'load') {
          if (elem.type === 'command') {
            elem.count -= skip_count
          }
          fixed.push(elem)
        } else {
          skip_count += 1
        }
      }
      return fixed
    }

    return expected_elems
  }

  private combineElems(test_elems: GrnTestElem[], expected_elems: GrnTestElem[]) {
    let test_max_cmd_count = 0
    let expected_max_cmd_count = 0
    let tmp_count = 0
    const responses: { [key: number]: Command } = {}

    test_elems.forEach((elem) => {
      if (elem.type === 'command') {
        if (elem.count > test_max_cmd_count) {
          test_max_cmd_count = elem.count
        } else if (elem.count <= 0) {
          tmp_count += 1
          elem.count = -tmp_count
        }
      }
    })
    expected_elems.forEach((elem) => {
      if (elem.type === 'command') {
        if (elem.count > 0) {
          responses[elem.count] = elem
          if (elem.response === undefined) {
            console.log(expected_elems)
            throw new Error('missing response')
          }
        }

        if (elem.count > expected_max_cmd_count) {
          expected_max_cmd_count = elem.count
        }
      }
    })

    if (test_max_cmd_count !== expected_max_cmd_count) {
      return undefined
    }

    for (let i = 0; i < test_elems.length; i++) {
      const elem = test_elems[i]
      if (elem.type === 'command' && elem.count > 0) {
        test_elems[i] = responses[elem.count]
      }
    }

    return test_elems
  }

  includeGrn(grnFile: string) {
    merge(this.report, {
      pragma: {
        '#@include': {
          [grnFile]: 1,
        },
      },
    })

    if (GrnTestConverter.includeMap[grnFile] != null) {
      return GrnTestConverter.includeMap[grnFile]
    }

    const elems = parseGrnTest(
      fs.readFileSync(path.join(this.testFileInfo.base, grnFile), { encoding: 'utf8' }),
      false
    )
    const r_elems: GrnTestElem[] = []
    for (const elem of elems) {
      if (elem.type === 'pragma' && elem.string.match(/^#@include\s+(\S+)/)) {
        const grn = RegExp.$1
        r_elems.push(...this.includeGrn(grn))
      } else {
        if (elem.type === 'command') {
          elem.count = 0
        }
        r_elems.push(elem)
      }
    }

    GrnTestConverter.includeMap[grnFile] = r_elems
    return r_elems
  }

  private buildLines() {
    const lines: string[] = []
    const tryLines: string[] = []

    if (this.testElems === undefined) {
      return lines
    }

    for (const elem of this.testElems) {
      const onerror = this.context.onerror
      const currentLines = onerror ? tryLines : lines

      if (elem.type === 'command') {
        this.advices.command[elem.command.command_name] = true
        const converter = new CommandConverter(elem, this.testPath)
        currentLines.push(...converter.main())
        merge(this.report, converter.report)
        if (converter.skipReason != null) {
          merge(this.skipReasons, {
            [converter.skipReason]: 1,
          })
        }
        if (converter.isolationReason != null) {
          merge(this.isolatedReasons, {
            [converter.isolationReason]: 1,
          })
        }
        if (converter.omitReason != null) {
          this.omit(converter.omitReason)
        }
      } else if (elem.type === 'export') {
        currentLines.push(...this.getLinesOfExport(elem))
      } else if (elem.type === 'pragma') {
        currentLines.push(...this.getLinesOfPragma(elem))
      } else if (elem.type === 'log') {
        currentLines.push(...this.getLinesOfComment(elem))
      } else if (elem.type === 'querylog') {
        currentLines.push(...this.getLinesOfComment(elem))
      } else if (elem.type === 'note') {
        currentLines.push(...this.getLinesOfComment(elem))
      }
      currentLines.push('')

      if (onerror && !this.context.onerror) {
        this.pushTryLines(lines, tryLines)
      }
    }

    if (tryLines.length > 0) {
      this.pushTryLines(lines, tryLines)
    }

    return lines
  }

  private pushTryLines(lines: string[], tryLines: string[]) {
    lines.push('try {')
    lines.push(...tryLines)
    lines.push('} catch (e) {')
    lines.push('  return')
    lines.push('}')
    tryLines.length = 0
  }

  private getLinesOfExport(elem: Export) {
    if (elem.string.match(/^#\$(\w+)=(.+)/)) {
      const key = RegExp.$1
      const val = RegExp.$2.replace(/#\{/g, '${')
      this.addEnvAdvice(key, val)

      return [
        `// ${elem.string}`,
        `setEnv('${key}', \`${val}\`)`, // need escape
      ]
    } else {
      throw new Error('unexpected')
    }
  }

  private addEnvAdvice(key: string, val: string) {
    this.advices.env ??= {}
    this.advices.env[key] = val
  }

  private getLinesOfPragma(elem: Pragma) {
    const lines = this.getLinesOfComment(elem)

    if (elem.string.match(/^#@timeout\s+(\d+)/)) {
      const time = Number(RegExp.$1) * 1000
      this.context.timeout = time
      this.advices.pragma.timeout = time
    } else if (elem.string.match(/^#@timeout\s+default/)) {
      // nothing
    } else if (elem.string.startsWith('#@omit')) {
      this.omit('#@omit')
      this.advices.pragma.omit = true
    } else if (elem.string.startsWith('#@eval')) {
      this.omit('#@eval')
      this.advices.pragma.eval
    } else if (elem.string.match(/^#@suggest-create-dataset\s+(\w+)/)) {
      const dataset = RegExp.$1
      this.advices.pragma.suggest_create_dataset = dataset
      lines.push(`await groongar.suggestCreateDataset('${dataset}')`)
    } else if (elem.string.match(/^#@on-error\s+omit/)) {
      this.context.onerror = true
      merge(this.report, {
        pragma: {
          '#@on-error omit': 1,
        },
      })
    } else if (elem.string.match(/^#@on-error\s+default/)) {
      this.context.onerror = false
    } else if (elem.string.match(/^#@copy-path\s+(\S+)\s+(\S+)/)) {
      const src = RegExp.$1
      const dest = RegExp.$2.replace(/#\{/g, '${')
      // #{db_directory}, #{db_path}
      lines.push(`copyPath('${src}', \`${dest}\`)`)
      this.copypathMap[src] = true
      merge(this.report, {
        pragma: {
          '#@copy-path': {
            src: {
              [src]: 1,
            },
            dest: {
              [dest]: 1,
            },
          },
        },
      })
    } else if (elem.string.match(/#@sleep\s+(\d+)/)) {
      const time = Number(RegExp.$1) * 1000
      lines.push(`await sleep(${time})`)
    } else if (
      elem.string.match(/^#@generate-series\s+(\d+)\s+(\d+)\s+(\w+)\s+'((?:\\'|[^'])+)'/)
    ) {
      const from = Number(RegExp.$1)
      const to = Number(RegExp.$2)
      const table = RegExp.$3
      const value = RegExp.$4
        .trim()
        .replace(/=>/g, ':')
        .replace(/("[^"]+") \* (\d+)/g, '$1.repeat($2)')
      lines.push(
        `await generateSeries(${from}, ${to}, (i) => { return ${value}}, (values) => groongar.load({ table: '${table}', values}))`
      )
    } else if (elem.string.match(/^#@add-important-log-levels/)) {
      // ignore
    } else if (elem.string.match(/^#@remove-important-log-levels/)) {
      // ignore
    } else if (elem.string.match(/^#@disable-logging/)) {
      // ignore
    } else if (elem.string.match(/^#@enable-logging/)) {
      // ignore
    } else if (elem.string.match(/^#@collect-query-log (true|false)/)) {
      // ignore
    } else if (elem.string.match(/^#@read-timeout\s+(\S+)/)) {
      // ignore
    } else if (elem.string.match(/^#@timeout default/)) {
      // ignore
    } else if (elem.string.match(/^#@require-input-type/)) {
      // ignore
    } else if (elem.string.match(/^#@add-ignore-log-pattern/)) {
      // ignore
    } else if (elem.string.match(/^#@remove-ignore-log-pattern/)) {
      // ignore
    } else if (elem.string.match(/^#@require-interface http/)) {
      // ignore
    } else if (elem.string.match(/^#@require-testee groonga/)) {
      // ignore
    } else if (elem.string.match(/^#@require-apache-arrow/)) {
      this.advices.pragma.require_apache_arrow = true
      // ignore
    } else if (elem.string.match(/^#@include /)) {
      // !!!
    } else if (elem.string.match(/^#@require-platform\s+(!?windows)/)) {
      this.advices.pragma.require_platform = RegExp.$1 as any
    } else if (elem.string.match(/^#@sleep-after-command /)) {
      // ignore
    } else {
      throw new Error(`unexpected pragma: ${elem.string}`)
    }

    return lines
  }

  private omit(reason: string) {
    merge(this.omitReasons, { [reason]: 1 })
    merge(this.report, {
      omit_reasons: {
        [reason]: 1,
      },
    })
    this.advices.omit = true
  }

  private getLinesOfComment(elem: Comment) {
    return elem.string
      .trim()
      .split(/\n/)
      .map((line) => `// ${line}`)
  }

  // shouldOmit() {
  //   return Object.keys(this.omitReasons).length !== 0
  // }

  shouldIsolate() {
    return Object.keys(this.isolatedReasons).length !== 0
  }

  private omitReasonsLines() {
    const lines: string[] = []

    Object.keys(this.omitReasons).forEach((reason) => {
      lines.push(`// OMIT: ${reason}`)
    })

    return lines
  }

  private advicesLines() {
    const lines: string[] = []

    lines.push('{')
    lines.push(`  testPath: '${this.testPath}',`)

    lines.push(' command: {')
    Object.keys(this.advices.command).forEach((key) => {
      const bool = this.advices.command[key] ? 'true' : 'false'
      lines.push(`    ${key}: ${bool},`)
    })
    lines.push('  },')

    lines.push(' pragma: {')
    Object.keys(this.advices.pragma).forEach((key) => {
      const val = JSON.stringify(this.advices.pragma[key as keyof PragmaAdvices])
      lines.push(`    '${key}': ${val},`)
    })
    lines.push('  },')

    if (this.advices.env) {
      lines.push(' env: {')
      Object.keys(this.advices.env).forEach((key) => {
        if (this.advices.env) {
          const val = this.advices.env[key]
          lines.push(`    '${key}': \`${val}\`,`)
        }
      })
      lines.push('  },')
    }

    if (this.advices.omit) {
      lines.push('  omit: true,')
    }

    lines.push('}')

    return lines
  }

  private applyTemplate(lines: string[]) {
    const basename = path.basename(this.testPath)
    return `
      import path from 'path'
      import { createGroongar } from '@yagisumi/groongar'

      const TEST = (advices: Advices) => (shouldOmit(advices) ? it.skip : it)

      describe('grntest', () => {
        const orig_cwd = process.cwd()
        const temp_dir = path.join(__dirname, \`tmp.${basename}.\${clientInterface}\`)
        const db_directory = 'db'
        const db_path = 'db/db'
              let env: TestEnv
        const advices: Advices = ${this.advicesLines().join('\n')}

        afterAll(() => {
          return new Promise((resolve) => {
            setTimeout(() => {
              rimraf(temp_dir)
              resolve(null)
            }, 500)
          })
        })

        beforeEach(() => {
          env = undefined as any
          rimraf(temp_dir)
          mkdir(temp_dir)
          process.chdir(temp_dir)
          mkdir(db_directory)
        })

        afterEach(() => {
          process.chdir(orig_cwd)
          if (env) {
            const tmp = env
            env = undefined as any
            return teardownClient(tmp)
          }
        })

        ${this.omitReasonsLines().join('\n')}
        TEST(advices)('${this.testPath}', async () => {
          env = await setupClient({
            db_path: db_path,
            env: advices.env,
          })
          const r_grngr = createGroongar(env.client)
          if (r_grngr.error) {
            throw r_grngr.error
          }
          const groongar = r_grngr.value
          // init
          groongar['defaultOptionBase'] = {}
          groongar['defaultOptionMap'] = {}
          groongar['overwriteOptionBase'] = {}
          groongar['overwriteOptionMap'] = {}

          ${lines.join('\n')}
        })
      })
    `
  }
}
