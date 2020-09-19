import fs from 'fs'
import path from 'path'

export function setEnv(key: string, value: string) {
  process.env[key] = value
}

export function deleteEnv(key: string) {
  delete process.env[key]
}

export function mkdir(path: string) {
  fs.mkdirSync(path)
}

export function exists(path: string) {
  return fs.existsSync(path)
}

export function copyFile(src: string, dest: string) {
  fs.copyFileSync(src, dest)
}

export function rimraf(dir_path: string) {
  if (fs.existsSync(dir_path)) {
    fs.readdirSync(dir_path).forEach(function (entry) {
      const entry_path = path.join(dir_path, entry)
      if (fs.lstatSync(entry_path).isDirectory()) {
        rimraf(entry_path)
      } else {
        fs.unlinkSync(entry_path)
      }
    })
    fs.rmdirSync(dir_path)
  }
}

export function getGroongaPath() {
  if (process.platform === 'win32' && process.env.GROONGA_PATH) {
    return path.join(process.env.GROONGA_PATH, 'bin/groonga.exe')
  }
  return 'groonga'
}

export function copyPath(src: string, dest: string) {
  // src: 'fixture/object_remove/too_small.data'
  const src2 = path.resolve(__dirname, '../grntest', src)
  fs.copyFileSync(src2, dest)
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

export function fixDBPath(actual: unknown, db_path: string | RegExp) {
  const reDBPath =
    typeof db_path === 'string'
      ? new RegExp(db_path.replace(/[-\\/\\\\^$*+?.()|[\\]{}]/g, '\\$&').replace(/\\/g, '\\\\'), 'g')
      : db_path

  if (typeof actual === 'string') {
    return actual.replace(reDBPath, 'db/db')
  } else if (Array.isArray(actual)) {
    for (let i = 0; i < actual.length; i++) {
      actual[i] = fixDBPath(actual[i], reDBPath)
    }
  } else if (typeof actual === 'object') {
    if (actual != null) {
      const act = actual as Record<string, unknown>
      Object.keys(actual).forEach((key) => {
        act[key] = fixDBPath(act[key], reDBPath)
      })
    }
  }
  return actual
}

export function fixObjectInspect(obj: unknown) {
  if (typeof obj === 'object') {
    if (obj != null) {
      const o = obj as Record<string, unknown>
      Object.keys(obj).forEach((key) => {
        if (typeof o[key] === 'object') {
          o[key] = fixObjectInspect(o[key])
        } else if (key === 'disk_usage') {
          o['disk_usage'] = 0
        }
      })
    }
  }

  return obj
}
