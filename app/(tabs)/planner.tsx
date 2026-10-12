import React, { useCallback, useMemo, useRef, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../src/context/ThemeContext';
import { BorderRadius, Spacing, Typography } from '../../src/constants/theme';
import { DateCalendarModal } from '../../src/components/DateCalendarModal';
import { ConfirmActionModal } from '../../src/components/ConfirmActionModal';
import { taskRepository, noteRepository } from '../../src/db/repositories';
import { settingsRepository, SETTING_KEYS } from '../../src/db/repositories/settingsRepository';
import { Note, Task } from '../../src/db/schema';
import type { TaskReminderOffset } from '../../src/db/schema';
import { formatPaiseToINR, rupeesToPaise } from '../../src/utils/money';
import { formatDateOnly } from '../../src/utils/date';
import { cancelNotification, scheduleTaskDueNotification } from '../../src/services/notificationService';

type PlannerTab = 'tasks' | 'notes';
type NoteCategory = 'Study' | 'Idea' | 'Other';
const REMINDER_OPTIONS: { value: TaskReminderOffset; label: string }[] = [
  { value: 60, label: '1 hour' },
  { value: 30, label: '30 min' },
  { value: 10, label: '10 min' },
];
const TASK_REMINDER_SCHEDULE_VERSION = '2';

function sanitizeAmount(value: string): string {
  const cleaned = value.replace(/[^0-9.]/g, '');
  const [whole = '', ...decimals] = cleaned.split('.');
  const decimal = decimals.join('').slice(0, 2);
  return cleaned.includes('.') ? `${whole}.${decimal}` : whole;
}

function formatTimeLabel(value: string): string {
  const [hours, minutes] = value.split(':').map(Number);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) return value;
  const date = new Date();
  date.setHours(hours, minutes, 0, 0);
  return date.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
}

async function migrateTaskReminderSchedules(): Promise<void> {
  if (settingsRepository.get(SETTING_KEYS.taskReminderScheduleVersion) === TASK_REMINDER_SCHEDULE_VERSION) {
    return;
  }

  for (const task of taskRepository.getAll()) {
    if (!task.notificationId) continue;

    let replacementId: string | null = null;
    if (!task.isCompleted && task.dueDate) {
      replacementId = await scheduleTaskDueNotification(
        task.title,
        task.dueDate,
        task.dueTime,
        task.reminderOffsetMinutes
      );
    }

    if (replacementId) {
      if (!(await cancelNotification(task.notificationId))) {
        await cancelNotification(replacementId);
        throw new Error('Could not update a saved task reminder.');
      }
      taskRepository.update(task.id, { notificationId: replacementId });
    } else {
      if (!(await cancelNotification(task.notificationId))) {
        throw new Error('Could not cancel an outdated task reminder.');
      }
      taskRepository.update(task.id, { notificationId: null });
    }
  }

  settingsRepository.set(SETTING_KEYS.taskReminderScheduleVersion, TASK_REMINDER_SCHEDULE_VERSION);
}

export default function PlannerScreen() {
  const { colors } = useAppTheme();
  const [activeTab, setActiveTab] = useState<PlannerTab>('tasks');
  const [tasks, setTasks] = useState<Task[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [taskModalVisible, setTaskModalVisible] = useState(false);
  const [noteModalVisible, setNoteModalVisible] = useState(false);
  const [datePickerVisible, setDatePickerVisible] = useState(false);
  const [taskTitle, setTaskTitle] = useState('');
  const [taskDueDate, setTaskDueDate] = useState('');
  const [taskDueTime, setTaskDueTime] = useState('');
  const [reminderOffsetMinutes, setReminderOffsetMinutes] = useState<TaskReminderOffset>(30);
  const [noteTitle, setNoteTitle] = useState('');
  const [noteContent, setNoteContent] = useState('');
  const [noteAmount, setNoteAmount] = useState('');
  const [noteCategory, setNoteCategory] = useState<NoteCategory>('Other');
  const [editingNoteId, setEditingNoteId] = useState<number | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ kind: 'task' | 'note'; id: number } | null>(null);
  const [isSavingTask, setIsSavingTask] = useState(false);
  const [workingTaskId, setWorkingTaskId] = useState<number | null>(null);
  const isMigratingTaskReminders = useRef(false);

  const loadData = useCallback(() => {
    try {
      setTasks(taskRepository.getAll());
      setNotes(noteRepository.getAll());
    } catch (error) {
      console.error('Failed to load planner data:', error);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    loadData();
    if (!isMigratingTaskReminders.current) {
      isMigratingTaskReminders.current = true;
      void migrateTaskReminderSchedules()
        .then(loadData)
        .catch((error) => {
          console.error('Failed to update saved task reminders:', error);
          Alert.alert(
            'Reminder Update Error',
            error instanceof Error ? error.message : 'Could not update saved task reminders.'
          );
        })
        .finally(() => {
          isMigratingTaskReminders.current = false;
        });
    }
  }, [loadData]));

  const pendingTasks = useMemo(() => tasks.filter((task) => !task.isCompleted).length, [tasks]);

  const openNewTask = () => {
    setTaskTitle('');
    setTaskDueDate('');
    setTaskDueTime('');
    setReminderOffsetMinutes(30);
    setTaskModalVisible(true);
  };

  const openNewNote = () => {
    setEditingNoteId(null);
    setNoteTitle('');
    setNoteContent('');
    setNoteAmount('');
    setNoteCategory('Other');
    setNoteModalVisible(true);
  };

  const saveTask = async () => {
    if (!taskTitle.trim()) {
      Alert.alert('Task title needed', 'Please enter what you want to do.');
      return;
    }
    if (taskDueTime && !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(taskDueTime)) {
      Alert.alert('Invalid due time', 'Enter a time in 24-hour HH:MM format, such as 14:30.');
      return;
    }
    setIsSavingTask(true);
    try {
      const task = taskRepository.add({
        title: taskTitle.trim(),
        dueDate: taskDueDate || null,
        dueTime: taskDueDate && taskDueTime ? taskDueTime : null,
        reminderOffsetMinutes: taskDueDate && taskDueTime ? reminderOffsetMinutes : null,
        amountPaise: null,
        isCompleted: false,
        createdAt: Date.now(),
      });
      setTaskModalVisible(false);
      setTaskTitle('');
      setTaskDueDate('');
      setTaskDueTime('');
      loadData();

      if (task.dueDate) {
        try {
          const notificationId = await scheduleTaskDueNotification(
            task.title,
            task.dueDate,
            task.dueTime,
            task.reminderOffsetMinutes
          );
          if (notificationId) {
            taskRepository.update(task.id, { notificationId });
          } else {
            Alert.alert(
              'Task saved without a reminder',
              'Allow notifications for SpendSense and choose a future reminder time.'
            );
          }
        } catch (error) {
          console.error('Failed to schedule task reminder:', error);
          Alert.alert(
            'Task saved, reminder unavailable',
            error instanceof Error ? error.message : 'Could not schedule this task reminder.'
          );
        }
      }
      loadData();
    } catch (error) {
      console.error('Failed to save task:', error);
      Alert.alert('Could not save task', 'Please try again.');
    } finally {
      setIsSavingTask(false);
    }
  };

  const saveNote = () => {
    if (!noteTitle.trim()) {
      Alert.alert('Note title needed', 'Please enter a title for your note.');
      return;
    }
    const amountPaise = noteAmount.trim() ? rupeesToPaise(noteAmount) : null;
    if (amountPaise !== null && (!Number.isInteger(amountPaise) || amountPaise <= 0)) {
      Alert.alert('Invalid amount', 'Enter a valid optional amount, or leave it blank.');
      return;
    }
    try {
      const values = { title: noteTitle.trim(), content: noteContent.trim(), tag: noteCategory, amountPaise };
      if (editingNoteId) {
        noteRepository.update(editingNoteId, values);
      } else {
        noteRepository.add({ ...values, createdAt: Date.now(), updatedAt: Date.now() });
      }
      setNoteModalVisible(false);
      loadData();
    } catch (error) {
      console.error('Failed to save note:', error);
      Alert.alert('Could not save note', 'Please try again.');
    }
  };

  const editNote = (note: Note) => {
    setEditingNoteId(note.id);
    setNoteTitle(note.title);
    setNoteContent(note.content);
    setNoteAmount(note.amountPaise ? (note.amountPaise / 100).toFixed(2).replace(/\.00$/, '') : '');
    setNoteCategory(note.tag === 'Study' || note.tag === 'Idea' ? note.tag : 'Other');
    setNoteModalVisible(true);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      if (deleteTarget.kind === 'task') {
        const task = taskRepository.getById(deleteTarget.id);
        if (task?.notificationId && !(await cancelNotification(task.notificationId))) {
          throw new Error('Could not cancel the task reminder. The task was not deleted.');
        }
        taskRepository.delete(deleteTarget.id);
      } else {
        noteRepository.delete(deleteTarget.id);
      }
      setDeleteTarget(null);
      loadData();
    } catch (error) {
      console.error('Failed to delete planner item:', error);
      Alert.alert(
        'Delete Error',
        error instanceof Error ? error.message : `Could not delete this ${deleteTarget.kind}.`
      );
    }
  };

  const toggleTaskCompletion = async (task: Task) => {
    setWorkingTaskId(task.id);
    try {
      if (!task.isCompleted && task.notificationId && !(await cancelNotification(task.notificationId))) {
        throw new Error('Could not cancel the task reminder. Try again before completing this task.');
      }

      const updatedTask = taskRepository.toggleComplete(task.id, task.isCompleted);
      if (updatedTask.isCompleted && task.notificationId) {
        taskRepository.update(task.id, { notificationId: null });
      } else if (!updatedTask.isCompleted && updatedTask.dueDate) {
        const notificationId = await scheduleTaskDueNotification(
          updatedTask.title,
          updatedTask.dueDate,
          updatedTask.dueTime,
          updatedTask.reminderOffsetMinutes
        );
        if (notificationId) {
          taskRepository.update(task.id, { notificationId });
        } else {
          Alert.alert(
            'Task reopened without a reminder',
            'Allow notifications for SpendSense and check that the reminder time has not passed.'
          );
        }
      }
      loadData();
    } catch (error) {
      console.error('Failed to update task reminder:', error);
      Alert.alert(
        'Task Reminder Error',
        error instanceof Error ? error.message : 'Could not update the task reminder.'
      );
      loadData();
    } finally {
      setWorkingTaskId(null);
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <ConfirmActionModal
        visible={deleteTarget !== null}
        title={`Delete ${deleteTarget?.kind === 'task' ? 'task' : 'note'}?`}
        message={`This ${deleteTarget?.kind ?? 'item'} will be permanently removed. You can’t undo this action.`}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
      />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <View>
            <Text style={[styles.title, { color: colors.text }]}>Planner</Text>
            <Text style={[styles.subtitle, { color: colors.textSecondary }]}>Tasks, study notes, ideas, and reminders</Text>
          </View>
          <TouchableOpacity style={[styles.newButton, { backgroundColor: colors.primary }]} onPress={activeTab === 'tasks' ? openNewTask : openNewNote}>
            <Ionicons name="add" size={19} color="#FFFFFF" />
            <Text style={styles.newButtonText}>{activeTab === 'tasks' ? 'New Task' : 'New Note'}</Text>
          </TouchableOpacity>
        </View>

        <View style={[styles.tabs, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}>
          <TouchableOpacity style={[styles.tab, activeTab === 'tasks' && { backgroundColor: colors.surface }]} onPress={() => setActiveTab('tasks')}>
            <Ionicons name="checkbox-outline" size={17} color={activeTab === 'tasks' ? colors.primary : colors.textSecondary} />
            <Text style={[styles.tabText, { color: activeTab === 'tasks' ? colors.text : colors.textSecondary }]}>Tasks ({pendingTasks})</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.tab, activeTab === 'notes' && { backgroundColor: colors.surface }]} onPress={() => setActiveTab('notes')}>
            <Ionicons name="document-text-outline" size={17} color={activeTab === 'notes' ? colors.primary : colors.textSecondary} />
            <Text style={[styles.tabText, { color: activeTab === 'notes' ? colors.text : colors.textSecondary }]}>Notes ({notes.length})</Text>
          </TouchableOpacity>
        </View>

        {activeTab === 'tasks' ? (
          tasks.length === 0 ? <Empty icon="checkbox-outline" title="No tasks yet" text="Add a study goal, reminder, or anything you want to complete." colors={colors} /> :
          tasks.map((task) => (
            <View key={task.id} style={[styles.card, styles.taskCard, { backgroundColor: colors.surface, borderColor: colors.border }, task.isCompleted && { opacity: 0.6 }]}>
              <TouchableOpacity disabled={workingTaskId === task.id} style={[styles.checkbox, { borderColor: task.isCompleted ? colors.primary : colors.border }, task.isCompleted && { backgroundColor: colors.primary }]} onPress={() => { void toggleTaskCompletion(task); }}>
                {task.isCompleted ? <Ionicons name="checkmark" size={14} color="#FFFFFF" /> : null}
              </TouchableOpacity>
              <View style={styles.cardBody}>
                <Text style={[styles.cardTitle, { color: colors.text }, task.isCompleted && { textDecorationLine: 'line-through', color: colors.textSecondary }]}>{task.title}</Text>
                {task.dueDate ? (
                  <Text style={[styles.meta, { color: colors.textSecondary }]}>
                    Due {formatDateOnly(task.dueDate)}
                    {task.dueTime ? `, ${formatTimeLabel(task.dueTime)}` : ''}
                    {!task.isCompleted
                      ? ` · ${task.notificationId
                        ? task.dueTime
                          ? `Reminder ${REMINDER_OPTIONS.find((option) => option.value === task.reminderOffsetMinutes)?.label ?? '30 min'} before`
                          : 'Reminder at 12:00 AM'
                        : 'Reminder not set'}`
                      : ''}
                  </Text>
                ) : null}
              </View>
              <TouchableOpacity onPress={() => setDeleteTarget({ kind: 'task', id: task.id })}><Ionicons name="trash-outline" size={18} color={colors.textMuted} /></TouchableOpacity>
            </View>
          ))
        ) : (
          notes.length === 0 ? <Empty icon="journal-outline" title="No notes yet" text="Save a study point, a new idea, or anything useful to remember." colors={colors} /> :
          notes.map((note) => {
            const category = note.tag === 'Study' || note.tag === 'Idea' ? note.tag : 'Other';
            const accentColor = category === 'Study'
              ? colors.transfer
              : category === 'Idea'
                ? colors.primary
                : colors.textSecondary;
            const accentBackground = category === 'Idea' ? colors.primaryLight : colors.surfaceElevated;

            return (
              <TouchableOpacity
                key={note.id}
                style={[styles.noteCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
                onPress={() => editNote(note)}
                accessibilityRole="button"
                accessibilityLabel={`Edit ${category.toLowerCase()} note: ${note.title}`}
              >
                <View style={[styles.noteAccent, { backgroundColor: accentColor }]} />
                <View style={styles.noteCardContent}>
                  <View style={styles.noteHeader}>
                    <View style={[styles.noteIcon, { backgroundColor: accentBackground }]}>
                      <Ionicons
                        name={category === 'Study' ? 'book-outline' : category === 'Idea' ? 'bulb-outline' : 'document-text-outline'}
                        size={18}
                        color={accentColor}
                      />
                    </View>
                    <Text style={[styles.noteTitle, { color: colors.text }]} numberOfLines={2}>{note.title}</Text>
                    <Text style={[styles.categoryBadge, { color: accentColor, backgroundColor: accentBackground }]}>{category}</Text>
                  </View>
                  {note.content ? (
                    <Text style={[styles.noteContent, { color: colors.textSecondary }]} numberOfLines={3}>
                      {note.content}
                    </Text>
                  ) : (
                    <Text style={[styles.noteContentHint, { color: colors.textMuted }]}>Tap to add note details</Text>
                  )}
                  <View style={[styles.noteDivider, { backgroundColor: colors.border }]} />
                  <View style={styles.noteFooter}>
                    <View style={styles.noteMeta}>
                      <Ionicons name="time-outline" size={14} color={colors.textMuted} />
                      <Text style={[styles.meta, { color: colors.textMuted }]}>
                        {new Date(note.updatedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </Text>
                    </View>
                    <View style={styles.noteFooterActions}>
                      {note.amountPaise ? (
                        <Text style={[styles.noteAmount, { color: colors.primary }]}>
                          {formatPaiseToINR(note.amountPaise)}
                        </Text>
                      ) : null}
                      <TouchableOpacity
                        style={styles.noteDeleteButton}
                        accessibilityRole="button"
                        accessibilityLabel={`Delete note: ${note.title}`}
                        onPress={(event) => {
                          event.stopPropagation();
                          setDeleteTarget({ kind: 'note', id: note.id });
                        }}
                      >
                        <Ionicons name="trash-outline" size={17} color={colors.textMuted} />
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>

      <Modal visible={taskModalVisible} transparent animationType="slide" onRequestClose={() => setTaskModalVisible(false)}>
        <Pressable style={styles.overlay} onPress={() => setTaskModalVisible(false)}>
          <Pressable style={[styles.modal, { backgroundColor: colors.surface }]} onStartShouldSetResponder={() => true}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>New Task</Text>
            <TextInput style={[styles.input, { color: colors.text, borderColor: colors.border }]} placeholder="e.g. Finish maths chapter" placeholderTextColor={colors.textMuted} value={taskTitle} onChangeText={setTaskTitle} autoFocus />
            <TouchableOpacity style={[styles.dateButton, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]} onPress={() => setDatePickerVisible(true)}>
              <Ionicons name="calendar-outline" size={18} color={colors.primary} />
              <Text style={[styles.dateButtonText, { color: taskDueDate ? colors.text : colors.textSecondary }]}>{taskDueDate ? `Due: ${formatDateOnly(taskDueDate)}` : 'Optional due date'}</Text>
              <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
            </TouchableOpacity>
            {taskDueDate ? (
              <>
                <View style={[styles.timeInputRow, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}>
                  <Ionicons name="time-outline" size={18} color={colors.primary} />
                  <TextInput
                    style={[styles.timeInput, { color: colors.text }]}
                    placeholder="Due time (optional, HH:MM)"
                    placeholderTextColor={colors.textMuted}
                    keyboardType="numbers-and-punctuation"
                    value={taskDueTime}
                    onChangeText={setTaskDueTime}
                    maxLength={5}
                  />
                </View>
                {taskDueTime ? (
                  <View style={styles.categoryChoices}>
                    {REMINDER_OPTIONS.map((option) => (
                      <TouchableOpacity
                        key={option.value}
                        style={[
                          styles.categoryChoice,
                          { backgroundColor: reminderOffsetMinutes === option.value ? colors.primary : colors.surfaceElevated },
                        ]}
                        onPress={() => setReminderOffsetMinutes(option.value)}
                      >
                        <Text style={[
                          styles.categoryChoiceText,
                          { color: reminderOffsetMinutes === option.value ? '#FFFFFF' : colors.textSecondary },
                        ]}>
                          {option.label} before
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                ) : null}
              </>
            ) : null}
            <Text style={[styles.reminderHint, { color: colors.textSecondary }]}>
              {taskDueDate
                ? taskDueTime
                  ? `One reminder ${REMINDER_OPTIONS.find((option) => option.value === reminderOffsetMinutes)?.label} before ${formatTimeLabel(taskDueTime)}.`
                  : 'SpendSense will remind you at 12:00 AM on the due date.'
                : 'Add a due date to get a completion reminder.'}
            </Text>
            <ModalActions
              colors={colors}
              onCancel={() => setTaskModalVisible(false)}
              onSave={saveTask}
              label={isSavingTask ? 'Saving…' : 'Add Task'}
              disabled={isSavingTask}
            />
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={noteModalVisible} transparent animationType="slide" onRequestClose={() => setNoteModalVisible(false)}>
        <Pressable style={styles.overlay} onPress={() => setNoteModalVisible(false)}>
          <Pressable style={[styles.modal, { backgroundColor: colors.surface }]} onStartShouldSetResponder={() => true}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>{editingNoteId ? 'Edit Note' : 'New Note'}</Text>
            <TextInput style={[styles.input, { color: colors.text, borderColor: colors.border }]} placeholder="Title (e.g. New project idea)" placeholderTextColor={colors.textMuted} value={noteTitle} onChangeText={setNoteTitle} autoFocus />
            <View style={styles.categoryChoices}>
              {(['Study', 'Idea', 'Other'] as NoteCategory[]).map((category) => <TouchableOpacity key={category} style={[styles.categoryChoice, { backgroundColor: noteCategory === category ? colors.primary : colors.surfaceElevated }]} onPress={() => setNoteCategory(category)}><Text style={[styles.categoryChoiceText, { color: noteCategory === category ? '#FFFFFF' : colors.textSecondary }]}>{category}</Text></TouchableOpacity>)}
            </View>
            <TextInput style={[styles.input, { color: colors.text, borderColor: colors.border }]} placeholder="Optional amount in ₹ (e.g. 250.50)" placeholderTextColor={colors.textMuted} keyboardType="decimal-pad" value={noteAmount} onChangeText={(value) => setNoteAmount(sanitizeAmount(value))} />
            <TextInput style={[styles.input, styles.textArea, { color: colors.text, borderColor: colors.border }]} placeholder="Write your note..." placeholderTextColor={colors.textMuted} multiline numberOfLines={4} value={noteContent} onChangeText={setNoteContent} />
            <ModalActions colors={colors} onCancel={() => setNoteModalVisible(false)} onSave={saveNote} label={editingNoteId ? 'Update' : 'Save'} />
          </Pressable>
        </Pressable>
      </Modal>

      <DateCalendarModal visible={datePickerVisible} selectedDate={taskDueDate} onSelect={setTaskDueDate} onClose={() => setDatePickerVisible(false)} allowClear onClear={() => { setTaskDueDate(''); setTaskDueTime(''); }} />
    </SafeAreaView>
  );
}

function Empty({ icon, title, text, colors }: { icon: any; title: string; text: string; colors: any }) {
  return <View style={[styles.empty, { backgroundColor: colors.surface, borderColor: colors.border }]}><Ionicons name={icon} size={42} color={colors.textMuted} /><Text style={[styles.emptyTitle, { color: colors.text }]}>{title}</Text><Text style={[styles.emptyText, { color: colors.textSecondary }]}>{text}</Text></View>;
}

function ModalActions({
  colors,
  onCancel,
  onSave,
  label,
  disabled = false,
}: {
  colors: any;
  onCancel: () => void;
  onSave: () => void;
  label: string;
  disabled?: boolean;
}) {
  return <View style={styles.actions}><TouchableOpacity disabled={disabled} style={[styles.actionButton, { backgroundColor: colors.surfaceElevated }]} onPress={onCancel}><Text style={[styles.actionText, { color: colors.text }]}>Cancel</Text></TouchableOpacity><TouchableOpacity disabled={disabled} style={[styles.actionButton, { backgroundColor: colors.primary }, disabled && { opacity: 0.6 }]} onPress={onSave}><Text style={[styles.actionText, { color: '#FFFFFF' }]}>{label}</Text></TouchableOpacity></View>;
}

const styles = StyleSheet.create({
  container: { flex: 1 }, content: { padding: Spacing.md, gap: Spacing.md, paddingBottom: Spacing.xxl },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.sm, marginBottom: Spacing.xs }, title: { fontSize: Typography.xxl, fontWeight: '800', letterSpacing: -0.5 }, subtitle: { fontSize: Typography.xs, marginTop: 3, lineHeight: 17 },
  newButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, minHeight: 42, paddingHorizontal: Spacing.md, borderRadius: BorderRadius.full }, newButtonText: { color: '#FFFFFF', fontSize: Typography.xs, fontWeight: '700' },
  tabs: { flexDirection: 'row', borderRadius: BorderRadius.lg, borderWidth: 1, padding: 4, gap: 4 }, tab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, minHeight: 42, borderRadius: BorderRadius.md }, tabText: { fontSize: Typography.xs, fontWeight: '700' },
  card: { borderRadius: BorderRadius.lg, borderWidth: 1, padding: Spacing.md, gap: Spacing.xs, shadowColor: '#163B28', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 8, elevation: 1 }, taskCard: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, minHeight: 72 }, cardBody: { flex: 1 }, checkbox: { width: 24, height: 24, borderRadius: BorderRadius.xs, borderWidth: 2, alignItems: 'center', justifyContent: 'center' }, cardTitle: { flex: 1, fontSize: Typography.md, fontWeight: '700' }, meta: { fontSize: Typography.xs, marginTop: 3, lineHeight: 16 },
  noteCard: { flexDirection: 'row', borderRadius: BorderRadius.xl, borderWidth: 1, overflow: 'hidden', shadowColor: '#163B28', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.06, shadowRadius: 10, elevation: 2 },
  noteAccent: { width: 4 },
  noteCardContent: { flex: 1, padding: Spacing.md, gap: Spacing.sm },
  noteHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  noteIcon: { width: 36, height: 36, borderRadius: BorderRadius.sm, alignItems: 'center', justifyContent: 'center' },
  noteTitle: { flex: 1, fontSize: Typography.md, fontWeight: '700', lineHeight: 21 },
  categoryBadge: { overflow: 'hidden', borderRadius: BorderRadius.full, paddingHorizontal: 9, paddingVertical: 5, fontSize: 11, fontWeight: '700' },
  noteContent: { fontSize: Typography.sm, lineHeight: 20 },
  noteContentHint: { fontSize: Typography.xs, lineHeight: 20, fontStyle: 'italic' },
  noteDivider: { height: StyleSheet.hairlineWidth, marginTop: Spacing.xxs },
  noteFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  noteMeta: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
  noteFooterActions: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  noteDeleteButton: { minWidth: 36, minHeight: 36, alignItems: 'center', justifyContent: 'center', borderRadius: BorderRadius.full },
  noteAmount: { fontSize: Typography.xs, fontWeight: '700' },
  empty: { alignItems: 'center', borderWidth: 1, borderRadius: BorderRadius.xl, padding: Spacing.xl, gap: Spacing.sm, shadowColor: '#163B28', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 8, elevation: 1 }, emptyTitle: { fontSize: Typography.md, fontWeight: '700' }, emptyText: { fontSize: Typography.xs, textAlign: 'center', lineHeight: 18 },
  overlay: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.58)', justifyContent: 'center', padding: Spacing.md }, modal: { width: '100%', maxWidth: 420, alignSelf: 'center', borderRadius: BorderRadius.xl, padding: Spacing.lg, gap: Spacing.sm }, modalTitle: { fontSize: Typography.xl, fontWeight: '800', marginBottom: Spacing.xs }, input: { borderWidth: 1, borderRadius: BorderRadius.md, minHeight: 48, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm + 2, fontSize: Typography.sm }, textArea: { height: 96, textAlignVertical: 'top' },
  dateButton: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, borderWidth: 1, borderRadius: BorderRadius.md, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm + 2 }, dateButtonText: { flex: 1, fontSize: Typography.sm, fontWeight: '600' }, timeInputRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, borderWidth: 1, borderRadius: BorderRadius.md, paddingHorizontal: Spacing.md }, timeInput: { flex: 1, paddingVertical: Spacing.sm + 2, fontSize: Typography.sm }, reminderHint: { fontSize: Typography.xs, lineHeight: 17, marginTop: -Spacing.xs }, categoryChoices: { flexDirection: 'row', gap: Spacing.xs }, categoryChoice: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: BorderRadius.sm }, categoryChoiceText: { fontSize: Typography.xs, fontWeight: '700' },
  actions: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.sm }, actionButton: { flex: 1, minHeight: 48, alignItems: 'center', justifyContent: 'center', paddingVertical: Spacing.sm, borderRadius: BorderRadius.md }, actionText: { fontSize: Typography.sm, fontWeight: '700' },
});
