/** Only the private-dashboard API uses 401 to ask the user to unlock again. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string
  ) {
    super(message);
  }
}

/** All dashboard requests share headers, cancellation and JSON error handling. */
export async function requestJson<T>(
  url: string,
  init?: RequestInit
): Promise<T> {
  const headers = new Headers(init?.headers);
  headers.set('accept', 'application/json');
  const response = await fetch(url, { ...init, headers, cache: 'no-store' });
  if (!response.headers.get('content-type')?.includes('application/json'))
    throw new ApiError(response.status, '服务器未返回有效的数据响应，请重试。');
  const body: unknown = await response.json();
  if (!response.ok) {
    const message =
      typeof body === 'object' &&
      body !== null &&
      'error' in body &&
      typeof body.error === 'string'
        ? body.error
        : '请求失败。';
    throw new ApiError(response.status, message);
  }
  return body as T;
}
