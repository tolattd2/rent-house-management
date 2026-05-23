'use client'

import { useEffect, useRef, useState } from 'react'
import {
  Bold, Italic, Underline, Strikethrough,
  AlignLeft, AlignCenter, AlignRight, AlignJustify,
  List, ListOrdered, Undo2, Redo2, Type, Palette, RemoveFormatting,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/** Font families that render Khmer + Latin well in most browsers. */
const FONT_FAMILIES = [
  { value: 'sans-serif',                                                label: 'Sans Serif' },
  { value: 'serif',                                                     label: 'Serif' },
  { value: 'monospace',                                                 label: 'Monospace' },
  { value: '"Khmer OS Siemreap", "Noto Sans Khmer", sans-serif',         label: 'Khmer OS Siemreap' },
  { value: '"Khmer OS Battambang", "Noto Serif Khmer", serif',          label: 'Khmer OS Battambang' },
  { value: '"Noto Sans Khmer", "Khmer OS", sans-serif',                  label: 'Noto Sans Khmer' },
  { value: '"Times New Roman", Times, serif',                            label: 'Times New Roman' },
  { value: 'Arial, Helvetica, sans-serif',                               label: 'Arial' },
  { value: 'Georgia, serif',                                             label: 'Georgia' },
]

/** Point-style sizes mapped to execCommand's 1–7 fontSize scale. */
const FONT_SIZES: Array<{ label: string; cmd: number }> = [
  { label: '10', cmd: 1 },
  { label: '12', cmd: 2 },
  { label: '14', cmd: 3 },
  { label: '16', cmd: 4 },
  { label: '18', cmd: 5 },
  { label: '24', cmd: 6 },
  { label: '32', cmd: 7 },
]

interface Props {
  value: string
  onChange: (html: string) => void
  className?: string
  ariaLabel?: string
}

/**
 * Lightweight rich text editor built on contenteditable + document.execCommand.
 * Saves HTML. Supports bold/italic/underline/strikethrough, alignment, lists,
 * font family, font size, text color, undo/redo, clear-formatting.
 */
export function RichTextEditor({ value, onChange, className, ariaLabel }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const [, force] = useState(0)

  // Keep the DOM in sync when `value` changes from outside (e.g. Reset to template
  // or initial load). Avoid re-writing while the user is typing.
  useEffect(() => {
    if (!ref.current) return
    if (ref.current.innerHTML !== value) ref.current.innerHTML = value
  }, [value])

  function exec(command: string, arg?: string) {
    ref.current?.focus()
    document.execCommand(command, false, arg)
    if (ref.current) onChange(ref.current.innerHTML)
    force((n) => n + 1)
  }

  function handleInput() {
    if (ref.current) onChange(ref.current.innerHTML)
  }

  return (
    <div className={cn('flex flex-col border rounded-md bg-background', className)}>
      <div className="flex flex-wrap gap-0.5 p-1.5 border-b bg-muted/40 sticky top-0 z-10">
        <ToolBtn title="Undo" onClick={() => exec('undo')}><Undo2 className="w-4 h-4" /></ToolBtn>
        <ToolBtn title="Redo" onClick={() => exec('redo')}><Redo2 className="w-4 h-4" /></ToolBtn>
        <Sep />

        <select
          className="text-xs h-8 rounded border bg-background px-1.5"
          title="Font family"
          defaultValue=""
          onChange={(e) => { if (e.target.value) { exec('fontName', e.target.value); e.target.value = '' } }}
        >
          <option value="">{/* placeholder */}Font</option>
          {FONT_FAMILIES.map((f) => (
            <option key={f.label} value={f.value} style={{ fontFamily: f.value }}>{f.label}</option>
          ))}
        </select>

        <select
          className="text-xs h-8 rounded border bg-background px-1.5"
          title="Font size"
          defaultValue=""
          onChange={(e) => { if (e.target.value) { exec('fontSize', e.target.value); e.target.value = '' } }}
        >
          <option value="">Size</option>
          {FONT_SIZES.map((s) => (
            <option key={s.label} value={String(s.cmd)}>{s.label}</option>
          ))}
        </select>

        <select
          className="text-xs h-8 rounded border bg-background px-1.5"
          title="Heading / paragraph"
          defaultValue=""
          onChange={(e) => { if (e.target.value) { exec('formatBlock', e.target.value); e.target.value = '' } }}
        >
          <option value="">Style</option>
          <option value="p">Paragraph</option>
          <option value="h1">Heading 1</option>
          <option value="h2">Heading 2</option>
          <option value="h3">Heading 3</option>
          <option value="pre">Code</option>
          <option value="blockquote">Quote</option>
        </select>

        <Sep />
        <ToolBtn title="Bold" onClick={() => exec('bold')}><Bold className="w-4 h-4" /></ToolBtn>
        <ToolBtn title="Italic" onClick={() => exec('italic')}><Italic className="w-4 h-4" /></ToolBtn>
        <ToolBtn title="Underline" onClick={() => exec('underline')}><Underline className="w-4 h-4" /></ToolBtn>
        <ToolBtn title="Strikethrough" onClick={() => exec('strikeThrough')}><Strikethrough className="w-4 h-4" /></ToolBtn>
        <Sep />

        <label
          className="inline-flex items-center justify-center w-8 h-8 rounded hover:bg-muted cursor-pointer"
          title="Text color"
        >
          <Palette className="w-4 h-4" />
          <input
            type="color"
            className="sr-only"
            onChange={(e) => exec('foreColor', e.target.value)}
          />
        </label>
        <label
          className="inline-flex items-center justify-center w-8 h-8 rounded hover:bg-muted cursor-pointer"
          title="Highlight color"
        >
          <Type className="w-4 h-4" />
          <input
            type="color"
            className="sr-only"
            onChange={(e) => exec('hiliteColor', e.target.value)}
          />
        </label>
        <Sep />

        <ToolBtn title="Align left"    onClick={() => exec('justifyLeft')}>   <AlignLeft className="w-4 h-4" />   </ToolBtn>
        <ToolBtn title="Align center"  onClick={() => exec('justifyCenter')}> <AlignCenter className="w-4 h-4" /> </ToolBtn>
        <ToolBtn title="Align right"   onClick={() => exec('justifyRight')}>  <AlignRight className="w-4 h-4" />  </ToolBtn>
        <ToolBtn title="Justify"       onClick={() => exec('justifyFull')}>   <AlignJustify className="w-4 h-4" /></ToolBtn>
        <Sep />

        <ToolBtn title="Bulleted list"  onClick={() => exec('insertUnorderedList')}><List className="w-4 h-4" />        </ToolBtn>
        <ToolBtn title="Numbered list"  onClick={() => exec('insertOrderedList')}>  <ListOrdered className="w-4 h-4" /> </ToolBtn>
        <Sep />

        <ToolBtn title="Clear formatting" onClick={() => exec('removeFormat')}>
          <RemoveFormatting className="w-4 h-4" />
        </ToolBtn>
      </div>

      <div
        ref={ref}
        role="textbox"
        aria-label={ariaLabel}
        aria-multiline="true"
        contentEditable
        suppressContentEditableWarning
        onInput={handleInput}
        onBlur={handleInput}
        // Paste rich content as plain text so Word/PDF dumps don't bring along
        // huge inline styles that bloat the saved HTML.
        onPaste={(e) => {
          e.preventDefault()
          const text = e.clipboardData.getData('text/plain')
          document.execCommand('insertText', false, text)
        }}
        className="prose prose-sm max-w-none min-h-[50vh] p-4 outline-none overflow-auto leading-relaxed [&_p]:my-2 [&_h1]:text-xl [&_h1]:font-bold [&_h2]:text-lg [&_h2]:font-semibold [&_h3]:text-base [&_h3]:font-semibold [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:list-decimal [&_ol]:pl-6 [&_pre]:bg-muted [&_pre]:p-2 [&_pre]:rounded [&_blockquote]:border-l-4 [&_blockquote]:pl-3 [&_blockquote]:italic"
      />
    </div>
  )
}

function ToolBtn({
  children, onClick, title,
}: { children: React.ReactNode; onClick: () => void; title: string }) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="h-8 w-8 p-0"
      title={title}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
    >
      {children}
    </Button>
  )
}

function Sep() {
  return <span className="self-stretch w-px bg-border mx-0.5" />
}

/** Convert plain text (newlines, tabs) into safe HTML for the editor. */
export function plainTextToHtml(text: string): string {
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
  return escaped
    .split(/\n/)
    .map((line) => (line.trim() === '' ? '<p><br></p>' : `<p>${line}</p>`))
    .join('')
}

/** True if the string looks like HTML (contains balanced-ish tags). */
export function looksLikeHtml(s: string): boolean {
  return /<\/?(p|div|span|h[1-6]|br|ul|ol|li|strong|em|b|i|u|font|table|tr|td|pre|blockquote)\b/i.test(s)
}
