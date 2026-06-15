/**
 * Construye cláusula WHERE para filtrar por empresa.
 * Superadmin no tiene filtro (ve todo).
 * @param {object} req - Express request object
 * @param {string} alias - Alias de la tabla (ej: 'd' para devices, 'c' para companies)
 * @returns {{ clause: string, params: number[] }}
 */
export function buildCompanyFilter(req, alias = 'd') {
  const ids = req.userCompanyIds;
  if (!ids || ids.length === 0) return { clause: '', params: [] };
  return {
    clause: ` AND ${alias}.company_id = ANY($${ids.length + 1}::int[])`,
    params: ids,
  };
}
