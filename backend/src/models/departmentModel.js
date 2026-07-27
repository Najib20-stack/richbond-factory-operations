export function createDepartment(input, existingDepartments) {
  const name = String(input.name || "").trim();
  const description = String(input.description || "").trim();
  const capacity = Math.max(0, Math.min(100, Number(input.capacity || 50)));
  const baseId = name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 32);

  let id = baseId || `departement-${Date.now()}`;
  let suffix = 2;

  while (existingDepartments.some((department) => department.id === id)) {
    id = `${baseId}-${suffix}`;
    suffix += 1;
  }

  return {
    id,
    name,
    description: description || "Nouveau département de production.",
    capacity,
  };
}
