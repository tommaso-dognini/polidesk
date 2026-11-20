'use strict';
/* Aule libere — layout inspired by PoliAule (PoliNetwork): filters on the left (sede, day, time range),
   rooms grouped by building with photos and status, favourites, and a campus map drawn from the
   Politecnico's own building shapes (Leaflet, no third-party tiles). */
window.noRerender.add('rooms');

const RoomsUI = { st: null, data: null, view: 'list', building: null, partial: true, map: null, photos: {} };
const H0 = 7, H1 = 20;
const pad2 = n => String(n).padStart(2, '0');
const hm = m => `${pad2(Math.floor(m / 60))}:${pad2(m % 60)}`;
const sedeShort = n => n.replace(/^Milano\s+/, '');
const STAR = '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9z"/></svg>';
const MAP = '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2z"/><path d="M9 4v14M15 6v14"/></svg>';
const LIST = '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/></svg>';

function roomsState() {
    const r = S.settings.rooms || {};
    if (!RoomsUI.st) {
        const now = new Date();
        let from = Math.max(H0 * 60, Math.min((H1 - 1) * 60, Math.ceil((now.getHours() * 60 + now.getMinutes()) / 15) * 15));
        RoomsUI.st = { sede: r.sede || 'MIA', day: 0, from, dur: r.dur || 120, favorites: r.favorites || { rooms: [], buildings: [] } };
    }
    return RoomsUI.st;
}
const saveRoomsPrefs = () => { const st = RoomsUI.st; api.saveSettings({ rooms: { ...(S.settings.rooms || {}), sede: st.sede, dur: st.dur, favorites: st.favorites } }); S.settings.rooms = { ...(S.settings.rooms || {}), sede: st.sede, dur: st.dur, favorites: st.favorites }; };

window.extraViews.rooms = async v => {
    const st = roomsState();
    const sp = await api.rooms.spaces();
    const cities = { Milano: [] };
    for (const s of sp.sedi) (cities[s.city === 'Milano' ? 'Milano' : 'Altre città'] = cities[s.city === 'Milano' ? 'Milano' : 'Altre città'] || []).push(s);
    v.innerHTML = `<div class="page wide ra-page">
        <div class="page-head"><div><h1>Aule libere</h1><div class="sub" id="r-sum">Dati pubblici del Politecnico, in tempo reale</div></div>
            <button class="ghost small ${RoomsUI.partial ? 'on' : ''}" id="r-part" title="Mostra anche le aule libere solo per una parte dell'intervallo"><span class="ra-tick">${icon('check')}</span>Anche parziali</button>
            <div class="seg" id="r-view"><button data-v="list" class="${RoomsUI.view === 'list' ? 'on' : ''}">${LIST} Elenco</button><button data-v="map" class="${RoomsUI.view === 'map' ? 'on' : ''}">${MAP} Mappa</button></div></div>
        <div class="ra">
        <aside class="ra-filters">
            <div class="ra-sec"><div class="ra-lbl">Sede</div>
                <select id="r-sede">${Object.entries(cities).map(([city, list]) => `<optgroup label="${esc(city)}">${list.map(s => `<option value="${s.id}" ${s.id === st.sede ? 'selected' : ''}>${esc(sedeShort(s.name))}</option>`).join('')}</optgroup>`).join('')}</select></div>
            <div class="ra-sec"><div class="ra-lbl">Giorno</div><div class="ra-days" id="r-days"></div></div>
            <div class="ra-sec"><div class="ra-lbl">Orario</div>
                <div class="ra-time"><span id="r-time"></span><span class="grow"></span><div class="ra-dur" title="Durata"><button id="r-dm" aria-label="Meno tempo">−</button><span id="r-dur"></span><button id="r-dp" aria-label="Più tempo">+</button></div></div>
                <div class="ra-hours" id="r-hours"></div><div class="ra-hlbl">${Array.from({ length: H1 - H0 }, (_, i) => `<span>${H0 + i}</span>`).join('')}</div>
                <div class="faint ra-hint">Clicca un'ora per scegliere l'inizio</div></div>
            <p class="faint ra-credit">Dati pubblici del Politecnico · idea di <a data-ext="https://poliaule.com">PoliAule</a> e <a data-ext="https://github.com/riccardosalemme/alpolimibot">@alpolimibot</a></p>
        </aside>
        <section class="ra-main"><div id="r-body"></div></section></div></div>`;
    $$('[data-ext]', v).forEach(a => a.onclick = () => api.openExternal(a.dataset.ext));
    $('#r-sede', v).onchange = e => { st.sede = e.target.value; RoomsUI.building = null; saveRoomsPrefs(); window.extraViews.rooms(v); };
    $('#r-part', v).onclick = () => { RoomsUI.partial = !RoomsUI.partial; $('#r-part', v).classList.toggle('on', RoomsUI.partial); drawBody(); };
    $$('#r-view button', v).forEach(b => b.onclick = () => { RoomsUI.view = b.dataset.v; $$('#r-view button', v).forEach(x => x.classList.toggle('on', x === b)); drawBody(); });
    $('#r-dm', v).onclick = () => { st.dur = Math.max(30, st.dur - 30); saveRoomsPrefs(); drawTime(); load(); };
    $('#r-dp', v).onclick = () => { st.dur = Math.min(360, st.dur + 30); saveRoomsPrefs(); drawTime(); load(); };
    drawDays(); drawTime(); load();

    function drawDays() {
        const it = [...Array(7)].map((_, i) => { const d = new Date(); d.setDate(d.getDate() + i); return d; });
        $('#r-days', v).innerHTML = it.map((d, i) => `<button class="${i === st.day ? 'on' : ''} ${d.getDay() === 0 ? 'sun' : ''}" data-d="${i}" title="${d.toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' })}"><span>${i === 0 ? 'oggi' : 'DLMMGVS'[d.getDay()]}</span><b>${d.getDate()}</b></button>`).join('');
        $$('#r-days button', v).forEach(b => b.onclick = () => { st.day = +b.dataset.d; drawDays(); load(); });
    }
    function drawTime() {
        const to = Math.min(H1 * 60, st.from + st.dur);
        $('#r-time', v).textContent = `${hm(st.from)} – ${hm(to)}`;
        $('#r-dur', v).textContent = st.dur % 60 ? `${Math.floor(st.dur / 60)}h${pad2(st.dur % 60)}` : `${st.dur / 60}h`;
        const now = new Date(), nowM = now.getHours() * 60 + now.getMinutes();
        $('#r-hours', v).innerHTML = Array.from({ length: H1 - H0 }, (_, i) => {
            const h = (H0 + i) * 60, sel = h + 60 > st.from && h < to;
            const past = st.day === 0 && h + 60 <= nowM;
            return `<button class="hr ${sel ? 'sel' : ''} ${past ? 'past' : ''}" data-h="${h}" title="Dalle ${hm(h)}">${st.day === 0 && nowM >= h && nowM < h + 60 ? `<i class="now" style="left:${(nowM - h) / 60 * 100}%"></i>` : ''}</button>`;
        }).join('');
        $$('#r-hours .hr', v).forEach(b => b.onclick = () => { st.from = Math.min(+b.dataset.h, H1 * 60 - 30); drawTime(); load(); });
    }
    async function load() {
        const body = $('#r-body', v);
        body.innerHTML = `<div class="empty-state small"><span class="spin"></span> Controllo l'occupazione delle aule…</div>`;
        const d = new Date(); d.setDate(d.getDate() + st.day); d.setHours(12, 0, 0, 0);
        const to = Math.min(H1 * 60, st.from + st.dur);
        try { RoomsUI.data = await api.rooms.status({ sede: st.sede, date: d.toISOString(), from: st.from, to }); }
        catch (e) { body.innerHTML = `<div class="empty-state">Impossibile contattare i servizi del Politecnico: ${esc(e.message)}</div>`; return; }
        const r = RoomsUI.data;
        const sede = $('#r-sede', v).selectedOptions[0];
        $('#r-sum', v).textContent = [sede ? sede.textContent : '', `${r.free} libere`, `${r.partial} parzialmente`, r.hidden ? `${r.hidden} con orario non pubblico` : ''].filter(Boolean).join(' · ');
        drawBody();
    }
    function drawBody() {
        if (!RoomsUI.data) return;
        const body = $('#r-body', v);
        if (RoomsUI.map) { RoomsUI.map.remove(); RoomsUI.map = null; }
        if (RoomsUI.view === 'map') return drawMap(body);
        const fav = st.favorites;
        const want = r => r.status === 'free' || (RoomsUI.partial && r.status === 'partial');
        const blds = RoomsUI.data.buildings.filter(b => !RoomsUI.building || b.id === RoomsUI.building);
        const favRooms = RoomsUI.data.buildings.flatMap(b => b.rooms.map(r => ({ ...r, bname: b.name }))).filter(r => fav.rooms.includes(r.id));
        const until = r => r.status === 'free' ? (r.freeUntil && r.freeUntil !== '23:59' ? `libera fino alle ${r.freeUntil}` : 'libera tutto il giorno') : r.status === 'partial' ? 'libera solo in parte' : 'occupata';
        const row = (r, bname) => `<div class="ra-room ${r.status}" data-room="${r.id}" data-b="${r.edificio}" tabindex="0">
            <span class="ra-ph" data-foto="${r.foto || ''}"></span>
            <span class="ra-n"><b>${esc(r.name)}</b><span class="faint">${[r.capienza ? r.capienza + ' posti' : '', bname ? esc(bname) : ''].filter(Boolean).join(' · ')}</span></span>
            ${timeline(r.occ)}
            <span class="pill ${r.status === 'free' ? 'ok' : r.status === 'partial' ? 'warn' : 'err'}">${until(r)}</span>
            <button class="ghost small icon ra-star ${fav.rooms.includes(r.id) ? 'on' : ''}" data-star-room="${r.id}" title="${fav.rooms.includes(r.id) ? 'Togli dalle preferite' : 'Aggiungi alle preferite'}" aria-label="Preferita">${STAR}</button></div>`;
        const group = (title, sub, extra, rows) => `<div class="ra-group"><div class="ra-gh"><b>${title}</b>${sub ? `<span class="faint">${sub}</span>` : ''}<span class="grow"></span>${extra}</div>${rows}</div>`;
        let html = '';
        if (RoomsUI.building) html += `<div class="note-line">${icon('pin')} <span class="grow">Solo l'edificio scelto sulla mappa</span><button class="small ghost" id="rb-clear">Mostra tutti</button></div>`;
        if (favRooms.length && !RoomsUI.building) html += group(`<span class="ra-favic">${STAR}</span> Preferite`, '', '', favRooms.map(r => row(r, r.bname)).join(''));
        for (const b of blds) {
            const rs = b.rooms.filter(want);
            if (!rs.length) continue;
            html += group(esc(b.name), esc(b.address), `<span class="pill ok">${b.free} libere</span>${b.partial ? `<span class="pill warn">${b.partial} parziali</span>` : ''}<button class="ghost small icon ra-star ${fav.buildings.includes(b.id) ? 'on' : ''}" data-star-b="${b.id}" title="Edificio preferito" aria-label="Edificio preferito">${STAR}</button>`, rs.map(r => row(r)).join(''));
        }
        body.innerHTML = html || `<div class="empty-state"><h2>Nessuna aula libera</h2><p>Prova a cambiare orario, ridurre la durata o attivare «Anche parziali».</p></div>`;
        if ($('#rb-clear', body)) $('#rb-clear', body).onclick = () => { RoomsUI.building = null; drawBody(); };
        $$('[data-star-room]', body).forEach(b => b.onclick = e => { e.stopPropagation(); const id = b.dataset.starRoom; fav.rooms = fav.rooms.includes(id) ? fav.rooms.filter(x => x !== id) : [...fav.rooms, id]; saveRoomsPrefs(); drawBody(); });
        $$('[data-star-b]', body).forEach(b => b.onclick = () => { const id = b.dataset.starB; fav.buildings = fav.buildings.includes(id) ? fav.buildings.filter(x => x !== id) : [...fav.buildings, id]; saveRoomsPrefs(); drawBody(); });
        $$('.ra-room', body).forEach(c => { c.onclick = () => roomDetail(c.dataset.room); c.onkeydown = e => { if (e.key === 'Enter') roomDetail(c.dataset.room); }; });
        lazyPhotos(body);
    }
    function timeline(occ) {
        const a = H0 * 60, w = (H1 - H0) * 60, to = Math.min(H1 * 60, st.from + st.dur);
        return `<div class="rtl">${(occ || []).map(o => { const s = Math.max(0, (toMin(o.start) - a) / w * 100), e = Math.min(100, (toMin(o.end) - a) / w * 100); return e > s ? `<i style="left:${s}%;width:${e - s}%"></i>` : ''; }).join('')}<b style="left:${(st.from - a) / w * 100}%;width:${(to - st.from) / w * 100}%"></b></div>`;
    }
    function roomDetail(id) {
        const b = RoomsUI.data.buildings.find(x => x.rooms.some(r => r.id === id)); const r = b.rooms.find(x => x.id === id);
        const m = modal(`<div class="rd-ph" data-foto="${r.foto || ''}"></div><h2>${esc(r.name)} <span class="pill ${r.status === 'free' ? 'ok' : r.status === 'partial' ? 'warn' : 'err'}">${{ free: 'libera', partial: 'parzialmente libera', busy: 'occupata' }[r.status]}</span></h2>
            <div class="muted">${esc(b.name)} · ${esc(b.address)}${r.capienza ? ' · ' + r.capienza + ' posti' : ''}${r.tipo ? ' · ' + esc(r.tipo) : ''}</div>
            <div class="rd-tl">${timeline(r.occ)}<div class="hours-lbl">${Array.from({ length: H1 - H0 }, (_, i) => `<span>${H0 + i}</span>`).join('')}</div></div>
            <div class="rd-occ">${(r.occ || []).length ? r.occ.map(o => `<div><b>${o.start}–${o.end}</b> ${esc(o.corso || 'Occupata')}</div>`).join('') : '<p class="muted">Nessuna occupazione registrata in questo giorno.</p>'}</div>
            <div class="foot"><button class="ghost" id="rd-ok">Chiudi</button></div>`);
        $('#rd-ok', m.el).onclick = m.close;
        lazyPhotos(m.el);
    }
    function drawMap(body) {
        body.innerHTML = `<div class="rmap-wrap"><div id="rmap" class="rmap"></div><div class="rmap-legend"><span><i class="lg free"></i>con aule libere</span><span><i class="lg partial"></i>solo parziali</span><span><i class="lg busy"></i>nessuna</span></div></div>`;
        const map = RoomsUI.map = L.map('rmap', { zoomControl: true, attributionControl: true, zoomSnap: 0.25 });
        map.attributionControl.setPrefix('').addAttribution('Edifici: Politecnico di Milano · Leaflet');
        const css = getComputedStyle(document.documentElement);
        const col = { free: css.getPropertyValue('--ok').trim(), partial: css.getPropertyValue('--warn').trim(), busy: css.getPropertyValue('--faint').trim() };
        const layers = [];
        for (const sh of RoomsUI.data.shapes || []) L.geoJSON(sh, { style: { color: col.busy, weight: 1, fillOpacity: 0.05, dashArray: '4 4' }, interactive: false }).addTo(map);
        const byId = new Map(RoomsUI.data.buildings.map(b => [b.id, b]));
        const sp2 = RoomsUI.allBuildings;
        for (const b of RoomsUI.data.buildings) {
            if (!b.geo) continue;
            const k = b.free ? 'free' : b.partial ? 'partial' : 'busy';
            const lay = L.geoJSON(b.geo, { style: { color: col[k], weight: 1.5, fillColor: col[k], fillOpacity: b.free ? Math.min(0.75, 0.3 + b.free * 0.1) : 0.35 } }).addTo(map);
            const has = b.free || b.partial;
            lay.bindTooltip(`<b>${esc(b.label || b.name)}</b>${b.free ? ` <span class="bl-n free">${b.free}</span>` : b.partial ? ` <span class="bl-n partial">${b.partial}</span>` : ''}`, { permanent: !!has, direction: 'center', className: 'blabel' + (has ? '' : ' muted') });
            lay.on('click', () => { RoomsUI.building = b.id; RoomsUI.view = 'list'; $$('#r-view button', v).forEach(x => x.classList.toggle('on', x.dataset.v === 'list')); drawBody(); });
            layers.push(lay);
        }
        const grp = L.featureGroup(layers);
        const fit = () => { map.invalidateSize(); if (layers.length) map.fitBounds(grp.getBounds(), { padding: [40, 40], maxZoom: 18 }); else map.setView([45.478, 9.227], 16); };
        fit(); requestAnimationFrame(fit); setTimeout(fit, 150);
    }
    function lazyPhotos(root) {
        const io = new IntersectionObserver(ents => ents.forEach(async e => {
            if (!e.isIntersecting) return; io.unobserve(e.target);
            const id = e.target.dataset.foto; if (!id) return;
            const url = RoomsUI.photos[id] !== undefined ? RoomsUI.photos[id] : (RoomsUI.photos[id] = await api.rooms.photo(id).catch(() => null));
            if (url) { e.target.style.backgroundImage = `url("${url}")`; e.target.classList.add('has'); }
        }), { root: null, rootMargin: '200px' });
        $$('[data-foto]', root).forEach(el => io.observe(el));
    }
};
function toMin(h) { const [a, b] = h.split(':').map(Number); return a * 60 + b; }
