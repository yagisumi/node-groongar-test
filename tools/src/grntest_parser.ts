import { GroongaCommand, parseCommand } from '@yagisumi/groonga-command'

type Header1 = [number, number, number] | [[number, number, number], string]
type Response1 = [Header1, unknown?]
export type Response3 = {
  header: {
    return_code: number
    start_time: number
    elapsed_time: number
    error?: {
      message: string
      function?: string
      file?: string
      line?: number
    }
  }
  body: unknown
}

export type Response = string | Response3 | Response1

export type Command = {
  type: 'command'
  string: string
  command: GroongaCommand
  count: number
  response?: Response
}

export type Pragma = {
  type: 'pragma'
  string: string
}

export type Note = {
  type: 'note'
  string: string
}

export type Export = {
  type: 'export'
  string: string
}

export type Log = {
  type: 'log'
  string: string
}

export type QueryLog = {
  type: 'querylog'
  string: string
}

export type Comment = Pragma | Note | Export | Log | QueryLog
export type GrnTestElem = Command | Comment

export function isCommand(elem: GrnTestElem): elem is Command {
  return elem.type === 'command'
}

export function isCommnet(elem: GrnTestElem): elem is Comment {
  return elem.type !== 'command'
}

export class GrnTestScanner {
  readonly lines: ReadonlyArray<string>
  index = 0

  constructor(grntest: string) {
    if (grntest.length === 0) {
      this.lines = []
    } else {
      this.lines = grntest.match(/([^\n]*\n|[^\n]+)/g) as string[]
    }
  }

  isEnded() {
    return this.index >= this.lines.length
  }

  peek(): string | undefined {
    return this.lines[this.index]
  }

  scan(): string | undefined {
    const line = this.lines[this.index]
    this.index += 1
    return line
  }

  readRest(): string {
    const lines = this.lines.slice(this.index)
    this.index = this.lines.length
    return lines.join('')
  }

  scanValues(): string | undefined {
    let line = this.peek()
    if (line === undefined || !line.match(/\s*\[/)) {
      return undefined
    }

    let values = ''
    while (line) {
      try {
        values += line
        JSON.parse(values)
        this.index += 1
        break
      } catch (err) {
        // empty
      }
      this.index += 1
      line = this.peek()
    }

    return values === '' ? undefined : values
  }

  scanCommand(): string | undefined {
    let command = this.peek()

    if (command === undefined || !command.match(/^(\w|\/d\/)/)) {
      return undefined
    }

    this.index += 1

    while (command.match(/\\\n$/)) {
      const line = this.scan()
      if (line === undefined) {
        break
      }
      command += line
    }

    return command
  }

  scanComments(): Comment[] {
    const commnets: Comment[] = []
    let line = this.peek()
    if (line === undefined || !line.startsWith('#')) {
      return commnets
    }

    while (line !== undefined && line.startsWith('#')) {
      this.index += 1
      const cc = line.slice(0, 2)
      if (cc === '#@') {
        commnets.push({
          type: 'pragma',
          string: line,
        })
      } else if (cc === '#$') {
        commnets.push({
          type: 'export',
          string: line,
        })
      } else if (cc === '# ' || cc === '#T') {
        // #TODO
        let string = line
        line = this.peek()
        while (line?.startsWith('# ')) {
          this.index += 1
          string += line
          line = this.peek()
        }
        commnets.push({
          type: 'note',
          string,
        })
      } else if (cc === '#|') {
        let string = line
        line = this.peek()
        while (line?.startsWith('#|')) {
          this.index += 1
          string += line
          line = this.peek()
        }
        commnets.push({
          type: 'log',
          string,
        })
      } else if (cc === '#>') {
        let string = line
        line = this.peek()
        while (line !== undefined) {
          this.index += 1
          string += line
          if (line.startsWith('#<')) {
            break
          }
          line = this.peek()
        }
        commnets.push({
          type: 'querylog',
          string,
        })
      } else {
        throw new Error('unexpected')
      }

      line = this.peek()
    }

    return commnets
  }

  scanResponse() {
    let response = ''
    let line: string | undefined

    while ((line = this.peek())) {
      if (line.match(/^func\(.*?\)/)) {
        this.index += 1
        response = line
        break
      } else if (line.match(/^([a-z]|#|\/d\/)/)) {
        break
      } else {
        response += line
        this.index += 1
      }
    }

    return response === '' ? undefined : response
  }

  scanDumpResponse() {
    const lines: string[] = []
    let line = this.peek()

    while (line) {
      if (line === '[[0,0.0,0.0],true]\n') {
        this.index -= 1
        lines.pop()
        break
      } else if (line.startsWith('#')) {
        break
      } else if (line.startsWith('[')) {
        const last_line = lines[lines.length - 1]
        if (last_line && last_line.startsWith('select ')) {
          this.index -= 1
          lines.pop()
          break
        }
      }

      lines.push(line)
      this.index += 1
      line = this.peek()
    }

    return lines.join('')
  }

  skipEmptyLines() {
    let line = this.peek()
    while (line !== undefined && line.match(/^\s*$/)) {
      this.index += 1
      line = this.peek()
    }
  }
}

export function parseGrnTest(grntest: string, hasResponse: boolean) {
  const scanner = new GrnTestScanner(grntest)
  const elems: GrnTestElem[] = []
  let count = 1
  let logging = true

  while (!scanner.isEnded()) {
    const start_index = scanner.index
    const cmd_str = scanner.scanCommand()
    if (cmd_str) {
      const command = parseCommand(cmd_str)
      if (command === undefined) {
        throw new Error(`command parse error: ${cmd_str}`)
      }

      if (command.command_name === 'dump') {
        const response = hasResponse ? scanner.scanDumpResponse() : undefined

        elems.push({
          type: 'command',
          command,
          count: logging ? count : 0,
          string: cmd_str,
          response,
        })
      } else {
        if (command.command_name === 'load' && command.arguments.values === undefined) {
          const values = scanner.scanValues()
          if (values) {
            command.arguments['values'] = values
          } else if (!('values' in command.arguments) && values === undefined) {
            throw new Error('unexpected values')
          }
        }

        let response: Response | undefined = undefined
        if (hasResponse) {
          if (command.output_type === 'apache-arrow') {
            response = scanner.scanDumpResponse()
          } else if (command.output_type === 'xml') {
            response = scanner.scanDumpResponse()
          } else {
            response = scanner.scanResponse()
            if (response) {
              if (response.match(/^\s*(\{|\[)/)) {
                response = JSON.parse(response)
              }
            }
          }

          if (response === undefined) {
            throw new Error('missing response')
          }
        }

        elems.push({
          type: 'command',
          command,
          count: logging ? count : 0,
          string: cmd_str,
          response,
        })
      }
      if (logging) {
        count += 1
      }
    }

    scanner.skipEmptyLines()
    const comments = scanner.scanComments()
    comments.forEach((comment) => {
      if (comment.string.startsWith('#@disable-logging')) {
        logging = false
      } else if (comment.string.startsWith('#@enable-logging')) {
        logging = true
      }
      elems.push(comment)
    })
    scanner.skipEmptyLines()

    if (start_index === scanner.index) {
      throw new Error(`No line was scanned at ${start_index}`)
    }
  }

  return elems
}
