'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { RefreshCw, Menu } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { MapToolbar } from '@/components/room-map/map-toolbar'
import { RoomCanvas } from '@/components/room-map/room-canvas'
import { RoomSidebar } from '@/components/room-map/room-sidebar'
import { BranchFloorSelector } from '@/components/room-map/branch-floor-selector'
import { ZoomControls } from '@/components/room-map/zoom-controls'
import { CanvasSizeSelector } from '@/components/room-map/canvas-size-selector'
import { StatusLegend } from '@/components/room-map/status-legend'
import { useRoomMapStore } from '@/store/use-room-map-store'
import { useLanguage } from '@/contexts/language-context'
import { toast } from '@/hooks/use-toast'
import type { RoomMapView } from '@/lib/room-map-service'

interface Props {
  isAdmin: boolean
  initialBranch: string
  initialFloor: string
  initialFloors: string[]
  initialView: RoomMapView
}

export function RoomMapClient({ isAdmin, initialBranch, initialFloor, initialFloors, initialView }: Props) {
  const { t } = useLanguage()
  const router = useRouter()
  const [floors, setFloors] = useState(initialFloors)
  const [hasFloors, setHasFloors] = useState(initialView.hasFloors)
  const [reloading, setReloading] = useState(false)
  const [fullscreen, setFullscreen] = useState(false)
  const [mobileToolbarOpen, setMobileToolbarOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const hydrate = useRoomMapStore((s) => s.hydrate)
  const markSaving = useRoomMapStore((s) => s.markSaving)
  const markClean = useRoomMapStore((s) => s.markClean)
  const branch = useRoomMapStore((s) => s.branch)
  const floor = useRoomMapStore((s) => s.floor)
  const blocks = useRoomMapStore((s) => s.blocks)
  const dirty = useRoomMapStore((s) => s.dirty)
  const autoSave = useRoomMapStore((s) => s.autoSave)
  const undo = useRoomMapStore((s) => s.undo)
  const redo = useRoomMapStore((s) => s.redo)

  // Seed the store once on mount, then again whenever the server view changes.
  // The selector kept a ref so we don't loop on every render.
  const hydratedKey = useRef<string>('')
  useEffect(() => {
    const key = `${initialView.branch}|${initialView.floor}|${initialView.rooms.length}|${initialView.layouts.length}`
    if (hydratedKey.current === key) return
    hydratedKey.current = key
    hydrate({
      branch: initialView.branch,
      floor: initialView.floor,
      rooms: initialView.rooms,
      blocks: initialView.layouts,
    })
  }, [initialView, hydrate])

  // Refetch on window focus — keeps status colors live without WebSockets.
  // We skip while there are unsaved edits so we never blow away the user's WIP.
  const fetchView = useCallback(async (nextBranch: string, nextFloor: string, manual = false) => {
    setReloading(true)
    try {
      const params = new URLSearchParams({ branch: nextBranch, floor: nextFloor })
      const res = await fetch(`/api/room-map?${params.toString()}`, { cache: 'no-store' })
      const data: { ok: boolean; view?: RoomMapView; error?: string } = await res.json()
      if (data.ok && data.view) {
        hydratedKey.current = ''
        setHasFloors(data.view.hasFloors)
        hydrate({
          branch: data.view.branch,
          floor: data.view.floor,
          rooms: data.view.rooms,
          blocks: data.view.layouts,
        })
      } else if (manual) {
        toast({ title: t('room_map_reload_failed'), description: data.error, variant: 'destructive' })
      }
    } catch (e) {
      if (manual) {
        toast({ title: t('room_map_reload_failed'), description: e instanceof Error ? e.message : 'Error', variant: 'destructive' })
      }
    } finally {
      setReloading(false)
    }
  }, [hydrate, t])

  useEffect(() => {
    const onFocus = () => {
      if (useRoomMapStore.getState().dirty) return
      fetchView(useRoomMapStore.getState().branch, useRoomMapStore.getState().floor, false)
    }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [fetchView])

  // Warn before closing the tab with unsaved edits.
  useEffect(() => {
    if (!dirty) return
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [dirty])

  const changeBranchFloor = async (nextBranch: string, nextFloor: string) => {
    const url = new URL(window.location.href)
    url.searchParams.set('branch', nextBranch)
    url.searchParams.set('floor', nextFloor)
    window.history.replaceState({}, '', url.toString())
    if (nextBranch !== branch) {
      const res = await fetch(`/api/room-map?branch=${encodeURIComponent(nextBranch)}&floor=${encodeURIComponent(nextFloor)}`, { cache: 'no-store' })
      const data: { ok: boolean; view?: RoomMapView } = await res.json()
      if (data.ok && data.view) {
        hydratedKey.current = ''
        setHasFloors(data.view.hasFloors)
        // Union the configured floor count (1..floorCount) with whatever
        // floors actually have rooms today, so the dropdown reflects both
        // the Settings value and any legacy data.
        const configured = Array.from({ length: Math.max(1, data.view.floorCount) }, (_, i) => String(i + 1))
        const existing = data.view.rooms.map((r) => r.floor || '1')
        const nextFloors = data.view.hasFloors
          ? Array.from(new Set([...configured, ...existing])).sort((a, b) => {
              const na = parseInt(a, 10)
              const nb = parseInt(b, 10)
              if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb
              return a.localeCompare(b)
            })
          : ['1']
        setFloors(nextFloors.length > 0 ? nextFloors : ['1'])
        hydrate({
          branch: data.view.branch,
          floor: data.view.floor,
          rooms: data.view.rooms,
          blocks: data.view.layouts,
        })
      }
    } else {
      await fetchView(nextBranch, nextFloor, false)
    }
  }

  // Save is stable so the auto-save effect can call it without re-arming
  // the debounce every keystroke.
  const handleSave = useCallback(async (silent = false) => {
    if (!isAdmin) return
    const state = useRoomMapStore.getState()
    if (!state.dirty || state.saving) return
    markSaving(true)
    try {
      const payload = {
        branch: state.branch,
        floor: state.floor,
        blocks: state.blocks.map((b) => ({
          roomId: b.roomId,
          branch: b.branch,
          floor: b.floor,
          x: b.x,
          y: b.y,
          width: b.width,
          height: b.height,
          rotation: b.rotation,
          zIndex: b.zIndex,
        })),
      }
      const res = await fetch('/api/room-map', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data: { ok: boolean; error?: string } = await res.json()
      if (data.ok) {
        markClean()
        if (!silent) toast({ title: t('room_map_saved') })
        router.refresh()
      } else {
        toast({ title: t('room_map_save_failed'), description: data.error, variant: 'destructive' })
        markSaving(false)
      }
    } catch (e) {
      toast({ title: t('room_map_save_failed'), description: e instanceof Error ? e.message : 'Error', variant: 'destructive' })
      markSaving(false)
    }
  }, [isAdmin, markSaving, markClean, router, t])

  // Auto-save: debounce 1.5s after the user stops editing. The timer resets
  // whenever blocks change while in autoSave mode, so a burst of edits
  // collapses into one save.
  useEffect(() => {
    if (!autoSave || !isAdmin || !dirty) return
    const timer = setTimeout(() => {
      handleSave(true)
    }, 1500)
    return () => clearTimeout(timer)
  }, [autoSave, isAdmin, dirty, blocks, handleSave])

  // Fullscreen toggle for the map container. We listen for the native
  // fullscreenchange event so the toolbar icon flips correctly when the
  // user hits Esc to exit.
  const toggleFullscreen = useCallback(() => {
    const el = containerRef.current
    if (!el) return
    if (!document.fullscreenElement) {
      el.requestFullscreen().catch(() => undefined)
    } else {
      document.exitFullscreen().catch(() => undefined)
    }
  }, [])

  useEffect(() => {
    const onChange = () => setFullscreen(Boolean(document.fullscreenElement))
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])

  // Keyboard shortcuts: Ctrl/Cmd+S save, Ctrl/Cmd+Z undo, Ctrl/Cmd+Shift+Z
  // or Ctrl+Y redo. We ignore them while typing in an input.
  useEffect(() => {
    if (!isAdmin) return
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return
      const mod = e.ctrlKey || e.metaKey
      if (!mod) return
      const k = e.key.toLowerCase()
      if (k === 's') {
        e.preventDefault()
        handleSave(false)
      } else if (k === 'z' && !e.shiftKey) {
        e.preventDefault()
        undo()
      } else if ((k === 'z' && e.shiftKey) || k === 'y') {
        e.preventDefault()
        redo()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [isAdmin, handleSave, undo, redo])

  // Pinned floors list: when we switch branches we union the server result
  // with the previous list so the dropdown doesn't churn.
  const floorsView = useMemo(() => Array.from(new Set([...floors, floor].filter(Boolean))), [floors, floor])

  return (
    <div className="flex flex-col h-[calc(100vh-7rem)] sm:h-[calc(100vh-8rem)] animate-fade-in">
      <div className="flex flex-wrap items-center justify-between gap-2 sm:gap-3 pb-2 sm:pb-3">
        <div className="min-w-0">
          <h1 className="text-lg sm:text-2xl font-bold truncate">{t('nav_room_map')}</h1>
          <p className="hidden sm:block text-muted-foreground text-sm">{t('room_map_subtitle')}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <BranchFloorSelector
            branch={branch || initialBranch}
            floor={floor || initialFloor}
            floors={floorsView}
            hasFloors={hasFloors}
            dirty={dirty}
            onChange={changeBranchFloor}
          />
          <Button
            size="sm"
            variant="outline"
            onClick={() => fetchView(branch, floor, true)}
            loading={reloading}
            disabled={dirty}
            title={dirty ? t('room_map_reload_disabled') : t('room_map_reload')}
            className="h-9 px-2 sm:px-3"
          >
            <RefreshCw className="w-3.5 h-3.5 sm:mr-1.5" />
            <span className="hidden sm:inline">{t('room_map_reload')}</span>
          </Button>
        </div>
      </div>

      <div className="hidden sm:block">
        <StatusLegend />
      </div>

      <div
        ref={containerRef}
        className="mt-2 sm:mt-3 relative flex flex-1 min-h-0 rounded-lg border border-border overflow-hidden bg-card fullscreen:bg-background fullscreen:rounded-none"
      >
        <MapToolbar
          editable={isAdmin}
          fullscreen={fullscreen}
          onToggleFullscreen={toggleFullscreen}
          onSave={() => handleSave(false)}
          mobileOpen={mobileToolbarOpen}
          onMobileClose={() => setMobileToolbarOpen(false)}
        />
        <div className="flex-1 flex flex-col min-w-0">
          <RoomSidebar editable={isAdmin} />
          <div className="flex-1 relative min-h-0">
            {/* Mobile-only "open toolbar" button */}
            <div className="md:hidden absolute top-3 left-3 z-20">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setMobileToolbarOpen(true)}
                className="h-9 w-9 p-0 bg-background/90 shadow-sm"
                aria-label={t('room_map_tools')}
              >
                <Menu className="w-4 h-4" />
              </Button>
            </div>
            <div className="absolute top-3 right-3 z-20 flex items-center gap-1.5 sm:gap-2 flex-wrap justify-end">
              <CanvasSizeSelector />
              <ZoomControls />
            </div>
            <RoomCanvas editable={isAdmin} />
          </div>
        </div>
      </div>
    </div>
  )
}
