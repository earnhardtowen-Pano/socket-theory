import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { fit as camFit, gridStep, panBy, zoomAt, type CameraState } from './camera.js';

/**
 * The shared camera and the viewport frame. One x-axis for every view —
 * the station ruler is the spine that makes side and plan one drawing.
 */

interface CameraApi {
  cam: CameraState;
  setCam: React.Dispatch<React.SetStateAction<CameraState>>;
  /** Ask every view to fit its content on the next frame. */
  fitSignal: number;
  requestFit: () => void;
}

const CameraCtx = createContext<CameraApi | null>(null);

export function CameraProvider({ children }: { children: React.ReactNode }) {
  const [cam, setCam] = useState<CameraState>({ mmPerPx: 4.4, cx: 1300, cy: {} });
  const [fitSignal, setFitSignal] = useState(1);
  const api = useMemo(
    () => ({ cam, setCam, fitSignal, requestFit: () => setFitSignal((n) => n + 1) }),
    [cam, fitSignal],
  );
  return <CameraCtx.Provider value={api}>{children}</CameraCtx.Provider>;
}

export function useCamera(): CameraApi {
  const api = useContext(CameraCtx);
  if (!api) throw new Error('useCamera outside CameraProvider');
  return api;
}

export interface Mapper {
  readonly pxW: number;
  readonly pxH: number;
  readonly mmPerPx: number;
  sx(x: number): number;
  sy(y: number): number;
  /** Client (screen) coordinates → world mm. */
  toWorld(clientX: number, clientY: number): { x: number; y: number };
}

export function ViewportSvg({
  view,
  yUp,
  fitBox,
  rulerEdge,
  stations,
  children,
  onBackgroundDown,
  testid,
  minHeightPx,
  maxHeightPx,
}: {
  view: string;
  /** true when +y is up on screen (side view); false when +y is down-mirrored (plan handles its own sign). */
  yUp: boolean;
  /** World bbox to frame on fit: {x0,x1,y0,y1} in this view's y space. */
  fitBox: { x0: number; x1: number; y0: number; y1: number };
  /** Which edge carries the station ruler. */
  rulerEdge: 'top' | 'bottom';
  stations: readonly { id: string; label: string; x: number }[];
  children: (m: Mapper) => React.ReactNode;
  onBackgroundDown?: () => void;
  testid?: string;
  minHeightPx?: number;
  maxHeightPx?: number;
}) {
  const { cam, setCam, fitSignal } = useCamera();
  const hostRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [pxW, setPxW] = useState(800);

  // Height follows the content's aspect so the frame hugs the car.
  const aspect = (fitBox.y1 - fitBox.y0) / Math.max(1, fitBox.x1 - fitBox.x0);
  const heightPx = Math.round(
    Math.min(maxHeightPx ?? 620, Math.max(minHeightPx ?? 240, pxW * aspect)),
  );

  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setPxW(el.clientWidth));
    ro.observe(el);
    setPxW(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  // Fit on request (and on first mount).
  useEffect(() => {
    setCam((c) => camFit(c, view, fitBox, pxW, heightPx, 28));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitSignal, pxW]);

  const cy = cam.cy[view] ?? (fitBox.y0 + fitBox.y1) / 2;
  const m: Mapper = useMemo(
    () => ({
      pxW,
      pxH: heightPx,
      mmPerPx: cam.mmPerPx,
      sx: (x: number) => (x - cam.cx) / cam.mmPerPx + pxW / 2,
      sy: (y: number) =>
        yUp ? (cy - y) / cam.mmPerPx + heightPx / 2 : (y - cy) / cam.mmPerPx + heightPx / 2,
      toWorld: (clientX: number, clientY: number) => {
        const r = svgRef.current?.getBoundingClientRect();
        if (!r) return { x: 0, y: 0 };
        const px = clientX - r.left;
        const py = clientY - r.top;
        const x = cam.cx + (px - pxW / 2) * cam.mmPerPx;
        const y = yUp
          ? cy - (py - heightPx / 2) * cam.mmPerPx
          : cy + (py - heightPx / 2) * cam.mmPerPx;
        return { x, y };
      },
    }),
    [cam, cy, pxW, heightPx, yUp],
  );

  const onWheel = useCallback(
    (e: React.WheelEvent) => {
      e.preventDefault();
      const r = svgRef.current?.getBoundingClientRect();
      if (!r) return;
      const factor = Math.exp(e.deltaY * 0.0012);
      setCam((c) =>
        zoomAt(c, view, pxW, heightPx, e.clientX - r.left, e.clientY - r.top, factor, yUp),
      );
    },
    [setCam, view, pxW, heightPx, yUp],
  );

  const panState = useRef<{ x: number; y: number } | null>(null);
  const onPointerDown = (e: React.PointerEvent) => {
    // Pan on background drag; control points stop propagation before this.
    if (e.button !== 0 && e.button !== 1) return;
    onBackgroundDown?.();
    panState.current = { x: e.clientX, y: e.clientY };
    const move = (ev: PointerEvent) => {
      const p = panState.current;
      if (!p) return;
      setCam((c) => panBy(c, view, ev.clientX - p.x, ev.clientY - p.y, yUp));
      panState.current = { x: ev.clientX, y: ev.clientY };
    };
    const up = () => {
      panState.current = null;
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  // Grid + ruler geometry.
  const step = gridStep(cam.mmPerPx, 56);
  const gridLines: React.ReactNode[] = [];
  const x0 = cam.cx - (pxW / 2) * cam.mmPerPx;
  const x1 = cam.cx + (pxW / 2) * cam.mmPerPx;
  const yHalf = (heightPx / 2) * cam.mmPerPx;
  const y0 = cy - yHalf;
  const y1 = cy + yHalf;
  for (let gx = Math.ceil(x0 / step) * step; gx <= x1; gx += step) {
    gridLines.push(
      <line key={`vx${gx}`} x1={m.sx(gx)} y1={0} x2={m.sx(gx)} y2={heightPx} className="grid-line" />,
    );
  }
  for (let gy = Math.ceil(y0 / step) * step; gy <= y1; gy += step) {
    gridLines.push(
      <line key={`hz${gy}`} x1={0} y1={m.sy(gy)} x2={pxW} y2={m.sy(gy)} className="grid-line" />,
    );
  }

  const rulerY = rulerEdge === 'top' ? 14 : heightPx - 6;

  return (
    <div ref={hostRef} className="viewport-host" data-testid={testid}>
      <svg
        ref={svgRef}
        className="view-svg"
        width={pxW}
        height={heightPx}
        viewBox={`0 0 ${pxW} ${heightPx}`}
        onWheel={onWheel}
        onPointerDown={onPointerDown}
      >
        <g>{gridLines}</g>
        {children(m)}
        {/* station ruler — the shared spine */}
        <g className="ruler" data-testid="station-ruler">
          <line
            x1={0}
            x2={pxW}
            y1={rulerEdge === 'top' ? 18 : heightPx - 18}
            y2={rulerEdge === 'top' ? 18 : heightPx - 18}
            className="ruler-line"
          />
          {(() => {
            let lastLabelEnd = -Infinity;
            return stations.map((s) => {
              const tx = m.sx(s.x);
              const showLabel = tx - lastLabelEnd > 26;
              if (showLabel) lastLabelEnd = tx + s.label.length * 6;
              return (
                <g key={s.id}>
                  <line
                    x1={tx}
                    x2={tx}
                    y1={rulerEdge === 'top' ? 14 : heightPx - 22}
                    y2={rulerEdge === 'top' ? 22 : heightPx - 14}
                    className="ruler-tick"
                  />
                  {showLabel && (
                    <text x={tx + 3} y={rulerY} className="ruler-label">
                      {s.label}
                    </text>
                  )}
                </g>
              );
            });
          })()}
        </g>
      </svg>
    </div>
  );
}
