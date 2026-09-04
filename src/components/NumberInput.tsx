import { useEffect, useState, type CSSProperties } from 'react'

export function NumberInput({
  value,
  onChange,
  min,
  style,
}: {
  value: number
  onChange: (value: number) => void
  min?: number
  style?: CSSProperties
}) {
  const [text, setText] = useState(String(value))

  useEffect(() => {
    if (Number(text) !== value) setText(String(value))
  }, [value])

  const floor = min ?? 0

  return (
    <input
      type="number"
      inputMode="numeric"
      style={style}
      min={min}
      value={text}
      onChange={(e) => {
        const raw = e.target.value
        setText(raw)
        if (raw === '') return
        const parsed = Number(raw)
        if (!Number.isNaN(parsed)) onChange(parsed)
      }}
      onBlur={() => {
        if (text === '' || Number.isNaN(Number(text))) {
          setText(String(floor))
          onChange(floor)
        }
      }}
    />
  )
}
