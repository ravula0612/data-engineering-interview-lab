"use strict";

const SOURCES = {
  sql: "https://www.postgresql.org/docs/current/tutorial-window.html",
  spark: "https://spark.apache.org/docs/latest/sql-performance-tuning.html",
  streaming: "https://spark.apache.org/docs/latest/streaming/apis-on-dataframes-and-datasets.html",
  merge: "https://docs.databricks.com/aws/en/delta/merge",
  bundles: "https://docs.databricks.com/aws/en/dev-tools/bundles/",
  pipelines: "https://docs.databricks.com/aws/en/ldp/",
  catalog: "https://docs.databricks.com/aws/en/data-governance/unity-catalog/"
};

const QUESTIONS = [
  ["sql-latest", "SQL", "Intermediate", "Find the latest status for each order",
    "order_events(order_id, event_ts, event_id, status) can contain several events with the same event_ts. Write a query returning one row per order. Assume event_ts is non-null and larger event_id breaks ties within an order.",
    "Partition by order_id and sort by event_ts and then event_id, both descending. A stable secondary sort keeps reruns deterministic. If event_id has no business ordering, agree on a tie-breaker with the producer before relying on it.",
    ["Returns exactly one row per order", "Uses a deterministic tie-breaker", "Explains what the tie-breaker means"],
    SOURCES.sql, `WITH ranked AS (
  SELECT order_id, status,
         ROW_NUMBER() OVER (
           PARTITION BY order_id
           ORDER BY event_ts DESC, event_id DESC
         ) AS version
  FROM order_events
)
SELECT order_id, status
FROM ranked
WHERE version = 1;`],
  ["sql-missing", "SQL", "Foundations", "Find customers with no successful payment",
    "customers(customer_id) contains one row per customer. payments(customer_id, status) may contain null customer IDs. Return customers without any payment with status = 'paid'.",
    "Use a correlated NOT EXISTS predicate. Null customer IDs cannot satisfy the equality inside it, and several matching payments do not duplicate the customer. Test absent payments, failed-only payments, and a null payment key.",
    ["Checks only paid records", "Handles nullable payment keys", "Preserves one row per customer"],
    null, `SELECT c.customer_id
FROM customers AS c
WHERE NOT EXISTS (
  SELECT 1 FROM payments AS p
  WHERE p.customer_id = c.customer_id AND p.status = 'paid'
);`],
  ["sql-top", "SQL", "Intermediate", "Return the top three distinct amounts per region",
    "sales(sale_id, region, amount) has non-null amounts. Return every sale in the top three distinct amount values within each region, including ties.",
    "Use DENSE_RANK by region and order by amount descending. Filter ranks of three or less in an outer query. Do not add sale_id to the ranking order because it would split equal amounts into different peer groups.",
    ["Ranks within each region", "Includes all ties", "Uses consecutive ranks for distinct values"],
    SOURCES.sql, `WITH ranked AS (
  SELECT sale_id, region, amount,
         DENSE_RANK() OVER (PARTITION BY region ORDER BY amount DESC) AS position
  FROM sales
)
SELECT sale_id, region, amount FROM ranked WHERE position <= 3;`],
  ["sql-grain", "SQL", "Advanced", "Fix a revenue metric inflated by a join",
    "A dashboard joins order_lines (one row per item line) to refunds (one row per refund attempt) using order_id. Gross sales doubled after refunds were added. How would you produce gross, settled refunds, and net at order grain?",
    "Aggregate line amounts by order first. Separately aggregate settled refund amounts by order, deduplicating by refund identifier if ingestion can replay. Left join the two aggregates from the order spine and coalesce missing totals to zero. Compare totals to each source before publishing and decide how refund-only orders should be reported.",
    ["Identifies many-to-many fan-out", "Aggregates each side to order grain", "Reconciles source totals and addresses missing sides"]],
  ["py-batch", "Python", "Foundations", "Read records in bounded batches",
    "Implement batches(records, size) for an iterator that cannot be rewound. Emit the trailing batch and reject non-positive sizes.",
    "Read at most size records from a single iterator and stop on an empty batch. Memory is proportional to batch size. In this generator, validation runs when iteration starts. Test an empty iterator, exact multiples, and a trailing partial batch.",
    ["Consumes the iterator once", "Keeps memory bounded", "Emits a partial final batch"],
    null, `from itertools import islice

def batches(records, size):
    if size <= 0:
        raise ValueError("size must be positive")
    iterator = iter(records)
    while batch := list(islice(iterator, size)):
        yield batch`],
  ["py-merge", "Python", "Intermediate", "Merge sorted events from several files",
    "Ten files contain records sorted by the same comparable event key. Produce a single sorted stream without loading all the files. How would you handle deterministic ties?",
    "Use heapq.merge on lazy iterators with a common key, and keep the files open for the duration of consumption. The merge needs one current record per input and takes O(N log K) time for N records over K inputs. Use a composite ordering such as event time and event ID if each file also follows that ordering.",
    ["Uses a lazy k-way merge", "Accounts for input ordering and resource cleanup", "Handles equal keys deterministically"]],
  ["py-money", "Python", "Intermediate", "Parse amounts without binary rounding",
    "A CSV contains decimal amount strings. USD and INR both require two decimal places. How would you parse, total, and quarantine bad input?",
    "Construct Decimal from the original string, reject non-finite values, and validate precision with a documented rounding or rejection rule. Represent approved amounts as integer minor units or use a Decimal context sized for the totals. Keep each currency separate and quarantine rejection reasons with input row identifiers.",
    ["Avoids intermediate floats", "Validates precision and non-finite values", "Tracks rejects and keeps currencies separate"]],
  ["py-retry", "Python", "Advanced", "Retry an export without duplicating an upload",
    "A client uploads an export and times out before receiving the reply. The service might already have stored it. Design the retry behavior.",
    "Use a stable idempotency key for this export and require the service to store that key atomically with the committed result. On timeout, look up the result or retry with the same key and same payload. Use bounded backoff and jitter for transient errors, and stop retrying permanent validation failures.",
    ["Addresses the ambiguous commit", "Uses a stable idempotency key", "Bounds retries and distinguishes error classes"]],
  ["spark-plan", "Spark", "Foundations", "Identify a shuffle in a Spark plan",
    "A pipeline filters rows and then groups them by account. Where would you expect Spark to redistribute rows and what would you inspect?",
    "Inspect the executed SQL plan in the Spark UI for a shuffle exchange feeding the aggregation and compare its read and write metrics. A filter can run locally, and partial aggregation can reduce shuffle volume. An exchange may be unnecessary if the chosen plan already provides the required distribution.",
    ["Identifies the exchange", "Explains why grouping may need redistribution", "Checks executed plan and metrics"], SOURCES.spark],
  ["spark-skew", "Spark", "Advanced", "Diagnose one task running 20× longer",
    "A join stage has 399 tasks finishing in seconds and one task running for minutes. Spill is concentrated in that task. How do you prove skew and mitigate it?",
    "Compare task input and shuffle bytes and look for a hot join key, including default or null-like values. Confirm adaptive skew handling applies to the executed join. If supported by the data, broadcast a genuinely small side or split hot keys with a salting strategy that preserves multiplicity. Measure tail latency, spill, and output parity.",
    ["Uses task metrics and key distribution", "Picks a mitigation suited to join shape", "Verifies correctness and tail latency"], SOURCES.spark],
  ["spark-files", "Spark", "Intermediate", "Reduce the impact of small files",
    "A table has a day of data spread across 80,000 tiny files. A filter on that day is slow despite partition pruning. What would you change?",
    "Check bytes per selected file, scan task count, and file listing overhead. Compact the affected partitions where the table format supports safe concurrent writes. Change upstream batching or output partition counts to avoid recreating the problem. Compare scan duration and file counts on equivalent reads.",
    ["Separates pruning from per-file overhead", "Addresses existing and future files", "Measures comparable scans"], SOURCES.spark],
  ["spark-cache", "Spark", "Intermediate", "Decide whether caching helps",
    "Two actions use the same expensive join result. The result is larger than executor memory. What would you cache and how would you tell if it helped?",
    "Estimate reuse and materialization cost. Project and filter down to the shared columns and rows before persisting, select an appropriate storage level, and check the Storage tab and repeated stage timings. Unpersist once reuse ends. If the work is reused across jobs, consider storing a durable intermediate.",
    ["Identifies reusable work", "Sizes or narrows the cached data", "Measures reuse and unpersists"], SOURCES.spark],
  ["dbx-merge", "Databricks", "Intermediate", "Resolve duplicate source rows before MERGE",
    "A batch contains several updates per customer. A Delta MERGE by customer_id fails for some customers. The producer provides a per-customer sequence. What should the pipeline do?",
    "Reduce incoming rows to one per customer using the highest producer sequence. Reject or reconcile conflicting records with the same sequence. For a latest-state target, persist the sequence and only update when the incoming value is newer. For a historical target, retain the intermediate changes and use a history-aware design.",
    ["Explains ambiguous matches", "Uses an authoritative ordering", "Protects target state from older replays"], SOURCES.merge],
  ["dbx-bundles", "Databricks", "Intermediate", "Promote the same job to two environments",
    "Development and production have distinct catalogs, service identities, and compute policies. How would you deploy the same Lakeflow Job to both?",
    "Define the job once in a Declarative Automation Bundle and place environment-specific values in targets. Validate bundle changes in CI and deploy after review using an authorized identity. Set the run identity deliberately, grant least privilege on each target, and use versioned source changes to roll back configuration.",
    ["Separates shared definitions and target overrides", "Distinguishes deploy and run identities", "Explains validation and rollback"], SOURCES.bundles],
  ["dbx-pipelines", "Databricks", "Foundations", "Choose between a pipeline and a job",
    "A team needs an incremental table from arriving files, followed by an export that runs only after the pipeline completes. Describe how you would structure it.",
    "Use a Lakeflow Spark Declarative Pipelines pipeline to define tables and transformations. Use Lakeflow Jobs to orchestrate the pipeline task and an export task with a dependency. Track pipeline data quality and freshness separately from job task success.",
    ["Describes the pipeline's role", "Defines task ordering in Lakeflow Jobs", "Separates operational and data quality signals"], SOURCES.pipelines],
  ["dbx-catalog", "Databricks", "Advanced", "Publish a restricted analytics dataset",
    "A raw table contains customer identifiers. Analysts need only daily aggregates. An unattended job updates those aggregates. Design access within Unity Catalog.",
    "Publish a table or governed view containing only approved aggregates. Give analysts usage on its parent objects and SELECT on the approved object. Give the job identity only the underlying read and target write privileges it needs. Verify grants and ownership, then check the aggregate grain for groups that could identify individuals.",
    ["Limits analyst access to approved data", "Grants pipeline identity least privilege", "Checks both grants and aggregate disclosure"], SOURCES.catalog],
  ["str-watermark", "Streaming", "Intermediate", "Choose a watermark for late events",
    "A five-minute dashboard aggregates event time. Most events arrive within six minutes, but some arrive hours later. What does a 15-minute watermark change and how would you account for very late arrivals?",
    "Configure the event-time watermark before the window aggregation and select an output mode compatible with the desired dashboard behavior. The watermark advances with observed event time and lets eligible operators evict old state. Events beyond the delay may be dropped by a relevant operator. Preserve raw events and reconcile windows from a bounded backfill when required.",
    ["Explains event-time watermark and state retention", "Avoids a wall-clock cutoff claim", "Provides a correction path for late arrivals"], SOURCES.streaming],
  ["str-replay", "Streaming", "Advanced", "Recover from a crash after a sink write",
    "A microbatch writes to an external system and the stream crashes before recording completion. What must happen on restart to prevent duplicate output?",
    "Restart from the durable checkpoint so the engine can resume tracked progress. Treat the external write as replayable. Make the write idempotent via a stable event key, or atomically commit both the batch output and an application-plus-batch marker. Test a crash after write and before checkpoint progress.",
    ["Recognizes the completed batch may replay", "Uses a durable checkpoint", "Makes sink writes idempotent or atomic"], SOURCES.streaming],
  ["str-lag", "Streaming", "Intermediate", "Diagnose growing consumer lag",
    "Broker lag is rising, but CPU is low and batch durations are increasing. What measurements would distinguish input imbalance, slow sinks, and growing stream state?",
    "Compare offsets and backlog by broker partition, then compare processed rows per second with arriving rows per second. Split microbatch time into input, computation, state operations, and sink commit. Inspect hot partitions, state row counts, and remote sink latency before changing compute. Confirm recovery using backlog and end-to-end freshness.",
    ["Measures backlog by partition", "Breaks down batch phases", "Validates recovery with freshness and backlog"], SOURCES.streaming],
  ["str-cdc", "Streaming", "Advanced", "Apply out-of-order CDC events",
    "A source emits changes with a per-key ordering token. A delete reaches your consumer before an older update for the same key. How do you prevent a deleted row from reappearing?",
    "Compare source ordering tokens instead of ingestion timestamps. Persist the most recent token and a delete marker so older updates become no-ops. Keep the marker for the maximum replay horizon, or reconcile from an authoritative snapshot before removing it. Design for snapshot-to-log handoff and detect source positions that are missing.",
    ["Uses source order", "Retains delete ordering", "Addresses replay horizon or reconciliation"]],
  ["model-grain", "Data modeling", "Foundations", "Declare the grain of a shipment fact",
    "A shipment can have multiple parcels and each parcel has many scan events. Which grain would you choose for scans, and how would you support shipment-level KPIs?",
    "Use one fact row per scan event and a stable event identifier, with parcel and shipment references. Compute shipment metrics in a shipment-grain aggregate or lifecycle table. Distinguish event counts, parcel counts, and shipment counts to avoid inflating measures after joins.",
    ["States an unambiguous event grain", "Separates shipment metrics from event metrics", "Explains keys and counting"]],
  ["model-scd", "Data modeling", "Intermediate", "Join facts to the correct SCD Type 2 version",
    "A customer's tier changes at noon. Transactions arrive late. How can you assign each transaction to the correct tier version?",
    "Join on the natural key and a half-open validity interval: valid_from <= transaction event time and event time < valid_to, treating an open end as unbounded. Check for overlapping versions and decide how to treat facts that precede known dimension history. Replay affected fact keys when corrections change history.",
    ["Uses transaction event time", "Uses half-open intervals", "Addresses missing or corrected dimension versions"]],
  ["model-balances", "Data modeling", "Intermediate", "Aggregate daily balances correctly",
    "A table contains account closing balances by date. An analyst wants a monthly balance by currency. What aggregation would you propose?",
    "Define the metric first. For month-end balance, take each account's closing snapshot as of the reporting date according to the ledger's freshness rules, then sum across accounts within currency. Balance is additive across accounts but typically not across days. Average daily balances require explicit treatment of missing days.",
    ["Clarifies month-end versus monthly average", "Avoids summing across snapshot dates", "Handles currency and missing days"]],
  ["model-bridge", "Data modeling", "Advanced", "Report revenue across overlapping campaigns",
    "One order can be attributed to several campaigns. The campaign revenue report must reconcile to total eligible order revenue. How do you model the relationship?",
    "Introduce an order-campaign bridge at one row per attribution and store allocation weights with a rule version. Enforce that the weights sum to one for eligible orders, and define how unattributed orders appear. Aggregate weighted amounts. Define currency rounding so grouped amounts can still reconcile.",
    ["Uses a bridge at attribution grain", "Enforces allocation invariants", "Verifies totals and handles unattributed orders"]],
  ["quality-drift", "Data quality", "Intermediate", "Detect a breaking schema change",
    "A partner adds an optional column and sometimes sends a numeric field as text. What would you allow, quarantine, and alert on?",
    "Compare schema and contracts at ingestion. Allow compatible additions under a versioned policy. Parse text when conversion is explicit and lossless, quarantine invalid rows with reasons, and preserve raw input for replay. Alert on validation failure rates and agree a threshold beyond which publication pauses.",
    ["Distinguishes compatible and breaking changes", "Preserves raw records and rejection reasons", "Defines alert and publication thresholds"]],
  ["quality-zero", "Data quality", "Foundations", "Investigate a zero-row batch",
    "The daily pipeline reports success but produced zero rows. What signals tell you whether the source was empty or the pipeline silently lost data?",
    "Check whether source files or offsets advanced and compare source count, parsed count, accepted count, and target count. Compare the run against expected delivery windows and known empty days. Alert on unexplained count differences or freshness violations independently from job success.",
    ["Traces counts by stage", "Distinguishes expected empty input", "Uses freshness or reconciliation alerts"]],
  ["quality-metrics", "Data quality", "Advanced", "Validate a partition before publishing it",
    "A financial pipeline publishes a daily settlements table. An incomplete upstream delivery must not appear as final. What controls would you add?",
    "Land the incoming files and record delivery completeness from a manifest or agreed finalization marker. Validate key uniqueness, amounts, totals by currency, and expected coverage in staging. Publish the checked partition atomically, track its input version, and define a correction strategy for late adjustments.",
    ["Verifies delivery completeness", "Checks totals and keys in staging", "Publishes atomically with input lineage"]],
  ["quality-fresh", "Data quality", "Intermediate", "Set a meaningful freshness alert",
    "A streaming job runs every five minutes, but data in a dashboard is sometimes hours old. Define freshness checks for this pipeline.",
    "Measure producer lag, ingestion lag, and time since the last published complete dashboard window. Use arrival timestamps or producer heartbeats to distinguish quiet periods from missing data. Alert on breached service targets and include the affected stage and data interval in the alert.",
    ["Separates source, processing, and serving freshness", "Handles quiet periods", "Makes alerts actionable"]],
  ["design-proof", "System design", "Advanced", "Design a pipeline for delivery proof images",
    "A logistics platform receives 2 million proof-of-delivery events each day. Each event references an image averaging 300 KB. Ops needs a lookup within five minutes and auditors need 90 days of metadata. Design storage, replay, and access.",
    "Estimate roughly 600 GB of images per day before overhead and keep binary objects in object storage. Store a small metadata fact keyed by event ID, with delivery ID and object reference for lookup. Deduplicate using stable events and idempotent object writes. Define binary retention separately from metadata, secure object access, and reconcile missing or orphaned objects.",
    ["Estimates throughput and separates binaries from metadata", "Defines idempotent replay and reconciliation", "Sets access, retention, and freshness controls"]],
  ["design-backfill", "System design", "Advanced", "Run a 90-day backfill alongside live traffic",
    "A bug affected a derived daily metric for three months. New data must continue to arrive while historical partitions are corrected. How do you prevent inconsistent reads?",
    "Freeze an explicit input snapshot or boundary and recompute only affected partitions into staging. Use capacity limits and a shared exclusion or version-check protocol for overlapping writes. Compare per-partition counts and metrics, then atomically swap the verified output at the required consistency scope. Keep a rollback version and verify the live boundary.",
    ["Sets replay boundaries and isolates work", "Controls concurrent writes and publication", "Defines validation and rollback"]],
  ["design-pay", "System design", "Advanced", "Reconcile two settlement feeds",
    "An internal ledger and an external provider produce daily feeds with duplicates, late records, and occasional split payouts. Design a pipeline for finance to resolve mismatches.",
    "Keep immutable source copies and define identifiers, currency, settlement dates, and matching grain. Run deterministic exact matching first, then group allowed split payouts using documented rules. Persist match decisions, file versions, and rule versions. Publish actionable exception categories alongside per-currency control totals and support idempotent restatements.",
    ["Defines matching grain and split rules", "Preserves an audit trail", "Publishes actionable exceptions and reconciles totals"]],
  ["design-incremental", "System design", "Intermediate", "Ingest hourly partner CSV files safely",
    "A partner resends filenames and sometimes publishes corrected content under the same name. Design incremental ingestion without double-counting corrected deliveries.",
    "Use a manifest or object version plus content hash to distinguish retries from changed files. Keep each raw version immutable, validate before publishing, and use a partition replacement or keyed merge based on the contract. Record the active version so replay produces the same output, and alert when expected files are missing.",
    ["Distinguishes retries from revisions", "Defines a publication rule for corrections", "Tracks input versions and missing deliveries"]]
].map(([id, topic, level, title, prompt, answer, rubric, source, code]) =>
  ({ id, topic, level, title, prompt, answer, rubric, source, code })
);

const MOCKS = [
  { title: "SQL & Python", minutes: 20, description: "Write a query, build a bounded iterator, and diagnose a reporting error.", ids: ["sql-latest", "py-batch", "sql-grain"] },
  { title: "Spark & Databricks", minutes: 25, description: "Diagnose skew, fix a Delta upsert, and reason through late events.", ids: ["spark-skew", "dbx-merge", "str-watermark"] },
  { title: "Senior pipeline design", minutes: 30, description: "Design a delivery pipeline, recover a stream, and coordinate a backfill.", ids: ["design-proof", "str-replay", "design-backfill"] }
];
