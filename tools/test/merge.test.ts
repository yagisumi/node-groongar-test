import { merge, kindof } from '../src/merge'
import { expect } from 'chai'

describe('merge', () => {
  it('kindof', () => {
    expect(kindof(undefined)).to.equal('undefined')
    expect(kindof('test')).to.equal('string')
    expect(kindof(100)).to.equal('number')
    expect(kindof(true)).to.equal('boolean')
    expect(kindof({})).to.equal('object')
    expect(kindof(null)).to.equal('null')
    expect(kindof([])).to.equal('array')
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
    expect(merged.a).to.deep.equal(x.a)
    expect(merged.b.c).to.be.false
    expect(merged.b.d).to.equal('y')
    expect(merged.e).to.deep.equal([1, 2, 3, 4])
    expect(merged.f).to.be.null
    expect(merged.g).to.be.undefined
    expect(merged.h).to.deep.equal({})
    expect(merged.i).to.equal(3)

    const obj: any = {}
    merge(obj, { a: [1], b: 1 })
    expect(obj).to.deep.equal({ a: [1], b: 1 })
    merge(obj, { a: [2], b: 2 })
    expect(obj).to.deep.equal({ a: [1, 2], b: 3 })
  })
})
