import { visit, SKIP } from "unist-util-visit";
import type { Root, Text, Break } from "mdast";

// Remark plugin: turns single newlines into hard breaks (same effect as the remark-breaks package).
export function remarkBreaks() {
  return (tree: Root) => {
    visit(tree, "text", (node, index, parent) => {
      if (parent === null || index === null) return;

      const parts: Array<Text | Break> = [];
      let start = 0;

      while (true) {
        const end = node.value.indexOf("\n", start);
        if (end === -1) {
          if (start > 0) {
            parts.push({ type: "text", value: node.value.slice(start) });
          }
          break;
        }
        parts.push(
          { type: "text", value: node.value.slice(start, end) },
          { type: "break" },
        );
        start = end + 1;
      }

      if (parts.length > 0) {
        parent.children.splice(index, 1, ...(parts as never[]));
        return [SKIP, index + parts.length - 1];
      }
    });
  };
}
