import { Migration } from '../blueprints/Migration'

export class CreateUsersTableMigration extends Migration {
  async up(): Promise<void> {
    await this.client.execute(`
      CREATE TABLE users (
        id int,
        title text,
        album text,
        artist text,
        created_at timestamp,
        updated_at timestamp
        PRIMARY KEY (id, updated_at)
      )
    `)
  }

  async down(): Promise<void> {
    await this.client.execute(`
      DROP TABLE IF EXISTS users
    `)
  }
}
