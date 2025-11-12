import { useEffect } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import TextAlign from "@tiptap/extension-text-align";
import Highlight from "@tiptap/extension-highlight";
import MenuBar from "./menu-bar";

interface RichTextEditorProps {
  content: string;
  onChange: (content: string) => void;
  placeholder?: string;
}

export default function RichTextEditor({
  content,
  onChange,
  placeholder,
}: RichTextEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        bulletList: {
          HTMLAttributes: {
            class: "list-disc ml-4",
          },
        },
        orderedList: {
          HTMLAttributes: {
            class: "list-decimal ml-4",
          },
        },
      }),
      TextAlign.configure({
        types: ["heading", "paragraph"],
      }),
      Highlight,
    ],
    content: content,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class:
          "min-h-[156px] border rounded-md bg-slate-50 py-4 px-4 focus-visible:outline-none",
      },
    },
    onUpdate: ({ editor: instance }) => {
      onChange(instance.getHTML());
    },
  });

  useEffect(() => {
    if (!editor) {
      return;
    }
    const incoming = content ?? "";
    const current = editor.getHTML();
    if (incoming !== current) {
      editor.commands.setContent(incoming, {
        emitUpdate: false,
        parseOptions: { preserveWhitespace: "full" },
      });
    }
  }, [content, editor]);

  useEffect(() => {
    if (!editor) {
      return;
    }

    const rawAttributes = editor.options.editorProps?.attributes;
    const resolvedAttributes: Record<string, string> =
      typeof rawAttributes === "function"
        ? rawAttributes(editor.view.state)
        : (rawAttributes as Record<string, string> | undefined) ?? {};

    const defaultClass =
      "min-h-[156px] border rounded-md bg-slate-50 py-4 px-4 focus-visible:outline-none";

    const currentClass = resolvedAttributes.class ?? defaultClass;
    const nextAttributes: Record<string, string> = {
      ...resolvedAttributes,
      class: placeholder
        ? `${currentClass} editor-placeholder`
        : currentClass,
    };

    if (placeholder) {
      nextAttributes["data-placeholder"] = placeholder;
    } else {
      delete nextAttributes["data-placeholder"];
    }

    editor.setOptions({
      editorProps: {
        ...editor.options.editorProps,
        attributes: nextAttributes,
      },
    });
  }, [editor, placeholder]);

  if (!editor) {
    return (
      <div className="min-h-[156px] rounded-md border border-dashed border-slate-200 bg-slate-50" />
    );
  }

  return (
    <div>
      <MenuBar editor={editor} />
      <EditorContent editor={editor} />
    </div>
  );
}
