export type Types =
  | 'string'
  | 'number'
  | 'bigint'
  | 'boolean'
  | 'symbol'
  | 'undefined'
  | 'object'
  | 'function'
  | 'null'
  | 'array'

export function kindof(v: any): Types {
  let t: Types = typeof v
  if (t === 'object') {
    if (v === null) {
      t = 'null'
    } else if (Array.isArray(v)) {
      t = 'array'
    }
  }
  return t
}

export function merge(a: any, b: any) {
  const type_a = kindof(a)
  const type_b = kindof(b)

  if (type_a !== type_b) {
    return b
  }

  if (type_a === 'boolean') {
    return a && b
  }

  if (type_a === 'number' || type_a === 'bigint') {
    return a + b
  }

  if (type_a === 'array') {
    return a.concat(b)
  }

  if (type_a === 'object') {
    Object.keys(b).forEach((key) => {
      if (key in a) {
        a[key] = merge(a[key], b[key])
      } else {
        a[key] = b[key]
      }
    })

    return a

    const keys: { [key: string]: true } = Object.create(null)
    const merged: { [key: string]: any } = {}
    Object.keys(a).forEach((key) => {
      keys[key] = true
    })
    Object.keys(b).forEach((key) => {
      keys[key] = true
    })
    Object.keys(keys).forEach((key) => {
      if (key in a && key in b) {
        merged[key] = merge(a[key], b[key])
      } else if (key in a) {
        merged[key] = a[key]
      } else {
        merged[key] = b[key]
      }
    })
    return merged
  }

  return b
}
