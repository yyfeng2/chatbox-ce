// The pdfjs worker build ships without type declarations. It is imported only
// to populate the globalThis.pdfjsWorker hook (see file-parser.ts loadPdfjs).
declare module 'pdfjs-dist/legacy/build/pdf.worker.mjs' {
  export const WorkerMessageHandler: unknown
}
