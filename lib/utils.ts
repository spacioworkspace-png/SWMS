import { SpaceType, BillingCycle } from '@/types'

export function getBillingCycle(spaceType: SpaceType): BillingCycle {
  switch (spaceType) {
    case 'Day Pass':
    case 'Meeting Room':
      return 'daily'
    case 'Virtual Office':
      return 'yearly'
    case 'Cabin':
    case 'Desk':
    default:
      return 'monthly'
  }
}

export function calculatePrice(pricePerDay: number, spaceType: SpaceType, days: number = 1): number {
  const billingCycle = getBillingCycle(spaceType)
  
  switch (billingCycle) {
    case 'daily':
      return pricePerDay * days
    case 'monthly':
      return pricePerDay * 30 // Approximate monthly price
    case 'yearly':
      return pricePerDay * 365 // Approximate yearly price
    default:
      return pricePerDay * days
  }
}

export function formatCurrency(amount: number): string {
  // Handle NaN, null, undefined, or invalid numbers
  if (amount == null || isNaN(amount) || !isFinite(amount)) {
    return '₹0.00'
  }
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
  }).format(amount)
}

export function formatDate(date: string | Date): string {
  return new Date(date).toLocaleDateString('en-IN', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

