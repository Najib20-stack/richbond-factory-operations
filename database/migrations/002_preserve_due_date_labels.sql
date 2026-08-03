ALTER TABLE tasks
  ADD COLUMN due_date_label TEXT NOT NULL DEFAULT '';

UPDATE tasks
SET due_date_label = due_date::text
WHERE due_date IS NOT NULL AND due_date_label = '';
