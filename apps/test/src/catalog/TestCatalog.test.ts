import { describe, expect, it } from 'bun:test'
import type { TestConfig } from '../config'
import { TestCatalog } from './TestCatalog'

const config = {
  labels: {
    cameras: { front: '🎥 передняя', yard: '🎥 двор' },
    objects: { person: '🧍 человек', car: '🚗 машина' },
  },
} as unknown as TestConfig

describe('TestCatalog', () => {
  it('lists cameras as code/label entries from config', () => {
    const cameras = new TestCatalog(config).listCameras()
    expect(cameras).toEqual([
      { code: 'front', label: '🎥 передняя' },
      { code: 'yard', label: '🎥 двор' },
    ])
  })

  it('lists object types as code/label entries from config', () => {
    const objects = new TestCatalog(config).listObjectTypes()
    expect(objects).toEqual([
      { code: 'person', label: '🧍 человек' },
      { code: 'car', label: '🚗 машина' },
    ])
  })
})
