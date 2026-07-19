import { writable } from 'svelte/store'
import { syncManager } from '../sync/sync-manager.js'
import type { SyncStatus } from '../sync/types.js'

/**
 * Global store for tracking the currently syncing service
 * This allows the sync status to persist even when the SyncSettingsModal is closed
 */
export const currentSyncingService = writable<string | undefined>(undefined)

/**
 * Which kind of operation triggered the current sync, so the UI can
 * correctly label the progress bar (e.g. "下载中" vs "上传中") instead
 * of guessing from the underlying status type.
 */
export const currentSyncOperation = writable<
  'pull' | 'push' | 'sync' | undefined
>(undefined)

/**
 * Detailed progress of the current sync operation for progress-bar UIs.
 * `null` when idle; otherwise carries the status type and an optional
 * percent hint so the UI can show a meaningful progress indicator instead
 * of just a bare spinner.
 *
 * The status type maps to a rough stage:
 *   initializing -> 5%, checking -> 15%, downloading -> 30%,
 *   merging -> 60%, uploading -> 80%, success -> 100%
 */
export const syncProgress = writable<{
  type: SyncStatus['type']
  progressHint: number
} | null>(null)

const PROGRESS_HINT_MAP: Record<string, number> = {
  idle: 0,
  initializing: 5,
  checking: 15,
  downloading: 30,
  merging: 60,
  uploading: 80,
  success: 100,
}

// Set up global listeners for sync events
function initializeSyncListeners() {
  // Handle sync initializing event
  const onSyncInitializing = (data: { serviceId: string }) => {
    console.log('[sync-status-store] sync initializing', data.serviceId)
    currentSyncingService.set(data.serviceId)
  }

  // Handle sync start event
  const onSyncStart = (data: { serviceId: string }) => {
    console.log('[sync-status-store] sync start', data.serviceId)
    currentSyncingService.set(data.serviceId)
  }

  // Handle sync end event
  const onSyncEnd = (data: { serviceId: string }) => {
    console.log('[sync-status-store] sync end', data.serviceId)
    currentSyncingService.update((current) => {
      if (current === data.serviceId) {
        return undefined
      }

      return current
    })
    // The caller (handlePull / handlePush / handleSyncNow) is responsible
    // for clearing `currentSyncOperation` because it owns the operation type.
  }

  // Handle status change for progress tracking
  const onStatusChange = (status: SyncStatus) => {
    if (
      status.type === 'idle' ||
      status.type === 'success' ||
      status.type === 'error' ||
      status.type === 'conflict' ||
      status.type === 'disabled'
    ) {
      syncProgress.set(null)
    } else {
      syncProgress.set({
        type: status.type,
        progressHint:
          PROGRESS_HINT_MAP[status.type] ??
          (status.type === 'downloading' || status.type === 'uploading'
            ? 50
            : 10),
      })
    }
  }

  // Register event listeners
  syncManager.on('syncInitializing', onSyncInitializing)
  syncManager.on('syncStart', onSyncStart)
  syncManager.on('syncEnd', onSyncEnd)
  syncManager.on('statusChange', onStatusChange)

  // No need to return cleanup function as this is a global store
  // that should listen for events throughout the application lifecycle
}

// Initialize the listeners
initializeSyncListeners()
