ALTER TABLE users
  DROP CONSTRAINT IF EXISTS users_role_check;

UPDATE users
SET role = 'Vérificateur/Responsable';

ALTER TABLE users
  ADD CONSTRAINT users_role_check
  CHECK (role = 'Vérificateur/Responsable');
