// Shared "start a workout" flows so every screen behaves identically.
import { store } from './store.js';
import { navigate } from '../router.js';
import { confirmDialog, toast } from '../components/ui.js';

async function guardActive() {
  const active = store.activeSession();
  if (!active) return true;
  const resume = await confirmDialog({ title: 'Workout in progress', message: `You already have “${active.name}” running. Resume it, or finish/discard it before starting another.`, confirmLabel: 'Resume workout' });
  if (resume) navigate('/workout/active');
  return false;
}

export async function startRoutine(routine) {
  if (!(await guardActive())) return;
  const missing = routine.exercises.filter(e => !store.exercise(e.exercise_id)).length;
  await store.startSession({ routine });
  if (missing) toast(`${missing} exercise${missing > 1 ? 's' : ''} in this routine no longer exist and were skipped.`);
  navigate('/workout/active');
}
export async function startEmpty() {
  if (!(await guardActive())) return;
  await store.startSession({ name: 'Workout' });
  navigate('/workout/active');
}
export async function repeatSession(session) {
  if (!(await guardActive())) return;
  await store.startSession({ fromSession: session, name: session.name });
  navigate('/workout/active');
}
