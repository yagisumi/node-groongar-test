import heredoc from 'heredocument'
import { init_config, Env } from './env'
import { convertGrnTest } from './grntest_converter'

function printUsage() {
  console.log(heredoc`
    USAGE: node tools/lib/tools.js [commands...]
      Commands
        init           create config.json
        doc_test       create grntest of groonga/docs
        convert        convert tests of grntest to tests of groongar
        outputs        collect outputs of grntest
        typecheck      generate tests for types of return values
        groongar       generate groongar.ts
        clean          delete directories [report doc_test outputs]
        clean_test     delete tests of groongar
  `)
}

const COMMANDS = {
  init: false,
  doc_test: false,
  convert: false,
  outputs: false,
  groongar: false,
  clean: false,
  clean_test: false,
}

function isKeyofCommands(key: string): key is keyof typeof COMMANDS {
  return key in COMMANDS
}

async function main() {
  const commands = Object.create(COMMANDS) as typeof COMMANDS
  const argv = process.argv.slice(2)
  if (argv.length === 0) {
    printUsage()
    return
  }

  argv.forEach((arg) => {
    if (isKeyofCommands(arg)) {
      commands[arg] = true
    } else {
      console.warn(`unknown command: ${arg}`)
    }
  })

  if (Object.keys(commands).length === 0) {
    printUsage()
    return
  }

  try {
    let env!: Env
    for (const cmd of Object.keys(commands)) {
      console.log(`tools.js ${cmd}`)
      if (cmd === 'init') {
        init_config()
      } else {
        env = env ?? new Env()

        if (cmd === 'clean') {
          env.clean()
        } else if (cmd === 'clean_test') {
          env.clean_grntest()
        } else if (cmd === 'convert') {
          await convertGrnTest(env)
        }
      }
    }
  } catch (e) {
    console.error(e)
  }
}

main()
