import { Migration } from '../blueprints/Migration'

export class CreateMigrationsTableMigration extends Migration {
  async up(): Promise<void> {
    await this.client.execute(`
      CREATE TABLE migrations (
        name text,
        PRIMARY KEY name
      )
    `)
  }

  async down(): Promise<void> {
    await this.client.execute(`
      DROP TABLE IF EXISTS migrations
    `)
  }
}
