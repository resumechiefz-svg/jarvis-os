/**
 * RISK MANAGER Agent — Portfolio risk enforcement
 * Position sizing, concentration limits, daily loss ceiling, drawdown protection
 * Every trade goes through here before execution
 */

import type { PortfolioSummary } from '../agents/tradepilot'
import type { TechnicalSignal } from './technical-analysis'

// Hard risk limits — never bypassed regardless of signal confidence
const LIMITS = {
  maxTradeNotional: 750,        // Max $ per single trade
  maxPositionPct: 0.08,         // Max 8% of portfolio in one name
  maxDailyLossDollars: 500,     // Stop all trading for the day at -$500
  maxDailyTrades: 12,           // No more than 12 trades per day
  maxPortfolioDrawdownPct: 0.05,// Halt if portfolio down 5% in a day
  minPrice: 5,                  // No penny stocks
  minLiquidity: 500000,         // Min avg daily volume ($)
  maxConcentration: 0.30,       // Max 30% in any one sector
  stopLossMultiplier: 1.5,      // Stop = 1.5x ATR from entry
  takeProfitMultiplier: 3.0,    // TP = 3x ATR from entry (R:R = 2:1)
}

export interface RiskAssessment {
  approved: boolean
  adjustedNotional: number
  stopLoss: number
  takeProfit: number
  riskRewardRatio: number
  reason?: string
  warnings: string[]
}

export interface DailyStats {
  tradesExecuted: number
  dayPL: number
  portfolioDrawdownPct: number
}

export function assessTrade(
  signal: TechnicalSignal,
  portfolio: PortfolioSummary,
  dailyStats: DailyStats,
  side: 'buy' | 'sell',
): RiskAssessment {
  const warnings: string[] = []

  // Hard stop: daily loss limit
  if (dailyStats.dayPL <= -LIMITS.maxDailyLossDollars) {
    return { approved: false, adjustedNotional: 0, stopLoss: 0, takeProfit: 0, riskRewardRatio: 0, reason: `Daily loss limit hit ($${Math.abs(dailyStats.dayPL).toFixed(0)}). No more trades today.`, warnings: [] }
  }

  // Hard stop: portfolio drawdown
  if (dailyStats.portfolioDrawdownPct <= -LIMITS.maxPortfolioDrawdownPct) {
    return { approved: false, adjustedNotional: 0, stopLoss: 0, takeProfit: 0, riskRewardRatio: 0, reason: `Portfolio down ${Math.abs(dailyStats.portfolioDrawdownPct * 100).toFixed(1)}% today. Drawdown protection engaged.`, warnings: [] }
  }

  // Hard stop: daily trade limit
  if (dailyStats.tradesExecuted >= LIMITS.maxDailyTrades) {
    return { approved: false, adjustedNotional: 0, stopLoss: 0, takeProfit: 0, riskRewardRatio: 0, reason: `Daily trade limit (${LIMITS.maxDailyTrades}) reached.`, warnings: [] }
  }

  // Price filter
  if (signal.price < LIMITS.minPrice) {
    return { approved: false, adjustedNotional: 0, stopLoss: 0, takeProfit: 0, riskRewardRatio: 0, reason: `${signal.symbol} price $${signal.price} below minimum $${LIMITS.minPrice}`, warnings: [] }
  }

  // Don't add to losers
  const existingPosition = portfolio.positions.find(p => p.symbol === signal.symbol)
  if (existingPosition && side === 'buy' && existingPosition.unrealizedPLPct < -15) {
    return { approved: false, adjustedNotional: 0, stopLoss: 0, takeProfit: 0, riskRewardRatio: 0, reason: `${signal.symbol} already down ${existingPosition.unrealizedPLPct.toFixed(1)}%. Not adding to a loser.`, warnings: [] }
  }

  // Existing position size check
  if (existingPosition && side === 'buy') {
    const currentExposure = existingPosition.marketValue / portfolio.equity
    if (currentExposure >= LIMITS.maxPositionPct) {
      return { approved: false, adjustedNotional: 0, stopLoss: 0, takeProfit: 0, riskRewardRatio: 0, reason: `Already at max position size in ${signal.symbol} (${(currentExposure * 100).toFixed(1)}% of portfolio)`, warnings: [] }
    }
  }

  // Position sizing — Kelly-inspired, risk-adjusted
  const maxByPct = portfolio.equity * LIMITS.maxPositionPct
  const maxByAbsolute = LIMITS.maxTradeNotional

  // Scale by signal strength
  const strengthMultiplier = signal.strength === 'STRONG' ? 1.0 : signal.strength === 'MODERATE' ? 0.65 : 0.35
  let notional = Math.min(maxByPct, maxByAbsolute) * strengthMultiplier

  // Scale down if near daily loss limit
  const dayLossRatio = Math.abs(dailyStats.dayPL) / LIMITS.maxDailyLossDollars
  if (dayLossRatio > 0.5) {
    notional *= (1 - dayLossRatio)
    warnings.push(`Reduced size — ${(dayLossRatio * 100).toFixed(0)}% of daily loss limit used`)
  }

  // Ensure we have enough cash
  if (notional > portfolio.cash * 0.9) {
    notional = portfolio.cash * 0.9
    warnings.push('Size capped at available cash')
  }

  if (notional < 50) {
    return { approved: false, adjustedNotional: 0, stopLoss: 0, takeProfit: 0, riskRewardRatio: 0, reason: 'Position size too small after risk adjustments', warnings }
  }

  // Stop loss and take profit using ATR
  const atr = signal.atr14 || signal.price * 0.02
  let stopLoss: number, takeProfit: number

  if (side === 'buy') {
    stopLoss = signal.price - (atr * LIMITS.stopLossMultiplier)
    takeProfit = signal.price + (atr * LIMITS.takeProfitMultiplier)
  } else {
    stopLoss = signal.price + (atr * LIMITS.stopLossMultiplier)
    takeProfit = signal.price - (atr * LIMITS.takeProfitMultiplier)
  }

  const riskPerShare = Math.abs(signal.price - stopLoss)
  const rewardPerShare = Math.abs(takeProfit - signal.price)
  const riskRewardRatio = riskPerShare > 0 ? rewardPerShare / riskPerShare : 0

  // Minimum R:R of 1.5:1
  if (riskRewardRatio < 1.5) {
    warnings.push(`R:R ${riskRewardRatio.toFixed(1)}:1 below 1.5:1 minimum — proceed with caution`)
  }

  return {
    approved: true,
    adjustedNotional: Math.round(notional),
    stopLoss: parseFloat(stopLoss.toFixed(2)),
    takeProfit: parseFloat(takeProfit.toFixed(2)),
    riskRewardRatio: parseFloat(riskRewardRatio.toFixed(2)),
    warnings,
  }
}
