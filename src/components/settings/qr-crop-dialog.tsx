'use client'

import { useState, useRef, useCallback } from 'react'
import ReactCrop, { type Crop, centerCrop, makeAspectCrop } from 'react-image-crop'
import 'react-image-crop/dist/ReactCrop.css'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Crop as CropIcon, X } from 'lucide-react'

interface Props {
  file: File
  onConfirm: (file: File) => void
  onCancel: () => void
}

function centerAspectCrop(mediaWidth: number, mediaHeight: number): Crop {
  return centerCrop(
    makeAspectCrop({ unit: '%', width: 90 }, 1, mediaWidth, mediaHeight),
    mediaWidth,
    mediaHeight,
  )
}

export function QrCropDialog({ file, onConfirm, onCancel }: Props) {
  const [imgSrc] = useState(() => URL.createObjectURL(file))
  const [crop, setCrop] = useState<Crop>()
  const [completedCrop, setCompletedCrop] = useState<Crop>()
  const imgRef = useRef<HTMLImageElement>(null)

  const onImageLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    const { naturalWidth: w, naturalHeight: h } = e.currentTarget
    setCrop(centerAspectCrop(w, h))
  }, [])

  const handleConfirm = useCallback(async () => {
    const img = imgRef.current
    if (!img || !completedCrop) return

    const canvas = document.createElement('canvas')
    const scaleX = img.naturalWidth / img.width
    const scaleY = img.naturalHeight / img.height

    const cropPx = completedCrop.unit === '%'
      ? {
          x: (completedCrop.x / 100) * img.naturalWidth,
          y: (completedCrop.y / 100) * img.naturalHeight,
          width: (completedCrop.width / 100) * img.naturalWidth,
          height: (completedCrop.height / 100) * img.naturalHeight,
        }
      : {
          x: completedCrop.x * scaleX,
          y: completedCrop.y * scaleY,
          width: completedCrop.width * scaleX,
          height: completedCrop.height * scaleY,
        }

    const size = Math.round(Math.min(cropPx.width, cropPx.height))
    canvas.width = size
    canvas.height = size

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.drawImage(
      img,
      cropPx.x, cropPx.y,
      cropPx.width, cropPx.height,
      0, 0,
      size, size,
    )

    canvas.toBlob((blob) => {
      if (!blob) return
      const croppedFile = new File([blob], file.name, { type: 'image/png' })
      onConfirm(croppedFile)
    }, 'image/png', 0.95)
  }, [completedCrop, file.name, onConfirm])

  return (
    <Dialog open onOpenChange={onCancel}>
      <DialogContent className="max-w-lg w-full">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CropIcon className="w-4 h-4" /> Crop Image (1:1)
          </DialogTitle>
        </DialogHeader>

        <div className="flex justify-center bg-muted/30 rounded-lg p-3 overflow-hidden">
          <ReactCrop
            crop={crop}
            onChange={(_, pct) => setCrop(pct)}
            onComplete={(_, pct) => setCompletedCrop(pct)}
            aspect={1}
            circularCrop={false}
            minWidth={20}
            ruleOfThirds
          >
            <img
              ref={imgRef}
              src={imgSrc}
              alt="Crop preview"
              onLoad={onImageLoad}
              style={{ maxHeight: '400px', maxWidth: '100%', display: 'block' }}
            />
          </ReactCrop>
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="outline" onClick={onCancel}>
            <X className="w-3.5 h-3.5 mr-1.5" /> Cancel
          </Button>
          <Button type="button" onClick={handleConfirm} disabled={!completedCrop?.width}>
            <CropIcon className="w-3.5 h-3.5 mr-1.5" /> Crop & Upload
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
