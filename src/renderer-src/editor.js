// Editor bundle for the renderer (built with esbuild → src/renderer/vendor/editor.js)
// CodeMirror 6 (MIT) · markdown-it (MIT) · KaTeX (MIT)
import { EditorView, keymap, placeholder } from '@codemirror/view';
import { EditorState, Compartment } from '@codemirror/state';
import { basicSetup } from 'codemirror';
import { indentWithTab } from '@codemirror/commands';
import { markdown } from '@codemirror/lang-markdown';
import { StreamLanguage, HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { stex } from '@codemirror/legacy-modes/mode/stex';
import { tags as t } from '@lezer/highlight';
import MarkdownIt from 'markdown-it';
import katex from 'katex';

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

function create(parent, { kind = 'markdown', value = '', onChange = () => { }, onSave = () => { }, lineNumbers = true, wrap = true } = {}) {
    const lang = new Compartment();
    const view = new EditorView({
        parent,
        state: EditorState.create({
            doc: value,
            extensions: [
                basicSetup, keymap.of([indentWithTab, { key: 'Mod-s', run: () => { onSave(); return true; } }]),
                lang.of(langFor(kind)), syntaxHighlighting(hl), theme,
                wrap ? EditorView.lineWrapping : [], placeholder('Scrivi qui…'),
                EditorView.updateListener.of(u => { if (u.docChanged) onChange(u.state.doc.toString()); }),
                lineNumbers ? [] : EditorView.theme({ '.cm-gutters': { display: 'none' } }),
            ],
        }),
    });
    return {
        view,
        getValue: () => view.state.doc.toString(),
        setValue: v => view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: v } }),
        getSelection: () => { const r = view.state.selection.main; return view.state.sliceDoc(r.from, r.to); },
        replaceSelection: text => { view.dispatch(view.state.replaceSelection(text)); view.focus(); },
        insertAtCursor: text => { const p = view.state.selection.main.head; view.dispatch({ changes: { from: p, insert: text }, selection: { anchor: p + text.length } }); view.focus(); },
        append: text => { const n = view.state.doc.length; view.dispatch({ changes: { from: n, insert: text } }); },
        gotoLine: n => { const l = view.state.doc.line(Math.max(1, Math.min(n, view.state.doc.lines))); view.dispatch({ selection: { anchor: l.from }, scrollIntoView: true }); view.focus(); },
        wrapSelection: (a, b) => { const r = view.state.selection.main; const s = view.state.sliceDoc(r.from, r.to); view.dispatch({ changes: { from: r.from, to: r.to, insert: a + s + b }, selection: { anchor: r.from + a.length, head: r.from + a.length + s.length } }); view.focus(); },
        focus: () => view.focus(),
        destroy: () => view.destroy(),
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
