"use client"

import type React from "react"
import { useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { BarChart3, Settings, Users, Shield, Menu, X, Home, LogOut, Bell, Search, ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"

interface AdminLayoutProps {
  children: React.ReactNode
  user?: {
    username: string
    role: string
    loginTime: number
  }
}

const navigation = [
  { name: "Dashboard", href: "/admin/rate-limits", icon: Home },
  { name: "Users", href: "/admin/rate-limits/users", icon: Users },
  { name: "Configuration", href: "/admin/rate-limits/config", icon: Settings },
  { name: "Analytics", href: "/admin/rate-limits/analytics", icon: BarChart3 },
]

export function AdminLayout({ children, user }: AdminLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const pathname = usePathname()

  return (
    <div className="min-h-screen bg-gray-50/30">
      {/* Mobile sidebar overlay */}
      <div className={cn("fixed inset-0 z-50 lg:hidden", sidebarOpen ? "block" : "hidden")}>
        <div className="fixed inset-0 bg-black/20 backdrop-blur-sm" onClick={() => setSidebarOpen(false)} />
        <div className="fixed left-0 top-0 h-full w-80 bg-white shadow-2xl">
          <div className="absolute right-4 top-4">
            <button
              className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-700"
              onClick={() => setSidebarOpen(false)}
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          <SidebarContent pathname={pathname} />
        </div>
      </div>

      {/* Desktop sidebar */}
      <div className="hidden lg:fixed lg:inset-y-0 lg:left-0 lg:z-40 lg:block lg:w-80">
        <SidebarContent pathname={pathname} />
      </div>

      {/* Main content */}
      <div className="lg:pl-80">
        {/* Top header */}
        <header className="sticky top-0 z-30 border-b border-gray-200/60 bg-white/80 backdrop-blur-xl">
          <div className="flex h-16 items-center gap-4 px-6">
            <button
              className="flex h-9 w-9 items-center justify-center rounded-lg text-gray-600 hover:bg-gray-100 lg:hidden"
              onClick={() => setSidebarOpen(true)}
            >
              <Menu className="h-5 w-5" />
            </button>

            <div className="flex flex-1 items-center justify-between">
              {/* Search */}
              <div className="relative max-w-md flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input
                  type="search"
                  placeholder="Search users, IPs, or identities..."
                  className="h-9 w-full rounded-lg border border-gray-200 bg-gray-50/50 pl-9 pr-4 text-sm placeholder:text-gray-500 focus:border-gray-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-gray-200/50"
                />
              </div>

              {/* Right section */}
              <div className="flex items-center gap-3">
            

                {/* User menu */}
                {user && (
                  <div className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white px-3 py-1.5">
                    <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gray-100 text-xs font-semibold text-gray-700">
                      {user.username.charAt(0).toUpperCase()}
                    </div>
                    <div className="hidden text-sm sm:block">
                      <div className="font-medium text-gray-900">{user.username}</div>
                      <div className="text-xs text-gray-500">{user.role}</div>
                    </div>
                    <button className="flex h-7 w-7 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-700">
                      <LogOut className="h-4 w-4" />
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="p-6">
          <div className="mx-auto max-w-7xl">{children}</div>
        </main>
      </div>
    </div>
  )
}

function SidebarContent({ pathname }: { pathname: string }) {
  return (
    <div className="flex h-full flex-col bg-white">
      {/* Logo section */}
      <div className="flex h-16 items-center gap-3 border-b border-gray-200/60 px-6">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gray-900">
          <Shield className="h-5 w-5 text-white" />
        </div>
        <div>
          <div className="text-sm font-semibold text-gray-900">CustomGPT</div>
          <div className="text-xs text-gray-500">Admin Console</div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 p-4">
        {navigation.map((item) => {
          const isActive = pathname === item.href
          return (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                "group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200",
                isActive ? "bg-gray-900 text-white shadow-sm" : "text-gray-700 hover:bg-gray-100 hover:text-gray-900",
              )}
            >
              <item.icon className="h-5 w-5 flex-shrink-0" />
              <span className="flex-1">{item.name}</span>
              {isActive && <ChevronRight className="h-4 w-4 opacity-60" />}
            </Link>
          )
        })}
      </nav>

      {/* Footer section */}
      <div className="border-t border-gray-200/60 p-4">
        <div className="rounded-lg bg-gray-50 p-4">
          <div className="text-xs font-medium text-gray-900">Need help?</div>
          <div className="mt-1 text-xs text-gray-600">Check our documentation or contact support for assistance.</div>
          <button className="mt-2 text-xs font-medium text-gray-900 hover:text-gray-700">View docs →</button>
        </div>
      </div>
    </div>
  )
}
