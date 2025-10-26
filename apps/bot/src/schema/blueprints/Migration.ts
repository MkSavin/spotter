import type { Client } from 'cassandra-driver'

export abstract class Migration {
  protected constructor(protected client: Client) {}

  abstract up(): Promise<void>
  abstract down(): Promise<void>
}
