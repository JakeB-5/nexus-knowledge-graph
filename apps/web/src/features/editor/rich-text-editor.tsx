'use client';

import React, { useRef, useState, useEffect, useCallback } from 'react';

interface RichTextEditorProps {
  initialValue?: string;
  placeholder?: string;
  onChange?: (html: string) => void;
  onAutoSave?: (html: string) => void;
  autoSaveDelay?: number;
  maxLength?: number;
  className?: string;
  readOnly?: boolean;
}

interface ToolbarButton {
  command: string;
  icon: string;
  title: string;
  value?: string;
  active?: () => boolean;
}


function debounce<T extends (...args: unknown[]) => void>(fn: T, delay: number): T {
  let timer: ReturnType<typeof setTimeout>;
  return ((...args: unknown[]) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  }) as T;
}

export function RichTextEditor({
  initialValue = '',
  placeholder = 'Start typing...',
  onChange,
  onAutoSave,
  autoSaveDelay = 2000,
  maxLength,
  className = '',
  readOnly = false,
}: RichTextEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const [charCount, setCharCount] = useState(0);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const savedRangeRef = useRef<Range | null>(null);

  // Initialize content
  useEffect(() => {
    if (editorRef.current && initialValue) {
      editorRef.current.innerHTML = initialValue;
      updateCharCount();
    }
  }, []);

  const updateCharCount = useCallback(() => {
    const text = editorRef.current?.innerText ?? '';
    setCharCount(text.length);
  }, []);

  const triggerChange = useCallback(() => {
    const html = editorRef.current?.innerHTML ?? '';
    onChange?.(html);
    updateCharCount();
  }, [onChange, updateCharCount]);

  const debouncedAutoSave = useCallback(
    debounce((...args: unknown[]) => {
      const html = args[0] as string;
      setSaveStatus('saving');
      setTimeout(() => {
        onAutoSave?.(html);
        setSaveStatus('saved');
        setTimeout(() => setSaveStatus('idle'), 2000);
      }, 300);
    }, autoSaveDelay),
    [onAutoSave, autoSaveDelay]
  );

  const handleInput = useCallback(() => {
    triggerChange();
    if (onAutoSave) {
      setSaveStatus('idle');
      debouncedAutoSave(editorRef.current?.innerHTML ?? '');
    }
  }, [triggerChange, onAutoSave, debouncedAutoSave]);

  const execCommand = useCallback((command: string, value?: string) => {
    editorRef.current?.focus();
    document.execCommand(command, false, value);
    triggerChange();
  }, [triggerChange]);


  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (readOnly) return;

    // Shortcuts
    if (e.ctrlKey || e.metaKey) {
      switch (e.key.toLowerCase()) {
        case 'b': e.preventDefault(); execCommand('bold'); break;
        case 'i': e.preventDefault(); execCommand('italic'); break;
        case 'u': e.preventDefault(); execCommand('underline'); break;
        case 'k': e.preventDefault(); openLinkDialog(); break;
        case '`': e.preventDefault(); execCommand('formatBlock', 'pre'); break;
      }
    }

    // Tab for indenting lists
    if (e.key === 'Tab') {
      e.preventDefault();
      execCommand(e.shiftKey ? 'outdent' : 'indent');
    }
  }, [readOnly, execCommand]);

  const isActive = (command: string): boolean => {
    try {
      return document.queryCommandState(command);
    } catch {
      return false;
    }
  };

  const openLinkDialog = () => {
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) {
      savedRangeRef.current = sel.getRangeAt(0).cloneRange();
    }
    setLinkUrl('');
    setLinkDialogOpen(true);
  };

  const insertLink = () => {
    if (!linkUrl) { setLinkDialogOpen(false); return; }
    const sel = window.getSelection();
    if (savedRangeRef.current) {
      sel?.removeAllRanges();
      sel?.addRange(savedRangeRef.current);
    }
    execCommand('createLink', linkUrl.startsWith('http') ? linkUrl : `https://${linkUrl}`);
    setLinkDialogOpen(false);
  };

  const TOOLBAR_GROUPS: Array<ToolbarButton[]> = [
    [
      { command: 'bold', icon: 'B', title: 'Bold (Ctrl+B)' },
      { command: 'italic', icon: 'I', title: 'Italic (Ctrl+I)' },
      { command: 'underline', icon: 'U', title: 'Underline (Ctrl+U)' },
      { command: 'strikeThrough', icon: 'S̶', title: 'Strikethrough' },
    ],
    [
      { command: 'formatBlock:h1', icon: 'H1', title: 'Heading 1', value: 'h1' },
      { command: 'formatBlock:h2', icon: 'H2', title: 'Heading 2', value: 'h2' },
      { command: 'formatBlock:h3', icon: 'H3', title: 'Heading 3', value: 'h3' },
    ],
    [
      { command: 'insertUnorderedList', icon: '≡', title: 'Bullet list' },
      { command: 'insertOrderedList', icon: '1.', title: 'Numbered list' },
      { command: 'indent', icon: '→', title: 'Indent' },
      { command: 'outdent', icon: '←', title: 'Outdent' },
    ],
    [
      { command: 'formatBlock:blockquote', icon: '❝', title: 'Block quote', value: 'blockquote' },
      { command: 'formatBlock:pre', icon: '</>', title: 'Code block', value: 'pre' },
      { command: 'createLink', icon: '🔗', title: 'Insert link (Ctrl+K)' },
      { command: 'removeFormat', icon: '⊘', title: 'Clear formatting' },
    ],
  ];

  const handleToolbarClick = (btn: ToolbarButton) => {
    if (btn.command === 'createLink') {
      openLinkDialog();
      return;
    }
    if (btn.command.startsWith('formatBlock:')) {
      execCommand('formatBlock', btn.value!);
      return;
    }
    execCommand(btn.command, btn.value);
  };

  return (
    <div className={`flex flex-col border border-gray-200 rounded-xl overflow-hidden bg-white ${className}`}>
      {/* Toolbar */}
      {!readOnly && (
        <div className="flex items-center gap-0.5 px-3 py-2 border-b border-gray-100 bg-gray-50 flex-wrap">
          {TOOLBAR_GROUPS.map((group, gi) => (
            <React.Fragment key={gi}>
              {gi > 0 && <div className="w-px h-5 bg-gray-200 mx-1" />}
              {group.map((btn) => {
                const active = ['bold', 'italic', 'underline', 'strikeThrough',
                  'insertUnorderedList', 'insertOrderedList'].includes(btn.command)
                  ? isActive(btn.command)
                  : false;
                return (
                  <button
                    key={btn.command}
                    title={btn.title}
                    onMouseDown={(e) => { e.preventDefault(); handleToolbarClick(btn); }}
                    className={`w-7 h-7 flex items-center justify-center rounded text-xs font-medium transition-colors ${
                      active
                        ? 'bg-indigo-100 text-indigo-700'
                        : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700'
                    }`}
                  >
                    {btn.icon}
                  </button>
                );
              })}
            </React.Fragment>
          ))}
        </div>
      )}

      {/* Editor */}
      <div className="relative flex-1">
        <div
          ref={editorRef}
          contentEditable={!readOnly}
          suppressContentEditableWarning
          onInput={handleInput}
          onKeyDown={handleKeyDown}
          className="min-h-[200px] p-4 outline-none text-sm text-gray-800 leading-relaxed prose prose-sm max-w-none"
          style={{ wordBreak: 'break-word' }}
        />
        {charCount === 0 && (
          <div className="absolute top-4 left-4 text-gray-400 text-sm pointer-events-none select-none">
            {placeholder}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between px-4 py-2 border-t border-gray-100 bg-gray-50">
        <div className="text-xs text-gray-400">
          {charCount} chars{maxLength ? ` / ${maxLength}` : ''}
        </div>
        {onAutoSave && (
          <div className={`text-xs transition-opacity ${saveStatus === 'idle' ? 'opacity-0' : 'opacity-100'}`}>
            {saveStatus === 'saving' && <span className="text-gray-400">Saving...</span>}
            {saveStatus === 'saved' && <span className="text-emerald-500">Saved</span>}
          </div>
        )}
      </div>

      {/* Link dialog */}
      {linkDialogOpen && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center" onClick={() => setLinkDialogOpen(false)}>
          <div className="bg-white rounded-xl shadow-xl p-5 w-80" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-semibold text-gray-800 mb-3">Insert Link</h3>
            <input
              type="text"
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
              placeholder="https://example.com"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-400 mb-3"
              onKeyDown={(e) => { if (e.key === 'Enter') insertLink(); if (e.key === 'Escape') setLinkDialogOpen(false); }}
              autoFocus
            />
            <div className="flex gap-2 justify-end">
              <button onClick={() => setLinkDialogOpen(false)} className="px-3 py-1.5 text-xs text-gray-500 hover:text-gray-700 border border-gray-200 rounded-lg">
                Cancel
              </button>
              <button onClick={insertLink} className="px-3 py-1.5 text-xs bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">
                Insert
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        [contenteditable] h1 { font-size: 1.5rem; font-weight: 700; margin: 0.5rem 0; }
        [contenteditable] h2 { font-size: 1.25rem; font-weight: 600; margin: 0.5rem 0; }
        [contenteditable] h3 { font-size: 1.1rem; font-weight: 600; margin: 0.4rem 0; }
        [contenteditable] blockquote { border-left: 3px solid #6366f1; padding-left: 12px; color: #6b7280; font-style: italic; margin: 0.5rem 0; }
        [contenteditable] pre { background: #f3f4f6; border-radius: 6px; padding: 10px 14px; font-family: monospace; font-size: 0.85em; margin: 0.5rem 0; overflow-x: auto; }
        [contenteditable] ul { list-style: disc; padding-left: 1.5rem; }
        [contenteditable] ol { list-style: decimal; padding-left: 1.5rem; }
        [contenteditable] a { color: #6366f1; text-decoration: underline; }
      `}</style>
    </div>
  );
}
