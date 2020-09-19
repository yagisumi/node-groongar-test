import { GrnTestScanner, parseGrnTest, Command } from '../src/grntest_parser'
import heredoc from 'heredocument'
import { expect } from 'chai'

describe('grntest_parser', () => {
  describe('GrnTestScanner', () => {
    it('scan() and peek()', () => {
      const text = ['aaaaa', 'bbbbb', 'ccccc'].join('\n')
      const scanner = new GrnTestScanner(text)

      expect(scanner.peek()).to.equal('aaaaa\n')
      expect(scanner.scan()).to.equal('aaaaa\n')
      expect(scanner.peek()).to.equal('bbbbb\n')
      expect(scanner.scan()).to.equal('bbbbb\n')
      expect(scanner.peek()).to.equal('ccccc')
      expect(scanner.scan()).to.equal('ccccc')
      expect(scanner.peek()).to.be.undefined
      expect(scanner.scan()).to.be.undefined
    })

    it('readRest()', () => {
      const lines = ['aaaaa', 'bbbbb', 'ccccc']
      const text = lines.join('\n')

      {
        const scanner = new GrnTestScanner(text)
        expect(scanner.readRest()).to.equal(text)
        expect(scanner.scan()).to.be.undefined
        expect(scanner.readRest()).to.equal('')
      }

      {
        const scanner = new GrnTestScanner(text)
        expect(scanner.scan()).to.equal('aaaaa\n')
        expect(scanner.readRest()).to.equal(lines.slice(1).join('\n'))
        expect(scanner.scan()).to.be.undefined
        expect(scanner.readRest()).to.equal('')
      }
    })

    it('scanValues()', () => {
      {
        const scanner = new GrnTestScanner('[]')
        expect(scanner.scanValues()).to.equal('[]')
      }

      {
        const scanner = new GrnTestScanner('{}')
        expect(scanner.scanValues()).to.be.undefined
      }

      {
        const scanner = new GrnTestScanner('[\n\n\n]')
        expect(scanner.scanValues()).to.equal('[\n\n\n]')
      }

      {
        const text = heredoc`
          load --table SmallNumbers
          [
          ["_key","id_uint8"],
          [10,11],
          [20,22],
          [30,33]
          ]
        `
        const scanner = new GrnTestScanner(text)
        expect(scanner.scanCommand()).to.equal('load --table SmallNumbers\n')
        expect(JSON.parse(scanner.scanValues() as string)).to.deep.equal([
          ['_key', 'id_uint8'],
          [10, 11],
          [20, 22],
          [30, 33],
        ])
      }
    })

    it('scanCommand()', () => {
      {
        const scanner = new GrnTestScanner('status\n')
        expect(scanner.scanCommand()).to.equal('status\n')
      }

      {
        const scanner = new GrnTestScanner('/d/status.json\n')
        expect(scanner.scanCommand()).to.equal('/d/status.json\n')
      }

      {
        const scanner = new GrnTestScanner('select \\\n --table Users \\\n  --command_version 3\n')
        expect(scanner.scanCommand()).to.equal('select \\\n --table Users \\\n  --command_version 3\n')
      }

      {
        const scanner = new GrnTestScanner('[]\n')
        expect(scanner.scanCommand()).to.be.undefined
      }

      {
        const scanner = new GrnTestScanner('# comment\n')
        expect(scanner.scanCommand()).to.be.undefined
      }
    })

    it('scanComments()', () => {
      const text = heredoc`
        #$GRN_II_BUILDER_BLOCK_THRESHOLD=5
        #@collect-query-log true
        #>delete --filter "_key @^ \"b\"" --table "Users"
        #:000000000000000 filter(2): #<accessor _key(Users)> "b" prefix
        #:000000000000000 delete(2): [0][1]
        #:000000000000000 send(0)
        #<000000000000000 rc=0
        # TODO
        # TODO
        #|i| [object][search][index][key][near] <Terms.index>
        #|i| grn_ii_sel > (a k)
        #|i| n=2 (a k)
        #|i| exact: 2
        #|i| hits=2
        #@collect-query-log false
        # TODO
        table_create Data TABLE_NO_KEY
      `

      const scanner = new GrnTestScanner(text)
      const comments = scanner.scanComments()
      expect(comments.length).to.equal(7)
      expect(comments[0].type).to.equal('export')
      expect(comments[1].type).to.equal('pragma')
      expect(comments[2].type).to.equal('querylog')
      expect(comments[3].type).to.equal('note')
      expect(comments[4].type).to.equal('log')
      expect(comments[5].type).to.equal('pragma')
      expect(comments[6].type).to.equal('note')
      expect(scanner.index).to.equal(16)
      expect(scanner.scanCommand()).to.equal('table_create Data TABLE_NO_KEY\n')
    })

    it('scanResponse()', () => {
      {
        const text = heredoc`
          [[0,0.0,0.0],true]
          column_create LargeNumbers id_text COLUMN_SCALAR Text
        `
        const scanner = new GrnTestScanner(text)
        expect(scanner.scanResponse()).to.equal('[[0,0.0,0.0],true]\n')
        expect(scanner.scanResponse()).to.be.undefined
        expect(scanner.scanCommand()).to.equal('column_create LargeNumbers id_text COLUMN_SCALAR Text\n')
      }
    })
  })

  it('scanDumpResponse', () => {
    {
      const text = heredoc`
        dump   --dump_plugins no   --dump_schema no
        load --table Data
        [
        ["_id","numbers"],
        [1,[1,-2]],
        [2,[-3,4]]
        ]

        column_create Numbers data_numbers COLUMN_INDEX Data numbers
        select Data --filter 'numbers @ -2'
        [[0,0.0,0.0],[[[1],[["_id","UInt32"],["numbers","Int32"]],[1,[1,-2]]]]]
      `
      const scanner = new GrnTestScanner(text)
      expect(scanner.scanCommand()).to.equal('dump   --dump_plugins no   --dump_schema no\n')
      const res = scanner.scanDumpResponse()
      expect(res?.endsWith('numbers\n')).to.be.true
      expect(scanner.scanCommand()).to.equal("select Data --filter 'numbers @ -2'\n")
      expect(scanner.scanResponse()).to.equal(
        '[[0,0.0,0.0],[[[1],[["_id","UInt32"],["numbers","Int32"]],[1,[1,-2]]]]]\n'
      )
    }

    {
      const text = 'dump   --dump_plugins no   --dump_schema no\n'
      const scanner = new GrnTestScanner(text)
      expect(scanner.scanCommand()).to.equal(text)
      expect(scanner.scanDumpResponse()).to.equal('')
    }
  })

  it('skipEmptyLines()', () => {
    const text = heredoc`
        table_create Users TABLE_HASH_KEY ShortText


        column_create Users name COLUMN_SCALAR ShortText
      `
    const scanner = new GrnTestScanner(text)
    scanner.skipEmptyLines()
    expect(scanner.index).to.equal(0)
    expect(scanner.scanCommand()).to.equal('table_create Users TABLE_HASH_KEY ShortText\n')
    expect(scanner.index).to.equal(1)
    scanner.skipEmptyLines()
    expect(scanner.index).to.equal(3)
    scanner.skipEmptyLines()
    expect(scanner.index).to.equal(3)
    expect(scanner.scanCommand()).to.equal('column_create Users name COLUMN_SCALAR ShortText\n')
  })

  it('output_type=appache-allow', () => {
    const text = heredoc`
      logical_range_filter Logs time   --command_version 3   --output_type apache-arrow
      _key: string
      int32: int32
      int32_vector: list<item: int32>
      int64: int64
      reference_short_text: string
      reference_short_text_vector: list<item: string>
      time: timestamp[ns]
      uint32: uint32
        _key	int32	int32_vector	int64	reference_short_text	reference_short_text_vector	                     time	uint32
      0	2015-02-03 23:59:58	  -29	[
        1,
        -2,
        3
      ]	4294967296	Hello 2015-02-03    	[
        "2015-02-03 1",
        "2015-02-03 2"
      ]	2015-02-03T23:59:58+09:00	    29
      1	2015-02-04 00:00:00	 -290	[
        10,
        -20,
        30
      ]	4294967297	Hello 2015-02-04    	[
        "2015-02-04 1",
        "2015-02-04 2",
        "2015-02-04 3"
      ]	2015-02-04T00:00:00+09:00	   290
      2	2015-02-05 00:00:00	-2900	[
        100,
        -200,
        300
      ]	4294967298	Hello 2015-02-05    	[]                         	2015-02-05T00:00:00+09:00	  2900
      ========================================
      return_code: int32
      start_time: timestamp[ns]
      elapsed_time: double
      -- metadata --
      GROONGA:data_type: metadata
        return_code	               start_time	elapsed_time
      0	          0	1970-01-01T09:00:00+09:00	    0.000000
      #>logical_range_filter --command_version "3" --logical_table "Logs" --output_type "apache-arrow" --shard_key "time"
      #:000000000000000 sort(1)[Logs_20150203]: time
      #:000000000000000 send(0)
      #:000000000000000 sort(1)[Logs_20150204]: time
      #:000000000000000 send(0)
      #:000000000000000 sort(1)[Logs_20150205]: time
      #:000000000000000 send(0)
      #:000000000000000 output(3)
      #:000000000000000 send(0)
      #<000000000000000 rc=0
      logical_range_filter Logs time   --command_version 3   --output_type apache-arrow
    `

    const scanner = new GrnTestScanner(text)
    expect(scanner.scanCommand()).to.equal(
      'logical_range_filter Logs time   --command_version 3   --output_type apache-arrow\n'
    )
    const res = scanner.scanDumpResponse()
    expect(res?.endsWith('0.000000\n')).to.be.true
    const comments = scanner.scanComments()
    expect(comments.length).to.equal(1)
    expect(scanner.scanCommand()).to.equal(
      'logical_range_filter Logs time   --command_version 3   --output_type apache-arrow\n'
    )
  })

  describe('parseGrnTest', () => {
    it('expected', () => {
      const grntest = heredoc`
        table_create Users TABLE_HASH_KEY ShortText
        [[0,0.0,0.0],true]
        column_create Users name COLUMN_SCALAR ShortText
        [[0,0.0,0.0],true]
        load --table Users
        [
        {"_key": "bob", "name": "Bob"},
        {"_key": "mallory", "name": "Mallory"},
        {"_key": "peggy", "name": "Peggy"},
        {"_key": "alice", "name": "Alice"},
        {"_key": "eve", "name": "Eve"}
        ]
        [[0,0.0,0.0],5]
        dump --sort_hash_table yes
        table_create Users TABLE_HASH_KEY ShortText
        column_create Users name COLUMN_SCALAR ShortText

        load --table Users
        [
        ["_key","name"],
        ["alice","Alice"],
        ["bob","Bob"],
        ["eve","Eve"],
        ["mallory","Mallory"],
        ["peggy","Peggy"]
        ]
      `
      const elems = parseGrnTest(grntest, true)
      expect(elems.length).to.equal(4)
      expect(elems[0].type).to.equal('command')
      expect((elems[0] as Command).count).to.equal(1)
      expect(elems[1].type).to.equal('command')
      expect((elems[1] as Command).count).to.equal(2)
      expect(elems[2].type).to.equal('command')
      expect((elems[2] as Command).count).to.equal(3)
      expect(elems[3].type).to.equal('command')
      expect((elems[3] as Command).count).to.equal(4)
    })

    it('test (first line comment)', () => {
      const grntest = heredoc`
        #@on-error omit
        plugin_register sharding
        #@on-error default

        dump
      `
      const elems = parseGrnTest(grntest, false)
      expect(elems.length).to.equal(4)
      expect(elems[0].type).to.equal('pragma')
      expect(elems[1].type).to.equal('command')
      expect((elems[1] as Command).count).to.equal(1)
      expect(elems[2].type).to.equal('pragma')
      expect(elems[3].type).to.equal('command')
      expect((elems[3] as Command).count).to.equal(2)
    })
  })
})
