type KitWindow = Window & {
  TPDiagram?: { auto?: (root: ParentNode) => void };
  tasteBackgrounds?: { detect?: () => void };
};

const kitUrl = (path: string): string => new URL(`${import.meta.env.BASE_URL}kit/${path}`, location.href).href;

/** The design kit scans the DOM once on load; an SPA has to re-run it after each screen renders. */
export async function enhanceDom(root: ParentNode = document): Promise<void> {
  const w = window as KitWindow;
  try {
    w.TPDiagram?.auto?.(root);
  } catch {
    /* diagrams are decorative here */
  }
  try {
    w.tasteBackgrounds?.detect?.();
  } catch {
    /* backgrounds are decorative here */
  }
  try {
    const moments = await import(/* @vite-ignore */ kitUrl('moments/moments.js'));
    moments.mountAll(root);
  } catch {
    /* a missing moment leaves its markup as plain text */
  }
  try {
    const system = await import(/* @vite-ignore */ kitUrl('system.js'));
    system.default?.init?.();
  } catch {
    /* nav/menu behaviour is optional */
  }
  try {
    const motion = await import(/* @vite-ignore */ kitUrl('motion/motion.js'));
    motion.refresh?.();
  } catch {
    /* motion is optional */
  }
}
