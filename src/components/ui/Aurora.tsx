'use client'
/**
 * Aurora — the living nebula background
 * Three drifting aurora blobs + holographic grid + scanlines
 * Creates the "from the future" feeling the moment the app loads
 */
export default function Aurora() {
  return (
    <>
      {/* Aurora nebula blobs */}
      <div className="aurora-container" aria-hidden>
        <div className="aurora-blob aurora-1" />
        <div className="aurora-blob aurora-2" />
        <div className="aurora-blob aurora-3" />
        <div className="aurora-blob aurora-4" />
      </div>

      {/* Holographic perspective grid */}
      <div className="holo-grid" aria-hidden />

      {/* Subtle scanlines */}
      <div className="scanline-overlay" aria-hidden />
    </>
  )
}
