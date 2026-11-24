export type ProgressCallback = (bytes: number, total: number) => void

/**
 * Download with real byte-level progress via response.clone().
 * - The CLONE stream is read for progress (raw bytes only, no decoding).
 * - The ORIGINAL response goes through the browser's native .text() decoder
 *   which is guaranteed to produce correct UTF-8 output — no chunk-boundary
 *   corruption.
 *
 * If `response.clone()` is not supported or the body cannot be cloned (rare),
 * we fall back to a plain `fetch() + text()` with a single end-of-stream
 * progress callback.
 */
export async function fetchWithDownloadProgress(
  url: string,
  init: RequestInit,
  onProgress: ProgressCallback
): Promise<{ text: string; response: Response; headers: Headers }> {
  const response = await fetch(url, init)

  if (
    !response.ok ||
    !response.body ||
    typeof response.clone !== 'function'
  ) {
    const text = await response.text()
    onProgress(0, 0)
    return { text, response, headers: response.headers }
  }

  const contentLength = response.headers.get('Content-Length')
  const total = contentLength ? Number.parseInt(contentLength, 10) : 0

  let progressClone: Response
  try {
    progressClone = response.clone()
  } catch {
    // Fallback if cloning fails
    const text = await response.text()
    onProgress(0, 0)
    return { text, response, headers: response.headers }
  }

  const progressPromise = (async () => {
    if (!progressClone.body) return
    const reader = progressClone.body.getReader()
    let received = 0
    const timer = setInterval(() => {
      onProgress(received, total > 0 ? total : received)
    }, 100)
    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        if (value) received += value.byteLength
      }
    } finally {
      clearInterval(timer)
      onProgress(received, total > 0 ? total : received)
    }
  })()

  const text = await response.text()
  await progressPromise

  return { text, response, headers: response.headers }
}

/**
 * Upload with real byte-level progress via XMLHttpRequest.
 *
 * 为什么用 XHR 而不是 fetch：
 * - fetch 在不使用流式请求体时，无法报告请求体的发送进度；
 * - 流式请求体虽然能拿到进度，但它没有 Content-Length、强制 chunked、
 *   只能在 HTTP/2 上发送、必触发 CORS 预检，经过代理 / 企业网关时会把
 *   认证信息弄坏，导致凭证有效却被 GitHub 返回 401 "Bad credentials"；
 * - XHR 的 upload.onprogress 用普通字符串请求体就能拿到真实的已发送字节数，
 *   走的是和 GET 一样的标准 HTTP 通路，兼容性最好。
 */
export async function fetchWithUploadProgress(
  url: string,
  init: RequestInit,
  body: string,
  onProgress: ProgressCallback
): Promise<Response> {
  const total = new TextEncoder().encode(body).byteLength

  return await new Promise<Response>((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open(init.method ?? 'POST', url, true)

    const headers = (init.headers ?? {}) as Record<string, string>
    for (const key of Object.keys(headers)) {
      try {
        xhr.setRequestHeader(key, String(headers[key]))
      } catch {
        // 浏览器禁止设置的请求头，跳过
      }
    }

    // 真实上传进度：event.loaded 为已发送字节数（含请求头开销，可能略大于 total）
    xhr.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable) {
        onProgress(Math.min(event.loaded, event.total || total), event.total || total)
      }
    })

    xhr.addEventListener('load', () => {
      const responseHeaders = new Headers()
      const raw = xhr.getAllResponseHeaders().trim()
      if (raw) {
        for (const line of raw.split(/[\r\n]+/)) {
          const index = line.indexOf(':')
          if (index > 0) {
            responseHeaders.append(
              line.slice(0, index).trim(),
              line.slice(index + 1).trim()
            )
          }
        }
      }

      onProgress(total, total)
      resolve(
        new Response(xhr.responseText, {
          status: xhr.status,
          statusText: xhr.statusText,
          headers: responseHeaders,
        })
      )
    })

    xhr.addEventListener('error', () => {
      reject(new TypeError('Failed to fetch'))
    })
    xhr.addEventListener('timeout', () => {
      reject(new TypeError('Failed to fetch'))
    })
    xhr.addEventListener('abort', () => {
      reject(new DOMException('The operation was aborted.', 'AbortError'))
    })

    init.signal?.addEventListener('abort', () => {
      xhr.abort()
    })

    xhr.send(body)
  })
}
