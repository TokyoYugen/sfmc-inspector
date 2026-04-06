/**
 * SFMC Inspector — ampscript-linter.js
 * Static analysis of AMPScript V1 blocks found in emails, templates, CloudPages.
 */

var AmpscriptLinter = (function () {

  var SEVERITY = {
    ERROR:   "error",
    WARNING: "warning",
    INFO:    "info"
  };

  // ─── Extract AMPScript blocks from raw HTML/content ──────────────────────────

  function extractBlocks(content) {
    var blocks = [];
    // Match %%[ ... ]%% blocks (the standard AMPScript delimiter)
    var blockRe = /%%\[([\s\S]*?)\]%%/g;
    var match;
    while ((match = blockRe.exec(content)) !== null) {
      blocks.push({ raw: match[0], inner: match[1], offset: match.index });
    }
    // Also capture inline %%=...=%% expressions
    var inlineRe = /%%=([\s\S]*?)=%%/g;
    while ((match = inlineRe.exec(content)) !== null) {
      blocks.push({ raw: match[0], inner: match[1], offset: match.index, inline: true });
    }
    return blocks;
  }

  // ─── Rule definitions ────────────────────────────────────────────────────────

  var rules = [

    {
      id:       "AMP001",
      severity: SEVERITY.ERROR,
      title:    "Variable used without VAR declaration",
      check: function (content, blocks) {
        var declared  = {};
        var used      = [];
        var issues    = [];

        blocks.forEach(function (b) {
          // Find VAR declarations
          var varRe = /\bVAR\s+@(\w+)/gi;
          var m;
          while ((m = varRe.exec(b.inner)) !== null) {
            declared["@" + m[1].toLowerCase()] = true;
          }
          // Find @variable usages (not in VAR declarations)
          var useRe = /(?<!VAR\s)@(\w+)/gi;
          while ((m = useRe.exec(b.inner)) !== null) {
            used.push("@" + m[1].toLowerCase());
          }
        });

        var undeclared = used.filter(function (v) {
          return !declared[v];
        });

        return undeclared.length > 0;
      },
      message: "One or more @variables are used without a VAR declaration. In AMPScript V1 all variables must be explicitly declared with VAR @variableName.",
      fix:    "Add VAR @variableName at the top of your AMPScript block before using the variable."
    },

    {
      id:       "AMP002",
      severity: SEVERITY.ERROR,
      title:    "IF block without ENDIF",
      check: function (content, blocks) {
        var ifCount     = 0;
        var endifCount  = 0;
        blocks.forEach(function (b) {
          ifCount    += (b.inner.match(/\bIF\b/gi)    || []).length;
          endifCount += (b.inner.match(/\bENDIF\b/gi) || []).length;
        });
        return ifCount !== endifCount;
      },
      message: "IF and ENDIF counts don't match. Every IF block must have a corresponding ENDIF.",
      fix:    "Check each IF/ELSEIF chain and ensure it is closed with ENDIF."
    },

    {
      id:       "AMP003",
      severity: SEVERITY.ERROR,
      title:    "FOR block without NEXT",
      check: function (content, blocks) {
        var forCount  = 0;
        var nextCount = 0;
        blocks.forEach(function (b) {
          forCount  += (b.inner.match(/\bFOR\b/gi)  || []).length;
          nextCount += (b.inner.match(/\bNEXT\b/gi) || []).length;
        });
        return forCount !== nextCount;
      },
      message: "FOR loop without matching NEXT found. Every FOR must close with NEXT @counter.",
      fix:    "Add NEXT @counter at the end of each FOR loop block."
    },

    {
      id:       "AMP004",
      severity: SEVERITY.WARNING,
      title:    "Output without EncodeValue()",
      check: function (content, blocks) {
        // Look for SetVar or direct output of subscriber data without encoding
        return blocks.some(function (b) {
          if (b.inline) return false;
          // Check for AttributeValue() result stored but then used in v() without Encode
          return /AttributeValue\s*\(/i.test(b.inner) &&
                 !/EncodeValue\s*\(/i.test(b.inner);
        });
      },
      message: "AttributeValue() result output without EncodeValue() wrapping. Unencoded subscriber data can break HTML rendering or create XSS-like output in web contexts.",
      fix:    "Wrap subscriber attribute outputs: %%=EncodeValue(AttributeValue('fieldName'))=%%"
    },

    {
      id:       "AMP005",
      severity: SEVERITY.WARNING,
      title:    "Hardcoded email address or ClientID",
      check: function (content) {
        return /client_id\s*=\s*["']\d+["']/i.test(content) ||
               /clientid\s*=\s*["']\d+["']/i.test(content) ||
               /["'][a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}["']/.test(content);
      },
      message: "Possible hardcoded email address or Client ID found. These should be stored in a Data Extension or System Data and referenced dynamically.",
      fix:    "Move hardcoded values to a Sendable DE field or use AttributeValue() / system attributes."
    },

    {
      id:       "AMP006",
      severity: SEVERITY.ERROR,
      title:    "LookupRows without null check",
      check: function (content, blocks) {
        return blocks.some(function (b) {
          var hasLookup    = /\bLookupRows\s*\(/i.test(b.inner);
          var hasRowCount  = /\bRowCount\s*\(/i.test(b.inner);
          return hasLookup && !hasRowCount;
        });
      },
      message: "LookupRows() used without a RowCount() null-check. If no rows are returned and you access a row directly, the email will error and may not send.",
      fix:    "Always check: SET @rowCount = RowCount(@rows) and wrap row access in IF @rowCount > 0."
    },

    {
      id:       "AMP007",
      severity: SEVERITY.WARNING,
      title:    "Lowercase AMPScript keywords",
      check: function (content, blocks) {
        var keywords = ["if", "endif", "else", "elseif", "for", "next", "var", "set", "then"];
        return blocks.some(function (b) {
          return keywords.some(function (kw) {
            var re = new RegExp("\\b" + kw + "\\b", "g");
            var upperRe = new RegExp("\\b" + kw.toUpperCase() + "\\b", "g");
            var lowerMatches = (b.inner.match(re) || []).length;
            var upperMatches = (b.inner.match(upperRe) || []).length;
            return lowerMatches > upperMatches;
          });
        });
      },
      message: "AMPScript keywords appear in lowercase. Convention is UPPERCASE for all keywords (IF, ENDIF, SET, VAR, FOR, NEXT, THEN, ELSE) for readability and consistency.",
      fix:    "Uppercase all AMPScript keywords: IF, ENDIF, SET, VAR, FOR, NEXT, THEN, ELSE, ELSEIF."
    },

    {
      id:       "AMP008",
      severity: SEVERITY.INFO,
      title:    "TreatAsContent() usage detected",
      check: function (content) {
        return /\bTreatAsContent\s*\(/i.test(content);
      },
      message: "TreatAsContent() can execute AMPScript embedded in DE field values. This is powerful but dangerous — ensure the source data is trusted and sanitized.",
      fix:    "Confirm that the Data Extension field feeding TreatAsContent() cannot be modified by end users or external systems."
    },

    {
      id:       "AMP009",
      severity: SEVERITY.WARNING,
      title:    "InsertDE / UpsertDE without error handling",
      check: function (content, blocks) {
        return blocks.some(function (b) {
          var hasInsert = /\b(InsertDE|UpsertDE|UpdateDE|DeleteDE)\s*\(/i.test(b.inner);
          var hasIf     = /\bIF\b/i.test(b.inner);
          return hasInsert && !hasIf;
        });
      },
      message: "Data write function (InsertDE/UpsertDE/UpdateDE) found without conditional error handling. Failed writes are silent in AMPScript — the email still sends.",
      fix:    "Use RaiseError() or conditional checks on return values where possible, and log failures to an audit DE."
    },

    {
      id:       "AMP010",
      severity: SEVERITY.INFO,
      title:    "Using v2 syntax (%%[[ ]]) — not V1 compatible",
      check: function (content) {
        return /%%\[\[[\s\S]*?\]\]%%/.test(content);
      },
      message: "AMPScript V2 syntax (%%[[ ]]) detected. This is not supported in all SFMC contexts and can cause rendering failures in older email templates.",
      fix:    "Use standard V1 syntax: %%[ ]%% for blocks, %%=...=%% for inline output."
    }

  ];

  // ─── Public API ──────────────────────────────────────────────────────────────

  function lint(content) {
    if (!content || typeof content !== "string") {
      return { diagnostics: [], score: 100 };
    }

    var blocks      = extractBlocks(content);
    var diagnostics = [];

    rules.forEach(function (rule) {
      try {
        if (rule.check(content, blocks)) {
          diagnostics.push({
            id:       rule.id,
            severity: rule.severity,
            title:    rule.title,
            message:  rule.message,
            fix:      rule.fix
          });
        }
      } catch (e) {
        // Rule threw — skip silently
      }
    });

    var score = 100;
    diagnostics.forEach(function (d) {
      if (d.severity === SEVERITY.ERROR)   score -= 20;
      if (d.severity === SEVERITY.WARNING) score -= 8;
      if (d.severity === SEVERITY.INFO)    score -= 2;
    });
    score = Math.max(0, score);

    return {
      diagnostics:  diagnostics,
      score:        score,
      blockCount:   blocks.length,
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
