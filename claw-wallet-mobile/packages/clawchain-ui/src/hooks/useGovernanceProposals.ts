/**
 * useGovernanceProposals — React hook for governance proposal queries.
 *
 * Fetches proposals from the ClawChain governance module, supports filtering
 * by status, and provides a voting action (sandbox stub).
 */

import { useState, useEffect, useCallback, useRef } from "react";
import {
  clawchainApi,
  type GovernanceProposal,
  type ProposalVote,
  type ShieldResult,
} from "../services/clawchain-api.js";

export type ProposalStatus = "all" | "voting" | "passed" | "rejected" | "executed";

export interface UseGovernanceProposalsOptions {
  /** Filter by proposal status. Default: "all" */
  status?: ProposalStatus;
  /** Auto-refresh interval in ms. 0 = disabled. Default: 30000 */
  refreshInterval?: number;
}

export interface UseGovernanceProposalsResult {
  /** List of governance proposals. */
  proposals: GovernanceProposal[];
  /** Whether proposals are being fetched. */
  isLoading: boolean;
  /** Error message, if any. */
  error: string | null;
  /** Manually refresh the proposals list. */
  refresh: () => Promise<void>;
  /** Fetch a single proposal by ID. */
  getProposal: (id: string) => Promise<GovernanceProposal | null>;
  /** Fetch votes for a proposal. */
  getVotes: (proposalId: string) => Promise<ProposalVote[]>;
  /** Vote on a proposal (sandbox stub). */
  vote: (proposalId: string, option: string, voter: string) => Promise<ShieldResult>;
}

export function useGovernanceProposals(
  options: UseGovernanceProposalsOptions = {}
): UseGovernanceProposalsResult {
  const { status = "all", refreshInterval = 30000 } = options;

  const [proposals, setProposals] = useState<GovernanceProposal[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const statusFilter = status === "all" ? undefined : status;
      const result = await clawchainApi.getProposals(statusFilter);
      if (mountedRef.current) {
        setProposals(result);
      }
    } catch (e: unknown) {
      if (mountedRef.current) {
        setError(e instanceof Error ? e.message : "Failed to fetch proposals");
      }
    } finally {
      if (mountedRef.current) {
        setIsLoading(false);
      }
    }
  }, [status]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Fetch on mount and when status filter changes
  useEffect(() => {
    refresh();
  }, [refresh]);

  // Auto-refresh
  useEffect(() => {
    if (refreshInterval <= 0) return;
    const timer = setInterval(refresh, refreshInterval);
    return () => clearInterval(timer);
  }, [refreshInterval, refresh]);

  const getProposal = useCallback(async (id: string) => {
    return clawchainApi.getProposal(id);
  }, []);

  const getVotes = useCallback(async (proposalId: string) => {
    return clawchainApi.getProposalVotes(proposalId);
  }, []);

  const vote = useCallback(
    async (proposalId: string, option: string, voter: string) => {
      return clawchainApi.voteOnProposal(proposalId, option, voter);
    },
    []
  );

  return {
    proposals,
    isLoading,
    error,
    refresh,
    getProposal,
    getVotes,
    vote,
  };
}
