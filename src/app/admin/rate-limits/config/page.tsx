"use client"

import { useState, useEffect } from "react"
import { Save, RotateCcw, AlertCircle, CheckCircle, Settings, Shield, Clock, Users, Globe, Key } from "lucide-react"

interface RateLimitConfig {
  global: {
    defaultPerMinute: number
    defaultPerHour: number
    defaultPerDay: number
    identityOrder: string[]
  }
  routes: {
    [route: string]: {
      perMinute?: number
      perHour?: number
      perDay?: number
    }
  }
  identityMultipliers: {
    jwt: number
    session: number
    ip: number
  }
  turnstile: {
    enabled: boolean
    bypassAuthenticated: boolean
    cacheDuration: number
  }
  routesInScope?: string[]
}

interface RouteLimit {
  pattern: string
  perMinute: number
  perHour: number
  perDay: number
}

export default function ConfigPage() {
  const [config, setConfig] = useState<RateLimitConfig | null>(null)
  const [originalConfig, setOriginalConfig] = useState<RateLimitConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null)
  const [newRoute, setNewRoute] = useState<RouteLimit>({ pattern: "", perMinute: 60, perHour: 3600, perDay: 86400 })
  const [routeLimits, setRouteLimits] = useState<RouteLimit[]>([])

  useEffect(() => {
    fetchConfig()
  }, [])

  const fetchConfig = async () => {
    setLoading(true)
    try {
      const token = typeof window !== "undefined" ? localStorage.getItem("admin_token") : null
      const res = await fetch("/api/admin/config", {
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      })
      if (res.status === 401) {
        window.location.href = "/admin/login"
        return
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = await res.json()
      const override = json.data?.override || {}
      const defaults = json.data?.defaults || {}
      const mergedRoutes = {
        ...(defaults.routes || {}),
        ...(override.routes || {}),
      }
      const src = Object.keys(override).length ? { ...defaults, ...override, routes: mergedRoutes } : { ...defaults, routes: mergedRoutes }
       const uiConfig: RateLimitConfig = {
        global: {
          defaultPerMinute: src.limits?.global?.minute ?? 60,
          defaultPerHour: src.limits?.global?.hour ?? 3600,
          defaultPerDay: src.limits?.global?.day ?? 86400,
          identityOrder: defaults.identityOrder?.map((v: string) =>
            v === "jwt-sub" ? "jwt" : v === "session-cookie" ? "session" : "ip",
          ) || ["jwt", "session", "ip"],
        },
        routes: src.routes || {},
        identityMultipliers: src.identityMultipliers || { jwt: 2.0, session: 1.5, ip: 1.0 },
        turnstile: {
          enabled: !!src.turnstile?.enabled,
          bypassAuthenticated: !!src.turnstile?.bypassAuthenticated,
          cacheDuration: src.turnstile?.cacheDurationSeconds ?? defaults.turnstile?.cacheDurationSeconds ?? 300,
        },
        routesInScope: Array.isArray(src.routesInScope) ? src.routesInScope : defaults.routesInScope || [],
      }
      setConfig(uiConfig)
      setOriginalConfig(JSON.parse(JSON.stringify(uiConfig)))
      setRouteLimits(
        Object.entries(mergedRoutes).map(([pattern, limits]) => {
          const { perMinute, perHour, perDay } = limits as {
            perMinute?: number;
            perHour?: number;
            perDay?: number;
          };
          return {
            pattern,
            perMinute: perMinute || uiConfig.global.defaultPerMinute,
            perHour: perHour || uiConfig.global.defaultPerHour,
            perDay: perDay || uiConfig.global.defaultPerDay,
          };
        }),
      )
      setLoading(false)
    } catch (error) {
      console.error("Failed to fetch config:", error)
      setMessage({ type: "error", text: "Failed to load configuration" })
      setLoading(false)
    }
  }

  const saveConfig = async () => {
    if (!config) return

    setSaving(true)
    try {
      const token = typeof window !== "undefined" ? localStorage.getItem("admin_token") : null
      const payload = {
        global: config.global,
        routes: routeLimits.reduce(
          (acc, route) => {
            acc[route.pattern] = {
              perMinute: route.perMinute,
              perHour: route.perHour,
              perDay: route.perDay,
            }
            return acc
          },
          {} as { [route: string]: { perMinute?: number; perHour?: number; perDay?: number } },
        ),
        identityMultipliers: config.identityMultipliers,
         routesInScope: Array.isArray(config.routesInScope) ? config.routesInScope : [],
        turnstile: {
          enabled: config.turnstile.enabled,
          bypassAuthenticated: config.turnstile.bypassAuthenticated,
          cacheDuration: config.turnstile.cacheDuration,
        },
      }
      const res = await fetch("/api/admin/config", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(payload),
      })
      if (res.status === 401) {
        window.location.href = "/admin/login"
        return
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setOriginalConfig(JSON.parse(JSON.stringify(config)))
      setMessage({ type: "success", text: "Configuration saved successfully" })
    } catch (error) {
      console.error("Failed to save config:", error)
      setMessage({ type: "error", text: "Failed to save configuration" })
    } finally {
      setSaving(false)
      setTimeout(() => setMessage(null), 3000)
    }
  }

  const resetConfig = () => {
    if (originalConfig) {
      setConfig(JSON.parse(JSON.stringify(originalConfig)))
      setRouteLimits(
        Object.entries(originalConfig.routes).map(([pattern, limits]) => ({
          pattern,
          perMinute: limits.perMinute || originalConfig.global.defaultPerMinute,
          perHour: limits.perHour || originalConfig.global.defaultPerHour,
          perDay: limits.perDay || originalConfig.global.defaultPerDay,
        })),
      )
      setMessage({ type: "success", text: "Configuration reset to last saved state" })
      setTimeout(() => setMessage(null), 3000)
    }
  }

  const updateGlobalConfig = (field: keyof RateLimitConfig["global"], value: any) => {
    if (!config) return
    setConfig({
      ...config,
      global: {
        ...config.global,
        [field]: value,
      },
    })
  }

  const updateRouteLimit = (index: number, field: keyof RouteLimit, value: any) => {
    setRouteLimits(routeLimits.map((route, i) => (i === index ? { ...route, [field]: value } : route)))
  }

  const addRouteLimit = () => {
    if (!newRoute.pattern) return

    setRouteLimits([...routeLimits, newRoute])
    setNewRoute({ pattern: "", perMinute: 60, perHour: 3600, perDay: 86400 })
  }

  const removeRouteLimit = (index: number) => {
    setRouteLimits(routeLimits.filter((_, i) => i !== index))
  }

  const updateIdentityMultiplier = (identity: keyof RateLimitConfig["identityMultipliers"], value: number) => {
    if (!config) return
    setConfig({
      ...config,
      identityMultipliers: {
        ...config.identityMultipliers,
        [identity]: value,
      },
    })
  }

  const updateTurnstileConfig = (field: keyof RateLimitConfig["turnstile"], value: any) => {
    if (!config) return
    setConfig({
      ...config,
      turnstile: {
        ...config.turnstile,
        [field]: value,
      },
    })
  }

  const hasChanges = config && originalConfig && JSON.stringify(config) !== JSON.stringify(originalConfig)

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 bg-gray-200 animate-pulse rounded w-64"></div>
        <div className="space-y-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="bg-white shadow rounded-lg p-6">
              <div className="h-6 bg-gray-200 animate-pulse rounded w-32 mb-4"></div>
              <div className="space-y-3">
                <div className="h-4 bg-gray-200 animate-pulse rounded"></div>
                <div className="h-4 bg-gray-200 animate-pulse rounded w-3/4"></div>
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (!config) return null

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Rate Limit Configuration</h1>
          <p className="mt-1 text-sm text-gray-500">Configure rate limiting rules and thresholds</p>
        </div>

        <div className="flex items-center space-x-4">
          {message && (
            <div
              className={`inline-flex items-center px-3 py-2 rounded-md text-sm font-medium ${
                message.type === "success" ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"
              }`}
            >
              {message.type === "success" ? (
                <CheckCircle className="h-4 w-4 mr-2" />
              ) : (
                <AlertCircle className="h-4 w-4 mr-2" />
              )}
              {message.text}
            </div>
          )}

          <button
            onClick={resetConfig}
            disabled={!hasChanges}
            className="inline-flex items-center px-3 py-2 border border-gray-300 shadow-sm text-sm leading-4 font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
          >
            <RotateCcw className="h-4 w-4 mr-2" />
            Reset
          </button>

          <button
            onClick={saveConfig}
            disabled={saving || !hasChanges}
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
          >
            <Save className={`h-4 w-4 mr-2 ${saving ? "animate-spin" : ""}`} />
            {saving ? "Saving..." : "Save Changes"}
          </button>
        </div>
      </div>

      {/* Global Settings */}
      <div className="bg-white shadow rounded-lg">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-medium text-gray-900 flex items-center">
            <Settings className="h-5 w-5 mr-2" />
            Global Rate Limits
          </h3>
          <p className="mt-1 text-sm text-gray-500">Default rate limits applied to all endpoints</p>
        </div>
        <div className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <Clock className="inline h-4 w-4 mr-1" />
                Per Minute
              </label>
              <input
                type="number"
                className="w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500"
                value={config.global.defaultPerMinute}
                onChange={(e) => updateGlobalConfig("defaultPerMinute", Number.parseInt(e.target.value))}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <Clock className="inline h-4 w-4 mr-1" />
                Per Hour
              </label>
              <input
                type="number"
                className="w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500"
                value={config.global.defaultPerHour}
                onChange={(e) => updateGlobalConfig("defaultPerHour", Number.parseInt(e.target.value))}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <Clock className="inline h-4 w-4 mr-1" />
                Per Day
              </label>
              <input
                type="number"
                className="w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500"
                value={config.global.defaultPerDay}
                onChange={(e) => updateGlobalConfig("defaultPerDay", Number.parseInt(e.target.value))}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Identity Multipliers */}
      <div className="bg-white shadow rounded-lg">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-medium text-gray-900 flex items-center">
            <Users className="h-5 w-5 mr-2" />
            Identity Multipliers
          </h3>
          <p className="mt-1 text-sm text-gray-500">Multipliers applied based on user identity type</p>
        </div>
        <div className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <Key className="inline h-4 w-4 mr-1" />
                JWT Users
              </label>
              <input
                type="number"
                step="0.1"
                className="w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500"
                value={config.identityMultipliers.jwt}
                onChange={(e) => updateIdentityMultiplier("jwt", Number.parseFloat(e.target.value))}
              />
              <p className="mt-1 text-xs text-gray-500">Higher limits for authenticated users</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <Users className="inline h-4 w-4 mr-1" />
                Session Users
              </label>
              <input
                type="number"
                step="0.1"
                className="w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500"
                value={config.identityMultipliers.session}
                onChange={(e) => updateIdentityMultiplier("session", Number.parseFloat(e.target.value))}
              />
              <p className="mt-1 text-xs text-gray-500">Moderate limits for session users</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <Globe className="inline h-4 w-4 mr-1" />
                IP Addresses
              </label>
              <input
                type="number"
                step="0.1"
                className="w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500"
                value={config.identityMultipliers.ip}
                onChange={(e) => updateIdentityMultiplier("ip", Number.parseFloat(e.target.value))}
              />
              <p className="mt-1 text-xs text-gray-500">Base limits for IP-based users</p>
            </div>
          </div>
        </div>
      </div>

      {/* Route-Specific Limits */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
        <div className="p-8 border-b border-gray-100">
          <h2 className="text-2xl font-semibold text-gray-900 mb-2">Route-Specific Limits</h2>
          <p className="text-gray-600">Configure rate limits for specific API routes</p>
        </div>
        <div className="p-8">
          <div className="space-y-6">
            {routeLimits.map((route, index) => (
              <div key={index} className="bg-gray-50 rounded-lg p-6 border border-gray-200">
                <div className="flex flex-col lg:flex-row lg:items-center gap-4 mb-4">
                  <div className="flex-1 min-w-0">
                    <label className="block text-sm font-medium text-gray-700 mb-2">Route Pattern</label>
                    <input
                      type="text"
                      value={route.pattern}
                      onChange={(e) => updateRouteLimit(index, "pattern", e.target.value)}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                      placeholder="/api/users/*"
                    />
                  </div>
                  <div className="flex-shrink-0">
                    <button
                      onClick={() => removeRouteLimit(index)}
                      className="px-4 py-3 text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors font-medium"
                    >
                      Remove
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Per Minute</label>
                    <input
                      type="number"
                      value={route.perMinute}
                      onChange={(e) => updateRouteLimit(index, "perMinute", Number.parseInt(e.target.value))}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                      min="1"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Per Hour</label>
                    <input
                      type="number"
                      value={route.perHour}
                      onChange={(e) => updateRouteLimit(index, "perHour", Number.parseInt(e.target.value))}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                      min="1"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Per Day</label>
                    <input
                      type="number"
                      value={route.perDay}
                      onChange={(e) => updateRouteLimit(index, "perDay", Number.parseInt(e.target.value))}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                      min="1"
                    />
                  </div>
                </div>
              </div>
            ))}

            <div className="bg-blue-50 rounded-lg p-6 border border-blue-200">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Add New Route</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Route Pattern</label>
                  <input
                    type="text"
                    value={newRoute.pattern}
                    onChange={(e) => setNewRoute({ ...newRoute, pattern: e.target.value })}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                    placeholder="/api/new-endpoint/*"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Per Minute</label>
                    <input
                      type="number"
                      value={newRoute.perMinute}
                      onChange={(e) => setNewRoute({ ...newRoute, perMinute: Number.parseInt(e.target.value) || 0 })}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                      min="1"
                      placeholder="60"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Per Hour</label>
                    <input
                      type="number"
                      value={newRoute.perHour}
                      onChange={(e) => setNewRoute({ ...newRoute, perHour: Number.parseInt(e.target.value) || 0 })}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                      min="1"
                      placeholder="1000"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Per Day</label>
                    <input
                      type="number"
                      value={newRoute.perDay}
                      onChange={(e) => setNewRoute({ ...newRoute, perDay: Number.parseInt(e.target.value) || 0 })}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                      min="1"
                      placeholder="10000"
                    />
                  </div>
                </div>

                <div className="flex justify-end pt-2">
                  <button
                    onClick={addRouteLimit}
                    className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors font-medium"
                  >
                    Add Route
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Turnstile Configuration */}
      <div className="bg-white shadow rounded-lg">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-medium text-gray-900 flex items-center">
            <Shield className="h-5 w-5 mr-2" />
            Turnstile Configuration
          </h3>
          <p className="mt-1 text-sm text-gray-500">Human verification and bot protection settings</p>
        </div>
        <div className="p-6">
          <div className="space-y-6">
            <div className="flex items-center">
              <input
                type="checkbox"
                className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                checked={config.turnstile.enabled}
                onChange={(e) => updateTurnstileConfig("enabled", e.target.checked)}
              />
              <label className="ml-2 block text-sm text-gray-900">Enable Turnstile verification</label>
            </div>

            <div className="flex items-center">
              <input
                type="checkbox"
                className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                checked={config.turnstile.bypassAuthenticated}
                onChange={(e) => updateTurnstileConfig("bypassAuthenticated", e.target.checked)}
              />
              <label className="ml-2 block text-sm text-gray-900">Bypass verification for authenticated users</label>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Cache Duration (seconds)</label>
              <input
                type="number"
                className="w-32 border-gray-300 rounded-md shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                value={config.turnstile.cacheDuration}
                onChange={(e) => updateTurnstileConfig("cacheDuration", Number.parseInt(e.target.value))}
              />
              <p className="mt-1 text-xs text-gray-500">How long to cache successful verifications</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
