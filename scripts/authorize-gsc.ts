import { createHash, randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { createServer } from 'node:http';

if (existsSync('.dev.vars')) {
  process.loadEnvFile('.dev.vars');
} else if (existsSync('.env')) {
  process.loadEnvFile('.env');
}

const CLIENT_ID = requiredEnvironment('GOOGLE_OAUTH_CLIENT_ID');
const CLIENT_SECRET = requiredEnvironment('GOOGLE_OAUTH_CLIENT_SECRET');
const CALLBACK_URL = 'http://127.0.0.1:8789/oauth2/callback';
const SCOPES = [
  'https://www.googleapis.com/auth/webmasters.readonly',
  'https://www.googleapis.com/auth/analytics.readonly',
].join(' ');

/**
 * This is a one-time local authorization flow for a Google OAuth Desktop app.
 * It receives the loopback callback on the user's machine, prints only the
 * refresh token, and never sends that credential to the dashboard browser.
 */
async function main() {
  const state = base64Url(randomBytes(32));
  const verifier = base64Url(randomBytes(48));
  const challenge = base64Url(createHash('sha256').update(verifier).digest());
  const callbackPromise = waitForAuthorizationCode(state);
  const authorizationUrl = new URL(
    'https://accounts.google.com/o/oauth2/v2/auth'
  );
  authorizationUrl.search = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: CALLBACK_URL,
    response_type: 'code',
    scope: SCOPES,
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    access_type: 'offline',
    prompt: 'consent',
  }).toString();

  console.log(
    '\nOpen this exact URL in your browser and authorize the Google account that owns your GSC Properties and GA4 Properties:\n'
  );
  console.log(authorizationUrl.toString());
  console.log('\nWaiting for the local callback on 127.0.0.1:8789…\n');

  const callback = await callbackPromise;

  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code: callback,
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      redirect_uri: CALLBACK_URL,
      grant_type: 'authorization_code',
      code_verifier: verifier,
    }),
  });
  const token = (await tokenResponse.json()) as {
    refresh_token?: string;
    error_description?: string;
  };
  if (!tokenResponse.ok || !token.refresh_token)
    throw new Error(
      token.error_description ?? 'Google did not return a refresh token.'
    );

  console.log(
    'Copy this value into the Cloudflare Secret named GSC_REFRESH_TOKEN:'
  );
  console.log(token.refresh_token);
}

/** Starts a loopback-only listener and rejects callbacks from another state value. */
function waitForAuthorizationCode(expectedState: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const server = createServer((request, response) => {
      const url = new URL(request.url ?? '/', CALLBACK_URL);
      const code = url.searchParams.get('code');
      const returnedState = url.searchParams.get('state');
      const providerError = url.searchParams.get('error');
      const errorDescription = url.searchParams.get('error_description');
      if (providerError || !code || returnedState !== expectedState) {
        const errorDetail = providerError
          ? `Google returned error: ${providerError}${errorDescription ? ` (${errorDescription})` : ''}`
          : !code
            ? 'No authorization code returned from Google.'
            : 'OAuth state mismatch (CSRF validation failed).';
        response.writeHead(400, { 'content-type': 'text/html; charset=utf-8' });
        response.end(
          `<h1>Authorization failed</h1><p style="color:red;font-family:monospace;">${errorDetail}</p><p>You can close this tab and retry the command.</p>`
        );
        server.close();
        reject(new Error(errorDetail));
        return;
      }
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      response.end(
        '<h1>Authorization complete</h1><p>You can close this tab and return to the terminal.</p>'
      );
      server.close();
      resolve(code);
    });
    server.once('error', reject);
    server.listen(8789, '127.0.0.1');
  });
}

function requiredEnvironment(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name} environment variable.`);
  return value;
}
function base64Url(value: Buffer): string {
  return value.toString('base64url');
}

void main().catch((error: unknown) => {
  console.error(
    error instanceof Error ? error.message : 'Authorization failed.'
  );
  process.exitCode = 1;
});
