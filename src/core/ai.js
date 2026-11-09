'use strict';
// Notes / summaries / explanations with Claude Code, Antigravity (agy) or Gemini CLI.
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { which } = require('./downloader');

const PROVIDERS = {
    claude: { bin: 'claude', label: 'Claude Code' },
    agy: { bin: 'agy', label: 'Antigravity CLI' },
    gemini: { bin: 'gemini', label: 'Gemini CLI' },
};

const TEMPLATES = {
    sommario: {
        label: 'Sommario breve (per l\'indice)',
        suffix: 'sommario',
        prompt: `Riceverai la trascrizione automatica di una lezione universitaria. Scrivi in Markdown, nella lingua della lezione:
1. UNA frase (max 30 parole) che descrive di cosa tratta la lezione;
2. da 3 a 6 bullet ("- ") con gli argomenti principali, max 12 parole ciascuno.
Niente titoli, niente introduzioni, niente altro testo.`,
    },
    appunti: {
        label: 'Appunti strutturati',
        suffix: 'appunti',
        prompt: `Sei un tutor universitario del Politecnico di Milano. Riceverai la trascrizione automatica di una lezione, che può contenere errori di riconoscimento vocale.
Scrivi APPUNTI COMPLETI e ben strutturati in Markdown, nella stessa lingua della lezione:
- titolo, poi indice degli argomenti;
- sezioni con titoli, definizioni, formule in LaTeX ($...$ / $$...$$), passaggi chiave, esempi fatti dal docente;
- correggi gli errori evidenti della trascrizione usando il contesto, senza inventare contenuti;
- segnala con "⚠️ Da verificare" i punti poco chiari;
- chiudi con "Punti chiave" (5-10 bullet) e "Possibili domande d'esame".
Rispondi SOLO con il Markdown degli appunti.`,
    },
    riassunto: {
        label: 'Riassunto breve',
        suffix: 'riassunto',
        prompt: `Riceverai la trascrizione automatica di una lezione universitaria. Scrivi un RIASSUNTO in Markdown (max ~1 pagina), nella lingua della lezione: argomenti trattati, concetti principali, collegamenti con lezioni precedenti/successive se menzionati. Rispondi SOLO con il Markdown.`,
    },
    spiegazione: {
        label: 'Spiegazione dei concetti difficili',
        suffix: 'spiegazione',
        prompt: `Riceverai la trascrizione automatica di una lezione universitaria. Individua i 3-6 concetti più difficili e spiegali in modo chiaro e intuitivo in Markdown, nella lingua della lezione: intuizione, formalizzazione (LaTeX), esempio numerico o pratico, errori comuni. Rispondi SOLO con il Markdown.`,
    },
    flashcard: {
        label: 'Flashcard / domande',
        suffix: 'flashcard',
        prompt: `Riceverai la trascrizione automatica di una lezione universitaria. Crea 15-25 flashcard in Markdown per ripassare, nella lingua della lezione, nel formato:
### D: domanda
R: risposta concisa
Includi sia domande teoriche sia di applicazione. Rispondi SOLO con il Markdown.`,
    },
};

function available() {
    const out = {};
    for (const [k, p] of Object.entries(PROVIDERS)) out[k] = { ...p, path: which(p.bin) };
    return out;
}

function env() {
    return require('./downloader').toolEnv();
}

/** Pure text-in / markdown-out run: transcript on stdin, prompt as argument, no tools. */
function runPrompt(provider, prompt, stdinText, { model = '', cwd, onChunk = () => { }, signal } = {}) {
    const p = PROVIDERS[provider];
    if (!p) return Promise.reject(new Error('Provider sconosciuto: ' + provider));
    const bin = which(p.bin);
    if (!bin) return Promise.reject(new Error(`${p.label} non trovato nel PATH`));
    let args;
    if (provider === 'claude') { args = ['-p', prompt, '--output-format', 'text']; if (model) args.push('--model', model); }
    else if (provider === 'agy') {
        // agy's print mode does not read stdin as text: inline the transcript in the prompt
        const full = stdinText ? `${prompt}\n\n<trascrizione>\n${stdinText}\n</trascrizione>` : prompt;
        stdinText = '';
        args = ['-p', full, '--output-format', 'text'];
        if (model) args.push('--model', model);
    }
    else { args = ['-p', prompt]; if (model) args.push('-m', model); }
    return new Promise((resolve, reject) => {
        const child = spawn(bin, args, { cwd: cwd || process.cwd(), env: env(), signal });
        let out = '', err = '';
        child.stdout.on('data', d => { out += d; onChunk(d.toString()); });
        child.stderr.on('data', d => err += d);
        child.on('error', reject);
        child.on('close', code => code === 0 && out.trim() ? resolve(out.trim() + '\n') : reject(new Error(`${p.label} exit ${code}: ${(err || out).slice(-500)}`)));
        child.stdin.on('error', () => { });
        child.stdin.end(stdinText || '');
    });
}

/** Agentic run inside the course folder: the CLI may read transcripts/slides and write files. */
function runAgent(provider, prompt, courseDir, { model = '', onChunk = () => { }, signal } = {}) {
    const p = PROVIDERS[provider];
    const bin = which(p.bin);
    if (!bin) return Promise.reject(new Error(`${p.label} non trovato nel PATH`));
    let args;
    if (provider === 'claude') args = ['-p', prompt, '--permission-mode', 'acceptEdits', '--allowedTools', 'Read,Glob,Grep,Write,Edit'];
    else if (provider === 'agy') args = ['-p', prompt, '--mode', 'accept-edits'];
    else args = ['-p', prompt, '--approval-mode', 'auto_edit'];
    if (model) args.push(provider === 'gemini' ? '-m' : '--model', model);
    return new Promise((resolve, reject) => {
        const child = spawn(bin, args, { cwd: courseDir, env: env(), signal });
        let out = '', err = '';
        child.stdout.on('data', d => { out += d; onChunk(d.toString()); });
        child.stderr.on('data', d => err += d);
        child.on('error', reject);
        child.stdin.end();
        child.on('close', code => code === 0 ? resolve(out) : reject(new Error(`${p.label} exit ${code}: ${(err || out).slice(-500)}`)));
    });
}

/** Generate a note for one transcript and save it in <course>/note/. Returns the file name. */
async function generateNote({ provider, model, template, transcriptPath, notesDir, title, onChunk }) {
    const t = TEMPLATES[template] || TEMPLATES.appunti;
    const text = fs.readFileSync(transcriptPath, 'utf8');
    const header = title ? `Lezione: ${title}\n\n` : '';
    fs.mkdirSync(notesDir, { recursive: true });
    const md = await runPrompt(provider, t.prompt, header + text, { model, cwd: notesDir, onChunk });
    const stem = path.basename(transcriptPath).replace(/\.(txt|srt|vtt|json)$/i, '');
    const name = `${stem} - ${t.suffix}.md`;
    fs.writeFileSync(path.join(notesDir, name), md);
    return name;
}

module.exports = { PROVIDERS, TEMPLATES, available, runPrompt, runAgent, generateNote };
