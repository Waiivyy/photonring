// Small DOM helpers. The page is built with createElement and textContent only: no innerHTML and
// no style attributes, so nothing from the URL can become markup and the Stage 5 content
// security policy needs no exceptions.

type Attrs = Readonly<Record<string, string | number | boolean | null | undefined>>;
type Child = Node | string | null | undefined | false;

function apply(node: Element, attrs: Attrs): void {
  for (const [name, value] of Object.entries(attrs)) {
    if (value === null || value === undefined || value === false) continue;
    node.setAttribute(name, value === true ? '' : String(value));
  }
}

/** An HTML element with attributes and children (strings become text nodes). */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  apply(node, attrs);
  for (const c of children) if (c !== null && c !== undefined && c !== false) node.append(c);
  return node;
}

const SVG_NS = 'http://www.w3.org/2000/svg';

/** An SVG element with attributes (presentation attributes, not style). */
export function svgEl<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  ...children: Child[]
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  apply(node, attrs);
  for (const c of children) if (c !== null && c !== undefined && c !== false) node.append(c);
  return node;
}
