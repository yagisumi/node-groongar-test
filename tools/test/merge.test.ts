import { merge, kindof } from '@/merge'

describe('merge', () => {
  it('kindof', () => {
    expect(kindof(undefined)).toBe('undefined')
    expect(kindof('test')).toBe('string')
    expect(kindof(100)).toBe('number')
    expect(kindof(true)).toBe('boolean')
    expect(kindof({})).toBe('object')
    expect(kindof(null)).toBe('null')
    expect(kindof([])).toBe('array')
  })

  it('merge', () => {
    const x = {
      a: 100,
      b: {
        c: false,
        d: 'x',
      },
      e: [1, 2],
      f: {},
      g: 'test',
      h: {},
    }
    const y = {
      a: 1000,
      b: {
        c: true,
        d: 'y',
      },
      e: [3, 4],
      f: null,
      g: undefined,
      i: 3,
    }
    const merged = merge(x, y)
    expect(merged.a).toBe(x.a)
    expect(merged.b.c).toBe(false)
    expect(merged.b.d).toBe('y')
    expect(merged.e).toEqual([1, 2, 3, 4])
    expect(merged.f).toBeNull()
    expect(merged.g).toBeUndefined()
    expect(merged.h).toEqual({})
    expect(merged.i).toBe(3)

    const obj: any = {}
    merge(obj, { a: [1], b: 1 })
    expect(obj).toEqual({ a: [1], b: 1 })
    merge(obj, { a: [2], b: 2 })
    expect(obj).toEqual({ a: [1, 2], b: 3 })
  })
})
