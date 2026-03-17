'use client';

import React, { useRef, useState, useEffect, useCallback, useMemo } from 'react';

interface MarkdownEditorProps {
  initialValue?: string;
  onChange?: (markdown: string) => void;
  placeholder?: string;
  className?: string;
  height?: number;
}

// Minimal markdown to HTML renderer
function renderMarkdown(md: string): string {
  let html = md
    // Escape HTML entities
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // Code blocks (must come before inline code)
  html = html.replace(/```(\w*)\n?([\s\S]*?)```/g, (_, lang, code) =>
    `<pre class="md-code-block"${lang ? ` data-lang="${lang}"` : ''}><code>${code.trim()}</code></pre>`
  );

  // Headings
  html = html.replace(/^##### (.+)$/gm, '<h5>$1</h5>');
  html = html.replace(/^#### (.+)$/gm, '<h4>$1</h4>');
  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');

  // Horizontal rule
  html = html.replace(/^---$/gm, '<hr/>');

  // Blockquote
  html = html.replace(/^&gt; (.+)$/gm, '<blockquote>$1</blockquote>');

  // Unordered lists
  html = html.replace(/^[-*] (.+)$/gm, '<li>$1</li>');
  html = html.replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>');

  // Ordered lists
  html = html.replace(/^\d+\. (.+)$/gm, '<li>$1</li>');

  // Bold italic
  html = html.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
  // Bold
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/__(.+?)__/g, '<strong>$1</strong>');
  // Italic
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
  html = html.replace(/_(.+?)_/g, '<em>$1</em>');
  // Strikethrough
  html = html.replace(/~~(.+?)~~/g, '<del>$1</del>');
  // Inline code
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
  // Links
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
  // Images
  html = html.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1" style="max-width:100%"/>');

  // Paragraphs (double newlines)
  html = html.replace(/\n\n+/g, '</p><p>');
  html = `<p>${html}</p>`;

  // Clean up empty paragraphs and paragraphs wrapping block elements
  html = html.replace(/<p>\s*<\/p>/g, '');
  html = html.replace(/<p>(<h[1-6]>|<ul>|<ol>|<pre>|<blockquote>|<hr)/g, '$1');
  html = html.replace(/(<\/h[1-6]>|<\/ul>|<\/ol>|<\/pre>|<\/blockquote>|<\/hr>|<hr\/>)<\/p>/g, '$1');

  return html;
}

interface ToolbarAction {
  label: string;
  title: string;
  wrap?: [string, string];
  insert?: string;
  block?: string;
}

const TOOLBAR_ACTIONS: ToolbarAction[] = [
  { label: 'B', title: 'Bold (Ctrl+B)', wrap: ['**', '**'] },
  { label: 'I', title: 'Italic (Ctrl+I)', wrap: ['*', '*'] },
  { label: 'S̶', title: 'Strikethrough', wrap: ['~~', '~~'] },
  { label: '`', title: 'Inline code', wrap: ['`', '`'] },
  { label: 'H1', title: 'Heading 1', block: '# ' },
  { label: 'H2', title: 'Heading 2', block: '## ' },
  { label: 'H3', title: 'Heading 3', block: '### ' },
  { label: '≡', title: 'Bullet list', block: '- ' },
  { label: '1.', title: 'Numbered list', block: '1. ' },
  { label: '❝', title: 'Blockquote', block: '> ' },
  { label: '</>', title: 'Code block', wrap: ['```\n', '\n```'] },
  { label: '—', title: 'Horizontal rule', insert: '\n---\n' },
  { label: '🔗', title: 'Link', wrap: ['[', '](url)'] },
];

export function MarkdownEditor({
  initialValue = '',
  onChange,
  placeholder = '# Start writing...\n\nSupports **bold**, *italic*, `code`, and more.',
  className = '',
  height = 400,
}: MarkdownEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [markdown, setMarkdown] = useState(initialValue);
  const [lineCount, setLineCount] = useState(1);
  const [wordCount, setWordCount] = useState(0);
  const previewRef = useRef<HTMLDivElement>(null);

  const preview = useMemo(() => renderMarkdown(markdown), [markdown]);

  useEffect(() => {
    const lines = markdown.split('\n').length;
    setLineCount(lines);
    const words = markdown.trim().split(/\s+/).filter(Boolean).length;
    setWordCount(words);
    onChange?.(markdown);
  }, [markdown, onChange]);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setMarkdown(e.target.value);
  };

  const applyAction = useCallback((action: ToolbarAction) => {
    const ta = textareaRef.current;
    if (!ta) return;

    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const selected = markdown.slice(start, end);
    let newText = markdown;
    let newStart = start;
    let newEnd = end;

    if (action.insert) {
      newText = markdown.slice(0, start) + action.insert + markdown.slice(end);
      newStart = newEnd = start + action.insert.length;
    } else if (action.wrap) {
      const [before, after] = action.wrap;
      newText = markdown.slice(0, start) + before + selected + after + markdown.slice(end);
      newStart = start + before.length;
      newEnd = newStart + selected.length;
    } else if (action.block) {
      // Find line start
      const lineStart = markdown.lastIndexOf('\n', start - 1) + 1;
      newText = markdown.slice(0, lineStart) + action.block + markdown.slice(lineStart);
      newStart = newEnd = start + action.block.length;
    }

    setMarkdown(newText);
    setTimeout(() => {
      ta.selectionStart = newStart;
      ta.selectionEnd = newEnd;
      ta.focus();
    }, 0);
  }, [markdown]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const ta = e.currentTarget;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;

    if (e.ctrlKey || e.metaKey) {
      switch (e.key.toLowerCase()) {
        case 'b': e.preventDefault(); applyAction({ label: '', title: '', wrap: ['**', '**'] }); return;
        case 'i': e.preventDefault(); applyAction({ label: '', title: '', wrap: ['*', '*'] }); return;
      }
    }

    // Tab -> indent
    if (e.key === 'Tab') {
      e.preventDefault();
      const val = markdown;
      const newVal = val.slice(0, start) + '  ' + val.slice(end);
      setMarkdown(newVal);
      setTimeout(() => { ta.selectionStart = ta.selectionEnd = start + 2; }, 0);
      return;
    }

    // Auto-close brackets and quotes
    const pairs: Record<string, string> = { '(': ')', '[': ']', '{': '}', '"': '"', "'": "'", '`': '`' };
    if (pairs[e.key] && start === end) {
      e.preventDefault();
      const close = pairs[e.key];
      const newVal = markdown.slice(0, start) + e.key + close + markdown.slice(end);
      setMarkdown(newVal);
      setTimeout(() => { ta.selectionStart = ta.selectionEnd = start + 1; }, 0);
    }
  }, [markdown, applyAction]);

  const handleScroll = (e: React.UIEvent<HTMLTextAreaElement>) => {
    if (previewRef.current) {
      const ratio = e.currentTarget.scrollTop / (e.currentTarget.scrollHeight - e.currentTarget.clientHeight);
      previewRef.current.scrollTop = ratio * (previewRef.current.scrollHeight - previewRef.current.clientHeight);
    }
  };

  return (
    <div className={`flex flex-col border border-gray-200 rounded-xl overflow-hidden bg-white ${className}`}>
      {/* Toolbar */}
      <div className="flex items-center gap-0.5 px-3 py-2 border-b border-gray-100 bg-gray-50 flex-wrap">
        {TOOLBAR_ACTIONS.map((action, i) => (
          <button
            key={i}
            title={action.title}
            onClick={() => applyAction(action)}
            className="w-7 h-7 flex items-center justify-center rounded text-xs font-medium text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-colors"
          >
            {action.label}
          </button>
        ))}
      </div>

      {/* Split pane */}
      <div className="flex flex-1" style={{ height }}>
        {/* Editor with line numbers */}
        <div className="flex flex-1 border-r border-gray-100 overflow-hidden">
          {/* Line numbers */}
          <div
            className="flex-shrink-0 w-10 bg-gray-50 border-r border-gray-100 overflow-hidden select-none"
            style={{ paddingTop: 12 }}
          >
            {Array.from({ length: lineCount }, (_, i) => (
              <div key={i} className="text-right pr-2 text-xs text-gray-300 leading-6 h-6">
                {i + 1}
              </div>
            ))}
          </div>

          {/* Textarea */}
          <textarea
            ref={textareaRef}
            value={markdown}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            onScroll={handleScroll}
            placeholder={placeholder}
            spellCheck={false}
            className="flex-1 p-3 text-sm font-mono text-gray-800 resize-none outline-none leading-6 bg-white"
            style={{ height: '100%', overflowY: 'auto' }}
          />
        </div>

        {/* Preview */}
        <div
          ref={previewRef}
          className="flex-1 overflow-y-auto p-4 text-sm text-gray-800 leading-relaxed"
          dangerouslySetInnerHTML={{ __html: preview || `<p class="text-gray-400">${placeholder.split('\n')[0]}</p>` }}
        />
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between px-4 py-2 border-t border-gray-100 bg-gray-50 text-xs text-gray-400">
        <span>Markdown</span>
        <div className="flex gap-3">
          <span>{lineCount} lines</span>
          <span>{wordCount} words</span>
          <span>{markdown.length} chars</span>
        </div>
      </div>

      <style>{`
        .flex-1[dangerouslysetinnerhtml] h1, [dangerouslySetInnerHTML] h1 { font-size: 1.5rem; font-weight: 700; margin-bottom: 0.5rem; }
        .flex-1 h1 { font-size: 1.5rem; font-weight: 700; margin: 0.75rem 0 0.4rem; color: #111827; }
        .flex-1 h2 { font-size: 1.2rem; font-weight: 600; margin: 0.6rem 0 0.3rem; color: #1f2937; }
        .flex-1 h3 { font-size: 1.05rem; font-weight: 600; margin: 0.5rem 0 0.25rem; color: #1f2937; }
        .flex-1 p { margin: 0.4rem 0; }
        .flex-1 blockquote { border-left: 3px solid #6366f1; padding-left: 10px; color: #6b7280; font-style: italic; margin: 0.5rem 0; }
        .flex-1 pre.md-code-block { background: #f3f4f6; border-radius: 6px; padding: 10px 14px; font-family: monospace; font-size: 0.82em; margin: 0.5rem 0; overflow-x: auto; }
        .flex-1 code { background: #f3f4f6; border-radius: 3px; padding: 1px 4px; font-family: monospace; font-size: 0.85em; }
        .flex-1 pre code { background: none; padding: 0; }
        .flex-1 ul { list-style: disc; padding-left: 1.5rem; margin: 0.4rem 0; }
        .flex-1 ol { list-style: decimal; padding-left: 1.5rem; margin: 0.4rem 0; }
        .flex-1 li { margin: 0.15rem 0; }
        .flex-1 a { color: #6366f1; text-decoration: underline; }
        .flex-1 hr { border: none; border-top: 1px solid #e5e7eb; margin: 1rem 0; }
        .flex-1 strong { font-weight: 700; }
        .flex-1 em { font-style: italic; }
        .flex-1 del { text-decoration: line-through; color: #9ca3af; }
        .flex-1 img { max-width: 100%; border-radius: 6px; }
      `}</style>
    </div>
  );
}
