/**
 * Fixed, purely decorative ambient light behind every page.
 *
 * Three very slow, heavily blurred radial gradients (plus a grain layer that
 * stops large gradients from banding). They are `position: fixed` with
 * `z-index: -1`, `pointer-events: none` and `aria-hidden`, so they never
 * intercept clicks, never affect layout and never appear in the a11y tree.
 *
 * Motion is transform-only and disabled entirely under
 * `prefers-reduced-motion`; on phones the third light source is dropped to
 * keep paint cost low (see globals.css).
 */
export function DawnStage() {
  return (
    <div className="dawn-stage" aria-hidden="true">
      <span className="dawn-glow dawn-glow-a" />
      <span className="dawn-glow dawn-glow-b" />
      <span className="dawn-glow dawn-glow-c" />
      <span className="dawn-grain" />
    </div>
  );
}
