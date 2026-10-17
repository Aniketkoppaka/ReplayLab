import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import zlib from 'node:zlib';
import { validateAndResolveTarget, type DnsLookupFn, defaultDnsLookup } from './target-validator.js';

export interface DispatchOptions {
  method: string;
  baseUrl: string;
  path: string;
  queryParams?: Record<string, string | string[]>;
  headers?: Record<string, string>;
  body?: unknown;
  bodyType?: 'NONE' | 'JSON' | 'TEXT';
  // Timeouts
  connectTimeoutMs?: number; // default 3000ms
  totalTimeoutMs?: number; // default 15000ms
  maxResponseBytes?: number; // default 10MB
  maxRedirects?: number; // default 0 (redirects disabled or explicit re-validation)
  dnsLookup?: DnsLookupFn;
}

export interface DispatchResponse {
  statusCode: number;
  headers: Record<string, string>;
  body: unknown;
  bodyRaw: string;
  durationMs: number;
}

/**
 * Creates an HTTP/HTTPS Agent that pins the socket connection directly to the pre-validated IP address,
 * while setting the TLS servername to the original hostname for valid SNI & certificate checking.
 * This completely eliminates DNS rebinding TOCTOU vulnerabilities.
 */
export function createPinnedAgent(targetIp: string, originalHostname: string, isHttps: boolean) {
  const family = net.isIP(targetIp);

  // Custom lookup supporting all Node.js dns.lookup signatures and options.all
  const lookup = (
    _hostname: string,
    optionsOrCallback: unknown,
    maybeCallback?: unknown
  ) => {
    const callback = typeof optionsOrCallback === 'function'
      ? optionsOrCallback
      : (maybeCallback as ((err: Error | null, address?: unknown, family?: number) => void));

    const options = typeof optionsOrCallback === 'object' && optionsOrCallback !== null
      ? (optionsOrCallback as { all?: boolean })
      : {};

    if (options.all) {
      callback(null, [{ address: targetIp, family }]);
    } else {
      callback(null, targetIp, family);
    }
  };

  if (isHttps) {
    return new https.Agent({
      // Socket connects directly to targetIp
      lookup: lookup as unknown as https.AgentOptions['lookup'],
      // SNI and certificate check uses originalHostname
      servername: originalHostname,
      keepAlive: false,
    });
  }

  return new http.Agent({
    lookup: lookup as unknown as http.AgentOptions['lookup'],
    keepAlive: false,
  });
}

/**
 * Safely dispatches an HTTP request with pinned IP socket dialing, strict timeouts,
 * body size limits, and hop-by-hop redirect re-validation.
 */
export async function executeSafeRequest(
  options: DispatchOptions,
  redirectDepth = 0
): Promise<DispatchResponse> {
  const maxRedirects = options.maxRedirects ?? 0;
  if (redirectDepth > maxRedirects) {
    throw new Error('SSRF_TOO_MANY_REDIRECTS: Exceeded maximum allowed redirect hops');
  }

  const dnsLookup = options.dnsLookup ?? defaultDnsLookup;
  const connectTimeoutMs = options.connectTimeoutMs ?? 3000;
  const totalTimeoutMs = options.totalTimeoutMs ?? 15000;
  const maxResponseBytes = options.maxResponseBytes ?? 10 * 1024 * 1024; // 10MB

  const startTime = Date.now();

  // 1. Validate destination & resolve DNS
  const target = await validateAndResolveTarget(
    options.baseUrl,
    options.path,
    dnsLookup
  );

  // 2. Build target URL with query params
  const requestUrl = new URL(target.url.toString());
  if (options.queryParams) {
    for (const [key, val] of Object.entries(options.queryParams)) {
      if (Array.isArray(val)) {
        val.forEach((v) => requestUrl.searchParams.append(key, v));
      } else {
        requestUrl.searchParams.set(key, val);
      }
    }
  }

  // 3. Prepare serialized body payload
  let payloadBuffer: Buffer | null = null;
  const headers: Record<string, string> = {
    ...options.headers,
    Host: requestUrl.hostname,
  };

  const MAX_REQUEST_PAYLOAD_BYTES = 10 * 1024 * 1024; // 10MB limit

  if (options.body != null && options.bodyType !== 'NONE') {
    if (options.bodyType === 'JSON' || typeof options.body === 'object') {
      const jsonStr = JSON.stringify(options.body);
      payloadBuffer = Buffer.from(jsonStr, 'utf8');
      if (!headers['Content-Type'] && !headers['content-type']) {
        headers['Content-Type'] = 'application/json';
      }
    } else {
      payloadBuffer = Buffer.from(String(options.body), 'utf8');
      if (!headers['Content-Type'] && !headers['content-type']) {
        headers['Content-Type'] = 'text/plain';
      }
    }

    if (payloadBuffer.length > MAX_REQUEST_PAYLOAD_BYTES) {
      throw new Error('PAYLOAD_LIMIT_EXCEEDED: Outbound request body exceeds maximum limit (10MB)');
    }
    headers['Content-Length'] = String(payloadBuffer.length);
  }

  // 4. Create pinned agent for DNS rebinding protection
  const agent = createPinnedAgent(target.resolvedIp, requestUrl.hostname, target.isHttps);

  return new Promise<DispatchResponse>((resolve, reject) => {
    let timer: NodeJS.Timeout | null = null;
    let isSettled = false;

    function cleanup() {
      if (timer) clearTimeout(timer);
      agent.destroy();
    }

    // Overall request execution timeout
    timer = setTimeout(() => {
      if (!isSettled) {
        isSettled = true;
        cleanup();
        req.destroy();
        reject(new Error('TIMEOUT: Execution timeout exceeded'));
      }
    }, totalTimeoutMs);

    const transport = target.isHttps ? https : http;

    const req = transport.request(
      requestUrl,
      {
        method: options.method.toUpperCase(),
        headers,
        agent,
        timeout: connectTimeoutMs,
      },
      async (res) => {
        // Handle Redirects (301, 302, 303, 307, 308)
        if (
          res.statusCode &&
          [301, 302, 303, 307, 308].includes(res.statusCode) &&
          res.headers.location
        ) {
          if (maxRedirects === 0) {
            // Redirects not permitted: treat as normal HTTP 3xx response or error
            // Per requirements, if redirects are disabled, we return the 3xx response
          } else {
            // Revalidate every redirect hop
            isSettled = true;
            cleanup();
            res.resume(); // Drain stream

            const redirectLocation = res.headers.location;
            try {
              // Construct new base/path
              const nextUrl = new URL(redirectLocation, requestUrl);
              const redirected = await executeSafeRequest(
                {
                  ...options,
                  baseUrl: nextUrl.origin,
                  path: nextUrl.pathname + nextUrl.search,
                },
                redirectDepth + 1
              );
              return resolve(redirected);
            } catch (err) {
              return reject(err);
            }
          }
        }

        // Handle decompression if Content-Encoding is gzip, deflate, or br
        const contentEncoding = (res.headers['content-encoding'] ?? '').toLowerCase().trim();
        let stream: NodeJS.ReadableStream = res;
        let decompressor: zlib.Gunzip | zlib.Inflate | zlib.BrotliDecompress | null = null;

        if (contentEncoding === 'gzip') {
          decompressor = zlib.createGunzip();
          stream = res.pipe(decompressor);
        } else if (contentEncoding === 'deflate') {
          decompressor = zlib.createInflate();
          stream = res.pipe(decompressor);
        } else if (contentEncoding === 'br') {
          decompressor = zlib.createBrotliDecompress();
          stream = res.pipe(decompressor);
        }

        const chunks: Buffer[] = [];
        let totalBytes = 0;

        stream.on('data', (chunk: Buffer) => {
          totalBytes += chunk.length;
          if (totalBytes > maxResponseBytes) {
            if (!isSettled) {
              isSettled = true;
              cleanup();
              req.destroy();
              if (decompressor) decompressor.destroy();
              reject(new Error('PAYLOAD_LIMIT_EXCEEDED: Response body exceeds limit'));
            }
          } else {
            chunks.push(chunk);
          }
        });

        stream.on('end', () => {
          if (isSettled) return;
          isSettled = true;
          cleanup();

          const durationMs = Date.now() - startTime;
          const bodyBuffer = Buffer.concat(chunks);
          const bodyRaw = bodyBuffer.toString('utf8');

          let bodyParsed: unknown = bodyRaw;
          const contentType = (res.headers['content-type'] ?? '').toLowerCase();
          if (contentType.includes('application/json')) {
            try {
              bodyParsed = JSON.parse(bodyRaw);
            } catch {
              bodyParsed = bodyRaw;
            }
          }

          const responseHeaders: Record<string, string> = {};
          for (const [k, v] of Object.entries(res.headers)) {
            if (v != null) {
              responseHeaders[k] = Array.isArray(v) ? v.join(', ') : v;
            }
          }

          resolve({
            statusCode: res.statusCode ?? 0,
            headers: responseHeaders,
            body: bodyParsed,
            bodyRaw,
            durationMs,
          });
        });

        stream.on('error', (err) => {
          if (!isSettled) {
            isSettled = true;
            cleanup();
            req.destroy();
            reject(new Error(`TRANSPORT_ERROR: ${err.message}`));
          }
        });

        res.on('error', (err) => {
          if (!isSettled) {
            isSettled = true;
            cleanup();
            reject(new Error(`TRANSPORT_ERROR: ${err.message}`));
          }
        });
      }
    );

    req.on('timeout', () => {
      if (!isSettled) {
        isSettled = true;
        cleanup();
        req.destroy();
        reject(new Error('TIMEOUT: Connection timeout'));
      }
    });

    req.on('error', (err) => {
      if (!isSettled) {
        isSettled = true;
        cleanup();
        reject(new Error(`TRANSPORT_ERROR: ${err.message}`));
      }
    });

    if (payloadBuffer) {
      req.write(payloadBuffer);
    }
    req.end();
  });
}
