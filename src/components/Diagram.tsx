interface DiagramProps {
  spec: unknown;
  opts?: string;
  still?: boolean;
}

/** Wrapper for the kit's diagrams: it reads the nested JSON spec and draws the graph. */
export function Diagram({ spec, opts, still }: DiagramProps) {
  const inner = `<script type="application/json">${JSON.stringify(spec)}</script>`;
  return (
    <div
      className="dg"
      data-diagram=""
      {...(still ? { 'data-dg-still': '' } : {})}
      {...(opts ? { 'data-diagram-opts': opts } : {})}
      dangerouslySetInnerHTML={{ __html: inner }}
    />
  );
}
