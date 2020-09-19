type TestingParts = {
  toBeTrue: string
  toBeFalse: string
  toBeUndefined: string
  toEqual: string
  toBeInstanceOf: string
  beforeAll: string
  afterAll: string
  import: string
}

type Testing = {
  jest: TestingParts
  mocha: TestingParts
}

export const testing: Testing = {
  jest: {
    toBeTrue: 'toBe(true)',
    toBeFalse: 'toBe(false)',
    toBeUndefined: 'toBeUndefined()',
    toEqual: 'toEqual',
    beforeAll: 'beforeAll',
    afterAll: 'afterAll',
    toBeInstanceOf: 'toBeInstanceOf',
    import: '',
  },
  mocha: {
    toBeTrue: 'to.be.true',
    toBeFalse: 'to.be.false',
    toBeUndefined: 'to.be.undefined',
    toEqual: 'to.deep.equal',
    toBeInstanceOf: 'to.be.an.instanceof',
    beforeAll: 'before',
    afterAll: 'after',
    import: `import { expect } from 'chai'`,
  },
}
