import { useState } from 'react';

interface Node {
  t: string;
  x: number;
  y: number;
}

const path = (a: Node, b: Node): string =>
  `M${a.x} ${a.y + 15} C${a.x} ${a.y + 40} ${b.x} ${b.y - 40} ${b.x} ${b.y - 15}`;

const label = (t: string): string => (t.length > 18 ? `${t.slice(0, 17)}…` : t);

/** The player's route as a growing graph; ported from the approved mockup. */
export function RouteGraph({ route, target }: { route: string[]; target: string }) {
  const [reduced] = useState(() => matchMedia('(prefers-reduced-motion: reduce)').matches);
  const points: Node[] = route.map((t, i) => ({ t, x: i % 2 ? 236 : 96, y: 30 + i * 62 }));
  const goal: Node = { t: target, x: route.length % 2 ? 236 : 96, y: 30 + route.length * 62 };
  const all = [...points, goal];
  const last = points.length - 1;
  const live = last > 0 ? path(points[last - 1], points[last]) : null;
  const pulse = last > 0 ? path(points[last - 1], points[last]) : path(points[last], goal);

  return (
    <svg id="wr-route" viewBox={`0 0 332 ${goal.y + 40}`} role="img" aria-label="Rute klik">
      {all.slice(0, -1).map((node, i) => (
        <path key={`edge-${i}`} className={`wr-edge${i === all.length - 2 ? ' wr-edge--ghost' : ''}`} d={path(node, all[i + 1])} />
      ))}
      {live ? <path className="wr-edge wr-edge--live" d={live} /> : null}
      {reduced ? null : (
        <g className="wr-pulse">
          <circle className="wr-pulse-glow" r={6}>
            <animateMotion dur="2.4s" repeatCount="indefinite" path={pulse} />
          </circle>
          <circle className="wr-pulse-head" r={2.6}>
            <animateMotion dur="2.4s" repeatCount="indefinite" path={pulse} />
          </circle>
        </g>
      )}
      {all.map((node, i) => (
        <g key={`node-${i}`} className={`wr-node${i === all.length - 1 ? ' wr-node--ghost' : i === last ? ' wr-node--now' : ''}`}>
          <rect x={node.x - 66} y={node.y - 15} width={132} height={30} rx={8} />
          <text x={node.x} y={node.y}>
            {label(node.t)}
          </text>
        </g>
      ))}
    </svg>
  );
}
