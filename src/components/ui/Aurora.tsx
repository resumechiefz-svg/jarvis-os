'use client'
/**
 * Aurora — the living nebula background
 * Four drifting aurora blobs + holographic grid + scanlines
 */
export default function Aurora() {
  return (
    <>
      {/* Deep space base — richer than pure black */}
      <div style={{
        position: 'fixed', inset: 0, zIndex: 0,
        background: 'radial-gradient(ellipse 120% 100% at 50% 0%, #000820 0%, #00020a 50%, #000510 100%)',
        pointerEvents: 'none',
      }} aria-hidden />

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
