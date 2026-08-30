/** callback_data prefix owned by the dialog engine. */
const PREFIX = 'dlg'

/** Telegram rejects callback_data longer than this. */
export const CALLBACK_LIMIT = 64

export const dialogCallbackPattern = /^dlg:/

/** Inert callback_data for a label-only button, e.g. the page counter. */
export const DIALOG_NOOP = 'dlg:noop'

export type DialogAction = 'pick' | 'page' | 'back' | 'cancel' | 'skip'

export type DialogCallback = {
  dialogId: string
  step: number
  action: DialogAction
  payload: string
}

const ACTIONS: DialogAction[] = ['pick', 'page', 'back', 'cancel', 'skip']

/** `dlg:<dialogId>:<step>:<action>:<payload>` — payload is an index, not a value. */
export const encodeCallback = (data: DialogCallback): string => {
  const encoded = [
    PREFIX,
    data.dialogId,
    String(data.step),
    data.action,
    data.payload,
  ].join(':')

  if (encoded.length > CALLBACK_LIMIT) {
    throw new Error(`Dialog callback_data exceeds ${CALLBACK_LIMIT} bytes`)
  }

  return encoded
}

export const decodeCallback = (raw: string): DialogCallback | undefined => {
  const parts = raw.split(':')
  if (parts.length < 4 || parts[0] !== PREFIX) return undefined

  const [, dialogId, rawStep, action, ...rest] = parts
  const step = Number(rawStep)

  if (!dialogId || !Number.isInteger(step) || step < 0) return undefined
  if (!ACTIONS.includes(action as DialogAction)) return undefined

  return {
    dialogId,
    step,
    action: action as DialogAction,
    payload: rest.join(':'),
  }
}

/** Short enough to keep callback_data within the limit, random enough to not collide. */
export const newDialogId = (): string => Math.random().toString(36).slice(2, 8)
