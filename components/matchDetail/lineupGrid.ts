export const gridToXY = (grid?: string) => {
  if (!grid || !grid.includes(':')) return { x: 50, y: 50 };
  const [rowStr, colStr] = grid.split(':');
  const row = Math.max(1, Number(rowStr));
  const col = Math.max(1, Number(colStr));
  const rowCount = 5;
  const colCount = 5;

  const rowIndex = Math.min(rowCount, row) - 1;
  const colIndex = Math.min(colCount, col) - 1;

  // tuned for mobile: keep GK lower, forwards away from top edge, wide players inside bounds
  const baseY = 14 + (rowIndex * (74 / (rowCount - 1)));
  const y = rowIndex === rowCount - 1 ? baseY + 2 : baseY;
  const x = 10 + (colIndex * (80 / (colCount - 1)));
  return { x, y };
};
