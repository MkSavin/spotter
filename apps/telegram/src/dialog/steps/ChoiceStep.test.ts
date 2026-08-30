import { describe, expect, test } from 'bun:test'
import type { BotContext } from '../../context'
import { CALLBACK_LIMIT, decodeCallback } from '../callbackData'
import type { Choice } from '../types'
import { choiceStep, PAGE_SIZE } from './ChoiceStep'

const context = {} as BotContext
const at = { dialogId: 'ab12cd', step: 0, page: 0 }

const cameras = (count: number): Choice[] =>
  Array.from({ length: count }, (_, index) => ({
    code: `cam-${index}`,
    label: `Камера ${index}`,
  }))

const buttons = (keyboard: { inline_keyboard: { text: string }[][] }) =>
  keyboard.inline_keyboard.flat().map((button) => button.text)

describe('choiceStep rendering', () => {
  test('falls back to typing when the catalog is empty', async () => {
    const step = choiceStep({
      name: 'camera',
      prompt: 'Выберите камеру',
      emptyPrompt: 'Каталог пуст',
      choices: () => [],
    })

    const { rendered, options } = await step.render(context, at)

    expect(rendered.text).toBe('Каталог пуст')
    expect(rendered.acceptsText).toBe(true)
    expect(options).toEqual([])
  })

  test('paginates a long list', async () => {
    const step = choiceStep({
      name: 'camera',
      prompt: 'Выберите камеру',
      choices: () => cameras(PAGE_SIZE + 3),
    })

    const { rendered } = await step.render(context, at)
    const labels = buttons(rendered.keyboard as never)

    expect(labels).toContain('Камера 0')
    expect(labels).not.toContain(`Камера ${PAGE_SIZE}`)
    expect(labels).toContain('1/2')
  })

  test('a second page carries the absolute option index', async () => {
    const step = choiceStep({
      name: 'camera',
      prompt: 'Выберите камеру',
      choices: () => cameras(PAGE_SIZE + 3),
    })

    const { rendered } = await step.render(context, { ...at, page: 1 })
    const first = (
      rendered.keyboard as never as {
        inline_keyboard: { text: string; callback_data: string }[][]
      }
    ).inline_keyboard[0][0]

    expect(decodeCallback(first.callback_data)?.payload).toBe(String(PAGE_SIZE))
  })

  test('callback data stays within the Telegram limit on long labels', async () => {
    const step = choiceStep({
      name: 'camera',
      prompt: 'Выберите камеру',
      choices: () => [
        { code: 'very-long-camera-code-name-here', label: 'Очень длинное имя' },
      ],
    })

    const { rendered } = await step.render(context, at)
    const keyboard = rendered.keyboard as never as {
      inline_keyboard: { callback_data: string }[][]
    }

    for (const button of keyboard.inline_keyboard.flat()) {
      expect(button.callback_data.length).toBeLessThanOrEqual(CALLBACK_LIMIT)
    }
  })

  test('offers Back only past the first step', async () => {
    const step = choiceStep({
      name: 'camera',
      prompt: 'Выберите камеру',
      choices: () => cameras(2),
    })

    const first = await step.render(context, at)
    const second = await step.render(context, { ...at, step: 1 })

    expect(buttons(first.rendered.keyboard as never)).not.toContain('‹ Назад')
    expect(buttons(second.rendered.keyboard as never)).toContain('‹ Назад')
  })
})

describe('choiceStep answers', () => {
  test('resolves the index against the snapshot shown to the user', async () => {
    const step = choiceStep({
      name: 'camera',
      prompt: '',
      choices: () => cameras(3),
    })

    expect(await step.accept?.('1', context, cameras(3))).toEqual({
      status: 'done',
      value: 'cam-1',
    })
  })

  test('a stale index re-asks instead of picking the wrong camera', async () => {
    const step = choiceStep({
      name: 'camera',
      prompt: '',
      choices: () => cameras(1),
    })

    const result = await step.accept?.('5', context, cameras(1))

    expect(result?.status).toBe('retry')
  })

  test('manual text is accepted only when allowed', async () => {
    const guarded = choiceStep({ name: 'c', prompt: '', choices: () => [] })
    const open = choiceStep({
      name: 'c',
      prompt: '',
      choices: () => [],
      allowManual: true,
    })

    expect(guarded.acceptText).toBeUndefined()
    expect(await open.acceptText?.(' front ', context)).toEqual({
      status: 'done',
      value: 'front',
    })
  })
})
