import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { FileUp, LoaderCircle, Pause, Play, Square, Volume2 } from 'lucide-react';

const MAX_FILE_BYTES = 15 * 1024 * 1024;
const MAX_PAGES = 20;
const MAX_SPEECH_WORDS = 280;

function limitSpeech(text: string) {
  const words = text.trim().split(/\s+/).filter(Boolean);
  return {
    text: words.slice(0, MAX_SPEECH_WORDS).join(' '),
    wordCount: words.length,
    spokenWordCount: Math.min(words.length, MAX_SPEECH_WORDS),
  };
}

export function PdfReadAloud() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const loadIdRef = useRef(0);
  const [fileName, setFileName] = useState('');
  const [pdfText, setPdfText] = useState('');
  const [pageCount, setPageCount] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => () => {
    loadIdRef.current += 1;
    window.speechSynthesis?.cancel();
  }, []);

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    const currentLoadId = ++loadIdRef.current;
    window.speechSynthesis?.cancel();
    setIsSpeaking(false);
    setIsPaused(false);
    setFileName('');
    setPdfText('');
    setPageCount(0);
    setMessage('');

    if (file.size > MAX_FILE_BYTES) {
      setMessage('Choose a PDF smaller than 15 MB.');
      return;
    }

    setIsLoading(true);
    let destroyPdf: (() => Promise<void>) | undefined;
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const signature = new TextDecoder().decode(bytes.subarray(0, 5));
      if (signature !== '%PDF-') {
        throw new Error('This file is not a readable PDF.');
      }

      const [{ getDocument, GlobalWorkerOptions }, workerUrl] = await Promise.all([
        import('pdfjs-dist'),
        import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
      ]);
      GlobalWorkerOptions.workerSrc = workerUrl.default;
      const loadingTask = getDocument({ data: bytes });
      destroyPdf = () => loadingTask.destroy();
      const pdfDocument = await loadingTask.promise;

      if (pdfDocument.numPages > MAX_PAGES) {
        throw new Error(`This reader supports PDFs up to ${MAX_PAGES} pages.`);
      }

      const pageTexts: string[] = [];
      for (let pageNumber = 1; pageNumber <= pdfDocument.numPages; pageNumber += 1) {
        if (currentLoadId !== loadIdRef.current) return;
        const page = await pdfDocument.getPage(pageNumber);
        const content = await page.getTextContent();
        pageTexts.push(content.items.map((item) => ('str' in item ? item.str.trim() : '')).filter(Boolean).join(' '));
      }

      if (currentLoadId !== loadIdRef.current) return;
      const extracted = pageTexts.join('\n').replace(/\s+/g, ' ').trim();
      if (!extracted) {
        throw new Error('No selectable text was found. Scanned PDFs need OCR before they can be read aloud.');
      }

      setFileName(file.name);
      setPdfText(extracted);
      setPageCount(pdfDocument.numPages);
      setMessage('PDF text is ready. It stays in this browser and is not uploaded.');
    } catch (error) {
      if (currentLoadId === loadIdRef.current) {
        setMessage(error instanceof Error ? error.message : 'Could not read this PDF.');
      }
    } finally {
      await destroyPdf?.().catch(() => undefined);
      if (currentLoadId === loadIdRef.current) setIsLoading(false);
    }
  };

  const startReading = () => {
    if (!pdfText || !('speechSynthesis' in window)) {
      setMessage('Speech playback is not supported by this browser. Open the PDF in a reader with read-aloud support.');
      return;
    }

    const { text, wordCount, spokenWordCount } = limitSpeech(pdfText);
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1;
    utterance.onstart = () => {
      setIsSpeaking(true);
      setIsPaused(false);
    };
    utterance.onend = () => {
      setIsSpeaking(false);
      setIsPaused(false);
    };
    utterance.onerror = () => {
      setIsSpeaking(false);
      setIsPaused(false);
      setMessage('The browser could not play this PDF aloud. Try again or use another device voice.');
    };
    setMessage(
      wordCount > spokenWordCount
        ? `Reading the first ${spokenWordCount} of ${wordCount} words to stay within the two-minute limit.`
        : `Reading ${spokenWordCount} words with your device voice.`,
    );
    window.speechSynthesis.speak(utterance);
  };

  const stopReading = () => {
    window.speechSynthesis?.cancel();
    setIsSpeaking(false);
    setIsPaused(false);
    setMessage('Playback stopped.');
  };

  const togglePause = () => {
    if (isPaused) {
      window.speechSynthesis?.resume();
      setIsPaused(false);
    } else if (isSpeaking) {
      window.speechSynthesis?.pause();
      setIsPaused(true);
    }
  };

  const speech = limitSpeech(pdfText);

  return (
    <section className="no-print mt-4 rounded-xl border border-[#d9d5e1] bg-white p-4" aria-label="Read a saved PDF aloud" data-testid="pdf-read-aloud">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-[#292e46]">Read a saved PDF aloud</h3>
          <p className="mt-1 text-sm leading-relaxed text-[#514e5c]">
            Select a text-based PDF. It is processed in this browser; no Tavily or AI request is made.
          </p>
        </div>
        {fileName && (
          <span className="max-w-full break-all rounded-full bg-[#f1eef7] px-3 py-1 text-sm font-medium text-[#51466f]">
            {fileName}
          </span>
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="application/pdf,.pdf"
        onChange={handleFileChange}
        className="sr-only"
        aria-label="Choose a PDF to read aloud"
        data-testid="input-pdf-read-aloud"
      />
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={isLoading}
          className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-[#c9bfdc] bg-[#f7f4fb] px-4 py-2 text-sm font-semibold text-[#463a67] hover:bg-[#eee8f7] disabled:cursor-wait disabled:opacity-70"
          data-testid="button-choose-pdf"
        >
          {isLoading ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> : <FileUp className="h-4 w-4" aria-hidden="true" />}
          {isLoading ? 'Reading PDF…' : 'Choose PDF'}
        </button>
        <button
          type="button"
          onClick={startReading}
          disabled={!pdfText || isLoading}
          className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-[#cde0d4] bg-[#edf6f0] px-4 py-2 text-sm font-semibold text-[#32634a] hover:bg-[#e2f0e7] disabled:cursor-not-allowed disabled:opacity-50"
          data-testid="button-read-pdf"
        >
          <Volume2 className="h-4 w-4" aria-hidden="true" /> Read PDF aloud
        </button>
        <button
          type="button"
          onClick={togglePause}
          disabled={!isSpeaking}
          className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-[#d8d2df] bg-[#f7f6f3] px-4 py-2 text-sm font-semibold text-[#393745] hover:bg-[#eeece8] disabled:cursor-not-allowed disabled:opacity-50"
          data-testid="button-pause-pdf-speech"
        >
          {isPaused ? <Play className="h-4 w-4" aria-hidden="true" /> : <Pause className="h-4 w-4" aria-hidden="true" />}
          {isPaused ? 'Resume' : 'Pause'}
        </button>
        <button
          type="button"
          onClick={stopReading}
          disabled={!isSpeaking}
          className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-[#e4b7b2] bg-[#fbefed] px-4 py-2 text-sm font-semibold text-[#98453e] hover:bg-[#f7e1de] disabled:cursor-not-allowed disabled:opacity-50"
          data-testid="button-stop-pdf-speech"
        >
          <Square className="h-4 w-4 fill-current" aria-hidden="true" /> Stop
        </button>
      </div>

      {pdfText && (
        <p className="mt-3 text-sm text-[#514e5c]" data-testid="text-pdf-speech-estimate">
          {pageCount} {pageCount === 1 ? 'page' : 'pages'} · {speech.spokenWordCount} of {speech.wordCount} words will be read (about {Math.ceil(speech.spokenWordCount / 2.5)} seconds).
          {speech.wordCount > speech.spokenWordCount && ' The two-minute speech limit applies.'}
        </p>
      )}
      <p className="mt-2 text-sm leading-relaxed text-[#514e5c]" role="status" aria-live="polite" data-testid="status-pdf-read-aloud">
        {message || 'Scanned image-only PDFs are not supported; use a PDF with selectable text.'}
      </p>
    </section>
  );
}
