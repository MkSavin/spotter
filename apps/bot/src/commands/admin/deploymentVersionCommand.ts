import Bun from 'bun'
import information from '../../../package.json'
import type { BotContext } from '../../context'
import { SpotterCommand } from '../framework/SpotterCommand'

class DeploymentVersionCommand extends SpotterCommand {
  readonly name = 'deployment_version'
  readonly description = 'Показать версию развертывания'
  readonly access = 'ADMIN' as const

  async handle(context: BotContext): Promise<void> {
    await context.replyWithHTML(
      `🤷 <b>Информация о развернутом приложении</b>

Приложение: <code>${information.name} v${information.version}</code>
Платформа: <code>Bun ${Bun.version_with_sha}</code>`,
    )
  }
}

export const deploymentVersionCommand = new DeploymentVersionCommand()
