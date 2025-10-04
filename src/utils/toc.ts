import type { TOCItem } from '../db';

/** A node in the nested TOC tree */
export interface TOCNode extends TOCItem {
  level: number; // ensure level is concrete on the node
  children: TOCNode[];
}

/**
 * Build a nested TOC tree from a flat list of TOC items.
 * Items must be in document order. Each item's `level` denotes its depth
 * (smaller number = higher level). Undefined level is treated as 0.
 *
 * Example: levels [1,1,2,2,3,2,1] will nest as described in the task.
 */
export function buildTOCTree(items: TOCItem[]): TOCNode[] {
  const roots: TOCNode[] = [];
  const stack: TOCNode[] = [];

  for (const it of items) {
  const level = typeof it.level === 'number' ? it.level : 0;
  const node: TOCNode = { ...it, level, children: [] } as TOCNode;

    // Pop stack until we find a parent with a smaller level
    while (stack.length > 0 && stack[stack.length - 1].level >= node.level) {
      stack.pop();
    }

    if (stack.length === 0) {
      // No parent -> root
      roots.push(node);
    } else {
      // Last item in stack is the parent
      stack[stack.length - 1].children.push(node);
    }

    // Push current node as potential parent for following items
    stack.push(node);
  }

  return roots;
}

/**
 * Convert a TOCNode tree into a nested object keyed by title where each value
 * is an array of its children (each child represented as the same object form).
 *
 * Example output shape:
 * {
 *   "Chapter 1": [
 *     { "Section 1.1": [ { "Subsection 1.1.1": [] } ] },
 *     { "Section 1.2": [] }
 *   ],
 *   "Chapter 2": []
 * }
 */
export function toNestedObject(nodes: TOCNode[]): Record<string, any[]> {
  const nodeToObj = (n: TOCNode): Record<string, any[]> => {
    if (!n.children || n.children.length === 0) return { [n.title]: [] };
    return { [n.title]: n.children.map((c) => nodeToObj(c)) };
  };

  const out: Record<string, any[]> = {};
  for (const n of nodes) {
    out[n.title] = n.children.length ? n.children.map((c) => nodeToObj(c)) : [];
  }
  return out;
}

/**
 * Convert a TOCNode tree into an array of full-entry objects that preserve
 * each node's fields and include a `children` array of the same shape.
 *
 * Example output shape:
 * [
 *   { title: 'Chapter 1', page: 1, level: 1, chunkId: ..., children: [ { title: 'Section 1.1', ... } ] },
 *   { title: 'Chapter 2', page: 10, level: 1, children: [] }
 * ]
 */
export function toNestedEntries(nodes: TOCNode[]): Array<Record<string, any>> {
  const mapNode = (n: TOCNode): Record<string, any> => {
    const { title, page, chunkId, bbox, level } = n;
    return {
      title,
      page,
      chunkId,
      bbox,
      level,
      children: n.children ? n.children.map(mapNode) : [],
    };
  };

  return nodes.map(mapNode);
}

// Example usage (for maintainers):
// const flat: TOCItem[] = [
//   { title: '1', page: 1, level: 1 },
//   { title: '1.1', page: 1, level: 2 },
//   { title: '1.1.1', page: 2, level: 3 },
//   { title: '2', page: 5, level: 1 },
// ];
// const tree = buildTOCTree(flat);
// const obj = toNestedObject(tree);
// console.log(JSON.stringify(obj, null, 2));
