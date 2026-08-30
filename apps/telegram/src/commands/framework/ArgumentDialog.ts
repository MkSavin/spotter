import type { BotContext } from '../../context'
import { choiceStep } from '../../dialog/steps/ChoiceStep'
import { textStep } from '../../dialog/steps/TextStep'
import type { DialogDefinition, Step } from '../../dialog/types'
import { type ArgSpec, signatureOf } from '../../middlewares/command/argument'

/** Namespaces argument dialogs so they cannot collide with future ones. */
export const argumentDialogKind = (command: string): string => `args:${command}`

/** Teaches the one-line form, so the dialog is not the only way in. */
const withHint = (prompt: string, signature: string): string =>
  `${prompt}\n\n<i>Можно сразу:</i> <code>/${signature}</code>`

const toStep = (arg: ArgSpec, signature: string): Step =>
  arg.choices
    ? choiceStep({
        name: arg.name,
        prompt: withHint(arg.prompt, signature),
        optional: arg.optional,
        choices: arg.choices,
        emptyPrompt: arg.emptyPrompt
          ? withHint(arg.emptyPrompt, signature)
          : undefined,
        allowManual: arg.allowManual,
        parse: arg.parse,
      })
    : textStep({
        name: arg.name,
        prompt: withHint(arg.prompt, signature),
        optional: arg.optional,
        parse: arg.parse,
      })

/** Turns a command's argument specs into a dialog the engine can run. */
export const argumentDialog = (
  command: string,
  args: readonly ArgSpec[],
  run: (context: BotContext, values: Record<string, string>) => Promise<void>,
): DialogDefinition => {
  const signature = signatureOf(command, args)
  return {
    kind: argumentDialogKind(command),
    steps: args.map((arg) => toStep(arg, signature)),
    complete: run,
  }
}
