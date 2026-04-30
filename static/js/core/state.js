export const state = {
  user: null,
  currentPage: 'home',
  selectedCustomer: null,
  inventoryItems: [],
  orderItems: [],
  masterOrderItems: [],
  shippingDraftItems: [],
  customers: [],
  warehouse: { activeZone: localStorage.getItem('yx_active_zone') || 'ALL', cells: [], availableItems: [], highlightedCells: [] },
  todayChanges: [],
  unreadCount: 0,
};
export function setState(patch) { Object.assign(state, patch); }
