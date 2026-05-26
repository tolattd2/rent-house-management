'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { MapToolbar } from '@/components/room-map/map-toolbar'
import { RoomCanvas } from '@/components/room-map/room-canvas'
import { RoomSidebar } from '@/components/room-map/room-sidebar'
import { BranchFloorSelector } from '@/components/room-map/branch-floor-selector'
import { ZoomControls } from '@/components/room-map/zoom-controls'
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
  const [reloading, setReloading] = useState(false)

  const hydrate = useRoomMapStore((s) => s.hydrate)
  const markSaving = useRoomMapStore((s) => s.markSaving)
  const markClean = useRoomMapStore((s) => s.markClean)
  const branch = useRoomMapStore((s) => s.branch)
  const floor = useRoomMapStore((s) => s.floor)
  const blocks = useRoomMapStore((s) => s.blocks)
  const dirty = useRoomMapStore((s) => s.dirty)

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
        hydrate({
          branch: data.view.branch,
          floor: data.view.floor,
          rooms: data.view.rooms,
          blocks: data.view.layouts,
        })
      }
      // Refresh floor list for the new branch.
      const fr = await fetch(`/api/room-map?branch=${encodeURIComponent(nextBranch)}&floor=${encodeURIComponent(nextFloor)}`).catch(() => null)
      if (fr) setFloors((prev) => Array.from(new Set([...prev, nextFloor])))
    } else {
      await fetchView(nextBranch, nextFloor, false)
    }
  }

  const handleSave = async () => {
    if (!isAdmin) return
    markSaving(true)
    try {
      const payload = {
        branch,
        floor,
        blocks: blocks.map((b) => ({
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
        toast({ title: t('room_map_saved') })
        router.refresh()
      } else {
        toast({ title: t('room_map_save_failed'), description: data.error, variant: 'destructive' })
        markSaving(false)
      }
    } catch (e) {
      toast({ title: t('room_map_save_failed'), description: e instanceof Error ? e.message : 'Error', variant: 'destructive' })
      markSaving(false)
    }
  }

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)] animate-fade-in">
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3">
        <div>
          <h1 className="text-2xl font-bold">{t('nav_room_map')}</h1>
          <p className="text-muted-foreground text-sm">{t('room_map_subtitle')}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <BranchFloorSelector
            branch={branch || initialBranch}
            floor={floor || initialFloor}
            floors={floors}
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
          >
            <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
            {t('room_map_reload')}
          </Button>
        </div>
      </div>

      <StatusLegend />

      <div className="mt-3 flex flex-1 min-h-0 rounded-lg border border-border overflow-hidden bg-card">
        <MapToolbar editable={isAdmin} onSave={handleSave} />
        <div className="flex-1 relative min-w-0">
          <div className="absolute top-3 right-3 z-20">
            <ZoomControls />
          </div>
          <RoomCanvas editable={isAdmin} />
        </div>
        <RoomSidebar editable={isAdmin} />
      </div>
    </div>
  )
}
