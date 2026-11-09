#!/usr/bin/env python3
"""
Script per trascrivere l'audio da file video usando Whisper localmente
"""

import sys
import os
from pathlib import Path
import time
import subprocess
import shutil
from concurrent.futures import ThreadPoolExecutor, as_completed
import threading

# Codici ANSI per colore arancione
ORANGE = '\033[38;5;208m'
RESET = '\033[0m'
BOLD = '\033[1m'
GREEN = '\033[92m'
CYAN = '\033[96m'
YELLOW = '\033[93m'
RED = '\033[91m'

def check_and_install_dependencies():
    """Verifica e installa le dipendenze necessarie"""
    print(f"{CYAN}🔍 Controllo dipendenze...{RESET}\n")
    
    missing_deps = []
    
    # Verifica Whisper
    try:
        import whisper
        print(f"{GREEN}✓ Whisper installato{RESET}")
    except ImportError:
        print(f"{YELLOW}✗ Whisper non trovato{RESET}")
        missing_deps.append(("whisper", "openai-whisper"))
    
    # Verifica tqdm
    try:
        import tqdm
        print(f"{GREEN}✓ tqdm installato{RESET}")
    except ImportError:
        print(f"{YELLOW}✗ tqdm non trovato{RESET}")
        missing_deps.append(("tqdm", "tqdm"))
    
    # Verifica ffmpeg
    if shutil.which("ffmpeg") is None:
        print(f"{YELLOW}✗ ffmpeg non trovato{RESET}")
        missing_deps.append(("ffmpeg", "brew install ffmpeg"))
    else:
        print(f"{GREEN}✓ ffmpeg installato{RESET}")
    
    if not missing_deps:
        print(f"\n{GREEN}✓ Tutte le dipendenze sono installate!{RESET}\n")
        return True
    
    # Chiedi conferma per installare
    print(f"\n{YELLOW}⚠️  Alcune dipendenze mancano.{RESET}")
    print(f"\n{BOLD}Dipendenze da installare:{RESET}")
    for name, install_cmd in missing_deps:
        print(f"  • {name}")
    
    confirm = input(f"\n{CYAN}Vuoi installarle automaticamente? (S/n): {RESET}").strip().lower()
    
    if confirm and confirm not in ['s', 'si', 'sì', 'y', 'yes', '']:
        print(f"\n{RED}❌ Impossibile continuare senza le dipendenze.{RESET}")
        print(f"\n{BOLD}Per installarle manualmente:{RESET}")
        for name, install_cmd in missing_deps:
            if name == "ffmpeg":
                print(f"  {install_cmd}")
            else:
                print(f"  pip install {install_cmd} --break-system-packages")
        sys.exit(1)
    
    # Installa le dipendenze
    print(f"\n{CYAN}📦 Installazione in corso...{RESET}\n")
    
    for name, install_cmd in missing_deps:
        try:
            if name == "ffmpeg":
                print(f"{CYAN}Installazione di ffmpeg con Homebrew...{RESET}")
                # Verifica se Homebrew è installato
                if shutil.which("brew") is None:
                    print(f"\n{RED}❌ Homebrew non trovato!{RESET}")
                    print(f"{YELLOW}Installa Homebrew da: https://brew.sh{RESET}")
                    print(f"{YELLOW}Poi esegui: brew install ffmpeg{RESET}")
                    sys.exit(1)
                
                result = subprocess.run(
                    ["brew", "install", "ffmpeg"],
                    capture_output=True,
                    text=True
                )
                if result.returncode == 0:
                    print(f"{GREEN}✓ ffmpeg installato con successo{RESET}")
                else:
                    print(f"{RED}✗ Errore nell'installazione di ffmpeg{RESET}")
                    print(f"{YELLOW}Esegui manualmente: brew install ffmpeg{RESET}")
                    sys.exit(1)
            else:
                print(f"{CYAN}Installazione di {name}...{RESET}")
                result = subprocess.run(
                    [sys.executable, "-m", "pip", "install", install_cmd, "--break-system-packages"],
                    capture_output=True,
                    text=True
                )
                if result.returncode == 0:
                    print(f"{GREEN}✓ {name} installato con successo{RESET}")
                else:
                    # Prova senza --break-system-packages
                    result = subprocess.run(
                        [sys.executable, "-m", "pip", "install", install_cmd],
                        capture_output=True,
                        text=True
                    )
                    if result.returncode == 0:
                        print(f"{GREEN}✓ {name} installato con successo{RESET}")
                    else:
                        print(f"{RED}✗ Errore nell'installazione di {name}{RESET}")
                        print(f"{YELLOW}Esegui manualmente: pip install {install_cmd}{RESET}")
                        sys.exit(1)
        except Exception as e:
            print(f"{RED}✗ Errore durante l'installazione di {name}: {e}{RESET}")
            sys.exit(1)
    
    print(f"\n{GREEN}✓ Tutte le dipendenze sono state installate!{RESET}\n")
    print(f"{CYAN}Riavvio dello script...{RESET}\n")
    time.sleep(2)
    
    # Ricarica i moduli
    return True

def print_banner():
    """Stampa il banner ASCII del programma"""
    banner = """
██╗   ██╗██╗██████╗ ███████╗ ██████╗     ████████╗██████╗  █████╗ ███╗   ██╗███████╗ ██████╗██████╗ ██╗██████╗ ███████╗██████╗ 
██║   ██║██║██╔══██╗██╔════╝██╔═══██╗    ╚══██╔══╝██╔══██╗██╔══██╗████╗  ██║██╔════╝██╔════╝██╔══██╗██║██╔══██╗██╔════╝██╔══██╗
██║   ██║██║██║  ██║█████╗  ██║   ██║       ██║   ██████╔╝███████║██╔██╗ ██║███████╗██║     ██████╔╝██║██████╔╝█████╗  ██████╔╝
╚██╗ ██╔╝██║██║  ██║██╔══╝  ██║   ██║       ██║   ██╔══██╗██╔══██║██║╚██╗██║╚════██║██║     ██╔══██╗██║██╔══██╗██╔══╝  ██╔══██╗
 ╚████╔╝ ██║██████╔╝███████╗╚██████╔╝       ██║   ██║  ██║██║  ██║██║ ╚████║███████║╚██████╗██║  ██║██║██████╔╝███████╗██║  ██║
  ╚═══╝  ╚═╝╚═════╝ ╚══════╝ ╚═════╝        ╚═╝   ╚═╝  ╚═╝╚═╝  ╚═╝╚═╝  ╚═══╝╚══════╝ ╚═════╝╚═╝  ╚═╝╚═╝╚═════╝ ╚══════╝╚═╝  ╚═╝
    """
    print(ORANGE + banner + RESET)
    print(CYAN + "                                    🎥 Trascrizione Video con Whisper AI 🎙️" + RESET)
    print()

def list_video_files(directory="."):
    """Elenca i file video nella directory"""
    video_extensions = ['.mp4', '.mov', '.avi', '.mkv', '.flv', '.wmv', '.webm', '.m4v']
    video_files = []

    for file in Path(directory).iterdir():
        # Salta i file nascosti e i metadata files di macOS (._*)
        if file.name.startswith('._') or file.name.startswith('.'):
            continue
        if file.is_file() and file.suffix.lower() in video_extensions:
            video_files.append(file)

    return sorted(video_files)

def get_transcript_filename(video_path, output_format):
    """Restituisce il nome del file di trascrizione per un dato video e formato"""
    video_name = Path(video_path).stem
    output_dir = Path(video_path).parent

    if output_format == "txt":
        return output_dir / f"{video_name}_trascrizione.txt"
    elif output_format == "srt":
        return output_dir / f"{video_name}_trascrizione.srt"
    elif output_format == "vtt":
        return output_dir / f"{video_name}_trascrizione.vtt"
    elif output_format == "json":
        return output_dir / f"{video_name}_trascrizione.json"
    else:  # all
        return output_dir / f"{video_name}_trascrizione.txt"

def is_video_transcribed(video_path, output_format):
    """Controlla se un video è già stato trascritto"""
    if output_format == "all":
        # Per "all", controlla se esiste almeno il file txt
        return get_transcript_filename(video_path, "txt").exists()
    else:
        return get_transcript_filename(video_path, output_format).exists()

def get_videos_to_transcribe(directory, output_format):
    """Restituisce la lista di video che non sono ancora stati trascritti"""
    all_videos = list_video_files(directory)
    videos_to_transcribe = []

    for video in all_videos:
        if not is_video_transcribed(video, output_format):
            videos_to_transcribe.append(video)

    return videos_to_transcribe

def select_mode():
    """Interfaccia per scegliere tra modalità singola o batch"""
    print(BOLD + "🎯 MODALITÀ DI ELABORAZIONE" + RESET)
    print("=" * 60)

    print("\n1. Video singolo - Trascrivi un solo video")
    print("2. Batch - Trascrivi tutti i video in una directory")

    while True:
        choice = input(f"\n{CYAN}Scegli modalità (1/2, default=1): {RESET}").strip()
        if choice == "" or choice == "1":
            return "single"
        elif choice == "2":
            return "batch"
        else:
            print(f"{YELLOW}⚠️  Scelta non valida. Riprova.{RESET}")

def select_directory():
    """Interfaccia per selezionare una directory"""
    print(BOLD + "📁 SELEZIONE DIRECTORY" + RESET)
    print("=" * 60)

    print("\n1. Usa directory corrente")
    print("2. Inserisci percorso directory")

    choice = input(f"\n{CYAN}Scelta (1/2): {RESET}").strip()

    if choice == "1":
        return "."
    else:
        dir_path = input(f"\n{CYAN}Inserisci il percorso completo della directory: {RESET}").strip()
        dir_path = dir_path.strip("'\"")
        return dir_path

def select_video():
    """Interfaccia interattiva per selezionare il video"""
    print(BOLD + "📁 SELEZIONE VIDEO" + RESET)
    print("=" * 60)

    # Chiedi se cercare nella directory corrente o specificare un percorso
    print("\n1. Cerca video nella directory corrente")
    print("2. Inserisci percorso manuale")

    choice = input(f"\n{CYAN}Scelta (1/2): {RESET}").strip()
    
    if choice == "1":
        videos = list_video_files()
        
        if not videos:
            print(f"\n{YELLOW}⚠️  Nessun video trovato nella directory corrente.{RESET}")
            video_path = input(f"\n{CYAN}Inserisci il percorso completo del video: {RESET}").strip()
            return video_path
        
        print(f"\n{GREEN}✓ Trovati {len(videos)} video:{RESET}\n")
        for i, video in enumerate(videos, 1):
            size_mb = video.stat().st_size / (1024 * 1024)
            print(f"  {i}. {video.name} ({size_mb:.1f} MB)")
        
        while True:
            try:
                selection = int(input(f"\n{CYAN}Seleziona il numero del video: {RESET}"))
                if 1 <= selection <= len(videos):
                    return str(videos[selection - 1])
                else:
                    print(f"{YELLOW}⚠️  Numero non valido. Riprova.{RESET}")
            except ValueError:
                print(f"{YELLOW}⚠️  Inserisci un numero valido.{RESET}")
    else:
        video_path = input(f"\n{CYAN}Inserisci il percorso completo del video: {RESET}").strip()
        # Rimuovi eventuali apici
        video_path = video_path.strip("'\"")
        return video_path

def select_model():
    """Interfaccia interattiva per selezionare il modello"""
    print(f"\n{BOLD}🤖 SELEZIONE MODELLO WHISPER{RESET}")
    print("=" * 60)
    
    models = {
        "1": ("tiny", "Velocissimo (~5-8 min per 2h) - Meno accurato"),
        "2": ("base", "Veloce (~10-15 min per 2h) - Buona accuratezza ⭐ CONSIGLIATO"),
        "3": ("small", "Medio (~20-30 min per 2h) - Molto accurato"),
        "4": ("medium", "Lento (~40-60 min per 2h) - Eccellente accuratezza"),
        "5": ("large", "Molto lento (~90-120 min per 2h) - Massima precisione")
    }
    
    print()
    for key, (name, desc) in models.items():
        print(f"  {key}. {BOLD}{name.upper()}{RESET} - {desc}")
    
    while True:
        choice = input(f"\n{CYAN}Seleziona il modello (1-5, default=2): {RESET}").strip()
        if choice == "":
            return "base"
        if choice in models:
            return models[choice][0]
        print(f"{YELLOW}⚠️  Scelta non valida. Riprova.{RESET}")

def select_language():
    """Interfaccia interattiva per selezionare la lingua"""
    print(f"\n{BOLD}🌍 SELEZIONE LINGUA{RESET}")
    print("=" * 60)
    
    languages = {
        "1": ("it", "Italiano"),
        "2": ("en", "English"),
        "3": ("es", "Español"),
        "4": ("fr", "Français"),
        "5": ("de", "Deutsch"),
        "6": ("pt", "Português"),
        "7": ("auto", "Rilevamento automatico")
    }
    
    print()
    for key, (code, name) in languages.items():
        if code == "it":
            print(f"  {key}. {name} ⭐ DEFAULT")
        else:
            print(f"  {key}. {name}")
    
    while True:
        choice = input(f"\n{CYAN}Seleziona la lingua (1-7, default=1): {RESET}").strip()
        if choice == "":
            return "it"
        if choice in languages:
            lang_code = languages[choice][0]
            return None if lang_code == "auto" else lang_code
        print(f"{YELLOW}⚠️  Scelta non valida. Riprova.{RESET}")

def select_output_format():
    """Interfaccia interattiva per selezionare il formato di output"""
    print(f"\n{BOLD}💾 FORMATO DI OUTPUT{RESET}")
    print("=" * 60)
    
    formats = {
        "1": ("txt", "Testo semplice (.txt) ⭐ DEFAULT"),
        "2": ("srt", "Sottotitoli SRT (.srt) - Per video player"),
        "3": ("vtt", "Sottotitoli WebVTT (.vtt) - Per web"),
        "4": ("json", "JSON completo (.json) - Con timestamp dettagliati"),
        "5": ("all", "Tutti i formati")
    }
    
    print()
    for key, (code, desc) in formats.items():
        print(f"  {key}. {desc}")
    
    while True:
        choice = input(f"\n{CYAN}Seleziona il formato (1-5, default=1): {RESET}").strip()
        if choice == "":
            return "txt"
        if choice in formats:
            return formats[choice][0]
        print(f"{YELLOW}⚠️  Scelta non valida. Riprova.{RESET}")

def estimate_time(video_path, model_size):
    """Stima il tempo di trascrizione basato sulla durata del video"""
    try:
        import subprocess
        result = subprocess.run(
            ['ffprobe', '-v', 'error', '-show_entries', 'format=duration', 
             '-of', 'default=noprint_wrappers=1:nokey=1', video_path],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE
        )
        duration_seconds = float(result.stdout)
        duration_minutes = duration_seconds / 60
        
        # Stime basate su M4 Pro (fattori di moltiplicazione)
        time_factors = {
            "tiny": 0.04,
            "base": 0.08,
            "small": 0.17,
            "medium": 0.35,
            "large": 0.75
        }
        
        estimated_minutes = duration_minutes * time_factors.get(model_size, 0.1)
        
        return duration_minutes, estimated_minutes
    except:
        return None, None

def select_threads():
    """Interfaccia per selezionare il numero di thread per l'elaborazione parallela"""
    import multiprocessing
    max_threads = multiprocessing.cpu_count()

    print(f"\n{BOLD}⚙️  CONFIGURAZIONE THREAD{RESET}")
    print("=" * 60)
    print(f"\nCPU disponibili: {max_threads}")
    print(f"Consigliato: {max(1, max_threads // 2)} thread (per non sovraccaricare il sistema)")

    while True:
        choice = input(f"\n{CYAN}Numero di thread (1-{max_threads}, default={max(1, max_threads // 2)}): {RESET}").strip()
        if choice == "":
            return max(1, max_threads // 2)
        try:
            threads = int(choice)
            if 1 <= threads <= max_threads:
                return threads
            else:
                print(f"{YELLOW}⚠️  Inserisci un numero tra 1 e {max_threads}.{RESET}")
        except ValueError:
            print(f"{YELLOW}⚠️  Inserisci un numero valido.{RESET}")

def transcribe_video(video_path, model_size="base", language="it", output_format="txt", quiet=False):
    """
    Trascrive l'audio da un file video usando Whisper

    Args:
        video_path: percorso del file video
        model_size: dimensione del modello Whisper (tiny, base, small, medium, large)
        language: lingua dell'audio (es: 'it' per italiano, 'en' per inglese, None per auto)
        output_format: formato output ('txt', 'srt', 'vtt', 'json', 'all')
        quiet: se True, riduce l'output verboso (utile per batch mode)
    """

    # Import whisper qui (dopo il controllo dipendenze)
    import whisper
    
    # Verifica che il file esista
    if not os.path.exists(video_path):
        print(f"\n{YELLOW}❌ Errore: il file {video_path} non esiste{RESET}")
        return
    
    # Stima il tempo di elaborazione
    video_duration, estimated_time = estimate_time(video_path, model_size)

    if not quiet:
        print(f"\n{BOLD}{'=' * 60}{RESET}")
        print(f"{GREEN}🎬 Video selezionato:{RESET} {Path(video_path).name}")
        if video_duration:
            print(f"{GREEN}⏱️  Durata video:{RESET} {video_duration:.1f} minuti")
            print(f"{GREEN}⏳ Tempo stimato:{RESET} {estimated_time:.1f} minuti")
        print(f"{BOLD}{'=' * 60}{RESET}\n")

        print(f"{CYAN}📥 Caricamento del modello Whisper ({model_size.upper()})...{RESET}")

    start_load = time.time()
    model = whisper.load_model(model_size)
    load_time = time.time() - start_load

    if not quiet:
        print(f"{GREEN}✓ Modello caricato in {load_time:.1f} secondi{RESET}\n")
        print(f"{CYAN}🎙️  Inizio trascrizione...{RESET}")
    start_time = time.time()
    
    # Whisper può processare direttamente file video grazie a ffmpeg
    transcribe_options = {
        "verbose": False,
        "fp16": False  # Usa False per compatibilità con CPU (Mac Intel) o MPS (Mac Silicon)
    }
    
    if language:
        transcribe_options["language"] = language
    
    result = model.transcribe(video_path, **transcribe_options)
    
    elapsed_time = time.time() - start_time

    if not quiet:
        print(f"\n{GREEN}✓ Trascrizione completata in {elapsed_time/60:.1f} minuti!{RESET}")
    
    # Crea il nome del file di output
    video_name = Path(video_path).stem
    output_dir = Path(video_path).parent
    
    saved_files = []
    
    # Salva la trascrizione nel formato richiesto
    if output_format == "txt" or output_format == "all":
        output_file = output_dir / f"{video_name}_trascrizione.txt"
        with open(output_file, "w", encoding="utf-8") as f:
            f.write(result["text"])
        saved_files.append(("Trascrizione TXT", output_file))
    
    if output_format == "srt" or output_format == "all":
        output_file = output_dir / f"{video_name}_trascrizione.srt"
        with open(output_file, "w", encoding="utf-8") as f:
            f.write(format_as_srt(result["segments"]))
        saved_files.append(("Sottotitoli SRT", output_file))
    
    if output_format == "vtt" or output_format == "all":
        output_file = output_dir / f"{video_name}_trascrizione.vtt"
        with open(output_file, "w", encoding="utf-8") as f:
            f.write(format_as_vtt(result["segments"]))
        saved_files.append(("Sottotitoli VTT", output_file))
    
    if output_format == "json" or output_format == "all":
        import json
        output_file = output_dir / f"{video_name}_trascrizione.json"
        with open(output_file, "w", encoding="utf-8") as f:
            json.dump(result, f, ensure_ascii=False, indent=2)
        saved_files.append(("JSON completo", output_file))
    
    if not quiet:
        # Mostra i file salvati
        print(f"\n{BOLD}📁 FILE SALVATI:{RESET}")
        for desc, filepath in saved_files:
            print(f"  {GREEN}✓{RESET} {desc}: {filepath}")

        # Mostra statistiche
        word_count = len(result["text"].split())
        char_count = len(result["text"])
        print(f"\n{BOLD}📊 STATISTICHE:{RESET}")
        print(f"  • Parole trascritte: {word_count}")
        print(f"  • Caratteri: {char_count}")
        print(f"  • Lingua rilevata: {result.get('language', 'N/A').upper()}")

        # Mostra un'anteprima della trascrizione
        print(f"\n{BOLD}👁️  ANTEPRIMA TRASCRIZIONE:{RESET}")
        print("-" * 60)
        preview_text = result["text"][:500] + "..." if len(result["text"]) > 500 else result["text"]
        print(preview_text)
        print("-" * 60)

    return result


def batch_transcribe(directory, model_size="base", language="it", output_format="txt", num_threads=2):
    """
    Trascrivi tutti i video in una directory in modalità batch con elaborazione parallela

    Args:
        directory: percorso della directory contenente i video
        model_size: dimensione del modello Whisper
        language: lingua dell'audio
        output_format: formato output
        num_threads: numero di thread per l'elaborazione parallela
    """
    # Trova i video da trascrivere
    videos_to_process = get_videos_to_transcribe(directory, output_format)

    if not videos_to_process:
        print(f"\n{YELLOW}⚠️  Nessun video da trascrivere. Tutti i video sono già stati elaborati!{RESET}")
        return

    total_videos = len(videos_to_process)
    print(f"\n{GREEN}✓ Trovati {total_videos} video da trascrivere{RESET}")

    # Lock per sincronizzare l'output
    print_lock = threading.Lock()

    # Contatore progresso
    completed = {"count": 0}

    def process_video(video_path):
        """Funzione wrapper per elaborare un singolo video"""
        try:
            video_name = Path(video_path).name

            with print_lock:
                print(f"\n{CYAN}[{completed['count'] + 1}/{total_videos}] 🎬 Inizio trascrizione: {video_name}{RESET}")

            # Trascrivi il video in modalità quiet
            transcribe_video(str(video_path), model_size, language, output_format, quiet=True)

            with print_lock:
                completed["count"] += 1
                print(f"{GREEN}✓ [{completed['count']}/{total_videos}] Completato: {video_name}{RESET}")

            return True, video_name, None

        except Exception as e:
            with print_lock:
                completed["count"] += 1
                print(f"{RED}✗ [{completed['count']}/{total_videos}] Errore su {video_name}: {e}{RESET}")
            return False, video_name, str(e)

    # Esegui trascrizione parallela
    print(f"\n{BOLD}{'=' * 60}{RESET}")
    print(f"{CYAN}🚀 Avvio elaborazione parallela con {num_threads} thread...{RESET}")
    print(f"{BOLD}{'=' * 60}{RESET}")

    start_time = time.time()
    results = {"success": [], "failed": []}

    with ThreadPoolExecutor(max_workers=num_threads) as executor:
        futures = {executor.submit(process_video, video): video for video in videos_to_process}

        for future in as_completed(futures):
            success, video_name, error = future.result()
            if success:
                results["success"].append(video_name)
            else:
                results["failed"].append((video_name, error))

    elapsed_time = time.time() - start_time

    # Mostra riepilogo finale
    print(f"\n{BOLD}{'=' * 60}{RESET}")
    print(f"{BOLD}📊 RIEPILOGO ELABORAZIONE BATCH{RESET}")
    print(f"{BOLD}{'=' * 60}{RESET}")
    print(f"{GREEN}✓ Video completati:{RESET} {len(results['success'])}/{total_videos}")
    if results["failed"]:
        print(f"{RED}✗ Video falliti:{RESET} {len(results['failed'])}/{total_videos}")
        for video_name, error in results["failed"]:
            print(f"  • {video_name}: {error}")
    print(f"{CYAN}⏱️  Tempo totale:{RESET} {elapsed_time/60:.1f} minuti")
    print(f"{CYAN}⚙️  Thread utilizzati:{RESET} {num_threads}")
    print(f"{BOLD}{'=' * 60}{RESET}\n")

def format_as_srt(segments):
    """Formatta i segmenti come file SRT"""
    srt_content = []
    for i, segment in enumerate(segments, start=1):
        start = format_timestamp(segment["start"])
        end = format_timestamp(segment["end"])
        text = segment["text"].strip()
        srt_content.append(f"{i}\n{start} --> {end}\n{text}\n")
    return "\n".join(srt_content)


def format_as_vtt(segments):
    """Formatta i segmenti come file VTT"""
    vtt_content = ["WEBVTT\n"]
    for segment in segments:
        start = format_timestamp(segment["start"])
        end = format_timestamp(segment["end"])
        text = segment["text"].strip()
        vtt_content.append(f"{start} --> {end}\n{text}\n")
    return "\n".join(vtt_content)


def format_timestamp(seconds):
    """Converte secondi in formato timestamp (HH:MM:SS,mmm per SRT / HH:MM:SS.mmm per VTT)"""
    hours = int(seconds // 3600)
    minutes = int((seconds % 3600) // 60)
    secs = int(seconds % 60)
    millis = int((seconds % 1) * 1000)
    return f"{hours:02d}:{minutes:02d}:{secs:02d},{millis:03d}"


def main():
    """Funzione principale con interfaccia interattiva"""

    # Verifica e installa dipendenze prima di tutto
    check_and_install_dependencies()

    print_banner()

    try:
        # Selezione modalità (singola o batch)
        mode = select_mode()

        if mode == "batch":
            # Modalità batch
            directory = select_directory()

            if not os.path.exists(directory):
                print(f"\n{YELLOW}❌ Errore: la directory specificata non esiste.{RESET}")
                return

            if not os.path.isdir(directory):
                print(f"\n{YELLOW}❌ Errore: il percorso specificato non è una directory.{RESET}")
                return

            # Seleziona parametri comuni per tutti i video
            model_size = select_model()
            language = select_language()
            output_format = select_output_format()
            num_threads = select_threads()

            # Mostra anteprima dei video da elaborare
            videos_to_process = get_videos_to_transcribe(directory, output_format)

            if not videos_to_process:
                print(f"\n{YELLOW}⚠️  Nessun video da trascrivere in questa directory!{RESET}")
                return

            print(f"\n{BOLD}{'=' * 60}{RESET}")
            print(f"{BOLD}📋 RIEPILOGO CONFIGURAZIONE BATCH:{RESET}")
            print(f"{BOLD}{'=' * 60}{RESET}")
            print(f"  📁 Directory: {os.path.abspath(directory)}")
            print(f"  🎬 Video da elaborare: {len(videos_to_process)}")
            print(f"  🤖 Modello: {model_size.upper()}")
            print(f"  🌍 Lingua: {language.upper() if language else 'AUTO'}")
            print(f"  💾 Formato: {output_format.upper()}")
            print(f"  ⚙️  Thread: {num_threads}")
            print(f"\n  Video da trascrivere:")
            for i, video in enumerate(videos_to_process[:10], 1):  # Mostra max 10
                print(f"    {i}. {video.name}")
            if len(videos_to_process) > 10:
                print(f"    ... e altri {len(videos_to_process) - 10} video")
            print(f"{BOLD}{'=' * 60}{RESET}")

            confirm = input(f"\n{CYAN}Procedere con la trascrizione batch? (S/n): {RESET}").strip().lower()

            if confirm and confirm not in ['s', 'si', 'sì', 'y', 'yes', '']:
                print(f"\n{YELLOW}❌ Operazione annullata.{RESET}")
                return

            # Avvia la trascrizione batch
            batch_transcribe(directory, model_size, language, output_format, num_threads)

            print(f"\n{GREEN}{BOLD}🎉 ELABORAZIONE BATCH COMPLETATA! 🎉{RESET}\n")

        else:
            # Modalità singola (codice originale)
            video_path = select_video()

            if not os.path.exists(video_path):
                print(f"\n{YELLOW}❌ Errore: il file specificato non esiste.{RESET}")
                return

            model_size = select_model()
            language = select_language()
            output_format = select_output_format()

            # Conferma finale
            print(f"\n{BOLD}{'=' * 60}{RESET}")
            print(f"{BOLD}📋 RIEPILOGO CONFIGURAZIONE:{RESET}")
            print(f"{BOLD}{'=' * 60}{RESET}")
            print(f"  🎬 Video: {Path(video_path).name}")
            print(f"  🤖 Modello: {model_size.upper()}")
            print(f"  🌍 Lingua: {language.upper() if language else 'AUTO'}")
            print(f"  💾 Formato: {output_format.upper()}")
            print(f"{BOLD}{'=' * 60}{RESET}")

            confirm = input(f"\n{CYAN}Procedere con la trascrizione? (S/n): {RESET}").strip().lower()

            if confirm and confirm not in ['s', 'si', 'sì', 'y', 'yes', '']:
                print(f"\n{YELLOW}❌ Operazione annullata.{RESET}")
                return

            # Avvia la trascrizione
            transcribe_video(video_path, model_size, language, output_format)

            print(f"\n{GREEN}{BOLD}🎉 TRASCRIZIONE COMPLETATA CON SUCCESSO! 🎉{RESET}\n")

    except KeyboardInterrupt:
        print(f"\n\n{YELLOW}⚠️  Operazione interrotta dall'utente.{RESET}")
        sys.exit(0)
    except Exception as e:
        print(f"\n{YELLOW}❌ Errore durante l'esecuzione: {e}{RESET}")
        import traceback
        traceback.print_exc()


if __name__ == "__main__":
    main()
