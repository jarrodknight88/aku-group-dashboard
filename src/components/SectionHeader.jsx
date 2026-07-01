import { colors, fonts } from '../theme.js'

/**
 * Band divider used between sections: serif title, hairline rule, optional
 * right-aligned control (e.g. the Top-by-$/Qty toggle).
 */
export default function SectionHeader({ title, sub, right, style }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        marginBottom: 14,
        ...style,
      }}
    >
      <div style={{ fontFamily: fonts.serif, fontSize: 18, fontWeight: 600 }}>
        {title}
        {sub && (
          <span style={{ fontFamily: fonts.sans, fontSize: 13, color: colors.muted3 }}>
            {' '}
            · {sub}
          </span>
        )}
      </div>
      <div style={{ flex: 1, height: 1, background: colors.divider }} />
      {right}
    </div>
  )
}
