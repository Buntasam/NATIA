import { Node, mergeAttributes } from "@tiptap/core";
import { NodeViewWrapper, NodeViewContent, ReactNodeViewRenderer } from "@tiptap/react";

const POSTIT_COLORS = [
  "#fef08a",
  "#86efac",
  "#93c5fd",
  "#f9a8d4",
  "#fdba74",
  "#d8b4fe",
  "#f1f5f9",
];

function PostItView({
  node,
  updateAttributes,
}: {
  node: { attrs: Record<string, unknown> };
  updateAttributes: (attrs: Record<string, unknown>) => void;
}) {
  const color = node.attrs.color as string;

  return (
    <NodeViewWrapper>
      <div className="postit" style={{ backgroundColor: color }} data-type="postit">
        <div className="postit-controls" contentEditable={false}>
          {POSTIT_COLORS.map((c) => (
            <button
              key={c}
              onClick={() => updateAttributes({ color: c })}
              title={c}
              className="postit-color-btn"
              style={{
                backgroundColor: c,
                outline:
                  c === color
                    ? "2px solid rgba(0,0,0,0.45)"
                    : "1px solid rgba(0,0,0,0.15)",
                outlineOffset: c === color ? "1px" : "0",
              }}
            />
          ))}
        </div>
        <NodeViewContent className="postit-content" />
      </div>
    </NodeViewWrapper>
  );
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    postit: {
      insertPostIt: (attrs?: { color?: string }) => ReturnType;
    };
  }
}

export const PostIt = Node.create({
  name: "postit",
  group: "block",
  content: "block+",

  addAttributes() {
    return {
      color: {
        default: "#fef08a",
        parseHTML: (el) => el.getAttribute("data-color") ?? "#fef08a",
        renderHTML: (attrs) => ({
          "data-color": attrs.color as string,
          style: `background-color: ${attrs.color as string}`,
        }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="postit"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes({ "data-type": "postit" }, HTMLAttributes), 0];
  },

  addNodeView() {
    return ReactNodeViewRenderer(PostItView);
  },

  addCommands() {
    return {
      insertPostIt:
        (attrs = {}) =>
        ({ commands }) => {
          return commands.insertContent({
            type: "postit",
            attrs: { color: "#fef08a", ...attrs },
            content: [{ type: "paragraph" }],
          });
        },
    };
  },
});
