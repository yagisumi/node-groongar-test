import path from 'path'
import fs from 'fs'
import util from 'util'
import rimraf from 'rimraf'
import moment from 'moment'
import sortObject from 'sortobject'
import mkdirp from 'mkdirp'
import prettier from 'prettier'

export function path_normalize(path: string) {
  return path.replace(/\\/g, '/')
}

export type Config = {
  groonga: string
  groonga_suggest_create_dataset: string
  groonga_src: string
  // grntest: string
  // prettier: string
}

function sanitize(value: unknown, init: string) {
  if (typeof value !== 'string' || value.length === 0) {
    return init
  } else {
    return value
  }
}

const CONFIG_FILE = 'config.json'
const ROOT_DIR = path.resolve(__dirname, '../..')
const TOOLS_DIR = path.join(ROOT_DIR, 'tools')
const PATH_CONFIG = path.join(TOOLS_DIR, CONFIG_FILE)

function defaultCommand(cmd: string) {
  if (process.platform === 'win32') {
    if (process.env.GROONGA_PATH) {
      return path.join(process.env.GROONGA_PATH, cmd + '.exe')
    }
  }
  return cmd
}

export function init_config() {
  if (fs.existsSync(PATH_CONFIG)) {
    throw new Error(`already exists ${CONFIG_FILE}`)
  }

  const config: Config = {
    groonga: '',
    groonga_suggest_create_dataset: '',
    groonga_src: '',
  }

  fs.writeFileSync(PATH_CONFIG, JSON.stringify(config, null, 2))
  console.log(`created ${PATH_CONFIG}`)
}

export class Env {
  readonly path_config = PATH_CONFIG

  readonly groongar_root_dir = ROOT_DIR
  readonly groongar_test_dir = path.join(this.groongar_root_dir, 'test')
  readonly groongar_grntest_dir = path.join(this.groongar_test_dir, 'grntest')
  readonly groongar_typecheck_dir = path.join(this.groongar_test_dir, 'typecheck')
  readonly path_groongar_ts = path.join(ROOT_DIR, 'src/groongar.ts')
  readonly tools_dir = TOOLS_DIR
  readonly groonga_repository_dir = path.join(this.tools_dir, 'groonga')
  readonly groonga_git_url = 'https://github.com/groonga/groonga.git'

  readonly report_dir = path.join(TOOLS_DIR, 'report')
  readonly doc_test_dir = path.join(TOOLS_DIR, 'doc_test')
  readonly temp_dir = path.join(TOOLS_DIR, 'temp')
  readonly tools_test_dir = path.join(TOOLS_DIR, 'test')
  readonly outputs_dir = path.join(TOOLS_DIR, 'outputs')

  config: Config

  get groonga() {
    return this.config.groonga
  }

  get groonga_suggest_create_dataset() {
    return this.config.groonga_suggest_create_dataset
  }

  constructor() {
    this.config = this.load_config()
  }

  private load_config() {
    if (!fs.existsSync(this.path_config)) {
      init_config()
    }

    const file = fs.readFileSync(this.path_config, { encoding: 'utf8' })
    const cfg = JSON.parse(file) as Config
    if (typeof cfg !== 'object') {
      throw new Error(`invalid format: ${CONFIG_FILE}`)
    }

    cfg.groonga = sanitize(cfg.groonga, defaultCommand('groonga'))
    cfg.groonga_suggest_create_dataset = sanitize(cfg.groonga, defaultCommand('groonga-suggest-create-dataset'))
    // cfg.grntest = sanitize(cfg.grntest, 'grntest')

    return cfg
  }

  get groonga_src_dir(): string | undefined {
    if (fs.existsSync(this.config.groonga_src)) {
      return this.config.groonga_src
    } else {
      return undefined
    }
  }

  clean() {
    console.log(`CLEAN: ${this.report_dir}`)
    rimraf.sync(this.report_dir)
    console.log(`CLEAN: ${this.outputs_dir}`)
    rimraf.sync(this.outputs_dir)
    console.log(`CLEAN: ${this.temp_dir}`)
    rimraf.sync(this.temp_dir)
    console.log(`CLEAN: ${this.doc_test_dir}`)
    rimraf.sync(this.doc_test_dir)
  }

  // clean_test() {
  //   rimraf.sync(this.tools_test_dir)
  // }

  clean_grntest() {
    console.log(`CLEAN: ${this.groongar_grntest_dir}`)
    rimraf.sync(this.groongar_grntest_dir)
    console.log(`CLEAN: ${this.groongar_typecheck_dir}`)
    rimraf.sync(this.groongar_typecheck_dir)
  }

  save_output(pathname: string, output: any) {
    const fullpath = path.join(this.outputs_dir, pathname)
    mkdirp.sync(path.dirname(fullpath))
    fs.writeFileSync(fullpath, JSON.stringify(output, null, 2))
  }

  save_grntest(pathname: string, test: string) {
    const fullpath = path.join(this.groongar_grntest_dir, pathname)
    mkdirp.sync(path.dirname(fullpath))
    fs.writeFileSync(fullpath, test)
  }

  save_typecheck(pathname: string, test: string) {
    const fullpath = path.join(this.groongar_typecheck_dir, pathname)
    mkdirp.sync(path.dirname(fullpath))
    fs.writeFileSync(fullpath, test)
  }

  save_report(name: string, obj: any) {
    if (!fs.existsSync(this.report_dir)) {
      fs.mkdirSync(this.report_dir)
    }

    const now = moment()
    const file = `${name}-${now.format('YYYYMMDD-HHmmss')}.txt`

    fs.writeFileSync(path.join(this.report_dir, file), util.inspect(sortObject(obj), false, null))
  }

  private prettierrc: any

  prettier_format(src: string) {
    if (this.prettierrc == null) {
      this.prettierrc = JSON.parse(
        fs.readFileSync(path.join(this.groongar_root_dir, '.prettierrc'), { encoding: 'utf8' })
      )
      this.prettierrc.parser = 'typescript'
    }
    return prettier.format(src, this.prettierrc)
  }
}
