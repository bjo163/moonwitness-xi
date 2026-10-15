import type { Transaction } from 'objection';
import { CompanyMembership } from '@moonwitness/orm-base';
import {
  OrganizationDepartment,
  OrganizationMembership,
  OrganizationPosition,
  OrganizationTeam,
} from './models.js';

type MutationRecord = Readonly<Record<string, unknown>>;
type ModelRow = Readonly<Record<string, unknown>>;

function relationId(values: MutationRecord, current: ModelRow | undefined, field: string) {
  const idKey = `${field}_id`;
  const value = Object.hasOwn(values, idKey)
    ? values[idKey]
    : Object.hasOwn(values, field)
      ? values[field]
      : current?.[idKey];
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : null;
}

function validDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

async function parentChainIsAcyclic(
  model: typeof OrganizationDepartment | typeof OrganizationTeam,
  parentId: number | null,
  currentId: number | undefined,
  trx?: Transaction
) {
  const visited = new Set<number>();
  if (currentId !== undefined) visited.add(currentId);
  let nextId = parentId;
  while (nextId !== null) {
    if (visited.has(nextId)) return false;
    visited.add(nextId);
    const row = (await model.query(trx).findById(nextId)) as unknown as ModelRow | undefined;
    if (!row) return false;
    const next = row.parent_id;
    nextId = typeof next === 'number' ? next : null;
  }
  return true;
}

async function managerChainIsAcyclic(
  managerId: number | null,
  currentId: number | undefined,
  trx?: Transaction
) {
  const visited = new Set<number>();
  if (currentId !== undefined) visited.add(currentId);
  let nextId = managerId;
  while (nextId !== null) {
    if (visited.has(nextId)) return false;
    visited.add(nextId);
    const row = (await OrganizationMembership.query(trx).findById(nextId)) as unknown as
      ModelRow | undefined;
    if (!row) return false;
    const next = row.manager_id;
    nextId = typeof next === 'number' ? next : null;
  }
  return true;
}

/** Validate company-owned organization edges before generic API writes. */
export async function isValidOrganizationMutation(
  modelName: string,
  values: MutationRecord,
  current?: ModelRow,
  trx?: Transaction
): Promise<boolean> {
  if (
    modelName !== OrganizationDepartment.modelName &&
    modelName !== OrganizationTeam.modelName &&
    modelName !== OrganizationPosition.modelName &&
    modelName !== OrganizationMembership.modelName
  )
    return true;
  const companyId = relationId(values, current, 'company');
  if (companyId === null) return false;

  if (modelName === OrganizationDepartment.modelName) {
    const currentId = typeof current?.id === 'number' ? current.id : undefined;
    if (
      currentId !== undefined &&
      current?.company_id !== companyId &&
      (await OrganizationDepartment.query(trx).where('parent_id', currentId).first())
    )
      return false;
    if (
      currentId !== undefined &&
      current?.company_id !== companyId &&
      ((await OrganizationTeam.query(trx).where('department_id', currentId).first()) ||
        (await OrganizationPosition.query(trx).where('department_id', currentId).first()) ||
        (await OrganizationMembership.query(trx).where('department_id', currentId).first()))
    )
      return false;
    const parentId = relationId(values, current, 'parent');
    if (parentId !== null) {
      const parent = (await OrganizationDepartment.query(trx).findById(parentId)) as unknown as
        ModelRow | undefined;
      if (!parent || parent.company_id !== companyId) return false;
    }
    return parentChainIsAcyclic(
      OrganizationDepartment,
      parentId,
      typeof current?.id === 'number' ? current.id : undefined,
      trx
    );
  }

  if (modelName === OrganizationTeam.modelName) {
    const currentId = typeof current?.id === 'number' ? current.id : undefined;
    const departmentId = relationId(values, current, 'department');
    const department =
      departmentId === null
        ? undefined
        : ((await OrganizationDepartment.query(trx).findById(departmentId)) as unknown as
            ModelRow | undefined);
    if (!department || department.company_id !== companyId) return false;
    if (
      currentId !== undefined &&
      (current?.company_id !== companyId || current?.department_id !== departmentId) &&
      ((await OrganizationTeam.query(trx).where('parent_id', currentId).first()) ||
        (await OrganizationMembership.query(trx).where('team_id', currentId).first()))
    )
      return false;
    const parentId = relationId(values, current, 'parent');
    if (parentId !== null) {
      const parent = (await OrganizationTeam.query(trx).findById(parentId)) as unknown as
        ModelRow | undefined;
      if (!parent || parent.company_id !== companyId || parent.department_id !== departmentId)
        return false;
    }
    return parentChainIsAcyclic(
      OrganizationTeam,
      parentId,
      typeof current?.id === 'number' ? current.id : undefined,
      trx
    );
  }

  if (modelName === OrganizationMembership.modelName) {
    const userId = relationId(values, current, 'user');
    const departmentId = relationId(values, current, 'department');
    if (userId === null || departmentId === null) return false;
    const [companyMembership, department] = await Promise.all([
      CompanyMembership.query(trx).where({ user_id: userId, company_id: companyId }).first(),
      OrganizationDepartment.query(trx).findById(departmentId),
    ]);
    if (!companyMembership || !department || department.company_id !== companyId) return false;

    const teamId = relationId(values, current, 'team');
    if (teamId !== null) {
      const team = (await OrganizationTeam.query(trx).findById(teamId)) as unknown as
        ModelRow | undefined;
      if (!team || team.company_id !== companyId || team.department_id !== departmentId)
        return false;
    }
    const positionId = relationId(values, current, 'position');
    if (positionId !== null) {
      const position = (await OrganizationPosition.query(trx).findById(positionId)) as unknown as
        ModelRow | undefined;
      if (!position || (position.department_id !== null && position.department_id !== departmentId))
        return false;
      if (position.company_id !== companyId) return false;
    }

    const managerId = relationId(values, current, 'manager');
    if (
      !(await managerChainIsAcyclic(
        managerId,
        typeof current?.id === 'number' ? current.id : undefined,
        trx
      ))
    )
      return false;
    if (managerId !== null) {
      const manager = (await OrganizationMembership.query(trx).findById(managerId)) as unknown as
        ModelRow | undefined;
      if (!manager || manager.company_id !== companyId) return false;
    }

    const startDate = Object.hasOwn(values, 'start_date') ? values.start_date : current?.start_date;
    const endDate = Object.hasOwn(values, 'end_date') ? values.end_date : current?.end_date;
    if (!validDate(startDate) || (endDate !== undefined && endDate !== null && !validDate(endDate)))
      return false;
    return endDate === undefined || endDate === null || endDate >= startDate;
  }

  if (modelName === OrganizationPosition.modelName) {
    const departmentId = relationId(values, current, 'department');
    if (departmentId !== null) {
      const department = (await OrganizationDepartment.query(trx).findById(
        departmentId
      )) as unknown as ModelRow | undefined;
      if (department?.company_id !== companyId) return false;
    }
    const currentId = typeof current?.id === 'number' ? current.id : undefined;
    if (
      currentId !== undefined &&
      (current?.company_id !== companyId || current?.department_id !== departmentId) &&
      (await OrganizationMembership.query(trx).where('position_id', currentId).first())
    )
      return false;
    return true;
  }

  return true;
}
