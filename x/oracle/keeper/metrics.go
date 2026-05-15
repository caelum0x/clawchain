package keeper

import (
	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promauto"
)

// Prometheus metrics for the oracle module.
// These are registered automatically via promauto and exposed on the
// CometBFT Prometheus endpoint (:26660/metrics by default).
var (
	// OracleVotePeriodCounter counts completed oracle vote periods.
	OracleVotePeriodCounter = promauto.NewCounter(prometheus.CounterOpts{
		Namespace: "clawchain",
		Subsystem: "oracle",
		Name:      "vote_periods_total",
		Help:      "Total number of completed oracle vote periods.",
	})

	// OracleExchangeRatesGauge tracks how many denom exchange rates are active.
	OracleExchangeRatesGauge = promauto.NewGauge(prometheus.GaugeOpts{
		Namespace: "clawchain",
		Subsystem: "oracle",
		Name:      "active_exchange_rates",
		Help:      "Number of active exchange rate denoms after the latest vote tally.",
	})

	// OracleVotingValidatorsGauge tracks how many bonded validators participated in voting.
	OracleVotingValidatorsGauge = promauto.NewGauge(prometheus.GaugeOpts{
		Namespace: "clawchain",
		Subsystem: "oracle",
		Name:      "voting_validators",
		Help:      "Number of bonded validators in the active oracle vote set.",
	})

	// OracleMissCounterGauge tracks total accumulated miss counts across all validators.
	OracleMissCounterGauge = promauto.NewGauge(prometheus.GaugeOpts{
		Namespace: "clawchain",
		Subsystem: "oracle",
		Name:      "total_miss_counter",
		Help:      "Sum of miss counters across all validators in current slash window.",
	})

	// OracleSlashCounter counts oracle-related validator slashes.
	OracleSlashCounter = promauto.NewCounter(prometheus.CounterOpts{
		Namespace: "clawchain",
		Subsystem: "oracle",
		Name:      "slashes_total",
		Help:      "Total number of oracle-related validator slashes.",
	})

	// OracleRewardDistributedGauge tracks the total rewards distributed in the last period.
	OracleRewardDistributedGauge = promauto.NewGauge(prometheus.GaugeOpts{
		Namespace: "clawchain",
		Subsystem: "oracle",
		Name:      "rewards_distributed_uclaw",
		Help:      "Total uclaw rewards distributed to oracle voters in the last vote period.",
	})

	// OracleExchangeRateGaugeVec tracks individual exchange rates per denom.
	OracleExchangeRateGaugeVec = promauto.NewGaugeVec(prometheus.GaugeOpts{
		Namespace: "clawchain",
		Subsystem: "oracle",
		Name:      "exchange_rate",
		Help:      "Current oracle exchange rate for a given denom.",
	}, []string{"denom"})

	// OracleBallotPowerGauge tracks the total voting power in the oracle ballot.
	OracleBallotPowerGauge = promauto.NewGauge(prometheus.GaugeOpts{
		Namespace: "clawchain",
		Subsystem: "oracle",
		Name:      "ballot_power_total",
		Help:      "Total voting power participating in the oracle ballot.",
	})

	// OracleLastUpdateHeightGauge tracks the block height of the last exchange rate update.
	// Referenced by alerting-rules.yml OraclePriceStale alert.
	OracleLastUpdateHeightGauge = promauto.NewGauge(prometheus.GaugeOpts{
		Namespace: "clawchain",
		Subsystem: "oracle",
		Name:      "last_update_height",
		Help:      "Block height of the most recent oracle exchange rate update.",
	})

	// OracleMissCounterIncrease tracks the miss counter as a simple gauge
	// that alert rules can use with increase() to detect rapid misses.
	// Referenced by alerting-rules.yml OracleHighMissRate alert.
	OracleMissCounterIncrease = promauto.NewCounter(prometheus.CounterOpts{
		Namespace: "clawchain",
		Subsystem: "oracle",
		Name:      "miss_counter",
		Help:      "Monotonic counter of individual oracle vote misses across all validators.",
	})

	// OracleActiveFeedersGauge tracks the number of validators with active feeder delegations.
	// Referenced by alerting-rules.yml OracleNoActiveFeeders alert.
	OracleActiveFeedersGauge = promauto.NewGauge(prometheus.GaugeOpts{
		Namespace: "clawchain",
		Subsystem: "oracle",
		Name:      "active_feeders",
		Help:      "Number of validators with active oracle feeder delegations.",
	})
)
