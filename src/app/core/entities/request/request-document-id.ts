export const createRequestDocumentId = (args: {
  retreatNumber: number | string;
  createdAt: Date;
  suffix: string;
}): string => {
  const { retreatNumber, createdAt, suffix } = args;
  if (!retreatNumber || Number.isNaN(createdAt.getTime()) || !/^[a-zA-Z0-9]{6,12}$/.test(suffix)) {
    throw new Error('Número del retiro, fecha y sufijo válido son requeridos para generar el ID');
  }

  const date = createdAt.toISOString().slice(0, 10).replace(/-/g, '');
  return `sol_${retreatNumber}_${date}_${suffix.toLowerCase()}`;
};
