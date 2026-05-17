/**
 * GovernanceScreen — View and vote on ClawChain governance proposals.
 *
 * This is a portable React Native component that can be used in both the
 * Expo sandbox app and the web user_dashboard. It uses the
 * useGovernanceProposals hook for data fetching.
 */

import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Alert,
  Platform,
} from "react-native";
import {
  useGovernanceProposals,
  type ProposalStatus,
} from "../hooks/useGovernanceProposals.js";
import type { GovernanceProposal } from "../services/clawchain-api.js";

// ── Theme constants (mirrors sandbox theme for consistency) ──

const COLORS = {
  primary: "#6C5CE7",
  primaryLight: "#A29BFE",
  accent: "#00D2FF",
  success: "#00B894",
  warning: "#FDCB6E",
  danger: "#E17055",
  textDark: "#1A1A2E",
  textLight: "#ECEDEE",
  textSecondary: "#9BA1A6",
  cardDark: "#1A1A2E",
  cardLight: "#FFFFFF",
  bgDark: "#0F0F1A",
  bgLight: "#F8F9FA",
  borderDark: "#2D2D44",
  borderLight: "#E1E8ED",
};

const STATUS_COLORS: Record<string, string> = {
  voting: COLORS.accent,
  passed: COLORS.success,
  rejected: COLORS.danger,
  executed: COLORS.primary,
  deposit_period: COLORS.warning,
};

const STATUS_LABELS: Record<string, string> = {
  voting: "Voting",
  passed: "Passed",
  rejected: "Rejected",
  executed: "Executed",
  deposit_period: "Deposit Period",
};

const FILTER_TABS: { label: string; value: ProposalStatus }[] = [
  { label: "All", value: "all" },
  { label: "Voting", value: "voting" },
  { label: "Passed", value: "passed" },
  { label: "Rejected", value: "rejected" },
];

interface GovernanceScreenProps {
  /** Current user address (needed for voting). */
  voterAddress?: string;
  /** Color scheme override. Defaults to "dark". */
  colorScheme?: "light" | "dark";
}

export function GovernanceScreen({
  voterAddress,
  colorScheme = "dark",
}: GovernanceScreenProps) {
  const isDark = colorScheme === "dark";
  const bg = isDark ? COLORS.bgDark : COLORS.bgLight;
  const cardBg = isDark ? COLORS.cardDark : COLORS.cardLight;
  const textColor = isDark ? COLORS.textLight : COLORS.textDark;
  const secondaryText = COLORS.textSecondary;
  const borderColor = isDark ? COLORS.borderDark : COLORS.borderLight;

  const [statusFilter, setStatusFilter] = useState<ProposalStatus>("all");
  const { proposals, isLoading, error, refresh, vote } =
    useGovernanceProposals({ status: statusFilter });

  const handleVote = async (proposalId: string, option: string) => {
    if (!voterAddress) {
      showAlert("Connect Wallet", "Please connect your wallet to vote.");
      return;
    }
    try {
      const result = await vote(proposalId, option, voterAddress);
      showAlert(
        "Vote Submitted",
        `TX Hash: ${result.txHash.slice(0, 20)}...${result.simulated ? " (simulated)" : ""}`
      );
    } catch (e: unknown) {
      showAlert("Vote Failed", e instanceof Error ? e.message : "Unknown error");
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: bg }]}>
      {/* Filter Tabs */}
      <View style={styles.filterRow}>
        {FILTER_TABS.map((tab) => (
          <TouchableOpacity
            key={tab.value}
            style={[
              styles.filterTab,
              {
                backgroundColor:
                  statusFilter === tab.value
                    ? COLORS.primary
                    : isDark
                      ? COLORS.cardDark
                      : COLORS.borderLight,
                borderColor:
                  statusFilter === tab.value
                    ? COLORS.primary
                    : borderColor,
              },
            ]}
            onPress={() => setStatusFilter(tab.value)}
            activeOpacity={0.7}
          >
            <Text
              style={[
                styles.filterTabText,
                {
                  color:
                    statusFilter === tab.value
                      ? "#FFFFFF"
                      : secondaryText,
                },
              ]}
            >
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={isLoading} onRefresh={refresh} />
        }
      >
        {error && (
          <View style={[styles.errorBanner, { borderColor: COLORS.danger }]}>
            <Text style={{ color: COLORS.danger, fontSize: 13 }}>{error}</Text>
          </View>
        )}

        {proposals.length === 0 && !isLoading && (
          <View style={styles.emptyState}>
            <Text style={[styles.emptyIcon]}>&#x1F5F3;</Text>
            <Text style={[styles.emptyTitle, { color: textColor }]}>
              No Proposals
            </Text>
            <Text style={[styles.emptySubtitle, { color: secondaryText }]}>
              {statusFilter === "all"
                ? "No governance proposals have been submitted yet."
                : `No proposals with status "${statusFilter}".`}
            </Text>
          </View>
        )}

        {proposals.map((proposal) => (
          <ProposalCard
            key={proposal.id}
            proposal={proposal}
            cardBg={cardBg}
            textColor={textColor}
            secondaryText={secondaryText}
            borderColor={borderColor}
            onVote={handleVote}
            canVote={!!voterAddress}
          />
        ))}
      </ScrollView>
    </View>
  );
}

// ── ProposalCard component ──

function ProposalCard({
  proposal,
  cardBg,
  textColor,
  secondaryText,
  borderColor,
  onVote,
  canVote,
}: {
  proposal: GovernanceProposal;
  cardBg: string;
  textColor: string;
  secondaryText: string;
  borderColor: string;
  onVote: (proposalId: string, option: string) => void;
  canVote: boolean;
}) {
  const statusColor = STATUS_COLORS[proposal.status] ?? COLORS.textSecondary;
  const statusLabel = STATUS_LABELS[proposal.status] ?? proposal.status;
  const isVoting = proposal.status === "voting";

  // Calculate vote percentages
  const yes = parseInt(proposal.yesVotes, 10) || 0;
  const no = parseInt(proposal.noVotes, 10) || 0;
  const abstain = parseInt(proposal.abstainVotes, 10) || 0;
  const veto = parseInt(proposal.vetoVotes, 10) || 0;
  const total = yes + no + abstain + veto;
  const yesPercent = total > 0 ? Math.round((yes / total) * 100) : 0;
  const noPercent = total > 0 ? Math.round((no / total) * 100) : 0;

  const depositDisplay =
    proposal.totalDeposit.length > 0
      ? `${formatClaw(proposal.totalDeposit[0].amount)} CLAW`
      : "0 CLAW";

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: cardBg, borderColor },
      ]}
    >
      {/* Header */}
      <View style={styles.cardHeader}>
        <Text style={[styles.proposalId, { color: secondaryText }]}>
          #{proposal.id}
        </Text>
        <View
          style={[
            styles.statusBadge,
            { backgroundColor: statusColor + "1A" },
          ]}
        >
          <Text style={[styles.statusText, { color: statusColor }]}>
            {statusLabel}
          </Text>
        </View>
      </View>

      {/* Title & Summary */}
      <Text style={[styles.proposalTitle, { color: textColor }]}>
        {proposal.title || "Untitled Proposal"}
      </Text>
      {proposal.summary ? (
        <Text
          style={[styles.proposalSummary, { color: secondaryText }]}
          numberOfLines={3}
        >
          {proposal.summary}
        </Text>
      ) : null}

      {/* Vote Bar */}
      {total > 0 && (
        <View style={styles.voteBarContainer}>
          <View style={styles.voteBar}>
            {yesPercent > 0 && (
              <View
                style={[
                  styles.voteBarSegment,
                  {
                    flex: yesPercent,
                    backgroundColor: COLORS.success,
                    borderTopLeftRadius: 4,
                    borderBottomLeftRadius: 4,
                  },
                ]}
              />
            )}
            {noPercent > 0 && (
              <View
                style={[
                  styles.voteBarSegment,
                  {
                    flex: noPercent,
                    backgroundColor: COLORS.danger,
                  },
                ]}
              />
            )}
            {100 - yesPercent - noPercent > 0 && (
              <View
                style={[
                  styles.voteBarSegment,
                  {
                    flex: 100 - yesPercent - noPercent,
                    backgroundColor: secondaryText + "33",
                    borderTopRightRadius: 4,
                    borderBottomRightRadius: 4,
                  },
                ]}
              />
            )}
          </View>
          <View style={styles.voteLabels}>
            <Text style={[styles.voteLabel, { color: COLORS.success }]}>
              Yes {yesPercent}%
            </Text>
            <Text style={[styles.voteLabel, { color: COLORS.danger }]}>
              No {noPercent}%
            </Text>
          </View>
        </View>
      )}

      {/* Meta Row */}
      <View style={styles.metaRow}>
        <Text style={[styles.metaText, { color: secondaryText }]}>
          Deposit: {depositDisplay}
        </Text>
        {proposal.votingEndTime ? (
          <Text style={[styles.metaText, { color: secondaryText }]}>
            Ends: {formatDate(proposal.votingEndTime)}
          </Text>
        ) : null}
      </View>

      {/* Vote Buttons */}
      {isVoting && canVote && (
        <View style={styles.voteActions}>
          <TouchableOpacity
            style={[styles.voteButton, { backgroundColor: COLORS.success + "1A" }]}
            onPress={() => onVote(proposal.id, "yes")}
            activeOpacity={0.7}
          >
            <Text style={[styles.voteButtonText, { color: COLORS.success }]}>
              Yes
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.voteButton, { backgroundColor: COLORS.danger + "1A" }]}
            onPress={() => onVote(proposal.id, "no")}
            activeOpacity={0.7}
          >
            <Text style={[styles.voteButtonText, { color: COLORS.danger }]}>
              No
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.voteButton, { backgroundColor: COLORS.textSecondary + "1A" }]}
            onPress={() => onVote(proposal.id, "abstain")}
            activeOpacity={0.7}
          >
            <Text style={[styles.voteButtonText, { color: COLORS.textSecondary }]}>
              Abstain
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.voteButton, { backgroundColor: COLORS.warning + "1A" }]}
            onPress={() => onVote(proposal.id, "no_with_veto")}
            activeOpacity={0.7}
          >
            <Text style={[styles.voteButtonText, { color: COLORS.warning }]}>
              Veto
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

// ── Helpers ──

function formatClaw(uclaw: string): string {
  const num = parseInt(uclaw, 10);
  if (isNaN(num)) return "0";
  const value = num / 1_000_000;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(2)}K`;
  return value.toFixed(2);
}

function formatDate(isoDate: string): string {
  try {
    const date = new Date(isoDate);
    return date.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return isoDate;
  }
}

function showAlert(title: string, message: string): void {
  if (Platform.OS === "web") {
    // eslint-disable-next-line no-alert
    globalThis.alert(`${title}\n\n${message}`);
  } else {
    Alert.alert(title, message);
  }
}

// ── Styles ──

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  filterRow: {
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 8,
    gap: 8,
  },
  filterTab: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
  },
  filterTabText: {
    fontSize: 13,
    fontWeight: "600",
  },
  scroll: {
    padding: 16,
    paddingBottom: 32,
  },
  errorBanner: {
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 12,
  },
  emptyState: {
    alignItems: "center",
    paddingVertical: 48,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 12,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "600",
    marginBottom: 4,
  },
  emptySubtitle: {
    fontSize: 14,
    textAlign: "center",
    paddingHorizontal: 32,
  },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    marginBottom: 12,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  proposalId: {
    fontSize: 13,
    fontWeight: "500",
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  statusText: {
    fontSize: 12,
    fontWeight: "700",
  },
  proposalTitle: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 4,
    lineHeight: 22,
  },
  proposalSummary: {
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 12,
  },
  voteBarContainer: {
    marginBottom: 12,
  },
  voteBar: {
    flexDirection: "row",
    height: 6,
    borderRadius: 4,
    overflow: "hidden",
    marginBottom: 4,
  },
  voteBarSegment: {
    height: 6,
  },
  voteLabels: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  voteLabel: {
    fontSize: 11,
    fontWeight: "600",
  },
  metaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  metaText: {
    fontSize: 12,
  },
  voteActions: {
    flexDirection: "row",
    gap: 6,
  },
  voteButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: "center",
  },
  voteButtonText: {
    fontSize: 13,
    fontWeight: "600",
  },
});
