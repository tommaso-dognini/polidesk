'use strict';
// Read-only discovery across all enrolled WeBeep courses (no downloads).
//   node scripts/discover-all.js [outFile]
const fs = require('fs');
const { Session } = require('../src/core/browser');
const webeep = require('../src/core/webeep');
const recman = require('../src/core/recman');
const lib = require('../src/core/library');

(async () => {
    const cfg = lib.loadConfig();
    const s = new Session({ email: cfg.settings.polimiEmail });
    const report = [];
    try {
        const courses = (await webeep.enrolledCourses(s)).sort((a, b) => b.id - a.id);
        for (const c of courses) {
            const row = { id: c.id, name: c.fullname, sources: [], archives: [] };
            console.log(`\n■ ${c.id} ${c.fullname}`);
            try {
                const sources = await webeep.findRecordingSources(s, c, m => console.log(m));
                row.sources = sources;
                for (const src of sources) console.log(`  • [${src.type}/${src.confidence}] ${src.label} → ${src.url.slice(0, 100)}`);
                for (const src of sources.filter(x => x.type === 'recman')) {
                    try {
                        const recs = await recman.listRecordings(s, src.url);
                        row.archives.push({ url: src.url, label: src.label, count: recs.length, first: recs[0] });
                        console.log(`    → ${recs.length} registrazioni (${src.label})`);
                    } catch (e) { row.archives.push({ url: src.url, error: e.message }); console.log('    ✗', e.message); }
                }
                if (!sources.length) console.log('  ⚠ nessuna sorgente');
            } catch (e) { row.error = e.message; console.log('  ✗', e.message); }
            report.push(row);
        }
    } finally { await s.close(); }
    fs.writeFileSync(process.argv[2] || 'discovery.json', JSON.stringify(report, null, 2));
})();
