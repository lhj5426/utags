import { writable } from 'svelte/store'
import { syncManager } from '../sync/sync-manager.js'
import type { SyncStatus } from '../sync/types.js'

export const currentSyncingService = writable<string | undefined>(undefined)

export const currentSyncOperation = writable<
  'pull' | 'push' | 'sync' | undefined
>(undefined)

// ---- Speed tracking -------------------------------------------------------
let lastBytes = 0
let lastSpeedTime = 0

function formatSpeed(bytesPerSec: number): string {
  if (bytesPerSec < 1024) return `${Math.max(1, bytesPerSec)} B/s`
  if (bytesPerSec < 1048576) return `${(bytesPerSec / 1024).toFixed(1)} KB/s`
  return `${(bytesPerSec / 1048576).toFixed(1)} MB/s`
}

// ---- Progress store -------------------------------------------------------
export const syncProgress = writable<{
  type: SyncStatus['type']
  progress: number // 0-100 real percent
  speed: string // e.g. "1.2 MB/s"
} | null>(null)

// ---- Error store ----------------------------------------------------------
export const syncError = writable<{
  serviceId?: string
  message: string
} | null>(null)

/** Turn raw adapter errors into something a user can act on. */
function humanizeSyncError(message: string): string {
  if (/409|conflict/i.test(message)) {
    return '远程文件已被改动（409 冲突）'
  }
  if (/401|bad credentials/i.test(message)) {
    return 'GitHub 认证失败（401 Bad credentials）'
  }
  if (/403|resource not accessible/i.test(message)) {
    return 'GitHub 拒绝访问（403）'
  }
  if (/422/i.test(message)) {
    return 'GitHub 拒绝了这次提交（422）'
  }
  if (/failed to fetch|networkerror|err_/i.test(message)) {
    return '网络请求失败'
  }
  return message
}

function initializeSyncListeners() {
  syncManager.on('syncInitializing', (data: { serviceId: string }) => {
    currentSyncingService.set(data.serviceId)
  })

  syncManager.on('syncStart', (data: { serviceId: string }) => {
    currentSyncingService.set(data.serviceId)
    syncError.set(null)
    lastBytes = 0
    lastSpeedTime = Date.now()
  })

  syncManager.on(
    'error',
    (data: { message: string; serviceId?: string }) => {
      syncError.set({
        serviceId: data.serviceId,
        message: humanizeSyncError(data.message),
      })
    }
  )

  syncManager.on('syncEnd', (data: { serviceId: string }) => {
    currentSyncingService.update((c) =>
      c === data.serviceId ? undefined : c
    )
  })

  syncManager.on(
    'statusChange',
    (status: SyncStatus & { bytesTransferred?: number; bytesTotal?: number }) => {
      if (
        status.type === 'error' ||
        status.type === 'conflict' ||
        status.type === 'disabled'
      ) {
        syncProgress.set(null)
        lastBytes = 0
        return
      }

      if (status.type === 'success') {
        // Keep 100 % visible for a moment so the user sees "完成"
        syncProgress.set({
          type: status.type as SyncStatus['type'],
          progress: 100,
          speed: '--',
        })
        setTimeout(() => {
          syncProgress.update((v) => (v?.type === 'success' ? null : v))
        }, 1500)
        lastBytes = 0
        return
      }

      if (status.type === 'idle') {
        syncProgress.set(null)
        lastBytes = 0
        return
      }

      const now = Date.now()
      const elapsed = (now - lastSpeedTime) / 1000
      let speed = '--'

      if (
        elapsed > 0.05 &&
        typeof status.bytesTransferred === 'number' &&
        status.bytesTransferred > lastBytes
      ) {
        const deltaBytes = status.bytesTransferred - lastBytes
        speed = formatSpeed(deltaBytes / elapsed)
      }

      lastBytes = status.bytesTransferred ?? lastBytes
      lastSpeedTime = now

      syncProgress.set({
        type: status.type,
        progress: status.progress ?? 0,
        speed,
      })
    }
  )
}

initializeSyncListeners()
