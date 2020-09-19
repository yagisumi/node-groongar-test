import fs from 'fs'
import path from 'path'
import heredoc from 'heredocument'
import { Env } from './env'
import prettier from 'prettier'

const OPTIONAL = 'OPTIONAL'
const REQUIRED = 'REQUIRED'
type Vers = { vers: string; default: number }
const CommonVers = { vers: '1 | 2 | 3', default: 1 }
const FLATTEN_REQUIRED = 'FLATTEN_REQUIRED'
const COMMANDS: { [name: string]: ['OPTIONAL' | 'REQUIRED' | 'FLATTEN_REQUIRED', Vers, string] } = {
  cache_limit: [OPTIONAL, CommonVers, '`cache_limit` gets or sets the max number of query cache entries.'],
  check: [REQUIRED, CommonVers, '`check` displays the state of the object.'],
  clearlock: [
    REQUIRED,
    CommonVers,
    '`clearlock` releases the lock set on the object.\n@deprecated Use `lock_clear` instead.',
  ],
  column_copy: [REQUIRED, CommonVers, '`column_copy` copies all column values to other column.'],
  column_create: [REQUIRED, CommonVers, '`column_create` creates a new column in a table.'],
  column_list: [REQUIRED, CommonVers, '`column_list` command lists columns in a table.'],
  column_remove: [REQUIRED, CommonVers, '`column_remove` deletes a column defined in the table.'],
  column_rename: [REQUIRED, CommonVers, '`column_rename` command renames a column.'],
  config_delete: [REQUIRED, CommonVers, '`config_delete` command deletes the specified configuration item.'],
  config_get: [REQUIRED, CommonVers, '`config_get` command returns the value of the specified configuration item.'],
  config_set: [REQUIRED, CommonVers, '`config_set` command sets a value to the specified configuration item.'],
  database_unmap: [OPTIONAL, CommonVers, '`database_unmap` unmaps already mapped tables and columns in the database.'],
  define_selector: [REQUIRED, CommonVers, '`define_selector` defines a new search command.'],
  defrag: [OPTIONAL, CommonVers, '`defrag` command resolves fragmentation of specified objects.'],
  delete: [REQUIRED, CommonVers, '`delete` command deletes specified record of table.'],
  dump: [OPTIONAL, CommonVers, '`dump` outputs a schema and data of a database.'],
  io_flush: [OPTIONAL, CommonVers, '`io_flush` flushes all changes in memory to disk explicitly.'],
  index_column_diff: [REQUIRED, CommonVers, '@todo'],
  load: [
    FLATTEN_REQUIRED,
    { vers: '1 | 2 | 3', default: 3 },
    '`load` loads data as records in the current database and updates values of each columns.',
  ],
  lock_acquire: [OPTIONAL, CommonVers, '`lock_acquire` command acquires the lock of the target object.'],
  lock_clear: [OPTIONAL, CommonVers, '`lock_clear` command clear the lock of the target object recursively.'],
  lock_release: [OPTIONAL, CommonVers, '`lock_release` command releases the lock of the target object.'],
  log_level: [REQUIRED, CommonVers, '`log_level` command sets log level of Groonga.'],
  log_put: [REQUIRED, CommonVers, '`log_put` outputs a message to the log.'],
  log_reopen: [OPTIONAL, CommonVers, '`log_reopen` is a command that reloads log files.'],
  logical_count: [
    FLATTEN_REQUIRED,
    CommonVers,
    '`logical_count` is a command that has only count feature in logical_select. logical_select searches records from multiple tables, outputs the number of matched records, outputs columns of the matched records and so on.',
  ],
  logical_parameters: [
    OPTIONAL,
    CommonVers,
    '`logical_parameters` is a command for test. Normally, you don’t need to use this command.',
  ],
  logical_range_filter: [
    FLATTEN_REQUIRED,
    { vers: '2', default: 2 },
    '`logical_range_filter` is a sharding version of range_filter.',
  ],
  logical_select: [FLATTEN_REQUIRED, { vers: '2', default: 2 }, '`logical_select` is a sharding version of select.'],
  logical_shard_list: [
    REQUIRED,
    CommonVers,
    '`logical_shard_list` returns all existing shard names against the specified logical table name.',
  ],
  logical_table_remove: [
    REQUIRED,
    CommonVers,
    '`logical_table_remove` removes tables and their columns for the specified logical table.',
  ],
  normalize: [REQUIRED, CommonVers, '`normalize` command normalizes text by the specified normalizer.'],
  normalizer_list: [OPTIONAL, CommonVers, '`normalizer_list` command lists normalizers in a database.'],
  object_exist: [
    REQUIRED,
    CommonVers,
    '`object_exist` returns whether object with the specified name exists or not in database.',
  ],
  object_inspect: [OPTIONAL, CommonVers, '`object_inspect` inspects an object. You can confirm details of an object.'],
  object_list: [OPTIONAL, CommonVers, '`object_list` lists objects in database.'],
  object_remove: [REQUIRED, CommonVers, '`object_remove` removes an object.'],
  object_set_visibility: [REQUIRED, CommonVers, '@todo'],
  plugin_register: [REQUIRED, CommonVers, '`plugin_register` command registers a plugin. '],
  plugin_unregister: [REQUIRED, CommonVers, '`plugin_unregister` command unregisters a plugin.'],
  query_expand: [REQUIRED, CommonVers, '@todo'],
  quit: [OPTIONAL, CommonVers, '`quit` ends the session.'],
  query_log_flags_add: [REQUIRED, CommonVers, '@todo'],
  query_log_flags_get: [OPTIONAL, CommonVers, '@todo'],
  query_log_flags_remove: [REQUIRED, CommonVers, '@todo'],
  query_log_flags_set: [REQUIRED, CommonVers, '@todo'],
  range_filter: [REQUIRED, { vers: '1 | 2 | 3', default: 3 }, '@todo'],
  register: [REQUIRED, CommonVers, '@deprecated Use `plugin_register` instead.'],
  reindex: [OPTIONAL, CommonVers, '`reindex` command recreates one or more index columns.'],
  request_cancel: [REQUIRED, CommonVers, '`request_cancel` command cancels a running request.'],
  ruby_eval: [REQUIRED, CommonVers, '`ruby_eval` command evaluates Ruby script and returns the result.'],
  // ruby_load: [REQUIRED, '`ruby_load` command loads specified Ruby script.'], # Removed
  schema: [OPTIONAL, CommonVers, '`schema` command returns schema in the database.'],
  select: [
    FLATTEN_REQUIRED,
    { vers: '1 | 2 | 3', default: 3 },
    '`select` searches records that are matched to specified conditions from a table and then outputs them.',
  ],
  shutdown: [OPTIONAL, CommonVers, '`shutdown` stops the Groonga server process.'],
  status: [OPTIONAL, CommonVers, '`status` returns the current status of the context that processes the request.'],
  suggest: [REQUIRED, CommonVers, 'suggest returns completion, correction and/or suggestion for a query.'],
  table_copy: [REQUIRED, CommonVers, '`table_copy` copies a table.'],
  table_create: [REQUIRED, CommonVers, '`table_create` creates a new table in the current database.'],
  table_list: [OPTIONAL, CommonVers, '`table_list` lists the tables defined in the current database.'],
  table_remove: [REQUIRED, CommonVers, '`table_remove` removes a table and its columns.'],
  table_rename: [REQUIRED, CommonVers, '`table_rename` command renames a table.'],
  table_tokenize: [REQUIRED, CommonVers, '`table_tokenize` command tokenizes text by the specified table’s tokenizer.'],
  thread_limit: [OPTIONAL, CommonVers, 'Not Implemented.'],
  tokenize: [REQUIRED, CommonVers, '`tokenize` command tokenizes text by the specified tokenizer.'],
  tokenizer_list: [OPTIONAL, CommonVers, '`tokenizer_list` command lists tokenizers in a database.'],
  truncate: [
    REQUIRED,
    CommonVers,
    '`truncate` command deletes all records from specified table or all values from specified column.',
  ],
}

function read_groongar_ts(path_groongar_ts: string) {
  const groongar_ts = fs.readFileSync(path_groongar_ts, { encoding: 'utf8' })
  const lines = groongar_ts.split(/\n/)

  let pre_template_idx = 0
  let post_template_idx = lines.length
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (line.indexOf('// <commands>') >= 0) {
      pre_template_idx = i
    } else if (line.indexOf('// </commands>') >= 0) {
      post_template_idx = i
    }
  }

  return {
    pre: lines.slice(0, pre_template_idx + 1).join('\n'),
    post: lines.slice(post_template_idx).join('\n'),
  }
}

export function method_name(cmd: string) {
  const name = cmd
    .split(/_/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join('')
  return name.charAt(0).toLowerCase() + name.slice(1)
}

export function comment(desc: string) {
  const lines = ['/**']
  lines.push(...desc.split(/\n/).map((line) => ` * ${line}`))
  lines.push(' */')
  return lines.join('\n')
}

function generate_method(cmd: string, vers: Vers, desc: string, optional: boolean) {
  const q = optional ? '?' : ''
  return heredoc`
    ${comment(desc)}
    ${method_name(cmd)}<V extends ${
    vers.vers
  }>(options${q}: opts<'${cmd}'> & CommandVersion<V>): Promise<Result<ret<'${cmd}', V>>>
    ${method_name(cmd)}<V extends ${
    vers.vers
  } = ${vers.default.toString()}>(options${q}: opts<'${cmd}'>): Promise<Result<ret<'${cmd}', V>>>
    ${method_name(cmd)}<V extends ${
    vers.vers
  }>(options${q}: opts<'${cmd}'> | (opts<'${cmd}'> & CommandVersion<V>)): Promise<Result<ret<'${cmd}', V>>> {
      return new Promise((resolve) => {
        try {
          const opts = this.mergeOptions('${cmd}', options)
          this.client.command('${cmd}', opts, (err, data) => {
            if (err) {
              resolve(ERR(err))
            } else {
              resolve(OK(data))
            }
          })
        } catch (err) {
          resolve(ERR(err))
        }
      })
    }
  `
}

function generate_flatten_method(cmd: string, vers: Vers, desc: string) {
  return heredoc`
  ${comment(desc)}
  ${method_name(cmd)}<V extends ${
    vers.vers
  }>(options: opts<'${cmd}'> & CommandVersion<V>): Promise<Result<ret<'${cmd}', V>>>
  ${method_name(cmd)}<V extends ${
    vers.vers
  } = ${vers.default.toString()}>(options: opts<'${cmd}'>): Promise<Result<ret<'${cmd}', V>>>
  ${method_name(cmd)}<V extends ${
    vers.vers
  }>(options: opts<'${cmd}'> | (opts<'${cmd}'> & CommandVersion<V>)): Promise<Result<ret<'${cmd}', V>>> {
      return new Promise((resolve) => {
        try {
          const flattened: CommandOptions = {}
          flattenOptions(flattened, options)

          const opts = this.mergeOptions('${cmd}', flattened)
          this.client.command('${cmd}', opts, (err, data) => {
            if (err) {
              resolve(ERR(err))
            } else {
              resolve(OK(data))
            }
          })
        } catch (err) {
          resolve(ERR(err))
        }
      })
    }
  `
}

function generate_methods() {
  const methods: string[] = []

  Object.keys(COMMANDS).forEach((cmd) => {
    const [kind, vers, desc] = COMMANDS[cmd]
    if (kind === 'OPTIONAL') {
      methods.push(generate_method(cmd, vers, desc, true))
    } else if (kind === 'REQUIRED') {
      methods.push(generate_method(cmd, vers, desc, false))
    } else if (kind === 'FLATTEN_REQUIRED') {
      methods.push(generate_flatten_method(cmd, vers, desc))
    }
  })

  return methods.join('\n')
}

function format(env: Env, src: string) {
  const prettierrc = JSON.parse(fs.readFileSync(path.join(env.groongar_root_dir, '.prettierrc'), { encoding: 'utf8' }))
  prettierrc.parser = 'typescript'
  return prettier.format(src, prettierrc)
}

export function generateGronngar(env: Env) {
  const template = read_groongar_ts(env.path_groongar_ts)
  const methods = generate_methods()
  const source = [template.pre, '', methods, template.post].join('\n')
  fs.writeFileSync(env.path_groongar_ts, format(env, source))
}
