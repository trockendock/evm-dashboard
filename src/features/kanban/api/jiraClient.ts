/**
 * Low-level HTTP client for the Jira REST API v3.
 * Builds authenticated requests using Basic Auth (email + API token).
 */

/**
 * Performs a request against the Jira REST API v3.
 *
 * @param host   - Jira cloud hostname, e.g. "myorg.atlassian.net"
 * @param email  - Jira account email used for Basic Auth
 * @param token  - Jira API token (plaintext, already decrypted)
 * @param path   - API path relative to /rest/api/3/, e.g. "myself"
 * @param params - Optional query-string parameters
 */
export async function jiraFetch<T>(
  host: string,
  email: string,
  token: string,
  path: string,
  params?: Record<string, string>,
): Promise<T> {
  const url = new URL(`https://${host}/rest/api/3/${path}`);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }
  }

  const credentials = btoa(`${email}:${token}`);

  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: {
      Authorization: `Basic ${credentials}`,
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    let message = `Jira API error ${response.status}`;
    try {
      const body = (await response.json()) as { errorMessages?: string[]; message?: string };
      if (body.errorMessages?.length) {
        message = body.errorMessages.join('; ');
      } else if (body.message) {
        message = body.message;
      }
    } catch {
      // Ignore JSON parse failure — use the generic message above
    }
    throw new Error(message);
  }

  return response.json() as Promise<T>;
}
