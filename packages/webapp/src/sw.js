const CACHE_NAME = 'utags-cache-v2'
const ASSETS_TO_CACHE = self.__WB_MANIFEST.map((entry) => entry.url)

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(ASSETS_TO_CACHE))
      .then(() => self.skipWaiting())
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event

  // 非 GET 请求（同步上传等 API 调用）直接放行，不经缓存
  if (request.method !== 'GET') return

  const url = new URL(request.url)

  // 跨域请求（如 api.github.com）直接放行，避免被缓存层包住后
  // 真实错误（CORS / 401）被吞成 "Failed to fetch"
  if (url.origin !== self.location.origin) return

  // 页面导航：网络优先，拿不到再用缓存，保证每次都能加载最新 HTML
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone()
          caches
            .open(CACHE_NAME)
            .then((cache) => cache.put(request, copy))
            .catch(() => {})
          return response
        })
        .catch(() =>
          caches
            .match(request)
            .then((cached) => cached || caches.match('/index.html'))
        )
    )
    return
  }

  // 静态资源：先用缓存，同时后台拉新版本，下次访问即为最新
  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((response) => {
          if (response && response.status === 200) {
            const copy = response.clone()
            caches
              .open(CACHE_NAME)
              .then((cache) => cache.put(request, copy))
              .catch(() => {})
          }
          return response
        })
        .catch(() => cached)

      return cached || network
    })
  )
})

// 激活时清掉旧版本缓存（只删静态资源缓存，不影响 IndexedDB / localStorage）
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) =>
        Promise.all(
          cacheNames.map((cache) => {
            if (cache !== CACHE_NAME) {
              return caches.delete(cache)
            }
          })
        )
      )
      .then(() => self.clients.claim())
  )
})
