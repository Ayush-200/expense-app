import { Decimal } from '@prisma/client/runtime/library';

export type SplitType = 'EQUAL' | 'EXACT' | 'PERCENTAGE' | 'SHARE';

export interface ParticipantInput {
  userId?: string;
  guestName?: string;
  guestEmail?: string;
  // For EXACT split
  exactAmount?: number;
  // For PERCENTAGE split
  percentage?: number;
  // For SHARE split
  shares?: number;
}

export interface CalculatedParticipant {
  userId?: string;
  guestName?: string;
  guestEmail?: string;
  amountOwed: number;
  splitMetadata: Record<string, unknown>;
}

/**
 * Calculates each participant's owed amount based on split type.
 * Adding a new split type = add a new case here only.
 */
export function calculateSplits(
  totalAmount: number,
  splitType: SplitType,
  participants: ParticipantInput[]
): CalculatedParticipant[] {
  switch (splitType) {
    case 'EQUAL':
      return calculateEqual(totalAmount, participants);
    case 'EXACT':
      return calculateExact(totalAmount, participants);
    case 'PERCENTAGE':
      return calculatePercentage(totalAmount, participants);
    case 'SHARE':
      return calculateShare(totalAmount, participants);
    default:
      throw new Error(`Unsupported split type: ${splitType}`);
  }
}

function calculateEqual(
  totalAmount: number,
  participants: ParticipantInput[]
): CalculatedParticipant[] {
  const count = participants.length;
  if (count === 0) throw new Error('At least one participant is required');

  const baseAmount = Math.floor((totalAmount / count) * 100) / 100;
  const remainder = Math.round((totalAmount - baseAmount * count) * 100);

  return participants.map((p, i) => ({
    userId: p.userId,
    guestName: p.guestName,
    guestEmail: p.guestEmail,
    // Distribute remainder cents to first participants
    amountOwed: i < remainder ? baseAmount + 0.01 : baseAmount,
    splitMetadata: { splitType: 'EQUAL' },
  }));
}

function calculateExact(
  totalAmount: number,
  participants: ParticipantInput[]
): CalculatedParticipant[] {
  const sum = participants.reduce((acc, p) => acc + (p.exactAmount ?? 0), 0);
  const rounded = Math.round(sum * 100) / 100;
  const total = Math.round(totalAmount * 100) / 100;

  if (rounded !== total) {
    throw new Error(
      `Exact amounts sum (${rounded}) must equal total expense amount (${total})`
    );
  }

  return participants.map((p) => ({
    userId: p.userId,
    guestName: p.guestName,
    guestEmail: p.guestEmail,
    amountOwed: p.exactAmount!,
    splitMetadata: { splitType: 'EXACT', exactAmount: p.exactAmount },
  }));
}

function calculatePercentage(
  totalAmount: number,
  participants: ParticipantInput[]
): CalculatedParticipant[] {
  const totalPct = participants.reduce((acc, p) => acc + (p.percentage ?? 0), 0);
  const rounded = Math.round(totalPct * 100) / 100;

  if (rounded !== 100) {
    throw new Error(`Percentages must sum to 100% (got ${rounded}%)`);
  }

  return participants.map((p) => ({
    userId: p.userId,
    guestName: p.guestName,
    guestEmail: p.guestEmail,
    amountOwed: Math.round(((p.percentage! / 100) * totalAmount) * 100) / 100,
    splitMetadata: { splitType: 'PERCENTAGE', percentage: p.percentage },
  }));
}

function calculateShare(
  totalAmount: number,
  participants: ParticipantInput[]
): CalculatedParticipant[] {
  const totalShares = participants.reduce((acc, p) => acc + (p.shares ?? 0), 0);
  if (totalShares === 0) throw new Error('Total shares must be greater than 0');

  return participants.map((p) => ({
    userId: p.userId,
    guestName: p.guestName,
    guestEmail: p.guestEmail,
    amountOwed:
      Math.round(((p.shares! / totalShares) * totalAmount) * 100) / 100,
    splitMetadata: { splitType: 'SHARE', shares: p.shares, totalShares },
  }));
}
