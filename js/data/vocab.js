// Shared vocabulary used by filters, forms and charts.
export const MUSCLE_GROUPS = [
  { key: 'chest', label: 'Chest', members: ['chest'], icon: 'dumbbell' },
  { key: 'back', label: 'Back', members: ['back', 'lats', 'upper_back', 'lower_back', 'traps'], icon: 'layers' },
  { key: 'shoulders', label: 'Shoulders', members: ['shoulders'], icon: 'target' },
  { key: 'biceps', label: 'Biceps', members: ['biceps'], icon: 'bolt' },
  { key: 'triceps', label: 'Triceps', members: ['triceps'], icon: 'bolt' },
  { key: 'forearms', label: 'Forearms', members: ['forearms'], icon: 'link' },
  { key: 'quads', label: 'Quads', members: ['quads'], icon: 'flame' },
  { key: 'hamstrings', label: 'Hamstrings', members: ['hamstrings'], icon: 'flame' },
  { key: 'glutes', label: 'Glutes', members: ['glutes'], icon: 'heart' },
  { key: 'calves', label: 'Calves', members: ['calves'], icon: 'up' },
  { key: 'abs', label: 'Core', members: ['abs', 'obliques'], icon: 'scan' },
  { key: 'cardio', label: 'Cardio', members: ['cardio'], icon: 'timer' },
];
export const MUSCLE_ALL = ['chest', 'back', 'lats', 'upper_back', 'lower_back', 'traps', 'shoulders', 'biceps', 'triceps', 'forearms', 'abs', 'obliques', 'quads', 'hamstrings', 'glutes', 'calves', 'cardio'];
export function groupOfMuscle(m) { return MUSCLE_GROUPS.find(g => g.members.includes(m)) || null; }

export const EQUIPMENT = ['barbell', 'dumbbell', 'cable', 'machine', 'bench', 'squat rack', 'dip station', 'bodyweight', 'rope', 'ab wheel', 'treadmill', 'bike', 'rower', 'elliptical'];
export const EQUIPMENT_FILTERS = ['barbell', 'dumbbell', 'cable', 'machine', 'bodyweight', 'bench'];

export const TYPES = [
  { value: 'weight_reps', label: 'Weight × reps' },
  { value: 'bodyweight_reps', label: 'Bodyweight reps' },
  { value: 'assisted', label: 'Assisted reps' },
  { value: 'cardio', label: 'Cardio (time/distance)' },
  { value: 'isometric', label: 'Hold (seconds)' },
  { value: 'mobility', label: 'Mobility / stretch' },
];
export const TYPE_LABEL = Object.fromEntries(TYPES.map(t => [t.value, t.label]));

export const TRACKING_BY_TYPE = {
  weight_reps: { weight: true, reps: true },
  bodyweight_reps: { reps: true, added_weight: true },
  assisted: { reps: true, assistance: true },
  cardio: { duration: true, distance: true },
  isometric: { duration: true },
  mobility: { duration: true },
};

export const SET_TYPES = [
  { value: 'normal', label: 'Working set', short: '' },
  { value: 'warmup', label: 'Warm-up', short: 'W' },
  { value: 'drop', label: 'Drop set', short: 'D' },
  { value: 'failure', label: 'Failure', short: 'F' },
  { value: 'rest_pause', label: 'Rest-pause', short: 'R' },
  { value: 'superset', label: 'Superset', short: 'S' },
  { value: 'circuit', label: 'Circuit', short: 'C' },
];

export const GOALS = [
  { value: 'strength', label: 'Get stronger' }, { value: 'muscle', label: 'Build muscle' },
  { value: 'fat_loss', label: 'Lose body fat' }, { value: 'fitness', label: 'General fitness' }, { value: 'endurance', label: 'Endurance' },
];
export const EXPERIENCE = [
  { value: 'beginner', label: 'Beginner', sub: 'Under a year' }, { value: 'intermediate', label: 'Intermediate', sub: '1–3 years' }, { value: 'advanced', label: 'Advanced', sub: '3+ years' },
];
export const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const WEEKDAYS_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const MEASUREMENTS = [
  { value: 'waist', label: 'Waist' }, { value: 'chest', label: 'Chest' }, { value: 'hips', label: 'Hips' },
  { value: 'upper_arm', label: 'Upper arm' }, { value: 'forearm', label: 'Forearm' }, { value: 'thigh', label: 'Thigh' },
  { value: 'calf', label: 'Calf' }, { value: 'neck', label: 'Neck' }, { value: 'custom', label: 'Custom' },
];
