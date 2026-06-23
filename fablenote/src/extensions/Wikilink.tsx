import { Mark, mergeAttributes } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    wikilink: {
      setWikilink: (id: string, title: string) => ReturnType;
    };
  }
}

export const Wikilink = Mark.create({
  name: "wikilink",
  priority: 1000,
  inclusive: false,

  addAttributes() {
    return {
      noteId: { default: null, parseHTML: (el) => el.getAttribute("data-note-id"), renderHTML: (a) => ({ "data-note-id": a.noteId }) },
      noteTitle: { default: "", parseHTML: (el) => el.getAttribute("data-note-title"), renderHTML: (a) => ({ "data-note-title": a.noteTitle }) },
    };
  },

  parseHTML() { return [{ tag: 'span[data-wikilink]' }]; },
  renderHTML({ HTMLAttributes }) {
    return ["span", mergeAttributes({ "data-wikilink": "true", class: "wikilink" }, HTMLAttributes), 0];
  },

  addCommands() {
    return {
      setWikilink: (id, title) => ({ commands }) =>
        commands.setMark(this.name, { noteId: id, noteTitle: title }),
    };
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey("wikilink-decorator"),
        props: {
          decorations(state) {
            const decorations: Decoration[] = [];
            const doc = state.doc;
            const regex = /\[\[([^\]]+)\]\]/g;
            doc.descendants((node, pos) => {
              if (!node.isText) return;
              const text = node.text ?? "";
              let m: RegExpExecArray | null;
              regex.lastIndex = 0;
              while ((m = regex.exec(text)) !== null) {
                const from = pos + m.index;
                const to = from + m[0].length;
                decorations.push(
                  Decoration.inline(from, to, { class: "wikilink-candidate", "data-title": m[1] })
                );
              }
            });
            return DecorationSet.create(doc, decorations);
          },
        },
      }),
    ];
  },
});
