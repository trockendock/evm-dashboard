/**
 * Unit tests for jiraFetch from jiraClient.ts.
 * Uses vi.stubGlobal to mock the global fetch.
 */

import { describe, it, expect, vi, afterEach } from 'vitest'
import { jiraFetch } from '../jiraClient'

afterEach(() => {
  vi.unstubAllGlobals()
})

function makeFetchMock(
  status: number,
  body: unknown,
  ok?: boolean,
): typeof globalThis.fetch {
  const isOk = ok ?? (status >= 200 && status < 300)
  return vi.fn().mockResolvedValue({
    ok: isOk,
    status,
    json: () => Promise.resolve(body),
  } as unknown as Response)
}

describe('jiraFetch', () => {
  const HOST = 'myorg.atlassian.net'
  const EMAIL = 'user@example.com'
  const TOKEN = 'mytoken123'
  const PATH = 'myself'

  it('returns parsed JSON on a successful 200 response', async () => {
    const responseBody = { accountId: 'abc', displayName: 'Alice' }
    vi.stubGlobal('fetch', makeFetchMock(200, responseBody))

    const result = await jiraFetch(HOST, EMAIL, TOKEN, PATH)
    expect(result).toEqual(responseBody)
  })

  it('throws an error on a non-2xx response', async () => {
    vi.stubGlobal('fetch', makeFetchMock(401, { errorMessages: ['Unauthorized'], message: undefined }))

    await expect(jiraFetch(HOST, EMAIL, TOKEN, PATH)).rejects.toThrow('Unauthorized')
  })

  it('throws a generic message when error body has no errorMessages or message', async () => {
    vi.stubGlobal('fetch', makeFetchMock(500, {}))

    await expect(jiraFetch(HOST, EMAIL, TOKEN, PATH)).rejects.toThrow('Jira API error 500')
  })

  it('throws using body.message when errorMessages is absent', async () => {
    vi.stubGlobal('fetch', makeFetchMock(404, { message: 'Issue not found' }))

    await expect(jiraFetch(HOST, EMAIL, TOKEN, PATH)).rejects.toThrow('Issue not found')
  })

  it('sets the correct Basic Auth header', async () => {
    const mockFetch = makeFetchMock(200, {})
    vi.stubGlobal('fetch', mockFetch)

    await jiraFetch(HOST, EMAIL, TOKEN, PATH)

    const [, options] = (mockFetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit]
    const expectedCredentials = btoa(`${EMAIL}:${TOKEN}`)
    expect((options.headers as Record<string, string>)['Authorization']).toBe(
      `Basic ${expectedCredentials}`,
    )
  })

  it('appends query parameters to the URL', async () => {
    const mockFetch = makeFetchMock(200, {})
    vi.stubGlobal('fetch', mockFetch)

    await jiraFetch(HOST, EMAIL, TOKEN, 'search', { jql: 'project = CRM', maxResults: '50' })

    const [url] = (mockFetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string]
    expect(url).toContain('jql=project+%3D+CRM')
    expect(url).toContain('maxResults=50')
  })
})
