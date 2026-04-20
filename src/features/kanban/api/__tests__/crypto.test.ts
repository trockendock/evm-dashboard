// @vitest-environment node
/**
 * Tests for encrypt/decrypt from crypto.ts.
 * Uses Node 18+ built-in globalThis.crypto.subtle (no mocking needed).
 */

import { describe, it, expect } from 'vitest'
import { vi } from 'vitest'

// We need to mock import.meta.env before importing the module.
// Vitest supports vi.stubEnv for import.meta.env.
vi.stubEnv('VITE_KANBAN_PEPPER', 'test-pepper-value-for-unit-tests')

// Dynamic import after stubbing env
const { encrypt, decrypt } = await import('../crypto')

describe('crypto – encrypt / decrypt', () => {
  it('encrypt returns a string in ivB64:ctB64 format', async () => {
    const result = await encrypt('hello')
    expect(typeof result).toBe('string')
    const parts = result.split(':')
    expect(parts).toHaveLength(2)
    expect(parts[0].length).toBeGreaterThan(0)
    expect(parts[1].length).toBeGreaterThan(0)
  })

  it('decrypt(encrypt(x)) returns the original plaintext', async () => {
    const plaintext = 'my-secret-api-token'
    const ciphertext = await encrypt(plaintext)
    const recovered = await decrypt(ciphertext)
    expect(recovered).toBe(plaintext)
  })

  it('encrypt produces different ciphertexts for the same input (random IV)', async () => {
    const c1 = await encrypt('same-text')
    const c2 = await encrypt('same-text')
    // The IV portion should differ because of random IV
    expect(c1).not.toBe(c2)
  })

  it('decrypt throws on input missing the colon separator', async () => {
    await expect(decrypt('nodividerhere')).rejects.toThrow(
      'Invalid ciphertext format',
    )
  })
})
