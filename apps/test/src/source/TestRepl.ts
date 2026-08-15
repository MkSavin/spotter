import process from 'node:process'
import readline from 'node:readline'
import type { EventSink } from '@spotter/sink'
import { Command } from 'commander'
import type { Stenograph } from 'stenograph'
import type { TestConfig } from '../config'
import { buildEvent, type EventPhase, newEventId } from './buildEvent'

const PROMPT = 'spotter-test> '

/**
 * Interactive REPL that drives the synthetic source. Each line is parsed with
 * commander; the commands emit canonical SpotterEvents so a developer can
 * exercise the full pipeline offline without a real NVR or MQTT broker.
 */
export class TestRepl {
  private rl: readline.Interface | null = null
  private stopping = false

  private camera: string
  private object: string

  constructor(
    private readonly config: TestConfig,
    private readonly emit: EventSink,
    private readonly logger: Stenograph,
  ) {
    this.camera = Object.keys(config.labels.cameras)[0] ?? 'front'
    this.object = Object.keys(config.labels.objects)[0] ?? 'person'
  }

  start(): void {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: PROMPT,
    })
    this.rl = rl

    this.banner()
    rl.prompt()

    rl.on('line', async (line) => {
      const input = line.trim()

      if (input) {
        await this.dispatch(input).catch((error) => this.logger.error(error))
      }

      if (!this.stopping) {
        rl.prompt()
      }
    })

    rl.on('close', () => {
      if (!this.stopping) {
        // Ctrl-D / EOF — reuse the runtime's graceful shutdown.
        process.kill(process.pid, 'SIGINT')
      }
    })
  }

  async stop(): Promise<void> {
    this.stopping = true
    this.rl?.close()
  }

  private banner(): void {
    console.log(
      [
        '',
        'Spotter test source — type "help" for commands.',
        `  camera: ${this.camera}   object: ${this.object}`,
        '',
      ].join('\n'),
    )
  }

  private async dispatch(input: string): Promise<void> {
    const tokens = input.split(/\s+/).filter(Boolean)

    try {
      await this.buildProgram().parseAsync(tokens, { from: 'user' })
    } catch {
      // exitOverride throws on help/parse errors — output was already printed.
    }
  }

  private buildProgram(): Command {
    const program = new Command()
      .name('')
      .exitOverride()
      .configureOutput({
        writeOut: (str) => process.stdout.write(str),
        writeErr: (str) => process.stdout.write(str),
      })

    program.configureHelp({ showGlobalOptions: false })

    program
      .command('event')
      .description('Emit a start→end event lifecycle (or a single phase)')
      .argument('[phase]', 'start | update | end (default: full lifecycle)')
      .action(async (phase?: string) => {
        await this.emitEvent(phase as EventPhase | undefined)
      })

    program
      .command('camera')
      .description('Show/select the camera used for emitted events')
      .argument('[code]', 'camera code to select')
      .action((code?: string) => this.selectCamera(code))

    program
      .command('object')
      .description('Show/select the object label used for emitted events')
      .argument('[code]', 'object code to select')
      .action((code?: string) => this.selectObject(code))

    program
      .command('exit')
      .alias('quit')
      .description('Stop the test source')
      .action(() => {
        process.kill(process.pid, 'SIGINT')
      })

    return program
  }

  private async emitEvent(phase?: EventPhase): Promise<void> {
    const id = newEventId()
    const startTime = Date.now() / 1000

    const phases: EventPhase[] = phase ? [phase] : ['start', 'end']

    for (const type of phases) {
      const event = buildEvent({
        id,
        camera: this.camera,
        label: this.object,
        type,
        startTime,
      })
      await this.emit(event)
      console.log(
        `→ emitted ${type} event ${id} (${this.object}@${this.camera})`,
      )
    }
  }

  private selectCamera(code?: string): void {
    const cameras = this.config.labels.cameras

    if (!code) {
      console.log('Cameras:')
      for (const [c, label] of Object.entries(cameras)) {
        console.log(`  ${c === this.camera ? '*' : ' '} ${c} — ${label}`)
      }
      return
    }

    if (!(code in cameras)) {
      console.log(`Unknown camera "${code}" (kept ${this.camera})`)
      return
    }

    this.camera = code
    console.log(`camera set to ${code}`)
  }

  private selectObject(code?: string): void {
    const objects = this.config.labels.objects

    if (!code) {
      console.log('Objects:')
      for (const [o, label] of Object.entries(objects)) {
        console.log(`  ${o === this.object ? '*' : ' '} ${o} — ${label}`)
      }
      return
    }

    if (!(code in objects)) {
      console.log(`Unknown object "${code}" (kept ${this.object})`)
      return
    }

    this.object = code
    console.log(`object set to ${code}`)
  }
}
