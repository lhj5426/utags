<script lang="ts">
  import Modal from '../Modal.svelte'
  import {
    syncConfigStore,
    removeSyncService,
    setActiveSyncService,
    discoverBrowserExtensionTargets,
    isDiscovering,
    discoveredTargets,
    promoteDiscoveredTarget,
  } from '../../stores/sync-config-store.js'
  import SyncServiceForm from './SyncServiceForm.svelte'
  import { syncManager } from '../../sync/sync-manager.js'
  import type { SyncServiceConfig } from '../../sync/types.js'
  import {
    Pen,
    Trash2,
    RefreshCw,
    CheckCircle,
    Plus,
    ArrowDownToLine,
    ArrowUpFromLine,
  } from 'lucide-svelte'
  import ConfirmModal from '../ConfirmModal.svelte'
  import {
    currentSyncingService,
    currentSyncOperation,
    syncProgress,
  } from '../../stores/sync-status-store.js'

  let { showSyncSettings = $bindable() } = $props<{
    showSyncSettings: boolean
  }>()
  let showSyncServiceForm = $state(false)
  let editingService = $state<SyncServiceConfig | null>(null)
  let showConfirmModal = $state(false)
  let serviceToDelete = $state<string | null>(null)

  function handleAdd() {
    editingService = null
    showSyncServiceForm = true
  }

  function handleEdit(service: SyncServiceConfig) {
    editingService = service
    showSyncServiceForm = true
  }

  function handleDelete(serviceId: string) {
    serviceToDelete = serviceId
    showConfirmModal = true
  }

  function confirmDelete() {
    if (serviceToDelete) {
      removeSyncService(serviceToDelete)
    }
    showConfirmModal = false
    serviceToDelete = null
  }

  async function handleSyncNow(serviceId: string) {
    if ($currentSyncingService) {
      alert('正在同步中，请稍后再试')
      return
    }

    currentSyncingService.set(serviceId)
    currentSyncOperation.set('sync')

    try {
      await syncManager.synchronize(serviceId)
    } finally {
      currentSyncingService.set(undefined)
      currentSyncOperation.set(undefined)
    }
  }

  async function handlePull(serviceId: string) {
    if ($currentSyncingService) {
      alert('正在同步中，请稍后再试')
      return
    }

    currentSyncingService.set(serviceId)
    currentSyncOperation.set('pull')

    try {
      await syncManager.pullFromRemote(serviceId)
    } finally {
      currentSyncingService.set(undefined)
      currentSyncOperation.set(undefined)
    }
  }

  async function handlePush(serviceId: string) {
    if ($currentSyncingService) {
      alert('正在同步中，请稍后再试')
      return
    }

    currentSyncingService.set(serviceId)
    currentSyncOperation.set('push')

    try {
      await syncManager.pushToRemote(serviceId)
    } finally {
      currentSyncingService.set(undefined)
      currentSyncOperation.set(undefined)
    }
  }

  function formatLastSyncTime(
    timestamp?: number,
    serviceType?: string
  ): string {
    if (!timestamp) {
      return '从未同步'
    }

    const date = new Date(timestamp)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffSeconds = Math.floor(diffMs / 1000)
    const diffMinutes = Math.floor(diffMs / (1000 * 60))
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

    if (diffMs < 0) {
      return '时间错误'
    }

    if (diffSeconds < 60) {
      return `${diffSeconds} 秒前`
    }
    if (diffMinutes < 60) {
      const remainingSeconds = diffSeconds % 60
      return `${diffMinutes} 分 ${remainingSeconds} 秒前`
    }

    return date.toLocaleString()
  }

  function handleSetAsActive(serviceId: string) {
    setActiveSyncService(serviceId)
  }

  /** Map sync status type to a Chinese label, taking the operation into account. */
  function statusLabel(type: string, operation: string | undefined): string {
    const stageMap: Record<string, string> = {
      initializing: '准备中',
      checking: '检查远程',
      downloading: '下载中',
      merging: '合并中',
      uploading: '上传中',
      success: '完成',
      error: '出错',
      conflict: '冲突',
    }
    const stage = stageMap[type] ?? type
    if (type === 'success' || type === 'error' || type === 'conflict') {
      return stage
    }
    const opMap: Record<string, string> = {
      pull: '正在下载',
      push: '正在上传',
      sync: '正在同步',
    }
    return opMap[operation ?? 'sync'] ?? stage
  }

  /** Static class bundles so Tailwind sees full class names in source. */
  const OP_CLASSES: Record<
    'pull' | 'push' | 'sync',
    { text: string; track: string; bar: string }
  > = {
    pull: {
      text: 'text-emerald-700 dark:text-emerald-300',
      track: 'bg-emerald-200 dark:bg-emerald-900/40',
      bar: 'bg-emerald-600 dark:bg-emerald-400',
    },
    push: {
      text: 'text-blue-700 dark:text-blue-300',
      track: 'bg-blue-200 dark:bg-blue-900/40',
      bar: 'bg-blue-600 dark:bg-blue-400',
    },
    sync: {
      text: 'text-indigo-700 dark:text-indigo-300',
      track: 'bg-indigo-200 dark:bg-indigo-900/40',
      bar: 'bg-indigo-600 dark:bg-indigo-400',
    },
  }
</script>

<Modal
  bind:isOpen={showSyncSettings}
  showConfirm={false}
  cancelText="关闭"
  title="同步设置">
  <div class="flex flex-col gap-6 p-2">
    <div class="flex justify-end gap-3">
      <button
        class="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-all hover:bg-indigo-700 focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50 dark:bg-indigo-500 dark:hover:bg-indigo-600 dark:focus:ring-offset-gray-900"
        onclick={() => discoverBrowserExtensionTargets()}
        disabled={$isDiscovering}>
        <RefreshCw size={18} class={$isDiscovering ? 'animate-spin' : ''} />
        <span>发现目标</span>
      </button>
      <button
        class="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-all hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:outline-none dark:bg-blue-500 dark:hover:bg-blue-600 dark:focus:ring-offset-gray-900"
        onclick={() => handleAdd()}>
        <Plus size={18} />
        <span>添加服务</span>
      </button>
    </div>
    <ul class="space-y-3">
      {#each $syncConfigStore.syncServices as service (service.id)}
        <li
          class="group rounded-xl border border-blue-400 bg-white p-4 shadow-sm transition-all duration-200 hover:border-blue-500 hover:shadow-md dark:border-gray-700 dark:bg-gray-800 dark:hover:border-blue-500">
          <div class="flex items-center gap-4">
            <div
              class="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400">
              {#if $syncConfigStore.activeSyncServiceId === service.id && false}
                <CheckCircle class="text-green-500" size={22} />
              {:else}
                <RefreshCw
                  size={20}
                  class={$currentSyncingService === service.id
                    ? 'animate-spin'
                    : ''} />
              {/if}
            </div>
            <div class="flex-1">
              <p class="font-semibold text-gray-900 dark:text-gray-50">
                {service.name}
              </p>
              <div
                class="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                <span>{service.type === 'browserExtension' ? '浏览器脚本同步' : service.type}</span>
                <span class="text-xs">•</span>
                <span
                  class:text-green-600={service.enabled}
                  class:dark:text-green-400={service.enabled}
                  class:text-red-600={!service.enabled}
                  class:dark:text-red-400={!service.enabled}
                  >{service.enabled ? '已启用' : '已禁用'}</span>
              </div>
              <div class="mt-1 flex flex-col gap-0.5 text-xs text-gray-400 dark:text-gray-500">
                <span>
                  上次同步: {formatLastSyncTime(
                    service.lastSyncTimestamp,
                    service.type
                  )}
                </span>
                {#if service.lastSyncOperation === 'pull' && service.lastPullTimestamp}
                  <span class="text-emerald-600 dark:text-emerald-400">
                    上次下载完成: {formatLastSyncTime(
                      service.lastPullTimestamp,
                      service.type
                    )}
                  </span>
                {/if}
                {#if service.lastSyncOperation === 'push' && service.lastPushTimestamp}
                  <span class="text-blue-600 dark:text-blue-400">
                    上次上传完成: {formatLastSyncTime(
                      service.lastPushTimestamp,
                      service.type
                    )}
                  </span>
                {/if}
                {#if service.lastSyncOperation === 'sync' && service.lastSyncTimestamp}
                  <span class="text-indigo-600 dark:text-indigo-400">
                    上次同步完成: {formatLastSyncTime(
                      service.lastSyncTimestamp,
                      service.type
                    )}
                  </span>
                {/if}
              </div>
            </div>
          </div>
          <div
            class="mt-3 flex items-center justify-end gap-1 border-t border-gray-200 pt-3 dark:border-gray-600">
            <button
              class="rounded-full p-2 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-800 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-white"
              onclick={() => handleEdit(service)}
              title="编辑">
              <Pen size={16} />
            </button>
            <button
              class="rounded-full p-2 text-red-500 transition-colors hover:bg-red-100 dark:hover:bg-red-900/50"
              onclick={() => handleDelete(service.id)}
              title="删除">
              <Trash2 size={16} />
            </button>
            <button
              class="flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1.5 text-xs font-medium text-emerald-700 transition-colors hover:bg-emerald-200 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-emerald-800/50 dark:text-emerald-300 dark:hover:bg-emerald-700 dark:disabled:opacity-40"
              onclick={() => handlePull(service.id)}
              title="下载 — 从远程拉取数据并合并到本地"
              disabled={!service.enabled || !!$currentSyncingService}>
              <ArrowDownToLine size={14} />
              <span>下载</span>
            </button>
            <button
              class="flex items-center gap-1.5 rounded-full bg-blue-100 px-3 py-1.5 text-xs font-medium text-blue-700 transition-colors hover:bg-blue-200 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-blue-800/50 dark:text-blue-300 dark:hover:bg-blue-700 dark:disabled:opacity-40"
              onclick={() => handlePush(service.id)}
              title="上传 — 将本地数据推送到远程"
              disabled={!service.enabled || !!$currentSyncingService}>
              <ArrowUpFromLine size={14} />
              <span>上传</span>
            </button>
            <button
              class="rounded-full p-2 text-gray-400 transition-colors hover:bg-gray-100 disabled:cursor-not-allowed disabled:text-gray-300 disabled:hover:bg-transparent dark:hover:bg-gray-700 dark:disabled:text-gray-600 dark:disabled:hover:bg-transparent"
              onclick={() => handleSyncNow(service.id)}
              title="完整同步（拉取 + 合并 + 上传）"
              disabled={!service.enabled || !!$currentSyncingService}>
              <RefreshCw size={14} />
            </button>
          </div>

          <!-- Dedicated progress bar — only visible when THIS service is the active one -->
          {#if $currentSyncingService === service.id && $syncProgress}
            {@const op = $currentSyncOperation ?? 'sync'}
            {@const opClasses = OP_CLASSES[op]}
            <div class="mt-3 space-y-1.5">
              <div
                class={'flex items-center justify-between text-xs font-medium ' +
                  opClasses.text}>
                <span class="flex items-center gap-1.5">
                  {#if op === 'pull'}
                    <ArrowDownToLine size={12} />
                  {:else if op === 'push'}
                    <ArrowUpFromLine size={12} />
                  {:else}
                    <RefreshCw size={12} class="animate-spin" />
                  {/if}
                  {statusLabel($syncProgress.type, op)}
                </span>
                <span>{$syncProgress.progressHint}%</span>
              </div>
              <div
                class={'h-2 w-full overflow-hidden rounded-full ' +
                  opClasses.track}>
                <div
                  class={'h-full rounded-full transition-all duration-500 ease-out ' +
                    opClasses.bar}
                  style="width: {$syncProgress.progressHint}%"></div>
              </div>
            </div>
          {/if}
        </li>
      {/each}
      {#each $discoveredTargets as service (service.id)}
        <li
          class="group flex items-center justify-between rounded-xl border border-dashed bg-white p-4 shadow-sm transition-all duration-200 hover:border-blue-500 hover:shadow-md dark:border-gray-700 dark:bg-gray-800 dark:hover:border-blue-500">
          <div class="flex items-center gap-4">
            <div
              class="flex h-10 w-10 items-center justify-center rounded-full bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400">
              <RefreshCw size={20} />
            </div>
            <div>
              <p class="font-semibold text-gray-900 dark:text-gray-50">
                {service.name}
              </p>
              <div
                class="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                <span>{service.type === 'browserExtension' ? '浏览器脚本同步' : service.type}</span>
              </div>
            </div>
          </div>
          <div
            class="flex items-center gap-1">
            <button
              class="rounded-full p-2 text-blue-500 transition-colors hover:bg-blue-100 dark:hover:bg-blue-900/50"
              onclick={() => promoteDiscoveredTarget(service.id)}
              title="添加">
              <Plus size={16} />
            </button>
          </div>
        </li>
      {/each}
    </ul>
  </div>

  {#if showSyncServiceForm}
    <SyncServiceForm
      bind:showForm={showSyncServiceForm}
      service={editingService} />
  {/if}

  <ConfirmModal
    bind:isOpen={showConfirmModal}
    title="删除同步服务"
    message="确定删除该同步服务吗？此操作不可撤销。"
    confirmText="删除"
    onConfirm={confirmDelete} />
</Modal>
