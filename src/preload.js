'use strict';
const { contextBridge, ipcRenderer } = require('electron');

const invoke = (ch, arg) => ipcRenderer.invoke(ch, arg);

contextBridge.exposeInMainWorld('polirec', {
    state: () => invoke('state'),
    addCourse: c => invoke('course:add', c),
    updateCourse: (id, patch) => invoke('course:update', { id, patch }),
    removeCourse: id => invoke('course:remove', id),
    webeepCourses: () => invoke('webeep:courses'),
    sync: ids => invoke('sync', ids),
    stopSync: () => invoke('sync:stop'),
    transcribe: (courseId, keys) => invoke('transcribe', { courseId, keys }),
    cancelTranscriptions: () => invoke('transcribe:cancel'),
    notes: (courseId, key, template, provider) => invoke('notes', { courseId, key, template, provider }),
    notesBatch: (courseId, template, provider) => invoke('notes:batch', { courseId, template, provider }),
    agent: (courseId, prompt, provider) => invoke('agent', { courseId, prompt, provider }),
    saveSettings: s => invoke('settings:save', s),
    pickDir: def => invoke('pick-dir', def),
    open: (courseId, kind, file) => invoke('open', { courseId, kind, file }),
    readFile: (courseId, kind, file) => invoke('read-file', { courseId, kind, file }),
    reveal: p => invoke('reveal', p),
    on: cb => ipcRenderer.on('evt', (_, e) => cb(e)),
});
