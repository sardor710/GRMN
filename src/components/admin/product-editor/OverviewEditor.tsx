"use client";

// The admin overview editor (plan M5.1/M5.3/M5.4): CKEditor 5 (open-source, licenseKey "GPL", self-hosted from
// npm). Loaded only through next/dynamic({ ssr: false }) from tabs/OverviewTab.tsx, so neither CKEditor nor
// its stylesheet ever reaches a storefront bundle.
//  - General HTML Support keeps exactly the shared overview allowlist (src/lib/overview/allowlist.ts); the
//    server sanitizes again on save, so Source mode cannot smuggle anything through.
//  - The editing surface wears the storefront overview stylesheet (edit-in-preview).
//  - Media Embed is YouTube-only; legacy imported `ov-video` links are converted to media blocks on load.
//  - Blocks move by dragging the block handle (left of each block) or by cut and paste.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CKEditor } from "@ckeditor/ckeditor5-react";
import {
  Autoformat,
  BlockQuote,
  BlockToolbar,
  Bold,
  ClassicEditor,
  Essentials,
  FileRepository,
  GeneralHtmlSupport,
  Heading,
  ImageBlock,
  ImageCaption,
  ImageInsert,
  ImageTextAlternative,
  ImageToolbar,
  ImageUpload,
  Italic,
  Link,
  LinkImage,
  List,
  MediaEmbed,
  Paragraph,
  PasteFromOffice,
  RemoveFormat,
  SourceEditing,
  Table,
  TableToolbar,
  WordCount,
  type Editor,
  type EditorConfig,
  type FileLoader,
  type UploadAdapter,
  type UploadResponse,
} from "ckeditor5";
import "ckeditor5/ckeditor5.css";
import overviewStyles from "@/components/product/CmsOverview.module.css";
import { overviewHtmlSupportRules } from "@/lib/overview/allowlist";
import { legacyVideoToMedia } from "@/lib/overview/video";
import { embedUrl } from "@/lib/overview/youtube";
import { uploadImageFile } from "./upload";
import styles from "./OverviewEditor.module.css";

/** Sends images dropped, pasted or picked in the editor to /api/admin/uploads (same endpoint as Photos). */
class AdminUploadAdapter implements UploadAdapter {
  private readonly loader: FileLoader;
  constructor(loader: FileLoader) {
    this.loader = loader;
  }
  async upload(): Promise<UploadResponse> {
    const file = await this.loader.file;
    if (!file) throw new Error("No file to upload.");
    return { default: await uploadImageFile(file) };
  }
  abort(): void {}
}

function AdminUploads(editor: Editor) {
  editor.plugins.get(FileRepository).createUploadAdapter = (loader) => new AdminUploadAdapter(loader);
}

const YOUTUBE_URLS = [
  /^(?:https?:\/\/)?(?:(?:www|m|music)\.)?youtube\.com\/watch\?(?:.*&)?v=([\w-]{11})/,
  /^(?:https?:\/\/)?(?:www\.)?youtu\.be\/([\w-]{11})/,
  /^(?:https?:\/\/)?(?:(?:www|m)\.)?youtube\.com\/(?:shorts|embed|live|v)\/([\w-]{11})/,
  /^(?:https?:\/\/)?(?:www\.)?youtube-nocookie\.com\/embed\/([\w-]{11})/,
];

/** Distance from the viewport top to the editor's scroll area, so the sticky toolbar stops under the header. */
function stickyOffset(): number {
  if (typeof document === "undefined") return 0;
  const main = document.getElementById("product-editor-main");
  return main ? Math.max(0, Math.round(main.getBoundingClientRect().top)) : 0;
}

export interface OverviewEditorProps {
  /** Stored overview HTML (read once on mount; remount the editor to load different content). */
  value: string;
  /** Called with the editor's HTML after edits (debounced, flushed on blur and when leaving Source mode). */
  onChange: (html: string) => void;
  /** Called if CKEditor fails to start, so the tab can fall back to the HTML textarea. */
  onFailure?: (message: string) => void;
}

export function OverviewEditor({ value, onChange, onFailure }: OverviewEditorProps) {
  const [initialData] = useState(() => legacyVideoToMedia(value));
  const [stats, setStats] = useState({ words: 0, characters: 0 });
  const editorRef = useRef<ClassicEditor | null>(null);
  const pending = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  const flush = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const editor = editorRef.current;
    if (!editor || editor.state !== "ready") return;
    try {
      const source = editor.plugins.get(SourceEditing);
      if (source.isSourceEditingMode) {
        source.updateEditorData();
        pending.current = true;
      }
      if (!pending.current) return;
      pending.current = false;
      onChangeRef.current(editor.getData());
    } catch {
      // The editor is being torn down; its last change was already flushed on blur.
    }
  }, []);

  const schedule = useCallback(() => {
    pending.current = true;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(flush, 300);
  }, [flush]);

  useEffect(() => () => flush(), [flush]);

  const config = useMemo<EditorConfig>(
    () => ({
      licenseKey: "GPL",
      plugins: [
        Essentials, Autoformat, Paragraph, Heading, Bold, Italic, Link, List, BlockQuote, RemoveFormat,
        ImageBlock, ImageToolbar, ImageCaption, ImageTextAlternative, ImageUpload, ImageInsert, LinkImage, AdminUploads,
        Table, TableToolbar, MediaEmbed, GeneralHtmlSupport, PasteFromOffice, SourceEditing, BlockToolbar, WordCount,
      ],
      initialData,
      toolbar: {
        items: [
          "undo", "redo", "|", "heading", "|", "bold", "italic", "link", "|", "bulletedList", "numberedList", "blockQuote", "|",
          "insertImage", "mediaEmbed", "insertTable", "|", "removeFormat", "sourceEditing",
        ],
        shouldNotGroupWhenFull: false,
      },
      // The ⋮⋮ handle left of each block opens block actions and drags the block to a new place.
      blockToolbar: ["heading", "|", "bulletedList", "numberedList", "blockQuote", "|", "insertImage", "mediaEmbed", "insertTable"],
      heading: {
        options: [
          { model: "paragraph", title: "Paragraph", class: "ck-heading_paragraph" },
          { model: "heading2", view: "h2", title: "Heading", class: "ck-heading_heading2" },
          { model: "heading3", view: "h3", title: "Subheading", class: "ck-heading_heading3" },
          { model: "heading4", view: "h4", title: "Small heading", class: "ck-heading_heading4" },
        ],
      },
      link: { defaultProtocol: "https://", allowedProtocols: ["https"] },
      image: {
        toolbar: ["imageTextAlternative", "toggleImageCaption", "|", "linkImage"],
        upload: { types: ["jpeg", "png", "webp", "avif"] },
      },
      table: { contentToolbar: ["tableColumn", "tableRow", "mergeTableCells"] },
      mediaEmbed: {
        previewsInData: false,
        providers: [
          {
            name: "youtube",
            url: YOUTUBE_URLS,
            html: (match: RegExpMatchArray) =>
              '<div style="position:relative;padding-bottom:56.25%;height:0">' +
              `<iframe src="${embedUrl(match[1])}" style="position:absolute;inset:0;width:100%;height:100%;border:0" ` +
              'allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen title="YouTube video"></iframe></div>',
          },
        ],
      },
      htmlSupport: { allow: overviewHtmlSupportRules() },
      wordCount: { onUpdate: (next: { words: number; characters: number }) => setStats({ words: next.words, characters: next.characters }) },
      ui: { viewportOffset: { top: stickyOffset() } },
      placeholder: "Write the product overview, or import it from garmin.com…",
    }),
    [initialData],
  );

  return (
    <div className={styles.shell}>
      <CKEditor
        editor={ClassicEditor}
        config={config}
        onReady={(editor) => {
          editorRef.current = editor;
          const root = editor.editing.view.document.getRoot();
          // Edit-in-preview: the editable wears the storefront overview stylesheet.
          if (root) editor.editing.view.change((writer) => writer.addClass([overviewStyles.overview, styles.surface], root));
          editor.plugins.get(SourceEditing).on("change:isSourceEditingMode", (_event, _name, isSource: boolean) => {
            if (!isSource) schedule();
          });
        }}
        onChange={schedule}
        onBlur={flush}
        onAfterDestroy={() => {
          editorRef.current = null;
        }}
        onError={(error, details) => {
          if (details.phase === "initialization") onFailure?.(error.message || "The editor could not start.");
        }}
      />
      <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-[#666]" aria-live="polite">
        <span>{stats.characters.toLocaleString("en-US")} characters</span>
        <span>{stats.words.toLocaleString("en-US")} words</span>
      </p>
    </div>
  );
}
