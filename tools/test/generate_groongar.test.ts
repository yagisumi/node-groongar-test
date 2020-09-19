import { method_name, comment } from '../src/generate_groongar'
import { expect } from 'chai'

describe('generate_groongar', () => {
  it('method_name', () => {
    expect(method_name('select')).to.equal('select')
    expect(method_name('table_list')).to.equal('tableList')
    expect(method_name('logical_shard_list')).to.equal('logicalShardList')
  })

  it('comment', () => {
    const desc = 'foo bar'
    expect(comment(desc)).to.deep.equal(['/**', ' * foo bar', ' */'].join('\n'))
  })
})
