'use strict';
// Per-course workspace (Notion-like page): free-form course page, todos, pomodoro log.
// Stored inside the course folder (polirec-workspace.json) so it travels with the files.
// A global workspace (no course) lives in ~/.polirec/workspace.json.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { APP_DIR } = require('./paths');

const fileFor = dir => dir ? path.join(dir, 'polirec-workspace.json') : path.join(APP_DIR, 'workspace.json');

function load(dir) {
    let w = {};
    try { w = JSON.parse(fs.readFileSync(fileFor(dir), 'utf8')); } catch (e) { }
    w.page = w.page || '';            // markdown "home" of the course
    w.todos = w.todos || [];          // {id, text, done, due, lesson, createdAt, doneAt}
    w.pomodoro = w.pomodoro || [];    // {start, minutes, kind}
    w.pinned = w.pinned || [];        // pinned items: {type:'lesson'|'file'|'note', ref}
    return w;
}

function save(dir, w) {
    const f = fileFor(dir);
    fs.mkdirSync(path.dirname(f), { recursive: true });
    const tmp = f + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(w, null, 2));
    fs.renameSync(tmp, f);
    return w;
}

function update(dir, fn) { const w = load(dir); fn(w); return save(dir, w); }

const todo = {
    add: (dir, t) => update(dir, w => w.todos.push({ id: crypto.randomUUID(), text: t.text, done: false, due: t.due || null, lesson: t.lesson || null, createdAt: new Date().toISOString() })),
    set: (dir, id, patch) => update(dir, w => { const x = w.todos.find(t => t.id === id); if (x) { Object.assign(x, patch); if ('done' in patch) x.doneAt = patch.done ? new Date().toISOString() : null; } }),
    remove: (dir, id) => update(dir, w => { w.todos = w.todos.filter(t => t.id !== id); }),
};

function logPomodoro(dir, entry) {
    return update(dir, w => { w.pomodoro.push({ start: entry.start || new Date().toISOString(), minutes: entry.minutes, kind: entry.kind || 'focus' }); });
}

function stats(w) {
    const focus = w.pomodoro.filter(p => p.kind === 'focus');
    const today = new Date().toISOString().slice(0, 10);
    const weekAgo = Date.now() - 7 * 864e5;
    return {
        total: focus.reduce((a, p) => a + p.minutes, 0),
        today: focus.filter(p => p.start.slice(0, 10) === today).reduce((a, p) => a + p.minutes, 0),
        week: focus.filter(p => new Date(p.start) > weekAgo).reduce((a, p) => a + p.minutes, 0),
        sessions: focus.length,
    };
}

module.exports = { load, save, update, todo, logPomodoro, stats };
