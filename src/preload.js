'use strict';
const { contextBridge, ipcRenderer } = require('electron');

const invoke = (ch, arg) => ipcRenderer.invoke(ch, arg);

contextBridge.exposeInMainWorld('polirec', {
    state: () => invoke('state'),
    addCourse: c => invoke('course:add', c),
    updateCourse: (id, patch) => invoke('course:update', { id, patch }),
    removeCourse: id => invoke('course:remove', id),
    reorderCourses: ids => invoke('course:reorder', ids),
    webeepCourses: () => invoke('webeep:courses'),
    sync: ids => invoke('sync', ids),
    stopSync: () => invoke('sync:stop'),
    transcribe: (courseId, keys) => invoke('transcribe', { courseId, keys }),
    cancelTranscriptions: () => invoke('transcribe:cancel'),
    notes: (courseId, key, template, provider) => invoke('notes', { courseId, key, template, provider }),
    notesBatch: (courseId, template, provider) => invoke('notes:batch', { courseId, template, provider }),
    agent: (courseId, prompt, provider) => invoke('agent', { courseId, prompt, provider }),
    recording: (courseId, key) => invoke('recording', { courseId, key }),
    saveSettings: s => invoke('settings:save', s),
    setAppearance: a => invoke('appearance', a),
    pickDir: def => invoke('pick-dir', def),
    open: (courseId, kind, file) => invoke('open', { courseId, kind, file }),
    openPath: p => invoke('open-path', p),
    openExternal: u => invoke('open-external', u),
    readFile: (courseId, kind, file) => invoke('read-file', { courseId, kind, file }),
    reveal: p => invoke('reveal', p),
    setupDetect: () => invoke('setup:detect'),
    setupInstall: rec => invoke('setup:install', rec),
    setupSkip: () => invoke('setup:skip'),
    on: cb => ipcRenderer.on('evt', (_, e) => cb(e)),
});
