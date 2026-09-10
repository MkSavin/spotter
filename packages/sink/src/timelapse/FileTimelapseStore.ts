import fs from 'node:fs/promises'
import path from 'node:path'
import type { Stenograph } from 'stenograph'
import type { TimelapseJobRecord, TimelapseStore } from './TimelapseTracker'

/**
 * One JSON file, written through a temp file and a rename so a crash cannot
 * leave something unparseable behind.
 */
export class FileTimelapseStore implements TimelapseStore {
  private records = new Map<string, TimelapseJobRecord>()
  private loaded = false
  private writing: Promise<void> = Promise.resolve()

  constructor(
    private readonly file: string,
    private readonly logger: Stenograph,
  ) {}

  async put(record: TimelapseJobRecord): Promise<void> {
    await this.load()
    this.records.set(record.jobId, record)
    await this.flush()
  }

  async drop(jobId: string): Promise<void> {
    await this.load()
    if (this.records.delete(jobId)) await this.flush()
  }

  async list(): Promise<TimelapseJobRecord[]> {
    await this.load()
    return [...this.records.values()]
  }

  private async load(): Promise<void> {
    if (this.loaded) return
    this.loaded = true

    try {
      const raw = await fs.readFile(this.file, 'utf8')
      const parsed = JSON.parse(raw) as TimelapseJobRecord[]

      if (Array.isArray(parsed)) {
        for (const record of parsed) {
          if (record?.jobId) this.records.set(record.jobId, record)
        }
      }
    } catch (error) {
      // A missing file is the normal first start; anything else means the file
      // is unusable, and refusing to start over it would be worse than losing
      // the handful of exports it described.
      if ((error as NodeJS.ErrnoException)?.code !== 'ENOENT') {
        this.logger.warn('Could not read the timelapse store', error)
      }
    }
  }

  /** Serialized: concurrent completions must not interleave writes. */
  private flush(): Promise<void> {
    this.writing = this.writing.then(() => this.write())
    return this.writing
  }

  private async write(): Promise<void> {
    const payload = JSON.stringify([...this.records.values()])
    const temporary = `${this.file}.tmp`

    try {
      await fs.mkdir(path.dirname(this.file), { recursive: true })
      await fs.writeFile(temporary, payload, 'utf8')
      await fs.rename(temporary, this.file)
    } catch (error) {
      this.logger.warn('Could not persist the timelapse store', error)
    }
  }
}
