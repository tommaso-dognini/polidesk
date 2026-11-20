// Editor bundle for the renderer (built with esbuild → src/renderer/vendor/editor.js)
// CodeMirror 6 (MIT) · markdown-it (MIT) · KaTeX (MIT)
import { EditorView, keymap, placeholder, Decoration, ViewPlugin, WidgetType } from '@codemirror/view';
import { EditorState, Compartment, Prec } from '@codemirror/state';
import { basicSetup } from 'codemirror';
import { markdown } from '@codemirror/lang-markdown';
import { StreamLanguage, HighlightStyle, syntaxHighlighting, bracketMatching, syntaxTree } from '@codemirror/language';
import { stex } from '@codemirror/legacy-modes/mode/stex';
import { tags as t } from '@lezer/highlight';
import { autocompletion, completionKeymap, closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete';
import { setDiagnostics, lintGutter, linter } from '@codemirror/lint';
import { indentMore, indentLess } from '@codemirror/commands';
import MarkdownIt from 'markdown-it';
import katex from 'katex';
import { unifiedMergeView, getChunks, acceptChunk, rejectChunk } from '@codemirror/merge';

// --- Typst: small stream mode (headings, functions, math, strings, comments, markup) ---
const typstMode = {
    startState: () => ({ math: false, comment: false }),
    token(stream, st) {
        if (st.comment) { if (stream.match(/.*?\*\//)) st.comment = false; else stream.skipToEnd(); return 'comment'; }
        if (stream.match('/*')) { st.comment = true; return 'comment'; }
        if (stream.match('//')) { stream.skipToEnd(); return 'comment'; }
        if (stream.peek() === '$') { stream.next(); st.math = !st.math; return 'keyword'; }
        if (st.math) { stream.next(); return 'number'; }
        if (stream.sol() && stream.match(/=+\s.*/)) return 'heading';
        if (stream.match(/#[a-zA-Z_][\w-]*(\.[\w-]+)*/)) return 'keyword';
        if (stream.match(/"(?:[^"\\]|\\.)*"/)) return 'string';
        if (stream.match(/\*[^*\n]+\*/)) return 'strong';
        if (stream.match(/_[^_\n]+_/)) return 'emphasis';
        if (stream.match(/<[\w-]+>|@[\w-]+/)) return 'link';
        if (stream.match(/\d+(\.\d+)?(pt|cm|mm|em|%)?/)) return 'number';
        stream.next(); return null;
    },
};

const hl = HighlightStyle.define([
    { tag: t.heading, fontWeight: '700', color: 'var(--accent)' },
    { tag: [t.strong], fontWeight: '700' },
    { tag: [t.emphasis], fontStyle: 'italic' },
    { tag: [t.keyword, t.tagName], color: 'var(--cm-keyword, #c2185b)' },
    { tag: [t.string, t.special(t.string)], color: 'var(--cm-string, #2e7d32)' },
    { tag: [t.number, t.atom], color: 'var(--cm-number, #6a1b9a)' },
    { tag: [t.comment], color: 'var(--faint)', fontStyle: 'italic' },
    { tag: [t.link, t.url], color: 'var(--accent)', textDecoration: 'underline' },
    { tag: [t.monospace], fontFamily: 'var(--font-mono)' },
    { tag: [t.quote], color: 'var(--muted)' },
]);

const theme = EditorView.theme({
    '&': { height: '100%', fontSize: '14px', backgroundColor: 'transparent', color: 'var(--text)' },
    '.cm-scroller': { fontFamily: 'var(--editor-font, var(--font-mono))', lineHeight: '1.65' },
    '.cm-content': { padding: '18px 0', caretColor: 'var(--accent)' },
    '.cm-line': { padding: '0 22px' },
    '.cm-gutters': { backgroundColor: 'transparent', border: 'none', color: 'var(--faint)' },
    '.cm-activeLine, .cm-activeLineGutter': { backgroundColor: 'var(--hover)' },
    '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection': { backgroundColor: 'var(--accent-soft) !important' },
    '.cm-cursor': { borderLeftColor: 'var(--accent)' },
    '.cm-panels': { backgroundColor: 'var(--panel)', color: 'var(--text)' },
    '.cm-tooltip': { backgroundColor: 'var(--elev)', border: '1px solid var(--line)' },
    '.cm-error-line': { backgroundColor: 'color-mix(in srgb, var(--err) 14%, transparent)' },
});

function langFor(kind) {
    if (kind === 'latex') return StreamLanguage.define(stex);
    if (kind === 'typst') return StreamLanguage.define(typstMode);
    return markdown();
}

const latexWords = ['section','subsection','subsubsection','chapter','paragraph','begin','end','label','ref','eqref','cite','textbf','textit','emph','frac','sqrt','sum','int','prod','infty','alpha','beta','gamma','theta','lambda','mu','pi','sigma','omega','includegraphics','usepackage','documentclass','item','itemize','enumerate','align','equation','figure','table','caption','centering'];
const typstWords = ['set','show','let','import','include','figure','table','heading','image','text','math','align','grid','list','enum','raw','link','strong','emph','underline','sqrt','frac','sum','integral','infinity','alpha','beta','gamma','theta','lambda','mu','pi','sigma','omega'];
function completeFor(kind) {
    return context => {
        const line = context.state.doc.lineAt(context.pos), before = line.text.slice(0, context.pos - line.from);
        const citeMatch = kind === 'latex' && before.match(/\\(?:ref|eqref|cite)\{([\w:.-]*)$/);
        const m = citeMatch || (kind === 'latex' ? before.match(/\\(?:begin\{)?([\w]*)$/) : before.match(/#([\w.]*)$/));
        if (!m) return null;
        const words = kind === 'latex' ? latexWords : typstWords;
        const source = context.state.doc.toString();
        const refs = kind === 'latex' ? [...source.matchAll(/\\(?:label|bibitem)\{([^}]+)\}/g)].map(x => x[1]) : [];
        const cites = kind === 'latex' ? [...source.matchAll(/\\(?:bibitem|citation)\{([^}]+)\}/g)].flatMap(x => x[1].split(',')) : [];
        const envs = kind === 'latex' ? ['itemize','enumerate','equation','align','figure','table','theorem','proof','center','tabular'] : [];
        const list = (citeMatch ? [...new Set([...refs, ...cites])] : [...new Set([...words, ...envs, ...refs, ...cites])]).map(label => ({
            label, type: refs.includes(label) || cites.includes(label) ? 'text' : 'keyword',
            apply: citeMatch ? label : kind === 'typst' && ['figure','table','set','show'].includes(label) ? (v, c, from, to) => {
                const snippet = label === 'figure' ? '#figure(image("file"), caption: [])' : label === 'table' ? '#table(columns: 2, [], [], [], [])' : label === 'set' ? '#set text(size: 11pt)' : '#show heading: set text(weight: "bold")';
                v.dispatch({ changes: { from, to, insert: snippet }, selection: { anchor: from + snippet.length } });
            } : kind === 'latex' && /^(itemize|enumerate|equation|align|figure|table|theorem|proof|center|tabular)$/.test(label) ? (v, c, from, to) => {
                const line = v.state.doc.lineAt(from), prefix = line.text.slice(0, from - line.from).replace(/\\begin\{$/, '');
                const start = line.from + prefix.length;
                const body = label === 'figure' ? '\n  \\centering\n  \\includegraphics[width=0.8\\linewidth]{file}\n  \\caption{}\n  \\label{fig:}\n' : label === 'table' ? '\n  \\centering\n  \\begin{tabular}{c}\n    \\hline\n    \\\\\n    \\hline\n  \\end{tabular}\n  \\caption{}\n  \\label{tab:}\n' : label === 'proof' ? '\n  \n' : label === 'theorem' ? '\n  \\label{thm:}\n  \n' : '\n  \n';
                const text = `\\begin{${label}}${body}\\end{${label}}`;
                v.dispatch({ changes: { from: start, to, insert: text }, selection: { anchor: start + `\\begin{${label}}\n  `.length } });
            } : kind === 'latex' ? `\\${label}` : `#${label}`
        }));
        return { from: context.pos - (citeMatch ? m[1].length : m[0].length), options: list, validFor: /^[\w.]*$/ };
    };
}
function localChecks(kind, doc) {
    const text = doc.toString(), out = [], add = (at, msg) => out.push({ from: at, to: Math.min(doc.length, at + 1), severity: 'error', message: msg });
    const stack = [], pairs = { '(': ')', '[': ']', '{': '}' }, close = { ')': '(', ']': '[', '}': '{' };
    let math = false, mathAt = 0;
    for (let i = 0; i < text.length; i++) {
        if (text[i] === '$' && (i === 0 || text[i - 1] !== '\\')) { if (!math) mathAt = i; math = !math; }
        if (kind === 'latex' && text.slice(i).match(/^\\begin\s*\{/)) { const m = text.slice(i).match(/^\\begin\s*\{([^}]+)\}/); if (m) stack.push({ name: m[1], at: i }); }
        if (kind === 'latex' && text.slice(i).match(/^\\end\s*\{/)) { const m = text.slice(i).match(/^\\end\s*\{([^}]+)\}/); if (m) { const found = stack.pop(); if (!found || found.name !== m[1]) add(i, `\\end{${m[1]}} senza corrispondenza`); } }
        if (kind === 'latex' && text[i] === '{' && (i === 0 || text[i - 1] !== '\\')) stack.push({ name: '}', at: i });
        else if (kind === 'latex' && text[i] === '}' && (i === 0 || text[i - 1] !== '\\')) { const ix = stack.map(x => x.name).lastIndexOf('}'); if (ix < 0) add(i, 'Graffa chiusa senza apertura'); else stack.splice(ix, 1); }
        if (kind === 'typst' && pairs[text[i]]) stack.push({ name: pairs[text[i]], at: i });
        else if (kind === 'typst' && close[text[i]]) { const found = stack.pop(); if (!found || found.name !== text[i]) add(i, `Parentesi ${text[i]} senza corrispondenza`); }
    }
    if (math) add(mathAt, 'Simbolo $ non chiuso');
    for (const item of stack) add(item.at, kind === 'latex' && item.name !== '}' ? `\\begin{${item.name}} senza \\end` : item.name === '}' ? 'Graffa non chiusa' : `Parentesi ${item.name} non chiusa`);
    return out;
}

class TaskBox extends WidgetType {
    constructor(checked) { super(); this.checked = checked; }
    eq(other) { return other.checked === this.checked; }
    toDOM(view) { const b = document.createElement('button'); b.type = 'button'; b.className = 'cm-task-box'; b.setAttribute('aria-label', this.checked ? 'Completa' : 'Segna come completata'); b.textContent = this.checked ? '✓' : ''; b.onclick = () => { const pos = view.posAtDOM(b); const line = view.state.doc.lineAt(pos); const m = line.text.match(/^(\s*[-*+]\s+)\[([ xX])\]/); if (!m) return; const from = line.from + m[1].length; view.dispatch({ changes: { from, to: from + 3, insert: m[2] === ' ' ? '[x]' : '[ ]' } }); }; return b; }
    ignoreEvent() { return false; }
}
const markdownVisuals = ViewPlugin.fromClass(class {
    constructor(view) { this.decorations = this.build(view); }
    update(update) { if (update.docChanged || update.viewportChanged || update.selectionSet) this.decorations = this.build(update.view); }
    build(view) {
        const ranges = [], active = view.state.doc.lineAt(view.state.selection.main.head).number;
        for (const { from, to } of view.visibleRanges) for (let p = from; p <= to;) {
            const line = view.state.doc.lineAt(p), text = line.text;
            const task = text.match(/^(\s*[-*+]\s+)\[([ xX])\]/);
            if (task) {
                const a = line.from + task[1].length;
                ranges.push(Decoration.replace({ widget: new TaskBox(task[2] !== ' ') }).range(a, a + 3));
                ranges.push(Decoration.mark({ class: 'cm-md-marker' }).range(line.from, a));
            }
            const heading = text.match(/^(#{1,6})(\s+)/);
            if (heading) { ranges.push(Decoration.line({ class: `cm-md-h${heading[1].length}` }).range(line.from)); ranges.push(Decoration.mark({ class: 'cm-md-marker' }).range(line.from, line.from + heading[0].length)); }
            const list = text.match(/^(\s*(?:[-*+]\s+|\d+\.\s+|>\s+))/);
            if (list && !task) ranges.push(Decoration.mark({ class: 'cm-md-marker' }).range(line.from, line.from + list[0].length));
            if (line.number !== active) for (const m of text.matchAll(/(?:\*\*|__|\*|_|`|~~)/g)) ranges.push(Decoration.mark({ class: 'cm-md-marker' }).range(line.from + m.index, line.from + m.index + m[0].length));
            if (line.to >= to) break; p = line.to + 1;
        }
        ranges.sort((a,b) => a.from - b.from || a.startSide - b.startSide);
        return Decoration.set(ranges, true);
    }
}, { decorations: v => v.decorations });

function markdownSpace(view) {
    const r = view.state.selection.main, line = view.state.doc.lineAt(r.head), before = line.text.slice(0, r.head - line.from);
    const m = before.match(/^(#{1,3}|[-*]|\d+\.|\[\]|>|---)$/);
    if (!m) return false;
    if (m[0] === '---') { view.dispatch({ changes: { from: line.from, to: r.head, insert: '---\n' }, selection: { anchor: line.from + 4 } }); return true; }
    const replacement = ({ '#':'#', '##':'##', '###':'###', '-':'-', '*':'*', '1.':'1.', '[]':'- [ ]', '>':'>' })[m[0]];
    view.dispatch({ changes: { from: line.from, to: r.head, insert: replacement + ' ' }, selection: { anchor: line.from + replacement.length + 1 } });
    return true;
}
function markdownInput(view, from, to, inserted, onSlash) {
    const line = view.state.doc.lineAt(from), before = view.state.doc.sliceString(line.from, from), after = view.state.doc.sliceString(to, line.to);
    const proposed = before + inserted + after;
    if (inserted.endsWith('/') && !before.trim() && !after) { setTimeout(onSlash, 0); return false; }
    if (!/\s$/.test(inserted)) return false;
    const task = proposed.match(/^(\s*(?:[-*+]\s+)?)(?:\[\]|\[\s\])\s+$/);
    if (task) {
        const lead = task[1] || '';
        const normalized = /[-*+]\s+$/.test(lead) ? `${lead}[ ] ` : `${lead}- [ ] `;
        view.dispatch({ changes: { from: line.from, to: line.to, insert: normalized }, selection: { anchor: line.from + normalized.length } });
        return true;
    }
    const m = proposed.match(/^(#{1,3}|[-*]|\d+\.|>|---)\s+$/);
    if (!m) return false;
    const replacement = ({ '#':'# ', '##':'## ', '###':'### ', '-':'- ', '*':'* ', '1.':'1. ', '>':'> ', '---':'---\n' })[m[1]];
    const next = m[1] === '---' ? replacement : replacement;
    view.dispatch({ changes: { from: line.from, to: line.to, insert: next }, selection: { anchor: line.from + next.length } });
    return true;
}
function markdownEnter(view) {
    const r = view.state.selection.main, line = view.state.doc.lineAt(r.head), text = line.text;
    if (/^\s*```\s*$/.test(text)) { view.dispatch({ changes: { from: line.to, insert: '\n\n```' }, selection: { anchor: line.to + 1 } }); return true; }
    const m = text.match(/^(\s*)([-*+]\s+|\d+\.\s+)(\[[ xX]\]\s+)?(.*)$/);
    if (!m) return false;
    if (!m[4].trim()) { view.dispatch({ changes: { from: line.from, to: line.to, insert: '' } }); return true; }
    const prefix = m[2].match(/^\d+\./) ? `${(parseInt(m[2], 10) + 1)}. ` : m[2];
    const task = m[3] ? '[ ] ' : '';
    const at = r.head;
    view.dispatch({ changes: { from: at, insert: `\n${m[1]}${prefix}${task}` }, selection: { anchor: at + 1 + m[1].length + prefix.length + task.length } });
    return true;
}
function markdownBackspace(view) {
    const r = view.state.selection.main, line = view.state.doc.lineAt(r.head);
    if (r.empty && r.head === line.to && /^\s*(?:[-*+]\s+|\d+\.\s+|>\s+|[-*+]\s+\[[ xX]\]\s*)$/.test(line.text)) { view.dispatch({ changes: { from: line.from, to: line.to, insert: '' } }); return true; }
    return false;
}
function markdownIndent(view, outdent = false) {
    const r = view.state.selection.main, a = view.state.doc.lineAt(r.from).number, b = view.state.doc.lineAt(r.to).number;
    const changes = [];
    for (let n = b; n >= a; n--) { const line = view.state.doc.line(n); if (outdent) { const m = line.text.match(/^ {1,2}/); if (m) changes.push({ from: line.from, to: line.from + m[0].length, insert: '' }); } else if (/^\s*(?:[-*+]\s|\d+\.\s|>\s)/.test(line.text)) changes.push({ from: line.from, insert: '  ' }); }
    if (!changes.length) return false;
    view.dispatch({ changes }); return true;
}
function latexCloseBegin(view) {
    const r = view.state.selection.main, line = view.state.doc.lineAt(r.head), before = line.text.slice(0, r.head - line.from);
    const m = before.match(/\\begin\{([\w*]+)$/);
    if (!m) return false;
    const insert = `}\n  \n\\end{${m[1]}}`;
    const skip = view.state.doc.sliceString(r.head, r.head + 1) === '}';
    view.dispatch({ changes: { from: r.head, to: r.head + (skip ? 1 : 0), insert }, selection: { anchor: r.head + 4 } });
    return true;
}
function latexEnter(view) {
    const r = view.state.selection.main, line = view.state.doc.lineAt(r.head);
    const m = line.text.match(/^\s*\\begin\{([\w*]+)\}\s*$/);
    if (!m || r.head !== line.to) return false;
    const indent = (line.text.match(/^\s*/) || [''])[0] + '  ';
    const closing = `${line.text.match(/^\s*/)?.[0] || ''}\\end{${m[1]}}`;
    const insert = `\n${indent}\n${closing}`;
    view.dispatch({ changes: { from: line.to, insert }, selection: { anchor: line.to + 1 + indent.length } });
    return true;
}
function latexInput(view, from, to, inserted) {
    if (inserted !== '}') return false;
    const line = view.state.doc.lineAt(from), before = view.state.doc.sliceString(line.from, from), after = view.state.doc.sliceString(to, line.to);
    const m = `${before}}${after}`.match(/^\s*\\begin\{([\w*]+)\}\s*$/);
    if (!m) return false;
    const indent = (before.match(/^\s*/) || [''])[0] + '  ', closing = `${before.match(/^\s*/) || [''][0]}\\end{${m[1]}}`;
    const tail = `\n${indent}\n${closing}`;
    view.dispatch({ changes: { from, to: line.to, insert: `}${tail}` }, selection: { anchor: from + 1 + indent.length } });
    return true;
}
function create(parent, { kind = 'markdown', value = '', onChange = () => { }, onSave = () => { }, onReviewChange = () => { }, onSlash = () => { }, lineNumbers = true, wrap = true, spellcheck = true } = {}) {
    if (kind === 'markdown') parent.classList.add('cm-markdown-editor');
    const lang = new Compartment();
    const merge = new Compartment();
    let reviewing = false;
    const view = new EditorView({
        parent,
        state: EditorState.create({
            doc: value,
            extensions: [
                basicSetup, closeBrackets(), bracketMatching(),
                autocompletion({ override: kind === 'markdown' ? [] : [completeFor(kind)] }),
                kind === 'latex' || kind === 'typst' ? [lintGutter(), linter(view => localChecks(kind, view.state.doc))] : [],
                kind === 'markdown' ? markdownVisuals : [],
                EditorView.inputHandler.of((view, from, to, text) => kind === 'markdown' ? markdownInput(view, from, to, text, onSlash) : kind === 'latex' ? latexInput(view, from, to, text) : false),
                Prec.high(EditorView.domEventHandlers({ keydown(event, view) {
                    if (event.key === 'Enter' && kind === 'markdown' && markdownEnter(view)) return true;
                    if (event.key === 'Enter' && kind === 'latex' && latexEnter(view)) return true;
                    if (event.key === 'Backspace' && kind === 'markdown' && markdownBackspace(view)) return true;
                    if (event.key === '}' && kind === 'latex' && latexCloseBegin(view)) return true;
                    return false;
                } })),
                Prec.high(keymap.of([...closeBracketsKeymap, ...completionKeymap, { key: 'Mod-s', run: () => { onSave(); return true; } },
                    ...(kind === 'markdown' ? [{ key: ' ', run: markdownSpace }, { key: 'Enter', run: markdownEnter }, { key: 'Backspace', run: markdownBackspace }] : []),
                    ...(kind === 'latex' ? [{ key: '}', run: latexCloseBegin }] : []),
                    ...(kind === 'markdown' ? [{ key: 'Tab', run: v => markdownIndent(v, false) }, { key: 'Shift-Tab', run: v => markdownIndent(v, true) }] : []),
                    ...(kind === 'markdown' ? [{ key: 'Mod-b', run: v => surround(v, '**', '**') }, { key: 'Mod-i', run: v => surround(v, '*', '*') }, { key: 'Mod-u', run: v => surround(v, '<u>', '</u>') }, { key: 'Mod-e', run: v => surround(v, '`', '`') }, { key: 'Mod-k', run: v => surround(v, '[', '](url)') }] : []),
                    ...(kind === 'markdown' ? [] : [{ key: 'Tab', run: indentMore }, { key: 'Shift-Tab', run: indentLess }])])),
                lang.of(langFor(kind)), syntaxHighlighting(hl), theme, merge.of([]),
                wrap ? EditorView.lineWrapping : [], placeholder('Scrivi qui…'),
                EditorView.contentAttributes.of({ spellcheck: spellcheck ? 'true' : 'false', lang: localStorage.getItem('polidesk-spell-language') === 'en-US' ? 'en-US' : 'it-IT' }),
                EditorView.updateListener.of(u => {
                    if (u.docChanged && !reviewing) onChange(u.state.doc.toString());
                    if (reviewing && !proposing) {
                        const ch = getChunks(u.state);
                        const n = ch ? ch.chunks.length : 0;
                        onReviewChange(n);
                        if (n === 0) endReviewSoon();
                    }
                }),
                lineNumbers ? [] : EditorView.theme({ '.cm-gutters': { display: 'none' } }),
            ],
        }),
    });
    function surround(v, a, b) { const r = v.state.selection.main, s = v.state.sliceDoc(r.from, r.to); v.dispatch({ changes: { from: r.from, to: r.to, insert: a + s + b }, selection: { anchor: r.from + a.length, head: r.from + a.length + s.length } }); return true; }
    // AI suggestions shown inline as a diff; each change can be accepted / rejected
    let proposing = false, endT = null;
    // one transaction: enable the diff view against the current text AND swap in the proposal
    function propose(newDoc) {
        if (reviewing) endReview();
        const original = view.state.doc.toString();
        if (original === newDoc) return 0;
        reviewing = true; proposing = true;
        view.dispatch({
            effects: merge.reconfigure(unifiedMergeView({ original, mergeControls: (type, action) => { const b = document.createElement('button'); b.className = 'mc-' + type; b.textContent = type === 'accept' ? '✓ Accetta' : '✕ Rifiuta'; b.onmousedown = action; return b; }, highlightChanges: true, gutter: true, syntaxHighlightDeletions: true })),
            changes: { from: 0, to: view.state.doc.length, insert: newDoc },
        });
        proposing = false;
        const ch = getChunks(view.state);
        const n = ch ? ch.chunks.length : 0;
        if (!n) { endReview(); return 0; }
        onReviewChange(n);
        view.dispatch({ effects: EditorView.scrollIntoView(ch.chunks[0].fromB, { y: 'center' }) });
        return n;
    }
    function endReviewSoon() { clearTimeout(endT); endT = setTimeout(() => { const ch = getChunks(view.state); if (!ch || !ch.chunks.length) endReview(); }, 0); }
    function endReview() {
        clearTimeout(endT);
        if (!reviewing) return;
        reviewing = false;
        view.dispatch({ effects: merge.reconfigure([]) });
        onReviewChange(0);
        onChange(view.state.doc.toString());
    }
    function resolveAll(accept) {
        let ch;
        while (reviewing && (ch = getChunks(view.state)) && ch.chunks.length) {
            const c = ch.chunks[0];
            (accept ? acceptChunk : rejectChunk)(view, c.fromB);
        }
        endReview();
    }
    return {
        view,
        propose, acceptAll: () => resolveAll(true), rejectAll: () => resolveAll(false), isReviewing: () => reviewing,
        getValue: () => view.state.doc.toString(),
        prefixLine: prefix => { const r = view.state.selection.main, line = view.state.doc.lineAt(r.head); const plain = line.text.replace(/^(?:#{1,6}\s+|[-*+]\s+|\d+\.\s+|>\s+|[-*+]\s+\[[ xX]\]\s+)/, ''); view.dispatch({ changes: { from: line.from, to: line.to, insert: prefix + plain }, selection: { anchor: line.from + prefix.length + plain.length } }); view.focus(); },
        setDiagnostics: diagnostics => view.dispatch(setDiagnostics(view.state, diagnostics)),
        diagnosticsFromErrors: errors => {
            const ds = (errors || []).map(e => { const ln = Math.max(1, Math.min(Number(e.line) || 1, view.state.doc.lines)); const line = view.state.doc.line(ln); const col = Math.max(0, Number(e.col || 1) - 1); const from = Math.min(line.to, line.from + col); return { from, to: Math.min(line.to, from + 1), severity: 'error', message: String(e.msg || e.message || 'Errore di compilazione') }; });
            view.dispatch(setDiagnostics(view.state, ds));
        },
        setValue: v => view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: v } }),
        getSelection: () => { const r = view.state.selection.main; return view.state.sliceDoc(r.from, r.to); },
        replaceSelection: text => { view.dispatch(view.state.replaceSelection(text)); view.focus(); },
        insertAtCursor: text => { const p = view.state.selection.main.head; view.dispatch({ changes: { from: p, insert: text }, selection: { anchor: p + text.length } }); view.focus(); },
        append: text => { const n = view.state.doc.length; view.dispatch({ changes: { from: n, insert: text } }); },
        gotoLine: n => { const l = view.state.doc.line(Math.max(1, Math.min(n, view.state.doc.lines))); view.dispatch({ selection: { anchor: l.from }, scrollIntoView: true }); view.focus(); },
        wrapSelection: (a, b) => { const r = view.state.selection.main; const s = view.state.sliceDoc(r.from, r.to); view.dispatch({ changes: { from: r.from, to: r.to, insert: a + s + b }, selection: { anchor: r.from + a.length, head: r.from + a.length + s.length } }); view.focus(); },
        focus: () => view.focus(),
        destroy: () => { view.destroy(); parent.classList.remove('cm-markdown-editor'); },
    };
}

// --- Markdown rendering with $math$ / $$math$$ (KaTeX), task lists, wiki links [[...]] ---
const md = new MarkdownIt({ html: false, linkify: true, typographer: true, breaks: false });
function mathPlugin(mdi) {
    mdi.inline.ruler.after('escape', 'math_inline', (state, silent) => {
        const s = state.src, p = state.pos;
        if (s[p] !== '$') return false;
        const dbl = s[p + 1] === '$';
        const open = dbl ? 2 : 1;
        const end = s.indexOf(dbl ? '$$' : '$', p + open);
        if (end < 0 || end === p + open) return false;
        if (!silent) { const tok = state.push(dbl ? 'math_block_inline' : 'math_inline', 'math', 0); tok.content = s.slice(p + open, end); }
        state.pos = end + open; return true;
    });
    mdi.block.ruler.after('blockquote', 'math_block', (state, start, end, silent) => {
        const pos = state.bMarks[start] + state.tShift[start];
        if (state.src.slice(pos, pos + 2) !== '$$') return false;
        let line = start, content = state.src.slice(pos + 2, state.eMarks[start]);
        if (content.trim().endsWith('$$')) content = content.trim().slice(0, -2);
        else {
            let found = false;
            while (++line < end) {
                const l = state.src.slice(state.bMarks[line] + state.tShift[line], state.eMarks[line]);
                if (l.trim().endsWith('$$')) { content += '\n' + l.trim().slice(0, -2); found = true; break; }
                content += '\n' + l;
            }
            if (!found) return false;
        }
        if (silent) return true;
        state.line = line + 1;
        const tok = state.push('math_block', 'math', 0); tok.content = content; tok.block = true; tok.map = [start, state.line];
        return true;
    }, { alt: ['paragraph', 'reference', 'blockquote', 'list'] });
    const k = (tex, display) => { try { return katex.renderToString(tex, { displayMode: display, throwOnError: false, output: 'html' }); } catch (e) { return `<code>${mdi.utils.escapeHtml(tex)}</code>`; } };
    mdi.renderer.rules.math_inline = (tk, i) => k(tk[i].content, false);
    mdi.renderer.rules.math_block_inline = (tk, i) => k(tk[i].content, true);
    mdi.renderer.rules.math_block = (tk, i) => `<div class="math-block">${k(tk[i].content, true)}</div>`;
}
md.use(mathPlugin);
// task lists: "- [ ] x" / "- [x] x"
md.core.ruler.push('tasks', state => {
    for (const tk of state.tokens) if (tk.type === 'inline' && /^\[[ xX]\]\s/.test(tk.content)) {
        const done = /^\[[xX]\]/.test(tk.content);
        tk.children[0].content = tk.children[0].content.replace(/^\[[ xX]\]\s/, '');
        tk.children.unshift(Object.assign(new state.Token('html_inline', '', 0), { content: `<input type="checkbox" disabled ${done ? 'checked' : ''}> ` }));
    }
});
function renderMarkdown(src, { baseUrl = '' } = {}) {
    let html = md.render(src.replace(/\[\[([^\]]+)\]\]/g, (_, n) => `[${n}](#note:${encodeURIComponent(n)})`));
    if (baseUrl) html = html.replace(/(<img [^>]*src=")(?!https?:|data:|media:)([^"]+)/g, (_, a, s) => a + baseUrl + s);
    return html;
}

window.PoliEditor = { create, renderMarkdown, katex };
