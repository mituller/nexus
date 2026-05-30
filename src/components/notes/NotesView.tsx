import { useState } from "react";
import { NotesList } from "./NotesList";
import { NoteEditor } from "./NoteEditor";
import { TranscriptImport } from "./TranscriptImport";

export function NotesView() {
  const [showImport, setShowImport] = useState(false);

  return (
    <div className="flex h-full overflow-hidden">
      <div className="w-64 shrink-0">
        <NotesList onImportTranscript={() => setShowImport(true)} />
      </div>
      <NoteEditor />
      {showImport && <TranscriptImport onClose={() => setShowImport(false)} />}
    </div>
  );
}
