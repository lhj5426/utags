<script lang="ts">
  import { onMount } from 'svelte'
  import Modal from '../Modal.svelte'
  import {
    addSyncService,
    updateSyncService,
  } from '../../stores/sync-config-store.js'

  import InputField from '../ui/InputField.svelte'
  import DatePicker from '../ui/DatePicker.svelte'
  import Switch from '../Switch.svelte'
  import type { SyncServiceConfig } from '../../sync/types.js'
  import type { MergeStrategy } from '../../lib/bookmark-merge-utils.js'
  import {
    mergeMetaOptions,
    mergeTagsOptions,
  } from '../../config/merge-options.js'

  type FormConfig = Omit<SyncServiceConfig, 'mergeStrategy'> & {
    mergeStrategy: MergeStrategy
  }

  let { showForm = $bindable(), service = null } = $props<{
    showForm: boolean
    service?: SyncServiceConfig | null
  }>()

  let config = $state<FormConfig>({
    id: '',
    name: '',
    type: 'github',
    enabled: true,
    autoSyncEnabled: false,
    autoSyncOnChanges: false,
    autoSyncInterval: 15,
    autoSyncDelayOnChanges: 1,
    scope: 'all',
    credentials: {
      username: '',
      password: '',
      token: '',
      apiKey: '',
    },
    target: {
      url: '',
      repo: '',
      path: '',
      branch: '',
      authTestEndpoint: '',
    },
    mergeStrategy: {
      meta: 'merge',
      tags: 'union',
      defaultDate: 0,
      preferOldestCreated: true,
      preferNewestUpdated: true,
    },
  })

  onMount(() => {
    if (service) {
      config.id = service.id
      config.name = service.name
      config.type = service.type
      config.enabled = service.enabled
      config.autoSyncEnabled = service.autoSyncEnabled
      config.autoSyncInterval = service.autoSyncInterval
      config.autoSyncOnChanges = service.autoSyncOnChanges
      config.autoSyncDelayOnChanges = service.autoSyncDelayOnChanges
      if (service.credentials) {
        config.credentials = { ...config.credentials, ...service.credentials }
      }
      if (service.target) {
        config.target = { ...config.target, ...service.target }
      }
      if (service.mergeStrategy) {
        config.mergeStrategy = {
          ...config.mergeStrategy,
          ...service.mergeStrategy,
        }
      }
    } else {
      config.id = crypto.randomUUID()
    }
  })

  // Validation error state
  let validationErrors = $state<string[]>([])

  /**
   * Validates the form configuration before submission
   * @returns Array of validation error messages
   */
  function validateForm(): string[] {
    const errors: string[] = []

    // Validate service name (required)
    if (!config.name || config.name.trim().length === 0) {
      errors.push('服务名称不能为空')
    } else if (config.name.trim().length > 100) {
      errors.push('服务名称不能超过 100 个字符')
    }

    // Validate auto sync interval (must be positive number)
    if (config.autoSyncInterval !== undefined) {
      if (config.autoSyncInterval <= 0) {
        errors.push('自动同步间隔必须大于 0 分钟')
      } else if (config.autoSyncInterval > 1440) {
        errors.push(
          '自动同步间隔不能超过 1440 分钟（24 小时）'
        )
      }
    }

    // Validate auto sync delay (must be positive number)
    if (config.autoSyncDelayOnChanges !== undefined) {
      if (config.autoSyncDelayOnChanges <= 0) {
        errors.push('变更延迟同步必须大于 0 分钟')
      } else if (config.autoSyncDelayOnChanges > 60) {
        errors.push('变更延迟同步不能超过 60 分钟')
      }
    }

    // Validate merge strategy default date format (if provided)
    if (config.mergeStrategy.defaultDate) {
      const dateValue = new Date(config.mergeStrategy.defaultDate)
      if (isNaN(dateValue.getTime())) {
        errors.push('默认日期格式无效')
      } else if (dateValue > new Date()) {
        errors.push('默认日期不能是未来时间')
      }
    }

    // Type-specific validation
    switch (config.type) {
      case 'github':
        if (
          !config.credentials.token ||
          config.credentials.token.trim().length === 0
        ) {
          errors.push('GitHub 令牌不能为空')
        }
        if (!config.target.repo || config.target.repo.trim().length === 0) {
          errors.push('仓库名称不能为空')
        } else if (!/^[\w.-]+\/[\w.-]+$/.test(config.target.repo.trim())) {
          errors.push('仓库名称格式必须为 "owner/repo"')
        }
        // Path and branch are optional for GitHub, no validation needed
        break

      case 'webdav':
        if (
          !config.credentials.username ||
          config.credentials.username.trim().length === 0
        ) {
          errors.push('WebDAV 用户名不能为空')
        }
        if (
          !config.credentials.password ||
          config.credentials.password.trim().length === 0
        ) {
          errors.push('WebDAV 密码不能为空')
        }
        if (!config.target.url || config.target.url.trim().length === 0) {
          errors.push('WebDAV 地址不能为空')
        } else {
          try {
            const url = new URL(config.target.url.trim())
            if (!['http:', 'https:'].includes(url.protocol)) {
              errors.push('WebDAV 地址必须使用 HTTP 或 HTTPS 协议')
            }
          } catch {
            errors.push('WebDAV 地址格式无效')
          }
        }
        // Path is optional for WebDAV, no validation needed
        break

      case 'customApi':
        if (!config.credentials.token && !config.credentials.apiKey) {
          errors.push('自定义 API 需要提供令牌或 API 密钥')
        }
        if (!config.target.url || config.target.url.trim().length === 0) {
          errors.push('API 基础地址不能为空')
        } else {
          try {
            const url = new URL(config.target.url.trim())
            if (!['http:', 'https:'].includes(url.protocol)) {
              errors.push('API 地址必须使用 HTTP 或 HTTPS 协议')
            }
          } catch {
            errors.push('API 地址格式无效')
          }
        }
        // Path is optional for Custom API, no validation needed
        break

      case 'browserExtension':
        // Browser extension doesn't require additional validation
        break

      default:
        errors.push('无效的服务类型')
        break
    }

    return errors
  }

  function handleSubmit() {
    // Clear previous validation errors
    validationErrors = []

    // Validate form
    const errors = validateForm()
    if (errors.length > 0) {
      validationErrors = errors
      return
    }

    let serviceToSave: SyncServiceConfig

    const baseConfig = {
      id: config.id,
      name: config.name.trim(),
      type: config.type,
      enabled: config.enabled,
      autoSyncEnabled: config.autoSyncEnabled,
      autoSyncOnChanges: config.autoSyncOnChanges,
      autoSyncInterval: config.autoSyncInterval,
      autoSyncDelayOnChanges: config.autoSyncDelayOnChanges,
      scope: config.scope,
      mergeStrategy: {
        ...config.mergeStrategy,
        defaultDate: config.mergeStrategy.defaultDate || 0,
      },
    }

    switch (config.type) {
      case 'github':
        serviceToSave = {
          ...baseConfig,
          type: 'github',
          credentials: {
            token: config.credentials.token?.trim() || '',
          },
          target: {
            repo: config.target.repo?.trim() || '',
            path: config.target.path?.trim() || '',
            branch: config.target.branch?.trim() || '',
          },
        }
        break
      case 'webdav':
        serviceToSave = {
          ...baseConfig,
          type: 'webdav',
          credentials: {
            username: config.credentials.username?.trim() || '',
            password: config.credentials.password?.trim() || '',
          },
          target: {
            url: config.target.url?.trim() || '',
            path: config.target.path?.trim() || '',
          },
        }
        break
      case 'customApi':
        serviceToSave = {
          ...baseConfig,
          type: 'customApi',
          credentials: {
            token: config.credentials.token?.trim() || '',
            apiKey: config.credentials.apiKey?.trim() || '',
          },
          target: {
            url: config.target.url?.trim() || '',
            path: config.target.path?.trim() || '',
            authTestEndpoint: config.target.authTestEndpoint?.trim() || '',
          },
        }
        break
      case 'browserExtension':
        serviceToSave = {
          ...baseConfig,
          type: 'browserExtension',
          credentials: service ? service.credentials : {},
          target: service ? service.target : {},
        }
        break
      default:
        // Should not happen
        return
    }

    if (service) {
      // Preserve sync metadata when updating service
      serviceToSave = {
        ...serviceToSave,
        lastSyncTimestamp: service.lastSyncTimestamp,
        lastDataChangeTimestamp: service.lastDataChangeTimestamp,
        lastSyncLocalDataHash: service.lastSyncLocalDataHash,
        lastSyncMeta: service.lastSyncMeta,
      }
      updateSyncService(serviceToSave)
    } else {
      addSyncService(serviceToSave)
    }
    showForm = false
  }

  /**
   * Clears validation errors when user starts editing
   */
  function clearValidationErrors() {
    if (validationErrors.length > 0) {
      validationErrors = []
    }
  }

  function onInputEnter() {
    handleSubmit()
  }
</script>

<Modal
  bind:isOpen={showForm}
  title={service ? '编辑同步服务' : '添加同步服务'}
  onConfirm={handleSubmit}
  {onInputEnter}>
  <div class="space-y-4 p-1">
    <!-- Validation Errors Display -->
    {#if validationErrors.length > 0}
      <div class="rounded-md bg-red-50 p-4 dark:bg-red-900/20">
        <div class="flex">
          <div class="ml-3">
            <h3 class="text-sm font-medium text-red-800 dark:text-red-200">
              请修正以下错误：
            </h3>
            <div class="mt-2 text-sm text-red-700 dark:text-red-300">
              <ul class="list-disc space-y-1 pl-5">
                {#each validationErrors as error}
                  <li>{error}</li>
                {/each}
              </ul>
            </div>
          </div>
        </div>
      </div>
    {/if}
    <div
      class="flex items-center justify-between border-b border-gray-200 pb-4 dark:border-gray-700">
      <span class="text-sm font-medium text-gray-700 dark:text-gray-300"
        >服务状态</span>
      <Switch bind:checked={config.enabled} />
    </div>

    <InputField
      bind:value={config.name}
      placeholder="我的同步服务"
      onInput={clearValidationErrors}>
      服务名称：
    </InputField>

    <div class="space-y-3">
      <h3 class="text-lg font-medium text-gray-900 dark:text-white">
        同步服务器信息
      </h3>
      <label
        for="service-type"
        class="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300"
        >服务类型：</label>
      <select
        id="service-type"
        bind:value={config.type}
        disabled={!!service}
        class="mt-1 block w-full rounded-md border-gray-300 py-2 pr-10 pl-3 text-base focus:border-indigo-500 focus:ring-indigo-500 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50 sm:text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white">
        <option value="github">GitHub</option>
        <option value="webdav">WebDAV</option>
        {#if service?.type === 'customApi'}
          <option value="customApi" selected>Custom API</option>
        {/if}
        {#if service?.type === 'browserExtension'}
          <option value="browserExtension" selected>Browser Extension</option>
        {/if}
        <!-- <option value="customApi">Custom API</option>
        <option value="browserExtension">Browser Extension</option> -->
      </select>
      {#if config.type === 'webdav'}
        <InputField
          bind:value={config.target.url}
          placeholder="https://example.com/dav"
          onInput={clearValidationErrors}>
          WebDAV 地址：
        </InputField>
        <InputField
          bind:value={config.target.path}
          placeholder="utags/bookmarks.json"
          onInput={clearValidationErrors}>
          路径：
        </InputField>
        <InputField
          bind:value={config.credentials.username}
          placeholder="用户名"
          onInput={clearValidationErrors}>
          用户名：
        </InputField>
        <InputField
          type="password"
          bind:value={config.credentials.password}
          placeholder="密码"
          onInput={clearValidationErrors}>
          密码：
        </InputField>
      {/if}

      {#if config.type === 'github'}
        <InputField
          bind:value={config.target.repo}
          placeholder="owner/repo"
          onInput={clearValidationErrors}>
          仓库名称：
        </InputField>
        <InputField
          bind:value={config.target.path}
          placeholder="utags/bookmarks.json"
          onInput={clearValidationErrors}>
          文件路径：
        </InputField>
        <InputField
          bind:value={config.target.branch}
          placeholder="main"
          onInput={clearValidationErrors}>
          分支：
        </InputField>
        <InputField
          type="password"
          bind:value={config.credentials.token}
          placeholder="GitHub 个人访问令牌"
          onInput={clearValidationErrors}>
          令牌：
        </InputField>
      {/if}

      {#if config.type === 'customApi'}
        <InputField
          bind:value={config.target.url}
          placeholder="https://api.example.com/v1"
          onInput={clearValidationErrors}>
          API 基础地址：
        </InputField>
        <InputField
          bind:value={config.target.path}
          placeholder="utags-bookmarks.json"
          onInput={clearValidationErrors}>
          路径：
        </InputField>
        <InputField
          bind:value={config.target.authTestEndpoint}
          placeholder="auth/status"
          onInput={clearValidationErrors}>
          认证测试端点：
        </InputField>
        <InputField
          type="password"
          bind:value={config.credentials.token}
          placeholder="Bearer 令牌"
          onInput={clearValidationErrors}>
          令牌：
        </InputField>
        <InputField
          type="password"
          bind:value={config.credentials.apiKey}
          placeholder="API 密钥"
          onInput={clearValidationErrors}>
          API 密钥：
        </InputField>
      {/if}
    </div>
    <div class="space-y-3 border-t border-gray-200 pt-4 dark:border-gray-700">
      <h3 class="text-lg font-medium text-gray-900 dark:text-white">
        自动同步行为
      </h3>
      <div class="flex items-center justify-between">
        <span class="text-sm font-medium text-gray-700 dark:text-gray-300"
          >启用自动同步</span>
        <Switch bind:checked={config.autoSyncEnabled} />
      </div>

      <InputField
        type="number"
        bind:value={config.autoSyncInterval}
        onInput={clearValidationErrors}>
        自动同步间隔（分钟）：
      </InputField>

      <div class="flex items-center justify-between">
        <span class="text-sm font-medium text-gray-700 dark:text-gray-300"
          >数据变更时自动同步</span>
        <Switch bind:checked={config.autoSyncOnChanges} />
      </div>
      <InputField
        type="number"
        bind:value={config.autoSyncDelayOnChanges}
        onInput={clearValidationErrors}>
        变更后延迟同步（分钟）：
      </InputField>
    </div>

    <div class="space-y-3 border-t border-gray-200 pt-4 dark:border-gray-700">
      <h3 class="text-lg font-medium text-gray-900 dark:text-white">
        合并策略
      </h3>
      <div>
        <label
          for="meta-strategy"
          class="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300"
          >Metadata 合并策略:</label>
        <select
          id="meta-strategy"
          bind:value={config.mergeStrategy.meta}
          class="mt-1 block w-full rounded-md border-gray-300 py-2 pr-10 pl-3 text-base focus:border-indigo-500 focus:ring-indigo-500 focus:outline-none sm:text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white">
          {#each mergeMetaOptions as option}
            <option value={option.value}>{option.label}</option>
          {/each}
        </select>
      </div>
      <div>
        <label
          for="tags-strategy"
          class="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300"
          >Tags 合并策略:</label>
        <select
          id="tags-strategy"
          bind:value={config.mergeStrategy.tags}
          class="mt-1 block w-full rounded-md border-gray-300 py-2 pr-10 pl-3 text-base focus:border-indigo-500 focus:ring-indigo-500 focus:outline-none sm:text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white">
          {#each mergeTagsOptions as option}
            <option value={option.value}>{option.label}</option>
          {/each}
        </select>
      </div>
      <DatePicker
        bind:value={config.mergeStrategy.defaultDate}
        onInput={clearValidationErrors}>
        无效时间戳默认日期：
      </DatePicker>
      <div class="flex items-center justify-between">
        <span class="text-sm font-medium text-gray-700 dark:text-gray-300"
          >优先最早创建时间</span>
        <Switch bind:checked={config.mergeStrategy.preferOldestCreated} />
      </div>
      <div class="flex items-center justify-between">
        <span class="text-sm font-medium text-gray-700 dark:text-gray-300"
          >优先最新更新时间</span>
        <Switch bind:checked={config.mergeStrategy.preferNewestUpdated} />
      </div>
    </div>
  </div>
</Modal>
