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
 * Upload with real progress via ReadableStream. The body is split into
 * 1KB chunks and fed through a ReadableStream, so the fetch()'s network
 * layer naturally backpressures. A 100ms timer reports the current byte
 * count to the UI.
 */
export async function fetchWithUploadProgress(
  url: string,
  init: RequestInit,
  body: string,
  onProgress: ProgressCallback
): Promise<Response> {
  const encoder = new TextEncoder()
  const data = encoder.encode(body)
  const total = data.length
  let sent = 0
  const CHUNK = 1024

  const timer = setInterval(() => {
    onProgress(sent, total)
  }, 100)
  const cleanup = () => clearInterval(timer)

  const stream = new ReadableStream({
    async pull(controller) {
      if (sent >= total) {
        controller.close()
        cleanup()
        onProgress(total, total)
        return
      }
      const end = Math.min(sent + CHUNK, total)
      controller.enqueue(data.slice(sent, end))
      sent = end
      await new Promise((r) => setTimeout(r, 0))
    },
    cancel() {
      cleanup()
    },
  })

  try {
    return await fetch(url, {
      ...init,
      body: stream,
      duplex: 'half',
    } as RequestInit)
  } catch (e) {
    cleanup()
    throw e
  }
}
