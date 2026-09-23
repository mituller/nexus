import { BedrockConfig } from "../types";
import { extractFromNote, hasAIConfig } from "./claude";
import { linkNoteTask, markNoteExtracted } from "./notes";
import { useTaskStore } from "../stores/tasks";
import { useNotesStore } from "../stores/notes";
import { findSimilarTask, hasExactTask } from "../utils/taskMatching";

export interface AutoExtractResult {
  tasksCreated: number;
  tasksSkipped: number;
  summary: string;
}

/**
 * Unattended version of the NoteEditor "Extract with AI" flow, used by the
 * watched-folder import. There is no review step, so duplicates are skipped
 * rather than offered for merge — the same matching rules the editor applies
 * when it picks default actions.
 */
export async function autoExtractNote(
  cfg: BedrockConfig,
  noteId: string,
  title: string,
  content: string,
  isTranscript: boolean
): Promise<AutoExtractResult> {
  if (!hasAIConfig(cfg)) throw new Error("AI is not configured (check Settings → Claude AI)");

  const result = await extractFromNote(cfg, title, content, isTranscript);

  const { add: addTask } = useTaskStore.getState();
  let tasksCreated = 0;
  let tasksSkipped = 0;

  for (const t of result.tasks) {
    // Re-read tasks each iteration so tasks created in this loop dedupe too
    const { tasks } = useTaskStore.getState();
    if (hasExactTask(t.title, tasks) || findSimilarTask(t.title, tasks)) {
      tasksSkipped++;
      continue;
    }

    const created = await addTask({
      title: t.title,
      status: "open",
      priority: t.priority,
      dueDate: t.dueDate,
      tags: t.tags,
      sourceType: "transcript",
      sourceId: noteId,
    });
    await linkNoteTask(noteId, created.id);
    tasksCreated++;
  }

  await markNoteExtracted(noteId);
  useNotesStore.getState().update(noteId, { extractedAt: new Date().toISOString() });

  return { tasksCreated, tasksSkipped, summary: result.summary };
}
