// Shared types for the data import/export pipeline.

export interface RowError {
  column?: string
  message: string
}

export type RowOutcome = 'create' | 'update' | 'skip' | 'error'

export interface RowPlan {
  rowIndex: number              // 0-based row offset within the sheet (excluding header)
  outcome: RowOutcome
  existingId?: string           // populated when outcome is 'update'
  matchedBy?: 'id' | 'naturalKey'
  errors?: RowError[]
  // A small label so the UI can show "Room 101 — Takmoa" etc. without
  // having to know each sheet's column layout.
  label?: string
}

export interface SheetPlan {
  sheet: string
  total: number
  create: number
  update: number
  skip: number
  error: number
  rows: RowPlan[]
}

export interface ImportPlan {
  sheets: SheetPlan[]
  hasErrors: boolean
  // Sheets that appeared in the file but didn't match any known schema.
  unknownSheets: string[]
}
