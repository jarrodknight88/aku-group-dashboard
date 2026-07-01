// Top Employees demo data for Teranga ATL — ported verbatim from the
// Location Report handoff's DCLogic component. Split by role, with a $ / Qty
// mode. When the backend is wired this comes from Toast PayrollExport +
// SalesSummary server-level data.

export const employeesByRole = {
  servers: {
    dollar: [
      ['M. Diallo', '$21,480'],
      ['A. Sow', '$18,920'],
      ['T. Ndiaye', '$16,340'],
      ['S. Camara', '$14,110'],
      ['L. Gueye', '$12,760'],
    ],
    qty: [
      ['A. Sow', '512 items'],
      ['M. Diallo', '498 items'],
      ['S. Camara', '431 items'],
      ['T. Ndiaye', '402 items'],
      ['L. Gueye', '356 items'],
    ],
  },
  bartenders: {
    dollar: [
      ['K. Toure', '$11,240'],
      ['D. Fall', '$9,860'],
      ['R. Cisse', '$8,420'],
      ['B. Sarr', '$6,980'],
      ['I. Kane', '$5,540'],
    ],
    qty: [
      ['R. Cisse', '517 drinks'],
      ['D. Fall', '488 drinks'],
      ['K. Toure', '452 drinks'],
      ['B. Sarr', '344 drinks'],
      ['I. Kane', '289 drinks'],
    ],
  },
  hookah: {
    dollar: [
      ['O. Mbaye', '$6,120'],
      ['Y. Diop', '$5,340'],
      ['H. Ba', '$4,180'],
      ['P. Faye', '$3,260'],
      ['C. Thiam', '$2,410'],
    ],
    qty: [
      ['O. Mbaye', '142 hookahs'],
      ['Y. Diop', '126 hookahs'],
      ['H. Ba', '98 hookahs'],
      ['P. Faye', '77 hookahs'],
      ['C. Thiam', '58 hookahs'],
    ],
  },
}

// Overall card = category leaders (most food / bottles / drinks), also mode-aware.
export const overallLeaders = {
  dollar: [
    { label: 'Most Food Sold', name: 'M. Diallo', role: 'Server', val: '$14,860' },
    { label: 'Most Bottles Sold', name: 'K. Toure', role: 'Bartender', val: '$8,240' },
    { label: 'Most Drinks / Cocktails', name: 'D. Fall', role: 'Bartender', val: '$5,910' },
  ],
  qty: [
    { label: 'Most Food Sold', name: 'A. Sow', role: 'Server', val: '486 items' },
    { label: 'Most Bottles Sold', name: 'D. Fall', role: 'Bartender', val: '42 bottles' },
    { label: 'Most Drinks / Cocktails', name: 'R. Cisse', role: 'Bartender', val: '517 drinks' },
  ],
}

// Build a ranked list of {rank, name, val} for a role in the given mode.
export function buildRankedList(role, mode) {
  return employeesByRole[role][mode].map((row, i) => ({
    rank: i + 1,
    name: row[0],
    val: row[1],
  }))
}
