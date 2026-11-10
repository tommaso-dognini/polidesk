// Components (browser, Whisper, ffmpeg, AI CLIs, optional tools) and the first-run onboarding.
// Uses globals from app.js: $, $$, esc, icon, api, guard, toast, go, refresh, S, field, sw, openAddCourse.

window.DepsUI = (() => {
    const busy = {};          // id → true while installing
    const logs = {};          // id → last log line
    let views = [];           // containers currently showing the list

    const GROUPS = [['base', 'Essenziali'], ['ai', 'Strumenti AI'], ['extra', 'Facoltativi']];

    function row(c, opt) {
        const st = c.ok ? 'ok' : c.need === 'optional' || c.need === 'ai' ? 'opt' : c.need === 'recommended' ? 'warn' : 'err';
        const badge = { ok: icon('check'), opt: '', warn: '!', err: '!' }[st];
        let ctl = '';
        if (busy[c.id]) ctl = `<span class="faint dp-log"><span class="spin"></span> ${esc(logs[c.id] || 'Installo…')}</span>`;
        else if (c.ok) {
            ctl = c.loginCmd ? `<button class="small" data-login="${esc(c.loginCmd)}" title="Apre il Terminale con «${esc(c.loginCmd)}» per accedere">Accedi…</button>` : '';
            if (c.setup && !opt.onboarding) ctl += `<button class="small" data-setup>Riconfigura…</button>`;
            ctl += '<span class="pill ok">Pronto</span>';
        } else {
            if (c.setup) ctl += `<button class="small primary" data-setup>${esc(c.autoLabel)}</button>`;
            else if (c.auto) ctl += `<button class="small primary" data-inst="${esc(c.id)}">${esc(c.autoLabel || 'Installa')}</button>`;
            if (c.cmd && !c.auto) ctl += `<button class="small" data-copy="${esc(c.cmd)}" title="${esc(c.cmd)}">${icon('copy')} Comando</button>`;
            if (c.url) ctl += `<button class="small ghost" data-url="${esc(c.url)}">Sito ↗</button>`;
        }
        const detail = c.ok ? (c.detail ? `<span class="dp-detail">${esc(c.detail)}</span>` : '') : `<span class="dp-detail ${st}">${{ err: 'Mancante: serve per usare PoliDesk', warn: 'Non configurata', opt: c.need === 'ai' ? 'Non installato' : 'Non installato (facoltativo)' }[st]}</span>`;
        return `<div class="field dp-row" data-id="${esc(c.id)}"><label><span class="dp-st ${st}">${badge}</span><span><b>${esc(c.label)}</b>${detail}<div class="help">${esc(c.what)}</div>${!c.ok && c.cmd && c.auto && !busy[c.id] ? `<div class="help">Oppure nel ${navigator.platform.startsWith('Win') ? 'PowerShell' : 'Terminale'}: <code>${esc(c.cmd)}</code></div>` : ''}</span></label><div class="ctl">${ctl}</div></div>`;
    }

    async function render(box, opt = {}) {
        if (!box) return;
        if (!views.some(x => x.box === box)) views.push({ box, opt });
        views = views.filter(x => x.box.isConnected);
        let list;
        try { list = await api.deps.status(); } catch (e) { box.innerHTML = `<div class="field"><span class="pill err">${esc(e.message)}</span></div>`; return; }
        if (opt.only) list = list.filter(c => opt.only.includes(c.id) || opt.only.includes(c.group));
        box._deps = list;
        const groups = opt.flat ? [['', '']] : GROUPS;
        box.innerHTML = groups.map(([g, l]) => {
            const items = list.filter(c => !g || c.group === g);
            if (!items.length) return '';
            return (l && !opt.flat ? `<div class="dp-gh">${l}</div>` : '') + items.map(c => row(c, opt)).join('');
        }).join('') + (opt.flat ? '' : `<div class="field"><span class="faint">Hai installato qualcosa da solo?</span><div class="ctl"><button class="small ghost" data-rescan>${icon('refresh')} Ricontrolla</button></div></div>`);
        wire(box, opt);
        if (opt.onChange) opt.onChange(list);
    }

    function wire(box, opt) {
        $$('[data-inst]', box).forEach(b => b.onclick = () => install(b.dataset.inst));
        $$('[data-copy]', box).forEach(b => b.onclick = () => { api.copy(b.dataset.copy); toast('Comando copiato: incollalo nel terminale'); });
        $$('[data-url]', box).forEach(b => b.onclick = () => api.openExternal(b.dataset.url));
        $$('[data-login]', box).forEach(b => b.onclick = () => guard(async () => { await api.deps.terminal(b.dataset.login); toast('Completa l\'accesso nel Terminale, poi torna qui', 5000); }));
        $$('[data-setup]', box).forEach(b => b.onclick = () => opt.onSetup ? opt.onSetup() : (render.skippedSetup = false, go({ name: 'setup', step: 'trascrizione' })));
        const rs = $('[data-rescan]', box); if (rs) rs.onclick = () => guard(async () => { await api.aiRescan(); await redraw(); toast('Ricontrollato'); });
    }

    async function redraw() { for (const x of views.filter(x => x.box.isConnected)) await render(x.box, x.opt); }

    async function install(id) {
        busy[id] = true; logs[id] = 'Preparo…'; redraw();
        try {
            await api.deps.install(id);
            toast('Installato ✓');
            if (id.startsWith('ai:')) { S.tools.ai = await api.aiRescan(); toast('Installato ✓ Ora premi «Accedi…» per collegare il tuo account', 6000); }
        } catch (e) { toast('Installazione non riuscita: ' + e.message, 7000); }
        finally { delete busy[id]; delete logs[id]; await refresh().catch(() => { }); redraw(); }
    }

    function onEvent(e) {
        if (e.type === 'deps-log' && busy[e.id]) {
            logs[e.id] = String(e.line || '').slice(0, 90);
            for (const x of views) { const el = x.box.isConnected && $(`.dp-row[data-id="${CSS.escape(e.id)}"] .dp-log`, x.box); if (el) el.innerHTML = `<span class="spin"></span> ${esc(logs[e.id])}`; }
        }
    }
    return { render, onEvent, install, redraw };
})();
api.on(e => { if (e.type === 'deps-log') DepsUI.onEvent(e); });

// ═════════════ onboarding (first run, or Impostazioni → Generale → Rivedi la configurazione) ═════════════
const OB_STEPS = [
    ['benvenuto', 'Benvenuto'],
    ['account', 'Account'],
    ['componenti', 'Componenti'],
    ['trascrizione', 'Trascrizione'],
    ['ai', 'AI'],
    ['corsi', 'Corsi'],
];
const OB = { step: 0, hw: null };

window.extraViews.setup = v => {
    const want = OB_STEPS.findIndex(s => s[0] === route.step);
    OB.step = want >= 0 ? want : (S.settings.setupDone ? OB.step : 0);
    v.innerHTML = `<div class="ob"><div class="ob-card">
        <ol class="ob-dots">${OB_STEPS.map(([k, l], i) => `<li data-i="${i}"><span></span>${l}</li>`).join('')}</ol>
        <div class="ob-body" id="ob-body"></div>
        <div class="ob-foot"><button class="ghost" id="ob-skip"></button><span class="grow"></span><button id="ob-back">Indietro</button><button class="primary" id="ob-next">Continua</button></div>
    </div></div>`;
    obDraw(v);
};

function obGo(v, i) { OB.step = Math.max(0, Math.min(OB_STEPS.length - 1, i)); obDraw(v); }
async function obFinish() {
    await api.saveSettings({ setupDone: true });
    await refresh();
    render.skippedSetup = true;
    $('#view').dataset.view = '';
    go({ name: 'dashboard' });
}

function obDraw(v) {
    const [key] = OB_STEPS[OB.step];
    const body = $('#ob-body', v), next = $('#ob-next', v), back = $('#ob-back', v), skip = $('#ob-skip', v);
    $$('.ob-dots li', v).forEach((li, i) => { li.classList.toggle('on', i === OB.step); li.classList.toggle('done', i < OB.step); li.onclick = () => i < OB.step && obGo(v, i); });
    back.classList.toggle('hidden', OB.step === 0);
    back.onclick = () => obGo(v, OB.step - 1);
    next.disabled = false; next.textContent = 'Continua';
    next.onclick = () => obGo(v, OB.step + 1);
    skip.textContent = S.settings.setupDone ? 'Chiudi' : 'Salta la configurazione';
    skip.onclick = () => guard(obFinish);
    const s = S.settings;
    const hero = (ic, col, title, sub) => `<div class="ob-hero"><span class="ob-ic" style="background:${col}">${icon(ic)}</span><h1>${title}</h1><p>${sub}</p></div>`;

    if (key === 'benvenuto') {
        body.innerHTML = hero('book', 'linear-gradient(135deg,#0a84ff,#5e5ce6)', 'Benvenuto in PoliDesk', 'Tutto quello che ti serve per studiare al Politecnico, in un\'app sola. Configuriamola insieme: ci vogliono un paio di minuti.')
            + `<div class="ob-feats">${[
                ['video', '#ff9500', 'Lezioni registrate', 'Scaricate da WeBeep o guardate in streaming, trascritte sul tuo computer'],
                ['sparkles', '#af52de', 'Appunti con l\'AI', 'Sommari, appunti, flashcard e domande d\'esame per ogni lezione'],
                ['calendar', '#ff3b30', 'Orario e aule libere', 'Il tuo calendario delle lezioni e le aule libere vicino a te'],
                ['folder', '#30b158', 'Materiale e appunti', 'Slide di WeBeep e l\'archivio degli studenti di PoliNetwork'],
            ].map(([ic, col, t, d]) => `<div class="ob-feat"><span class="ob-fi" style="background:${col}">${icon(ic)}</span><div><b>${t}</b><span>${d}</span></div></div>`).join('')}</div>
            <p class="ob-small">App non ufficiale, gratuita e open source. Non affiliata al Politecnico di Milano.</p>`;
        next.textContent = 'Inizia';
    }

    if (key === 'account') {
        body.innerHTML = hero('users', '#0a84ff', 'Il tuo account PoliMi', 'Accedi sempre dalla pagina ufficiale del Politecnico: PoliDesk non vede né salva la tua password.')
            + `<div class="gcard ob-form">
                ${field('Email PoliMi', 'Serve per completare in automatico il login WebEx', `<input id="ob-email" value="${esc(s.polimiEmail || '')}" placeholder="nome.cognome@mail.polimi.it">`)}
                ${field('Cartella dei corsi', 'Dove salvare lezioni, trascrizioni e materiale', `<input id="ob-root" value="${esc(s.defaultRoot || '')}"><button id="ob-rootp">Sfoglia…</button>`)}
            </div>`;
        $('#ob-rootp', body).onclick = async () => { const d = await api.pickDir($('#ob-root', body).value); if (d) $('#ob-root', body).value = d; };
        next.onclick = () => guard(async () => {
            const email = $('#ob-email', body).value.trim();
            if (email && !/^[^@\s]+@(mail\.)?polimi\.it$/i.test(email) && !confirm('L\'email non sembra un indirizzo PoliMi (…@mail.polimi.it). Continuare comunque?')) return;
            await api.saveSettings({ polimiEmail: email, defaultRoot: $('#ob-root', body).value.trim() });
            await refresh(); obGo(v, OB.step + 1);
        });
    }

    if (key === 'componenti') {
        body.innerHTML = hero('box', '#636366', 'Componenti', 'Controllo cosa c\'è già sul computer. Quello che manca si installa con un clic, solo per PoliDesk, senza permessi di amministratore.')
            + '<div class="gcard" id="ob-deps"><div class="field"><span class="faint"><span class="spin"></span> Controllo il sistema…</span></div></div>';
        const box = $('#ob-deps', body);
        DepsUI.render(box, {
            onboarding: true, flat: true, only: ['browser', 'ffmpeg', 'extra'],
            onChange: list => { const b = list.find(c => c.id === 'browser'); next.textContent = b && !b.ok ? 'Continua senza browser' : 'Continua'; },
        });
    }

    if (key === 'trascrizione') obTranscription(v, body, next);

    if (key === 'ai') {
        body.innerHTML = hero('sparkles', 'linear-gradient(135deg,#af52de,#ff2d55)', 'Strumenti AI', 'Sommari e appunti li scrive uno strumento AI che usi già, con il tuo account: PoliDesk non ha un suo abbonamento. Basta uno dei tre; Antigravity CLI ha una quota gratuita con l\'account Google.')
            + '<div class="gcard" id="ob-ai"></div><div class="gcard ob-form" id="ob-prov"></div>';
        const drawProv = list => {
            const inst = list.filter(c => c.ok);
            const cur = s.ai.provider;
            $('#ob-prov', body).innerHTML = inst.length ? field('Usa per PoliDesk', 'Puoi cambiarlo quando vuoi in Impostazioni → Intelligenza artificiale', `<select id="ob-pv">${inst.map(c => `<option value="${esc(c.id.slice(3))}" ${cur === c.id.slice(3) ? 'selected' : ''}>${esc(c.label)}</option>`).join('')}</select>`) : '';
            next.textContent = inst.length ? 'Continua' : 'Più tardi';
        };
        DepsUI.render($('#ob-ai', body), { onboarding: true, flat: true, only: ['ai'], onChange: drawProv });
        next.onclick = () => guard(async () => { const pv = $('#ob-pv', body); if (pv) { await api.saveSettings({ ai: { ...S.settings.ai, provider: pv.value } }); await refresh(); } obGo(v, OB.step + 1); });
    }

    if (key === 'corsi') {
        const list = () => S.courses.length ? `<div class="gcard">${S.courses.map(c => field(`${icon('book')} ${esc(cname(c))}`, esc(c.dir || ''), '<span class="pill ok">aggiunto</span>')).join('')}</div>` : '';
        body.innerHTML = hero('book', '#30b158', 'I tuoi corsi', 'Scegli i corsi da seguire tra quelli a cui sei iscritto su WeBeep. Per ognuno puoi decidere se scaricare le lezioni o guardarle in streaming.')
            + `<div id="ob-courses">${list()}</div><div class="ob-center"><button class="primary" id="ob-add">${icon('plus')} Aggiungi un corso</button></div>`;
        $('#ob-add', body).onclick = () => openAddCourse();
        const t = setInterval(() => { if (!body.isConnected || OB_STEPS[OB.step][0] !== 'corsi') return clearInterval(t); $('#ob-courses', body).innerHTML = list(); }, 1500);
        next.textContent = 'Fine';
        next.onclick = () => guard(obFinish);
    }
}

async function obTranscription(v, body, next) {
    body.innerHTML = `<div class="ob-hero"><span class="ob-ic" style="background:#ff9500">${icon('mic')}</span><h1>Trascrizione delle lezioni</h1><p>PoliDesk trasforma le lezioni in testo direttamente sul tuo computer: l'audio non viene inviato a nessuno. Scelgo il motore più adatto al tuo hardware.</p></div>
        <div id="ob-tr"><div class="gcard"><div class="field"><span class="faint"><span class="spin"></span> Analizzo il sistema…</span></div></div></div>`;
    const box = $('#ob-tr', body);
    const [{ hw, rec }, deps] = await Promise.all([api.setupDetect(), api.deps.status().catch(() => [])]);
    if (!body.isConnected) return;
    const w = deps.find(c => c.id === 'whisper');
    const accel = hw.appleSilicon ? 'Apple Silicon (GPU Metal)' : hw.nvidia ? `${esc(hw.nvidia.name)} · ${hw.nvidia.vramGB} GB` : 'processore (CPU)';
    const sizes = { tiny: '75 MB', base: '150 MB', small: '500 MB', medium: '1,5 GB', 'large-v3-turbo': '1,6 GB' };
    box.innerHTML = `<div class="gcard">
        ${field('Il tuo computer', '', `<span class="muted">${esc(hw.cpu || hw.arch)} · ${hw.ramGB} GB · ${accel}</span>`)}
        ${field('Motore consigliato', rec.engine === 'mlx' ? 'Ottimizzato per i chip Apple' : rec.cuda ? 'Usa la scheda video NVIDIA' : 'Funziona su qualsiasi computer', `<b>${rec.engine === 'mlx' ? 'mlx-whisper' : 'faster-whisper'}</b>`)}
        ${field('Precisione', 'Un modello più grande sbaglia meno parole ma è più lento', `<select id="ob-model">${['tiny', 'base', 'small', 'medium', 'large-v3-turbo'].map(m => `<option value="${m}" ${m === rec.model ? 'selected' : ''}>${m}${m === rec.model ? ' (consigliato)' : ''} · ${sizes[m]}</option>`).join('')}</select>`)}
        ${field('Trascrivi automaticamente', 'Dopo ogni nuova lezione', sw('ob-auto', S.settings.transcription.auto !== false))}
        ${w && w.ok ? field('Stato', '', `<span class="pill ok">✓ già configurata · ${esc(w.detail || '')}</span>`) : ''}
    </div>
    <div class="steps" id="ob-steps"></div><pre class="setup-log hidden" id="su-log"></pre>`;
    const installed = w && w.ok;
    next.textContent = installed ? 'Continua' : 'Installa (circa 5 minuti)';
    const skip = $('#ob-skip', v);
    if (!installed) { skip.textContent = 'Più tardi'; skip.onclick = () => guard(async () => { await api.saveSettings({ transcription: { ...S.settings.transcription, auto: false } }); await refresh(); obGo(v, OB.step + 1); }); }
    next.onclick = () => guard(async () => {
        const model = $('#ob-model', box).value, auto = $('#ob-auto', box).checked;
        if (installed && model === S.settings.transcription.model) { await api.saveSettings({ transcription: { ...S.settings.transcription, auto } }); await refresh(); return obGo(v, OB.step + 1); }
        const steps = { python: 'Ambiente Python privato', engine: 'Motore di trascrizione', model: 'Modello' };
        $('#ob-steps', box).innerHTML = Object.entries(steps).map(([k, l]) => `<div class="step" id="st-${k}"><span class="s faint">○</span><span>${l}</span><span class="grow"></span><span class="muted d"></span></div>`).join('');
        $('#su-log', box).classList.remove('hidden');
        next.disabled = true; $('#ob-back', v).disabled = true; next.textContent = 'Installo…';
        try {
            await api.setupInstall({ ...rec, model });
            await api.saveSettings({ transcription: { ...S.settings.transcription, auto } });
            await refresh(); toast('Trascrizione pronta ✓');
            obGo(v, OB.step + 1);
        } finally { next.disabled = false; $('#ob-back', v).disabled = false; }
    });
}
