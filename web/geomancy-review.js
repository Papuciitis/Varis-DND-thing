"use strict";

// Proposed rules stay attached to their original source entries, outside Spells.
(() => {
  const statuses = Object.freeze([
    ["draft", "Rewritten drafts", "Rewritten draft"],
    ["needs-design", "Needs a decision", "Needs a decision"],
    ["merge", "Merge with another spell", "Merge idea"],
    ["rejected", "Rejected", "Rejected"],
    ["unreviewed", "Not reviewed", "Not reviewed"],
    ["source-missing", "Missing source text", "Missing source text"]
  ]);
  const classes = Object.freeze(["Arcane", "Oath", "Occult", "Mystic"]);
  const status = entry => statuses.some(([key]) => key === entry.details?.review_status)
    ? entry.details.review_status : "unreviewed";
  const title = entry => statuses.find(([key]) => key === status(entry))[2];
  const conversion = entry => entry.details?.review_conversion;
  const isReview = entry => Object.hasOwn(entry.details || {}, "review_status");
  const levelText = value => String(value) === "0" ? "Cantrip" : "Level " + value;
  function selectedStatus(entries, params) {
    if (params.review === "all" || statuses.some(([key]) => key === params.review)) return params.review;
    if (params.group || params.level || params.filter || params.proposed) return "all";
    return entries.some(entry => conversion(entry)) ? "draft" : "all";
  }
  function matches(entry, params) {
    return (params.review === "all" || !params.review || status(entry) === params.review)
      && (!params.proposed || conversion(entry)?.magic_class === params.proposed);
  }
  function counts(entries) {
    return statuses.map(([key, label]) => ({key, label, count: entries.filter(entry => status(entry) === key).length}));
  }
  function badge(entry, el) {
    return el("span", "geomancy-status geomancy-status-" + status(entry), title(entry));
  }
  function draftLabel(entry) {
    const draft = conversion(entry);
    return draft ? draft.magic_class + " · " + levelText(draft.level) : "";
  }
  function appendCopy(host, value, el) {
    // Author comments can contain <placeholders>, code and raw markup. Keep it literal.
    for (const paragraph of String(value ?? "").split(/\n\s*\n/)) {
      if (paragraph.trim()) host.append(el("p", "geomancy-copy", paragraph));
    }
  }
  function disclosure(label, className, el) {
    const block = el("details", "geomancy-disclosure " + className);
    block.append(el("summary", "", label));
    const body = el("div", "geomancy-disclosure-body");
    block.append(body);
    return [block, body];
  }
  function renderEntry(entry, target, {el, link, renderOriginal}) {
    const data = entry.details || {};
    const wrap = el("div", "geomancy-review-entry");
    const decision = el("div", "geomancy-decision");
    decision.append(badge(entry, el));
    if (data.review_decision) appendCopy(decision, data.review_decision, el);
    else if (status(entry) === "unreviewed") decision.append(el("p", "geomancy-copy", "No author review has been recorded for this spell yet."));
    if (status(entry) === "source-missing" && data.draft_note) appendCopy(decision, data.draft_note, el);
    wrap.append(decision);

    const draft = conversion(entry);
    if (draft) {
      const proposal = el("section", "geomancy-conversion");
      proposal.setAttribute("aria-label", "Proposed spell conversion");
      proposal.append(el("p", "geomancy-eyebrow", "Proposed conversion · awaiting V."),
        el("h2", "geomancy-conversion-name", draft.name), el("p", "geomancy-tradition", draftLabel(entry)));
      const stats = el("dl", "stats geomancy-conversion-stats");
      for (const [key, label] of [["casting", "Casting time"], ["range", "Range"], ["duration", "Duration"], ["components", "Components"]]) {
        if (!draft[key]) continue;
        const field = el("div");
        field.append(el("dt", "", label), el("dd", "", draft[key]));
        stats.append(field);
      }
      proposal.append(stats);
      appendCopy(proposal, draft.effect, el);
      for (const [key, label] of [["higher_levels", "At higher spell levels"], ["upgrades", "Cantrip upgrades"]]) {
        if (draft[key]) {
          proposal.append(el("h3", "geomancy-rule-heading", label));
          appendCopy(proposal, draft[key], el);
        }
      }
      if (draft.design_notes) {
        const [notes, body] = disclosure("Drafting notes", "geomancy-drafting-notes", el);
        appendCopy(body, draft.design_notes, el);
        proposal.append(notes);
      }
      wrap.append(proposal);
    }
    if (data.review_questions?.length) {
      const questions = el("aside", "geomancy-questions");
      questions.append(el("h3", "", "For V. to decide"));
      const list = el("ul", "rule-list");
      for (const question of data.review_questions) list.append(el("li", "", question));
      questions.append(list);
      wrap.append(questions);
    }
    if (data.review_related_spells?.length) {
      const related = el("div", "geomancy-related-spells");
      related.append(el("h3", "geomancy-rule-heading", "Compare with current rules"));
      for (const spell of data.review_related_spells) {
        const row = el("p", "geomancy-related-spell");
        row.append(link(spell.name, {section: "spells", entry: spell.name, group: spell.group}, "text-link"));
        if (spell.notes) row.append(el("span", "", " — " + spell.notes));
        related.append(row);
      }
      wrap.append(related);
    }
    const [original, body] = disclosure("Original source spell · " + levelText(data.level ?? data.lvl ?? "?"), "geomancy-source", el);
    const originalDetails = Object.fromEntries(Object.entries(data).filter(([key]) => key !== "review" && !key.startsWith("review_")));
    renderOriginal({...entry, details: originalDetails}, body);
    wrap.append(original);
    if (data.review) {
      const [review, body] = disclosure("V.'s original review", "geomancy-author-review", el);
      body.append(el("p", "geomancy-copy", data.review));
      wrap.append(review);
    }
    target.append(wrap);
  }
  function expandableList(rows, {el, link, entryRoute, renderDetails}) {
    const list = el("div", "comparison-list geomancy-comparison-list");
    for (const {section, entry} of rows) {
      const block = el("details", "comparison-entry geomancy-comparison-entry");
      const summary = el("summary", "comparison-heading geomancy-comparison-heading");
      const names = el("span", "geomancy-entry-names");
      names.append(el("span", "result-name", entry.name));
      const draft = conversion(entry);
      if (draft && draft.name !== entry.name) names.append(el("span", "geomancy-draft-name", "Draft: " + draft.name));
      const meta = el("span", "geomancy-entry-meta");
      if (isReview(entry)) meta.append(badge(entry, el));
      meta.append(el("span", "result-meta", draftLabel(entry) || "Source " + levelText(entry.details?.level ?? entry.details?.lvl ?? "?")));
      summary.append(names, meta);
      const body = el("div", "comparison-body");
      body.append(link("Open spell page", entryRoute(section, entry), "comparison-open text-link"));
      renderDetails(entry, body);
      block.append(summary, body);
      list.append(block);
    }
    return list;
  }
  globalThis.GeomancyReview = Object.freeze({statuses, classes, status, title, isReview, conversion,
    selectedStatus, matches, counts, badge, draftLabel, renderEntry, expandableList});
})();
