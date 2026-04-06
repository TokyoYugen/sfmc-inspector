/**
 * SFMC Inspector — sql-linter.js
 * Static analysis of SQL used in SFMC Query Activities.
 * Returns structured diagnostics with severity levels.
 */

var SqlLinter = (function () {

  var SEVERITY = {
    ERROR:   "error",
    WARNING: "warning",
    INFO:    "info"
  };

  // ─── Rule definitions ────────────────────────────────────────────────────────

  var rules = [

    {
      id:       "SQL001",
      severity: SEVERITY.ERROR,
      title:    "SELECT * used",
      check: function (sql) {
        return /SELECT\s+\*/i.test(sql);
      },
      message: "Never use SELECT *. List columns explicitly to avoid unexpected data, improve performance, and ensure schema changes don't silently break your query.",
      fix:    "Replace SELECT * with an explicit column list."
    },

    {
      id:       "SQL002",
      severity: SEVERITY.WARNING,
      title:    "Missing NOLOCK on data view",
      check: function (sql) {
        var dataViews = [
          "_Sent", "_Open", "_Click", "_Bounce", "_Unsubscribe",
          "_Complaint", "_Job", "_ListMembership", "_Subscribers",
          "_Journey", "_JourneyActivity"
        ];
        var usesDV = dataViews.some(function (dv) {
          return new RegExp("FROM\\s+" + dv + "\\b", "i").test(sql) ||
                 new RegExp("JOIN\\s+" + dv  + "\\b", "i").test(sql);
        });
        if (!usesDV) return false;
        return !/WITH\s*\(\s*NOLOCK\s*\)/i.test(sql);
      },
      message: "Queries on SFMC data views (_Sent, _Open, _Click, etc.) should use WITH (NOLOCK) to avoid locking system tables and causing timeouts.",
      fix:    "Add WITH (NOLOCK) after each data view reference: FROM _Sent WITH (NOLOCK)"
    },

    {
      id:       "SQL003",
      severity: SEVERITY.ERROR,
      title:    "NULL comparison with = or !=",
      check: function (sql) {
        return /=\s*NULL\b/i.test(sql) || /!=\s*NULL\b/i.test(sql) || /<>\s*NULL\b/i.test(sql);
      },
      message: "NULL comparisons with = or != always return FALSE in SQL. This is a logic error.",
      fix:    "Use IS NULL or IS NOT NULL instead of = NULL or != NULL."
    },

    {
      id:       "SQL004",
      severity: SEVERITY.WARNING,
      title:    "No WHERE clause on large data view",
      check: function (sql) {
        var heavyViews = ["_Sent", "_Open", "_Click", "_Bounce", "_Job"];
        var usesHeavy = heavyViews.some(function (dv) {
          return new RegExp("FROM\\s+" + dv + "\\b", "i").test(sql);
        });
        if (!usesHeavy) return false;
        return !/\bWHERE\b/i.test(sql);
      },
      message: "Querying a high-volume data view like _Sent without a WHERE clause can process millions of rows and time out, or fail the automation.",
      fix:    "Add a date filter: WHERE CONVERT(DATE, EventDate) = DATEADD(DAY, -1, CONVERT(DATE, GETDATE()))"
    },

    {
      id:       "SQL005",
      severity: SEVERITY.WARNING,
      title:    "Implicit type coercion in JOIN",
      check: function (sql) {
        // Heuristic: CONVERT or CAST absent but JOIN ON present — hard to be certain,
        // so we flag joins that compare EmailAddress-style with numeric-looking fields
        return /JOIN.+ON.+EmailAddress\s*=\s*\w+Id/i.test(sql) ||
               /JOIN.+ON\s+\w+Id\s*=\s*EmailAddress/i.test(sql);
      },
      message: "Joining on mismatched types (e.g. EmailAddress vs numeric ID) causes implicit coercion, which is slow and may produce wrong results.",
      fix:    "Ensure JOIN keys have matching data types. Use CONVERT() explicitly if needed."
    },

    {
      id:       "SQL006",
      severity: SEVERITY.INFO,
      title:    "DISTINCT on high-volume table",
      check: function (sql) {
        return /SELECT\s+DISTINCT/i.test(sql);
      },
      message: "DISTINCT triggers an implicit sort across all rows. On large data extensions this can cause timeouts. Consider deduplicating at write time or using ROW_NUMBER() instead.",
      fix:    "Evaluate whether DISTINCT is truly needed, or use a CTE with ROW_NUMBER() OVER (PARTITION BY key ORDER BY date DESC)."
    },

    {
      id:       "SQL007",
      severity: SEVERITY.WARNING,
      title:    "Subquery in WHERE instead of JOIN",
      check: function (sql) {
        return /WHERE.+\(\s*SELECT/i.test(sql);
      },
      message: "Correlated subqueries in WHERE clauses are evaluated row-by-row and are much slower than equivalent JOINs in SFMC's query engine.",
      fix:    "Rewrite as a JOIN or use EXISTS() instead of IN (SELECT ...)."
    },

    {
      id:       "SQL008",
      severity: SEVERITY.ERROR,
      title:    "Missing INTO clause (no target DE)",
      check: function (sql) {
        // SFMC Query Activities require an explicit target — but the INTO
        // is set in the UI, not in SQL. Flag if someone puts it inline and gets it wrong.
        // This catches queries that have INTO but target a non-existent or misspelled name.
        // We just warn if INTO is present but the table name looks wrong.
        return false; // Future: compare against known DE list
      },
      message: "Query target (INTO) not specified. Ensure a target Data Extension is set in the Query Activity configuration.",
      fix:    "Set the target Data Extension in the SFMC Query Activity settings."
    },

    {
      id:       "SQL009",
      severity: SEVERITY.INFO,
      title:    "TOP without ORDER BY",
      check: function (sql) {
        return /\bTOP\s+\d+\b/i.test(sql) && !/\bORDER\s+BY\b/i.test(sql);
      },
      message: "TOP without ORDER BY returns an arbitrary subset of rows — the result is non-deterministic.",
      fix:    "Add an ORDER BY clause to ensure consistent results with TOP."
    },

    {
      id:       "SQL010",
      severity: SEVERITY.WARNING,
      title:    "GETDATE() without timezone context",
      check: function (sql) {
        return /\bGETDATE\(\)/i.test(sql) && !/\bAT TIME ZONE\b/i.test(sql);
      },
      message: "GETDATE() returns UTC time in SFMC. If your send window or business logic is timezone-sensitive, results may be off by hours.",
      fix:    "Use CONVERT(datetime, GETDATE() AT TIME ZONE 'UTC' AT TIME ZONE 'Central Standard Time') or adjust for your account timezone."
    }

  ];

  // ─── Public API ──────────────────────────────────────────────────────────────

  function lint(sql) {
    if (!sql || typeof sql !== "string") {
      return { diagnostics: [], score: 100 };
    }

    var diagnostics = [];

    rules.forEach(function (rule) {
      try {
        if (rule.check(sql)) {
          diagnostics.push({
            id:       rule.id,
            severity: rule.severity,
            title:    rule.title,
            message:  rule.message,
            fix:      rule.fix
          });
        }
      } catch (e) {
        // Rule threw — skip it silently
      }
    });

    // Score: 100 - (errors * 20) - (warnings * 8) - (infos * 2)
    var score = 100;
    diagnostics.forEach(function (d) {
      if (d.severity === SEVERITY.ERROR)   score -= 20;
      if (d.severity === SEVERITY.WARNING) score -= 8;
      if (d.severity === SEVERITY.INFO)    score -= 2;
    });
    score = Math.max(0, score);

    return {
      diagnostics: diagnostics,
      score:       score,
      errorCount:   diagnostics.filter(function (d) { return d.severity === SEVERITY.ERROR;   }).length,
      warningCount: diagnostics.filter(function (d) { return d.severity === SEVERITY.WARNING; }).length,
      infoCount:    diagnostics.filter(function (d) { return d.severity === SEVERITY.INFO;    }).length
    };
  }

  function getRules() {
    return rules.map(function (r) {
      return { id: r.id, severity: r.severity, title: r.title, message: r.message };
    });
  }

  return { lint: lint, getRules: getRules, SEVERITY: SEVERITY };

})();
