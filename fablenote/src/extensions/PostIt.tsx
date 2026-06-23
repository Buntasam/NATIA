import { useState, useRef } from "react";
import { Node, mergeAttributes } from "@tiptap/core";
import { NodeViewWrapper, NodeViewContent, ReactNodeViewRenderer } from "@tiptap/react";
import { GripVertical, Pin, PinOff } from "lucide-react";

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
  const color    = node.attrs.color as string;
  const floating = node.attrs.floating as boolean;
  const attrX    = (node.attrs.x as number) || 0;
  const attrY    = (node.attrs.y as number) || 0;

  const [localPos, setLocalPos] = useState<{ x: number; y: number } | null>(null);
  const dragStart = useRef<{ px: number; py: number; nx: number; ny: number } | null>(null);

  const posX = localPos ? localPos.x : attrX;
  const posY = localPos ? localPos.y : attrY;

  const handleDragStart = (e: React.PointerEvent) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    dragStart.current = { px: e.clientX, py: e.clientY, nx: attrX, ny: attrY };
    setLocalPos({ x: attrX, y: attrY });
  };

  const handleDragMove = (e: React.PointerEvent) => {
    if (!dragStart.current) return;
    const dx = e.clientX - dragStart.current.px;
    const dy = e.clientY - dragStart.current.py;
    setLocalPos({ x: dragStart.current.nx + dx, y: dragStart.current.ny + dy });
  };

  const handleDragEnd = (e: React.PointerEvent) => {
    if (!dragStart.current) return;
    const dx = e.clientX - dragStart.current.px;
    const dy = e.clientY - dragStart.current.py;
    const finalX = dragStart.current.nx + dx;
    const finalY = dragStart.current.ny + dy;
    updateAttributes({ x: finalX, y: finalY });
    setLocalPos(null);
    dragStart.current = null;
  };

  const toggleFloat = () => {
    updateAttributes({ floating: !floating, x: 0, y: 0 });
    setLocalPos(null);
    dragStart.current = null;
  };

  return (
    <NodeViewWrapper
      style={floating
        ? { position: "relative", height: 0, overflow: "visible", zIndex: 10 }
        : {}}
    >
      <div
        className="postit"
        style={{
          backgroundColor: color,
          ...(floating
            ? {
                position: "absolute",
                left: posX,
                top: posY,
                zIndex: 50,
                width: 280,
                userSelect: dragStart.current ? "none" : "auto",
                boxShadow: "0 4px 20px rgba(0,0,0,0.18)",
              }
            : {}),
        }}
        data-type="postit"
      >
        <div className="postit-controls" contentEditable={false}>
          {/* Drag handle — only when floating */}
          {floating && (
            <div
              className="postit-drag-handle"
              onPointerDown={handleDragStart}
              onPointerMove={handleDragMove}
              onPointerUp={handleDragEnd}
              title="Déplacer"
            >
              <GripVertical size={13} />
            </div>
          )}

          {/* Color swatches */}
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

          {/* Float toggle */}
          <button
            onClick={toggleFloat}
            className="postit-float-btn"
            title={floating ? "Ancrer dans le texte" : "Mode flottant"}
          >
            {floating ? <Pin size={12} /> : <PinOff size={12} />}
          </button>
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
      floating: {
        default: false,
        parseHTML: (el) => el.getAttribute("data-floating") === "true",
        renderHTML: (attrs) => ({ "data-floating": String(attrs.floating) }),
      },
      x: {
        default: 0,
        parseHTML: (el) => parseFloat(el.getAttribute("data-x") ?? "0"),
        renderHTML: (attrs) => ({ "data-x": String(attrs.x) }),
      },
      y: {
        default: 0,
        parseHTML: (el) => parseFloat(el.getAttribute("data-y") ?? "0"),
        renderHTML: (attrs) => ({ "data-y": String(attrs.y) }),
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
            attrs: { color: "#fef08a", floating: false, x: 0, y: 0, ...attrs },
            content: [{ type: "paragraph" }],
          });
        },
    };
  },
});
