import { createMiddleware, createStart } from '@tanstack/react-start';

/**
 * The dashboard is a private surface reachable on a public hostname, so every
 * response carries baseline hardening headers. Frame denial matters most: the
 * password form must never be embeddable by another origin.
 */
const securityHeaders = createMiddleware({ type: 'request' }).server(
  async ({ next }) => {
    const result = await next();
    const headers = new Headers(result.response.headers);
    headers.set('x-frame-options', 'DENY');
    headers.set('x-content-type-options', 'nosniff');
    headers.set('referrer-policy', 'no-referrer');
    headers.set(
      'strict-transport-security',
      'max-age=31536000; includeSubDomains'
    );
    const body =
      result.response.status === 204 || result.response.status === 304
        ? null
        : result.response.body;
    return {
      ...result,
      response: new Response(body, {
        status: result.response.status,
        statusText: result.response.statusText,
        headers,
      }),
    };
  }
);

export const startInstance = createStart(() => ({
  requestMiddleware: [securityHeaders],
}));
