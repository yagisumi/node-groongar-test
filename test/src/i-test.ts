import glob from 'glob'
import child_process from 'child_process'
import chalk from 'chalk'

type Status = 'passed' | 'failed' | 'skipped'

type StatusColor = { [R in Status]: (...text: string[]) => string }

type MochaJsonError = {
  message: string
  stack: string
  matcherResult: {
    actual: unknown
    expected: unknown
    name: string
    pass: boolean
  }
}

type MochaJsonTestPassed = {
  title: string
  fullTitle: string
  file: string
  duration: number
  currentRetry: number
  err: { stack: never }
}

type MochaJsonTestFailed = {
  title: string
  fullTitle: string
  file: string
  duration: number
  currentRetry: number
  err: MochaJsonError
}

type MochaJsonTest = MochaJsonTestPassed | MochaJsonTestFailed

type MochaJson = {
  stats: {
    passes: number
    pending: number
    failures: number
    duration: number
  }
  tests: Array<MochaJsonTest>
  failures: Array<MochaJsonTestFailed>
}

const Chalks: StatusColor = {
  passed: chalk.green,
  failed: chalk.red,
  skipped: chalk.yellow,
}

type StatusCount = {
  [key in Status]: number
}

class GrnTestRunner {
  readonly tests: Array<string>
  concurrency: number
  printResult: (path: string, status: Status, time_ms: number) => void
  startTime: number
  runnerCount = 0
  runnerIndex = 0
  statusCount: StatusCount
  reported = false
  failedMessages: Array<string> = []

  constructor(tests: Array<string>, concurrency = 2) {
    this.tests = tests
    this.concurrency = Math.max(concurrency, 1)
    this.printResult = this.initPrintResult(tests)
    this.statusCount = {
      passed: 0,
      failed: 0,
      skipped: 0,
    }
    console.log(`TEST: ${this.tests.length} files`)
    this.startTime = Date.now()
  }

  initPrintResult(tests: Array<string>) {
    let index = 0
    const all = tests.length
    const width = tests.length.toString().length
    const space = ' '.repeat(width)

    return (test: string, status: Status, time_ms: number) => {
      index += 1
      const path = test.replace(/^test\/grntest\//, '')
      const indexStr = (space + index.toString()).slice(-width)
      const status_str = Chalks[status](status.toUpperCase().slice(0, 4))
      const timeStr = (time_ms / 1000).toString() + 's'
      const timeLabel = time_ms > 10000 ? chalk.bgRed(timeStr) : timeStr
      console.log(`[${indexStr}/${all}] ${status_str} ${path} (${timeLabel})`)
    }
  }

  report() {
    this.reported = true
    console.log('')

    let total = 0
    const counts: Array<string> = []
    ;(['passed', 'failed', 'skipped'] as Status[]).forEach((result) => {
      const count = this.statusCount[result]
      if (count > 0) {
        total += count
        counts.push(Chalks[result](`${count} ${result}`))
      }
    })

    this.failedMessages.forEach((msg) => {
      console.log(msg)
    })

    console.log(`Tests: ${counts.join(', ')}, ${total} total`)
    console.log(`Time:  ${(Date.now() - this.startTime) / 1000}s`)
  }

  async run() {
    while (this.runnerCount < this.concurrency) {
      const test = this.tests[this.runnerIndex]
      this.runnerIndex += 1
      if (test == null) {
        if (this.runnerCount === 0) {
          if (!this.reported) {
            this.report()
          }
        }
        break
      }
      this.spawnJest(test)
    }
  }

  spawnJest(test: string) {
    this.runnerCount += 1
    child_process.exec(
      `npx mocha --config mocharc.json --reporter json --parallel false -r test/lib/mocha_env_nroonga.js ${test}`,
      {
        env: {
          TS_NODE_FILES: 'true',
        },
      },
      (error, stdout) => {
        let status: Status = 'passed'
        let time = 0
        if (error) {
          status = 'failed'
          this.statusCount['failed'] += 1
          this.failedMessages.push(` ${chalk.red('FAIL')} ${test}\n${error}\n`)
        } else {
          const result = JSON.parse(stdout) as MochaJson
          time = result.stats.duration
          if (result.stats.failures > 0) {
            this.statusCount['failed'] += result.stats.failures
            status = 'failed'
            for (const stat of result.failures || []) {
              this.failedMessages.push(` ${chalk.red('FAIL')} ${test}\n${stat.err.stack}\n`)
            }
          } else if (result.stats.pending > 0) {
            this.statusCount['skipped'] += result.stats.pending
            status = 'skipped'
          } else if (result.stats.passes > 0) {
            this.statusCount['passed'] += result.stats.passes
          }
        }
        this.printResult(test, status, time)

        this.runnerCount -= 1
        this.run()
      }
    )
  }
}

glob('test/grntest/**/*.i-test.ts', (err, files) => {
  if (err) {
    throw err
  }

  new GrnTestRunner(files, 2).run()
})
