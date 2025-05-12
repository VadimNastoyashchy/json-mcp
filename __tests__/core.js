import { describe, test, expect } from 'scripterio'
import { getAllFileNames } from '../build/index.js'

describe('Unit tests for:', () => {
  describe('getAllFileNames()', () => {
    test('Should return filenames from the path', async () => {
      const fileNames = await getAllFileNames(
        new URL('../__tests__/data', import.meta.url),
        '.json'
      )
      expect(fileNames[0]).toBeEqual('sample_users.json')
    })
  })
})
