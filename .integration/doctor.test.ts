import { describe, expect, test } from 'bun:test'
import { classifyGpu } from './doctor'

describe('classifyGpu', () => {
  test('a driver upgraded under the running module says reboot', () => {
    // What nvidia-smi prints after `apt upgrade` replaced the driver while the
    // old kernel module stayed loaded; the container hook fails the same way.
    const check = classifyGpu({
      exitCode: 18,
      out: 'Failed to initialize NVML: Driver/library version mismatch\nNVML library version: 550.120',
    })

    expect(check.status).toBe('fail')
    expect(check.detail).toContain('старый модуль')
    expect(check.hint).toContain('перезагрузи узел')
    expect(check.hint).toContain('--no-gpu')
  })

  test('no driver at all is a failure with the CPU way out', () => {
    const check = classifyGpu(undefined)

    expect(check.status).toBe('fail')
    expect(check.hint).toContain('--no-gpu')
  })

  test('any other failure shows what nvidia-smi said', () => {
    const check = classifyGpu({
      exitCode: 9,
      out: "NVIDIA-SMI has failed because it couldn't communicate with the NVIDIA driver.",
    })

    expect(check.status).toBe('fail')
    expect(check.detail).toContain("couldn't communicate")
  })

  test('a working card names itself and its driver', () => {
    expect(
      classifyGpu({ exitCode: 0, out: 'NVIDIA GeForce GTX 1060 6GB, 550.120' }),
    ).toEqual({
      name: 'Видеокарта',
      status: 'ok',
      detail: 'NVIDIA GeForce GTX 1060 6GB, драйвер 550.120',
    })
  })
})
